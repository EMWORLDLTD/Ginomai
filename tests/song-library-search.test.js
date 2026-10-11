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

test('search accepts title prefixes while requiring complete lyric phrases', () => {
  const { context: c } = setup();
  const grace = song('one', 'Amazing Grace', 'How sweet the sound\nThat saved a wretch like me', 'John Newton');
  for (const query of ['AMAZING GRACE', 'grace', 'a', 'amaz', 'amazing gra', 'g', 'gr', 'how sweet', 'sound that saved']) {
    assert.equal(c.matchSongQuery(grace, query), true, query);
  }
  assert.equal(c.matchSongQuery(grace, 'how sweet'), true);
  assert.match(grace._matchedSnippet, /How sweet/);
  for (const query of ['mazing', 'race', 'amazing grce', 'how swe', 'grace sweet', 'saved wretch me', 'sweet sound saved forever', 'John Newton']) {
    assert.equal(c.matchSongQuery(grace, query), false, `${query} is not a title prefix or complete lyric phrase`);
  }
  assert.equal(c.matchSongQuery(grace, 'sweet sweet sweet elsewhere anywhere'), false, 'repetition cannot inflate overlap');
  assert.equal(c.matchSongQuery(grace, 'missing unrelated'), false);
  assert.equal(grace._matchedSnippet, '');
});

test('user title and lyric examples rank exact titles first without changing the catalog', () => {
  const { context: c } = setup();
  const catalog = [
    song('lyric-one', 'Morning Worship', 'Today I will pray'),
    song('title-phrase', 'I Will Pray Today'),
    song('lyric-two', 'Evening Worship', 'I will pray\nAnd give thanks'),
    song('exact', 'I Will Pray')
  ];
  assert.deepEqual(Array.from(c.searchSongs(catalog, 'i WILL pray'), s => s.id), ['exact', 'title-phrase', 'lyric-one', 'lyric-two']);
  assert.deepEqual(catalog.map(s => s.id), ['lyric-one', 'title-phrase', 'lyric-two', 'exact']);
  assert.equal(c.searchSongs(catalog, '').length, catalog.length);
  assert.equal(c.searchSongs(catalog, 'I Will Pry').length, 0);
  const lordSongs = [
    song('first', 'You Are the Lord', 'Jesus, You are the same Lord'),
    song('second', 'Another Song', 'Jesus\nYou are the same Lord'),
    song('third', 'Other Song', 'You are Lord Jesus, the same yesterday')
  ];
  assert.deepEqual(Array.from(c.searchSongs(lordSongs, 'YOU ARE THE LORD'), s => s.id), ['first']);
  assert.deepEqual(Array.from(c.searchSongs(lordSongs, 'Jesus, You are the same Lord'), s => s.id), ['first', 'second']);
});

test('harvest phrase excludes overlap-only matches and keeps repeated words significant', () => {
  const { context: c } = setup();
  const catalog = [
    song('other', 'Other Worship', 'For the Lord of heaven'),
    song('harvest', 'Harvest Song', 'For the Lord of the harvest'),
    song('overlap', 'Another Worship', 'Love for the children of the Lord')
  ];
  assert.deepEqual(Array.from(c.searchSongs(catalog, 'for the lord of the harvest'), s => s.id), ['harvest']);
  assert.equal(c.searchSongs(catalog, 'for the lord of the harvet').length, 0);
  assert.equal(c.matchSongQuery(song('one', 'Holy Lord'), 'holy holy'), false);
  const split = song('split', 'Other');
  split.stanzas = [{ text: 'You are the same' }, { text: 'Lord' }];
  assert.equal(c.matchSongQuery(split, 'You are the same Lord'), false);
});

test('cached search data refreshes after edits and ignores persisted old indexes', () => {
  const { context: c } = setup();
  const item = song('one', 'Original', 'Old wording', 'Old artist');
  item._searchIndex = 'obsolete song';
  const data = c.getSongSearchData(item);
  assert.equal(c.getSongSearchData(item), data);
  item.title = 'Changed'; item.author = 'New artist'; item.stanzas[0].text = 'Fresh wording';
  assert.equal(c.matchSongQuery(item, 'old wording'), false);
  assert.equal(c.matchSongQuery(item, 'fresh wording'), true);
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
    render('song 12');
    assert.deepEqual(list.children.map(row => row.dataset.songId), ['12', ...Array.from({ length: 10 }, (_, i) => String(120 + i))]);
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

test('sidebar input filters the full library and ranks titles ahead of lyrics using cached rows', () => {
  const songs = [song('lyrics', 'Other Song', 'I will pray'), song('exact', 'I Will Pray')];
  const { context: c, elements, window, timers } = setup(songs);
  const render = loadRenderer(c);
  render('');
  const list = elements.get('bento-library-list');
  const exactRow = list.children[1];
  const replacements = list.replacements;
  vm.runInContext(bento.slice(bento.indexOf('  window.clearBentoSearch ='), bento.indexOf('  window.assignBibleBookToSlot =')), c);
  elements.get('bento-search-input').value = 'I WILL PRAY';
  window.handleBentoSearch('I WILL PRAY');
  for (const callback of timers.values()) callback();
  timers.clear();
  assert.deepEqual(list.children.map(row => row.dataset.songId), ['exact', 'lyrics']);
  assert.equal(list.children[0], exactRow);
  window.handleBentoSearch('I will pry');
  for (const callback of timers.values()) callback();
  timers.clear();
  assert.match(list.children[0].innerHTML, /No matching songs/);
  window.clearBentoSearch();
  assert.deepEqual(list.children.map(row => row.dataset.songId), ['lyrics', 'exact']);
  assert.equal(list.replacements, replacements);
});

test('sidebar finds Revival from the first letter through the complete word without rebuilding rows', () => {
  const songs = [
    song('lyrics', 'Other Song', 'Send revival'),
    song('embedded', 'We Pray for Revival'),
    song('longer', 'Revival Fire'),
    song('exact', 'Revival'),
    song('unrelated', 'Arrival Song')
  ];
  const { context: c, elements, window, timers } = setup(songs);
  const render = loadRenderer(c);
  render('');
  const list = elements.get('bento-library-list');
  const rows = new Map(list.children.map(row => [row.dataset.songId, row]));
  const replacements = list.replacements;
  vm.runInContext(bento.slice(bento.indexOf('  window.clearBentoSearch ='), bento.indexOf('  window.assignBibleBookToSlot =')), c);
  for (let length = 1; length <= 'Revival'.length; length++) {
    const query = 'Revival'.slice(0, length);
    elements.get('bento-search-input').value = query;
    window.handleBentoSearch(query);
    for (const callback of timers.values()) callback();
    timers.clear();
    const expected = length === 'Revival'.length
      ? ['exact', 'embedded', 'longer', 'lyrics']
      : ['embedded', 'longer', 'exact'];
    assert.deepEqual(list.children.map(row => row.dataset.songId), expected, query);
    for (const row of list.children) assert.equal(row, rows.get(row.dataset.songId));
  }
  window.clearBentoSearch();
  assert.deepEqual(list.children.map(row => row.dataset.songId), songs.map(item => item.id));
  assert.equal(list.replacements, replacements);
});
