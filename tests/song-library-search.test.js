'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const bento = fs.readFileSync(path.join(__dirname, '../js/bento-integration.js'), 'utf8');
const matching = app.slice(app.indexOf('function normalizeSearchText'), app.indexOf('// Render the Bento library'));
const song = (id, title, text = '', author = '') => ({ id, title, author, stanzas: [{ text }] });

class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.style = {}; this.className = '';
    this.scrollTop = 0; this.clientHeight = 300; this.scrollHeight = 2000;
    this.value = ''; this.replacements = 0; this.writes = 0;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled === undefined) enabled = !classes.has(name);
        if (enabled) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' ');
      },
      add: name => this.classList.toggle(name, true),
      remove: name => this.classList.toggle(name, false)
    };
  }
  set innerHTML(value) {
    this.html = value; this.writes++;
    this.replaceChildren();
    this.buttons = [...value.matchAll(/<(?:button|span) class="([^"]*)"[^>]*>/g)].map(match => {
      const button = new Element(); button.className = match[1]; return button;
    });
  }
  get innerHTML() { return this.html || ''; }
  setAttribute(name, value) { this[name] = value; }
  focus() {}
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1); this.parentElement = null;
  }
  replaceChildren() {
    this.replacements++;
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }
  insertBefore(row, reference) {
    row.remove();
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    assert.ok(index >= 0, 'insertion reference belongs to the list');
    this.children.splice(index, 0, row); row.parentElement = this;
  }
  appendChild(row) { this.insertBefore(row, null); }
  querySelectorAll(selector) {
    if (selector === '.medley-assign-btn') return (this.buttons || []).filter(b => b.classList.contains('medley-assign-btn'));
    if (selector === '.bento-slotbtns span') return (this.buttons || []).filter(b => !b.classList.contains('medley-assign-btn'));
    const classes = selector.split('.').filter(Boolean);
    return this.children.filter(child => classes.every(name => child.classList.contains(name)));
  }
}

function setup(songs = []) {
  const elements = new Map();
  for (const id of ['bento-library-list', 'bento-search-input', 'bento-search-clear']) elements.set(id, new Element());
  const timers = new Map(); let timerId = 0;
  const state = { currentTab: 'songs', agendaItems: [], medleySongIds: [], showMedleyView: false };
  const window = { state, SONGS_DATABASE: songs };
  const context = vm.createContext({
    window, state, SONGS_DATABASE: songs,
    document: { getElementById: id => elements.get(id), createElement: () => new Element(), body: { getAttribute: () => 'bento' } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(matching, context);
  return { context, window, state, elements, timers };
}

test('search folds Latin accents and apostrophes while preserving other scripts', () => {
  const { context: c } = setup();
  for (const [title, query] of [['Bénis le Seigneur', 'benis'], ['Bénis', 'be\u0301nis'], ['耶稣爱我', '耶稣'], ['नमस्ते', 'नमस्ते'], ['Ẹ ṣe', 'e se']]) {
    assert.equal(c.matchSongQuery(song('one', title), query), true, `${query} finds ${title}`);
  }
  assert.equal(c.matchSongQuery(song('one', 'Other', 'You’re faithful'), 'youre faithful'), true);
  assert.equal(c.matchSongQuery(song('one', 'Other', "You're faithful"), 'you’re faithful'), true);
  assert.equal(c.matchSongQuery(song('one', 'Grace'), '!!!'), false);
});

test('short titles and repeated substrings cannot produce unrelated matches', () => {
  const { context: c } = setup();
  assert.equal(c.matchSongQuery(song('one', 'Go'), 'goodness of god'), false);
  assert.equal(c.matchSongQuery(song('one', 'Other', 'Wonderful mercy'), 'wonder wonder wonder'), false);
  assert.equal(c.matchSongQuery(song('one', 'Other', 'The island'), 'he is'), false);
  assert.equal(c.matchSongQuery(song('one', 'Other', 'Holy holy holy Lord'), 'holy holy holy'), true);
});

test('search combines title, artist, and lyrics, retaining partial title typing', () => {
  const { context: c } = setup();
  const grace = song('one', 'Amazing Grace', 'How sweet the sound\nThat saved a wretch like me', 'John Newton');
  for (const query of ['amazing newton', 'newton amazing', 'amazing gra', 'amazing new', 'amaz', 'grace sweet', 'saved wretch me']) {
    assert.equal(c.matchSongQuery(grace, query), true, query);
  }
  assert.equal(c.matchSongQuery(grace, 'how sweet'), true);
  assert.match(grace._matchedSnippet, /How sweet/);
  assert.equal(c.matchSongQuery(grace, 'how swe'), true, 'lyric phrases work while typing the last word');
  assert.equal(c.matchSongQuery(grace, 'sweet sound saved forever'), true, 'whole-word overlap tolerates an imperfect remembered lyric');
  assert.equal(c.matchSongQuery(grace, 'sweet sweet sweet elsewhere anywhere'), false, 'repetition cannot inflate overlap');
  assert.equal(c.matchSongQuery(grace, 'missing unrelated'), false);
  assert.equal(grace._matchedSnippet, '');
});

test('cached search data refreshes after edits and ignores persisted old indexes', () => {
  const { context: c } = setup();
  const item = song('one', 'Original', 'Old wording', 'Old artist');
  item._searchIndex = 'obsolete song';
  const data = c.getSongSearchData(item);
  assert.equal(c.getSongSearchData(item), data);
  item.title = 'Changed'; item.author = 'New artist'; item.stanzas[0].text = 'Fresh wording';
  assert.equal(c.matchSongQuery(item, 'old wording'), false);
  assert.equal(c.matchSongQuery(item, 'fresh artist'), true);
  assert.notEqual(c.getSongSearchData(item), data);
  item.stanzas.push({ text: 'Additional verse' });
  assert.equal(c.matchSongQuery(item, 'additional verse'), true);
});

test('clearing Bento cancels pending filtering, including Escape path', () => {
  const { context: c, elements, timers, window } = setup();
  const renders = [];
  c.renderBentoLibrary = query => renders.push(query);
  vm.runInContext(bento.slice(bento.indexOf('  window.clearBentoSearch ='), bento.indexOf('  window.assignBibleBookToSlot =')), c);
  elements.get('bento-search-input').value = 'grace';
  window.handleBentoSearch('grace'); window.clearBentoSearch();
  for (const callback of timers.values()) callback();
  assert.equal(timers.size, 0);
  assert.deepEqual(renders, ['']);
  assert.equal(elements.get('bento-search-input').value, '');
});

function loadRenderer(c) {
  vm.runInContext(bento.slice(bento.indexOf('  function renderBentoLibrary('), bento.indexOf('  let _activeDismissCallback')), c);
  vm.runInContext(bento.slice(bento.indexOf('  function escapeHtml('), bento.indexOf('  function setBentoSingleCols(')), c);
  return query => c.renderBentoLibrary(query);
}

{
  test(`Bento filters in place, batches large libraries, and restores cached rows after no results`, () => {
    const songs = Array.from({ length: 1000 }, (_, i) => song(String(i), `Song ${i}`, `Lyric ${i}`));
    const { context: c, elements } = setup(songs);
    const render = loadRenderer(c);
    const list = elements.get('bento-library-list');
    render('');
    assert.equal(list.children.length, 80);
    const rows = list.children.slice();
    const replacements = list.replacements;
    list.scrollTop = list.scrollHeight;
    list.onscroll();
    assert.equal(list.children.length, 160);
    assert.equal(list.children[0], rows[0]);
    render('song 12 lyric');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0], rows[12]);
    render('no such song');
    assert.equal(list.children.length, 1);
    assert.match(list.children[0].innerHTML, /No matching/);
    render('');
    assert.equal(list.children.length, 80);
    assert.equal(list.scrollTop, 0);
    assert.equal(list.children[12], rows[12]);
    assert.equal(list.replacements, replacements, 'list was never rebuilt while filtering');
    render('song 999');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].dataset.songId, '999', 'songs beyond the first batch remain searchable');
  });

  test(`Bento keeps selection, medley assignments, edits and deletions correct with reused rows`, () => {
    const songs = [song('one', 'Grace'), song('two', 'Mercy')];
    const { context: c, state, elements } = setup(songs);
    state.showMedleyView = true;
    const render = loadRenderer(c);
    const list = elements.get('bento-library-list');
    render(''); const row = list.children[0];
    state.activeSongId = 'one'; state.medleySongIds = ['one']; state.agendaItems = [{ id: 'one' }];
    render('');
    assert.equal(list.children[0], row);
    assert.equal(row.classList.contains('active'), true);
    const buttons = row.querySelectorAll('.bento-slotbtns span');
    assert.equal(buttons[0].classList.contains('active'), true);
    songs[0] = song('one', 'Updated Grace', 'New lyrics');
    render('updated');
    assert.notEqual(list.children[0], row, 'replaced song object gets fresh event handlers');
    assert.match(list.children[0].innerHTML, /Updated Grace/);
    songs.shift(); render('');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].dataset.songId, 'two');
    assert.equal(list._songLibraryRows.rows.has('one'), false);
  });
}
