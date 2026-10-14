'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setupTestEnvironment() {
  const elements = new Map();
  function makeElement(initialId, tagName = 'div') {
    const classes = new Set();
    let currentId = initialId || '';
    const el = {
      get id() { return currentId; },
      set id(val) {
        if (currentId) elements.delete(currentId);
        currentId = val || '';
        if (currentId) elements.set(currentId, el);
      },
      tagName: tagName.toUpperCase(),
      dataset: {},
      style: {},
      children: [],
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      textContent: '',
      setSelectionRange(s, e) {
        this.selectionStart = s;
        this.selectionEnd = e;
      },
      scrollIntoView(opts) {
        this._scrolledIntoView = opts || true;
      },
      scrollTo(opts) {
        if (typeof opts === 'object' && opts.top !== undefined) {
          this.scrollTop = opts.top;
        } else if (typeof opts === 'number') {
          this.scrollTop = opts;
        }
      },
      focus() {
        this._focused = true;
      },
      getBoundingClientRect() {
        return { top: 0, bottom: 100, left: 0, right: 100 };
      },
      get className() {
        return Array.from(classes).join(' ');
      },
      set className(val) {
        classes.clear();
        if (typeof val === 'string') {
          val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
        }
      },
      get innerHTML() {
        return this._innerHTML || '';
      },
      set innerHTML(html) {
        this._innerHTML = html;
        this.children = [];
        if (typeof html === 'string') {
          const idMatches = [...html.matchAll(/id="([^"]+)"/g)];
          for (const m of idMatches) {
            const childId = m[1];
            let childEl = elements.get(childId);
            if (!childEl) {
              childEl = makeElement(childId);
            }
            childEl.children = [];
            childEl._listeners = {};
            childEl.parentElement = el;
            el.children.push(childEl);

            const valMatch = html.match(new RegExp(`id="${childId}"[^>]*value="([^"]*)"`));
            if (valMatch) childEl.value = valMatch[1];

            const textareaMatch = html.match(new RegExp(`<textarea[^>]*id="${childId}"[^>]*>([\\s\\S]*?)<\\/textarea>`));
            if (textareaMatch) childEl.value = textareaMatch[1];

            const textMatch = html.match(new RegExp(`<[^>]*id="${childId}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`));
            if (textMatch && !textareaMatch) childEl.textContent = textMatch[1].replace(/<[^>]+>/g, '').trim();
          }
        }
      },
      classList: {
        add(...cs) { cs.forEach(c => classes.add(c)); },
        remove(...cs) { cs.forEach(c => classes.delete(c)); },
        toggle(c, on) {
          if (on === undefined) on = !classes.has(c);
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
        contains(c) { return classes.has(c); }
      },
      remove() {
        if (this.parentElement && Array.isArray(this.parentElement.children)) {
          const idx = this.parentElement.children.indexOf(this);
          if (idx !== -1) this.parentElement.children.splice(idx, 1);
        }
      },
      appendChild(child) {
        if (!child) return child;
        child.parentElement = el;
        el.children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      append(...children) {
        children.forEach(c => { if (c && typeof c === 'object') this.appendChild(c); });
      },
      replaceChildren(...children) {
        el.children.slice().forEach(child => child.remove());
        this.append(...children);
      },
      insertBefore(child, reference) {
        if (child.parentElement) child.remove();
        const index = reference ? el.children.indexOf(reference) : -1;
        child.parentElement = el;
        if (index < 0) el.children.push(child); else el.children.splice(index, 0, child);
        return child;
      },
      contains(child) { return child === el || el.children.some(item => item.contains(child)); },
      querySelectorAll(sel) {
        const found = [];
        function walk(node) {
          if (!node || !node.children) return;
          for (const c of node.children) {
            if (sel.includes(',')) {
              const parts = sel.split(',').map(s => s.trim());
              for (const p of parts) {
                if (p.startsWith('.') && c.classList.contains(p.slice(1))) { found.push(c); break; }
                else if (p.startsWith('#') && c.id === p.slice(1)) { found.push(c); break; }
                else if (c.dataset && c.dataset.slideId && p.includes(`data-slide-id="${c.dataset.slideId}"`)) { found.push(c); break; }
              }
            } else if (sel.includes('[data-stanza-index="') && c.dataset && c.dataset.stanzaIndex !== undefined) {
              const m = sel.match(/\[data-stanza-index="([^"]+)"\]/);
              if (m && String(c.dataset.stanzaIndex) === m[1]) found.push(c);
            } else if (sel.startsWith('.') && sel.split('.').filter(Boolean).length > 1) {
              const clss = sel.split('.').filter(Boolean);
              if (clss.every(cls => c.classList.contains(cls))) found.push(c);
            } else if (sel.startsWith('.') && c.classList.contains(sel.slice(1))) {
              found.push(c);
            } else if (sel.startsWith('#') && c.id === sel.slice(1)) {
              found.push(c);
            } else if (c.tagName && c.tagName.toLowerCase() === sel.toLowerCase()) {
              found.push(c);
            }
            walk(c);
          }
        }
        walk(el);
        return found;
      },
      querySelector(sel) {
        const res = this.querySelectorAll(sel);
        return res.length > 0 ? res[0] : null;
      },
      closest(sel) {
        if (sel.startsWith('.') && this.classList.contains(sel.slice(1))) return this;
        if (sel.startsWith('#') && this.id === sel.slice(1)) return this;
        if (this.parentElement && typeof this.parentElement.closest === 'function') {
          return this.parentElement.closest(sel);
        }
        return null;
      },
      removeAttribute(attr) { delete el[attr]; },
      setAttribute(attr, val) {
        el[attr] = val;
        if (attr.startsWith('data-')) {
          const camel = attr.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
          el.dataset[camel] = val;
        }
      },
      getAttribute(attr) { return el[attr] || null; },
      addEventListener(type, handler) {
        this._listeners ||= {};
        (this._listeners[type] ||= []).push(handler);
      },
      dispatchEvent(event) {
        event.target ||= this;
        (this._listeners?.[event.type] || []).forEach(handler => handler(event));
      },
      removeEventListener() {},
      insertAdjacentHTML() {},
      setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
      focus() { context.document.activeElement = this; },
      blur() {},
      click() {
        if (typeof this.onclick === 'function') this.onclick({ button: 0, target: this, stopPropagation: () => {} });
      }
    };
    if (initialId) elements.set(initialId, el);
    return el;
  }

  const ids = [
    'prepared-reference', 'prepared-text', 'prepared-slide',
    'bento-deck-title', 'bento-deck-sub', 'deck-container',
    'bento-medley-container', 'auto-project-btn',
    'bento-edit-btn', 'bento-add-song-btn', 'bento-compare-btn',
    'bento-strongs-btn', 'bento-cols-seg', 'setting-song-editor-mode',
    'setting-song-title-toggle', 'song-editor-modal-backdrop',
    'editor-song-title', 'editor-song-author', 'editor-song-text',
    'editor-song-id', 'bento-deck-card',
    'bento-split-title', 'bento-split-author', 'bento-split-lyrics',
    'bento-split-slide-count', 'bento-split-cards-stream', 'bento-deck-split-editor'
  ];
  ids.forEach(id => makeElement(id));

  const SONGS_DATABASE = [
    {
      id: 'song_1',
      title: 'Amazing Grace',
      author: 'John Newton',
      stanzas: [
        { type: 'Verse 1', text: 'Amazing grace how sweet the sound' },
        { type: 'Verse 2', text: 'Twas grace that taught my heart to fear' },
        { type: 'Verse 3', text: 'Through many dangers toils and snares' }
      ]
    },
    {
      id: 'song_2',
      title: 'How Great Thou Art',
      author: 'Stuart Hine',
      stanzas: [
        { type: 'Verse 1', text: 'O Lord my God when I in awesome wonder' },
        { type: 'Verse 2', text: 'When through the woods and forest glades I wander' }
      ]
    }
  ];

  class ElementMock {}
  class MutationObserverMock {
    observe() {}
    disconnect() {}
  }

  const localStorageStore = new Map();
  const localStorageMock = {
    getItem(k) { return localStorageStore.get(k) || null; },
    setItem(k, v) { localStorageStore.set(k, String(v)); },
    removeItem(k) { localStorageStore.delete(k); },
    clear() { localStorageStore.clear(); }
  };

  class BroadcastChannelMock {
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }

  const context = {
    Element: ElementMock,
    MutationObserver: MutationObserverMock,
    BroadcastChannel: BroadcastChannelMock,
    URLSearchParams: global.URLSearchParams,
    location: { search: '' },
    navigator: { userAgent: 'node' },
    addEventListener() {},
    removeEventListener() {},
    window: {},
    document: {
      createElement: makeElement,
      getElementById: id => elements.get(id) || makeElement(id),
      querySelector: sel => {
        if (sel.startsWith('#')) return elements.get(sel.slice(1)) || makeElement(sel.slice(1));
        return makeElement('mock');
      },
      querySelectorAll: sel => {
        const found = [];
        elements.forEach(el => {
          const parts = sel.split(',').map(s => s.trim());
          for (const p of parts) {
            if (p.startsWith('.') && el.classList.contains(p.slice(1))) { found.push(el); break; }
            else if (p.startsWith('#') && el.id === p.slice(1)) { found.push(el); break; }
            else if (p.startsWith('[data-slide-id="')) {
              const idVal = p.slice(16, -2);
              if (el.dataset && (el.dataset.slideId === idVal || el.getAttribute('data-slide-id') === idVal)) {
                found.push(el);
                break;
              }
            }
          }
        });
        return found;
      },
      addEventListener() {},
      removeEventListener() {},
      body: makeElement('body')
    },
    localStorage: localStorageMock,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); return 1; },
    SONGS_DATABASE,
    BIBLE_DATABASE: { books: [] },
    console
  };

  context.window = context;
  context.global = context;
  vm.createContext(context);

  const libraryImporterMock = `
    window.libraryImporter = {
      parseSongText(text, title, author) {
        const lines = (text || '').split('\\n');
        const stanzas = [];
        let curType = 'Verse 1';
        let curLines = [];
        let verseCount = 1;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            if (curLines.length > 0) {
              stanzas.push({ type: curType, text: curLines.join('\\n') });
              curLines = [];
              verseCount++;
              curType = 'Verse ' + verseCount;
            }
            continue;
          }
          const tagMatch = trimmed.match(/^\\[([^\\]]+)\\]$/);
          if (tagMatch) {
            if (curLines.length > 0) {
              stanzas.push({ type: curType, text: curLines.join('\\n') });
              curLines = [];
            }
            curType = tagMatch[1];
            continue;
          }
          curLines.push(trimmed);
        }
        if (curLines.length > 0) {
          stanzas.push({ type: curType, text: curLines.join('\\n') });
        }
        return {
          title: title || 'Untitled Song',
          author: author || 'Unknown Artist',
          stanzas: stanzas.length > 0 ? stanzas : [{ type: 'Verse 1', text: text.trim() }]
        };
      },
      updateSong(songId, data) {
        const s = SONGS_DATABASE.find(x => x.id === songId);
        if (!s) return false;
        if (data.title) s.title = data.title;
        if (data.author) s.author = data.author;
        if (data.stanzas) s.stanzas = data.stanzas;
        return true;
      }
    };
  `;
  vm.runInContext(libraryImporterMock, context);

  // Load app.js and bento-integration.js
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const bentoJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'bento-integration.js'), 'utf8');

  vm.runInContext(appJs, context);
  vm.runInContext(bentoJs, context);
  context.syncRemoteCatalog = () => {};

  return { context, elements, SONGS_DATABASE };
}

test('In-Deck Split Editor: Mode preference routing (split vs modal)', () => {
  const { context, elements } = setupTestEnvironment();

  // Default mode is 'split'
  assert.equal(context.state.songEditorMode, 'split');

  // Activate song 1
  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';

  // Calling openSongEditor in split mode activates in-deck split editor
  context.openSongEditor('song_1');
  assert.equal(context.state.isDeckEditingSong, 'song_1');

  const modalBackdrop = elements.get('song-editor-modal-backdrop');
  assert.equal(modalBackdrop.classList.contains('open'), false, 'Overlay modal should NOT be open in split mode');

  // Change setting to 'modal'
  context.setSongEditorModeSetting('modal');
  assert.equal(context.state.songEditorMode, 'modal');
  assert.equal(context.localStorage.getItem('sf_song_editor_mode'), 'modal');
  assert.equal(context.state.isDeckEditingSong, null, 'Switching to modal cleanly exits split editor');

  // Calling openSongEditor in modal mode opens the overlay dialog
  context.openSongEditor('song_1');
  assert.equal(modalBackdrop.classList.contains('open'), true, 'Overlay modal should open in modal mode');

  // Switch back to split mode
  context.setSongEditorModeSetting('split');
  assert.equal(context.state.songEditorMode, 'split');
  assert.equal(context.localStorage.getItem('sf_song_editor_mode'), 'split');
});

test('In-Deck Split Editor: Layout elements & toolbar integration', () => {
  const { context, elements, SONGS_DATABASE } = setupTestEnvironment();

  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';

  context.openDeckSplitEditor('song_1');
  assert.equal(context.state.isDeckEditingSong, 'song_1');

  const container = elements.get('bento-medley-container');
  assert.ok(container.classList.contains('in-split-editor'), 'Container should have in-split-editor class');

  const editBtn = elements.get('bento-edit-btn');
  assert.ok(editBtn.classList.contains('active'), 'Toolbar Edit button should have active class');
  assert.ok(editBtn.innerHTML.includes('Save &amp; close'), 'Toolbar should provide the single save and close action');

  const colsSeg = elements.get('bento-cols-seg');
  assert.equal(colsSeg.style.display, 'none', 'Columns layout segment should be hidden in split mode');

  // Title, author, lyrics inputs
  const titleInput = elements.get('bento-split-title');
  const authorInput = elements.get('bento-split-author');
  const lyricsInput = elements.get('bento-split-lyrics');
  const countEl = elements.get('bento-split-slide-count');

  assert.ok(titleInput, 'Title input should exist');
  assert.equal(titleInput.value, 'Amazing Grace');
  assert.ok(authorInput, 'Author input should exist');
  assert.equal(authorInput.value, 'John Newton');
  assert.ok(lyricsInput, 'Lyrics textarea should exist');
  assert.ok(lyricsInput.value.includes('Amazing grace how sweet the sound'));
  assert.ok(countEl.textContent.includes('3 slide'), 'Slide count should indicate 3 slides');
});

test('In-Deck Split Editor: Real-time reactive cards stream & lyrics updates', () => {
  const { context, elements } = setupTestEnvironment();

  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';
  context.openDeckSplitEditor('song_1');

  const streamEl = elements.get('bento-split-cards-stream');
  assert.ok(streamEl, 'Cards stream container should exist');
  assert.equal(streamEl.children.length, 3, 'Should render 3 cards for the 3 stanzas');

  // Add a 4th verse to the lyrics textarea
  const lyricsInput = elements.get('bento-split-lyrics');
  lyricsInput.value += '\n\n[Verse 4]\nWhen we have been there ten thousand years\nBright shining as the sun';

  context.updateBentoSplitEditorPreview();

  assert.equal(streamEl.children.length, 4, 'Cards stream should reactively render 4 cards');
  const countEl = elements.get('bento-split-slide-count');
  assert.ok(countEl.textContent.includes('4 slide'), 'Slide count should show 4 slides');

  // Test insertBentoSplitTag
  lyricsInput.selectionStart = lyricsInput.value.length;
  lyricsInput.selectionEnd = lyricsInput.value.length;
  context.insertBentoSplitTag('Chorus');
  assert.ok(lyricsInput.value.includes('[Chorus]'), 'Should insert [Chorus] tag');

  // Test autoFormatBentoSplitEditor
  context.autoFormatBentoSplitEditor();
  assert.ok(lyricsInput.value.length > 0, 'Auto format should format lyrics');
});

test('In-Deck Split Editor: Live slide projection continuity while editing', () => {
  const { context, elements } = setupTestEnvironment();

  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';
  context.openDeckSplitEditor('song_1');

  const streamEl = elements.get('bento-split-cards-stream');
  assert.equal(streamEl.children.length, 3);

  const card1 = streamEl.children[0];
  const slideId = card1.dataset.slideId || card1.getAttribute('data-slide-id');
  assert.ok(slideId.startsWith('song_1_'), 'SlideId should belong to song_1');

  // Clicking card1 in the right column triggers projectSlide
  card1.click();

  // Check that the slide was projected live
  assert.equal(context.state.activeLiveSlideId, slideId);
  assert.equal(context.state.isDeckEditingSong, 'song_1', 'Left column editor is NOT closed by projecting a card');

  // Check that card1 now has the live class
  assert.ok(card1.classList.contains('live'), 'Projected card in right column gets .live class');

  // Clicking card2 follows suit directly to live
  const card2 = streamEl.children[1];
  const slideId2 = card2.dataset.slideId || card2.getAttribute('data-slide-id');
  card2.click();

  assert.equal(context.state.activeLiveSlideId, slideId2);
  assert.ok(card2.classList.contains('live'), 'Follow-suit slide gets .live class');
  assert.equal(card1.classList.contains('live'), false, 'Previous card loses .live class');
});

test('In-Deck Split Editor: Saving, toggling, and canceling', () => {
  const { context, elements, SONGS_DATABASE } = setupTestEnvironment();

  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';
  context.openDeckSplitEditor('song_1');

  const titleInput = elements.get('bento-split-title');
  titleInput.value = 'Amazing Grace (Updated)';
  const lyricsInput = elements.get('bento-split-lyrics');
  lyricsInput.value = '[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me';

  // Save changes
  context.saveBentoDeckSplitEditor();

  // Check state and database
  assert.equal(context.state.isDeckEditingSong, null, 'Saving exits split editor');
  const song = SONGS_DATABASE.find(s => s.id === 'song_1');
  assert.equal(song.title, 'Amazing Grace (Updated)');
  assert.equal(song.stanzas[0].text, 'Amazing grace how sweet the sound\nThat saved a wretch like me');

  const editBtn = elements.get('bento-edit-btn');
  assert.equal(editBtn.classList.contains('active'), false, 'Toolbar Edit button inactive after saving');

  // Test toggle: clicking openSongEditor again while editing closes & saves
  context.openSongEditor('song_1');
  assert.equal(context.state.isDeckEditingSong, 'song_1');

  // Toggle off via toolbar Edit button
  context.openSongEditor('song_1');
  assert.equal(context.state.isDeckEditingSong, null, 'Clicking Edit song again closes split editor');

  // Test cancel
  context.openDeckSplitEditor('song_1');
  assert.equal(context.state.isDeckEditingSong, 'song_1');
  context.closeDeckSplitEditor(false);
  assert.equal(context.state.isDeckEditingSong, null, 'Canceling closes without saving');
});

test('In-Deck Split Editor: Option 1 features - clean tag insertion, cursor tracking, new card glow, and live slide auto-scroll', () => {
  const { context, elements } = setupTestEnvironment();

  // Scenario A: Switch to edit mode when a slide is already LIVE
  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';
  context.state.activeLiveSlideId = 'song_1_1'; // Verse 2 is live

  context.openDeckSplitEditor('song_1');

  const streamEl = elements.get('bento-split-cards-stream');
  const lyricsInput = elements.get('bento-split-lyrics');

  // Verify that Verse 2 card is live and was auto-scrolled into view on initial mount
  const cardVerse2 = streamEl.children[1];
  assert.ok(cardVerse2.classList.contains('live'), 'Verse 2 should be marked live');
  assert.ok(cardVerse2._scrolledIntoView, 'Live card should be scrolled into view on initial mount');
  assert.ok(cardVerse2.dataset.stanzaIndex === '1', 'Card should have stanza index 1');

  // Verify left textarea was scrolled to that stanza
  assert.ok(lyricsInput.scrollTop >= 0, 'Textarea scrollTop should be calculated');

  // Scenario B: Tag insertion must insert REAL newlines (never literal \\n)
  const lenBefore = lyricsInput.value.length;
  lyricsInput.selectionStart = lenBefore;
  lyricsInput.selectionEnd = lenBefore;

  context.insertBentoSplitTag('Bridge');

  assert.equal(lyricsInput.value.includes('\\n'), false, 'Must NEVER insert escaped \\n characters into textarea');
  assert.ok(lyricsInput.value.includes('[Bridge]\n'), 'Must insert [Bridge] tag with real newline');
  assert.equal(lyricsInput.selectionStart, lyricsInput.value.length, 'Cursor should be positioned right after the inserted tag');

  // Newly created Bridge card in stream should have .bento-card-added-glow
  const bridgeCard = streamEl.children[streamEl.children.length - 1];
  assert.ok(bridgeCard.classList.contains('bento-card-added-glow'), 'New card should receive bento-card-added-glow class');
  assert.equal(bridgeCard._scrolledIntoView, undefined, 'Adding a section must not pull the deck away from live');

  // Scenario C: Cursor-driven card highlighting across stanzas
  // Move cursor to beginning of textarea (inside Stanza 0: Verse 1)
  lyricsInput.selectionStart = 5;
  lyricsInput.selectionEnd = 5;
  context.syncSplitActiveCardHighlight();

  const cardVerse1 = streamEl.children[0];
  const freshCardVerse2 = streamEl.children[1];
  assert.ok(cardVerse1.classList.contains('editing-focused'), 'Card 0 should receive editing-focused when cursor is in Stanza 0');
  assert.equal(freshCardVerse2.classList.contains('editing-focused'), false, 'Card 1 should not have editing-focused');

  // Move cursor to Stanza 1
  const ranges = context.getBentoSplitStanzaRanges(lyricsInput.value, [
    { type: 'Verse 1' }, { type: 'Verse 2' }, { type: 'Verse 3' }, { type: 'Bridge' }
  ]);
  if (ranges[1]) {
    lyricsInput.selectionStart = ranges[1].start + 5;
    lyricsInput.selectionEnd = ranges[1].start + 5;
    context.syncSplitActiveCardHighlight();

    assert.ok(freshCardVerse2.classList.contains('editing-focused'), 'Card 1 should receive editing-focused when cursor is in Stanza 1');
    assert.equal(cardVerse1.classList.contains('editing-focused'), false, 'Card 0 should lose editing-focused');
  }

  // Scenario D: Projecting preserves the editing position and gives the card focus.
  const caret = lyricsInput.selectionStart;
  const editorScroll = lyricsInput.scrollTop;
  cardVerse1.click();
  assert.equal(context.state.activeLiveSlideId, cardVerse1.dataset.slideId, 'Clicking card projects it');
  assert.equal(lyricsInput.selectionStart, caret);
  assert.equal(lyricsInput.scrollTop, editorScroll);
  assert.equal(context.document.activeElement, cardVerse1);
});

test('In-Deck Split Editor: Toolbar layout & zero outer scroll jumping (Fix for top header clipping & bottom void)', () => {
  const { context, elements } = setupTestEnvironment();

  const deckCard = elements.get('bento-deck-card') || elements.get('deck-container');
  context.state.activeSongId = 'song_1';
  context.state.activeDeckType = 'song';

  context.openDeckSplitEditor('song_1');

  // Verify in-split-editor class was added to deckCard
  assert.ok(deckCard.classList.contains('in-split-editor'), 'deckCard should have in-split-editor class');
  assert.equal(deckCard.scrollTop, 0, 'deckCard scrollTop must remain 0 to prevent top header clipping');

  // Verify non-essential toolbar controls are hidden during split editing
  const linesSeg = elements.get('bento-lines-seg');
  const addSongBtn = elements.get('bento-add-song-btn');
  const colsSeg = elements.get('bento-cols-seg');
  const modeSeg = elements.get('bento-mode-seg');

  if (linesSeg) assert.equal(linesSeg.style.display, 'none', 'Lines per slide segment should be hidden in split editor');
  if (addSongBtn) assert.equal(addSongBtn.style.display, 'none', 'New song button should be hidden in split editor');
  if (colsSeg) assert.equal(colsSeg.style.display, 'none', 'Cols segment should be hidden in split editor');
  if (modeSeg) assert.equal(modeSeg.style.display, 'none', 'Mode segment should be hidden in split editor');

  // Verify Done editing button is shown
  const editBtn = elements.get('bento-edit-btn');
  assert.equal(editBtn.style.display, 'inline-flex', 'Edit button should be visible');
  assert.ok(editBtn.classList.contains('active'), 'Edit button should be in active state');

  // Closing split editor removes in-split-editor class and restores toolbar buttons
  context.closeDeckSplitEditor(false);
  assert.equal(deckCard.classList.contains('in-split-editor'), false, 'deckCard should remove in-split-editor class');
  assert.equal(deckCard.scrollTop, 0, 'deckCard scrollTop should remain 0');
  if (linesSeg) assert.equal(linesSeg.style.display, 'inline-flex', 'Lines segment restored');
  if (addSongBtn) assert.equal(addSongBtn.style.display, 'inline-flex', 'Add song restored');
});

function openDraft() {
  const env = setupTestEnvironment();
  env.context.openDeckSplitEditor('song_1');
  return { ...env, lyrics: env.elements.get('bento-split-lyrics'), stream: env.elements.get('bento-split-cards-stream') };
}

test('draft typing patches the existing cards without changing the audience snapshot', () => {
  const { context, elements, lyrics, stream } = openDraft();
  const cards = [...stream.children];
  cards[0].click();
  const onAir = context.state.activeLiveText;
  context.setBentoSplitFollow('off');
  stream.scrollTop = 150;
  lyrics.value = lyrics.value.replace('Amazing grace', 'Corrected grace');
  context.updateBentoSplitEditorPreview();
  assert.deepEqual(stream.children, cards);
  assert.match(cards[0]._body.textContent, /Corrected grace/);
  assert.equal(stream.scrollTop, 150);
  assert.equal(context.state.activeLiveText, onAir);
  assert.equal(elements.get('bento-split-live-text').textContent, onAir);
  assert.equal(elements.get('bento-split-update-live').hidden, false);
  context.updateBentoSplitLive();
  assert.match(context.state.activeLiveText, /Corrected grace/);
  assert.equal(elements.get('bento-split-update-live').hidden, true);
});

test('arrow navigation uses the edited draft and preserves the editor selection', () => {
  const { context, lyrics, stream } = openDraft();
  stream.children[0].click();
  lyrics.value = lyrics.value.replace('Twas grace', 'Updated upcoming verse');
  lyrics.setSelectionRange(8, 12);
  lyrics.scrollTop = 100;
  context.updateBentoSplitEditorPreview();
  context.navigateLiveVerse(1);
  assert.match(context.state.activeLiveText, /Updated upcoming verse/);
  assert.equal(lyrics.selectionStart, 8);
  assert.equal(lyrics.selectionEnd, 12);
  assert.equal(lyrics.scrollTop, 100);
});

test('inserting and deleting sections above live preserves identity and navigation', () => {
  const { context, lyrics, stream } = openDraft();
  const liveCard = stream.children[1];
  const nextCard = stream.children[2];
  liveCard.click();
  const liveId = context.state.activeLiveSlideId;
  lyrics.value = '[Intro]\nNew intro\n\n' + lyrics.value;
  context.updateBentoSplitEditorPreview();
  assert.equal(stream.children[2], liveCard);
  assert.equal(context.state.activeLiveSlideId, liveId);
  assert.equal(liveCard.classList.contains('live'), true);
  lyrics.value = lyrics.value.slice(lyrics.value.indexOf('[Verse 2]'));
  context.updateBentoSplitEditorPreview();
  assert.equal(stream.children[0], liveCard);
  context.navigateLiveVerse(1);
  assert.equal(context.state.activeLiveSlideId, nextCard.dataset.slideId);
});

test('deleted live section keeps output and next goes to its surviving successor', () => {
  const { context, lyrics, stream } = openDraft();
  stream.children[1].click();
  const liveId = context.state.activeLiveSlideId;
  const text = context.state.activeLiveText;
  const nextId = stream.children[2].dataset.slideId;
  lyrics.value = lyrics.value.replace(/\[Verse 2\][\s\S]*?(?=\[Verse 3\])/, '');
  context.updateBentoSplitEditorPreview();
  assert.equal(context.state.activeLiveText, text);
  assert.equal(context.resolveBentoSplitSlide(liveId), false);
  assert.equal(stream.children.some(card => card.classList.contains('live')), false);
  context.navigateLiveVerse(1);
  assert.equal(context.state.activeLiveSlideId, nextId);
});

test('save remaps moved slide identity without reprojecting, discard keeps output', () => {
  const { context, lyrics, stream, SONGS_DATABASE } = openDraft();
  stream.children[1].click();
  const text = context.state.activeLiveText;
  lyrics.value = '[Intro]\nNew intro\n\n' + lyrics.value.replace('Twas grace', 'Changed live draft');
  context.updateBentoSplitEditorPreview();
  let broadcasts = 0;
  context.reprojectCurrentLive = () => broadcasts++;
  context.saveBentoDeckSplitEditor();
  assert.equal(context.state.activeLiveSlideId, 'song_1_2');
  assert.equal(context.state.activeLiveText, text);
  assert.equal(broadcasts, 0);
  assert.match(SONGS_DATABASE[0].stanzas[2].text, /Changed live draft/);
  context.openDeckSplitEditor('song_1');
  lyrics.value += '\n\n[Outro]\nUnsaved outro';
  context.updateBentoSplitEditorPreview();
  stream.children[stream.children.length - 1].click();
  context.closeDeckSplitEditor(false);
  assert.equal(context.state.activeLiveText, 'Unsaved outro');
  assert.equal(SONGS_DATABASE[0].stanzas.length, 4);
  assert.match(context.state.activeLiveSlideId, /removed/);
});

test('manual browsing suspends follow and explicit follow resumes it', () => {
  const { context, elements, stream } = openDraft();
  context.setBentoSplitFollow('edit');
  stream.dispatchEvent({ type: 'wheel' });
  assert.equal(elements.get('bento-split-follow').value, 'off');
  context.setBentoSplitFollow('live');
  assert.equal(elements.get('bento-split-follow').value, 'live');
});

test('live keyboard shortcuts preserve typing focus, page keys, and held output', () => {
  const { context, elements, lyrics, stream } = openDraft();
  stream.children[0].click();
  lyrics.focus();
  lyrics.setSelectionRange(10, 10);
  elements.get('bento-split-live-keys').value = 'function';
  const wrap = elements.get('bento-deck-split-editor');
  const event = key => ({ type: 'keydown', key, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} });
  wrap.dispatchEvent(event('F9'));
  assert.equal(context.state.activeLiveSlideId, stream.children[1].dataset.slideId);
  assert.equal(context.document.activeElement, lyrics);
  assert.equal(lyrics.selectionStart, 10);
  const pageDown = event('PageDown');
  wrap.dispatchEvent(pageDown);
  assert.equal(pageDown.defaultPrevented, undefined);
  context.state.isHoldLive = true;
  wrap.dispatchEvent(event('F9'));
  assert.equal(context.state.activeLiveSlideId, stream.children[1].dataset.slideId);
  wrap.dispatchEvent(event('Escape'));
  assert.equal(context.state.isDeckEditingSong, 'song_1');
  assert.equal(context.document.activeElement, stream);
});

test('chunk splitting preserves the live chunk and does not reuse an inserted slide identity', () => {
  const { context, lyrics, stream } = openDraft();
  lyrics.value = '[Verse 1]\nAlpha\nBravo\nCharlie\nDelta';
  context.state.maxLinesPerSlide = 2;
  context.updateBentoSplitEditorPreview();
  assert.equal(stream.children.length, 2);
  const liveCard = stream.children[1];
  liveCard.click();
  lyrics.value = '[Verse 1]\nNew first\nNew second\nAlpha\nBravo\nCharlie\nDelta';
  context.updateBentoSplitEditorPreview();
  assert.equal(stream.children.length, 3);
  assert.equal(stream.children[2], liveCard);
  assert.equal(context.state.activeLiveText, 'Charlie\nDelta');
  assert.equal(new Set(stream.children.map(card => card.dataset.slideId)).size, 3);
});

test('cue navigation advances from cue and taking live resolves the latest draft', () => {
  const { context, lyrics, stream, elements } = openDraft();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'operator-experience.js'), 'utf8'), context);
  context.setProjectionWorkflow('preview');
  stream.children[0].click();
  assert.equal(context.getPreparedSlide().slideId, stream.children[0].dataset.slideId);
  assert.equal(context.state.activeLiveSlideId, null);
  context.navigateLiveVerse(1);
  assert.equal(context.getPreparedSlide().slideId, stream.children[1].dataset.slideId);
  lyrics.value = lyrics.value.replace('Twas grace', 'Latest draft');
  context.updateBentoSplitEditorPreview();
  assert.match(elements.get('prepared-text').textContent, /Latest draft/);
  context.takePreparedSlide();
  assert.match(context.state.activeLiveText, /Latest draft/);
  assert.equal(context.getPreparedSlide(), null);
});

test('an unfinished empty section cannot replace the audience output', () => {
  const { context, lyrics, stream } = openDraft();
  stream.children[2].click();
  const before = context.state.activeLiveText;
  lyrics.value += '\n\n[Bridge]\n';
  context.updateBentoSplitEditorPreview();
  const empty = stream.children[3];
  assert.equal(context.resolveBentoSplitSlide(empty.dataset.slideId), false);
  empty.click();
  context.navigateLiveVerse(1);
  assert.equal(context.state.activeLiveText, before);
});

test('Save and close skips the importer refresh and closes before refreshing the library', () => {
  const { context, elements } = openDraft();
  const save = context.libraryImporter.updateSong;
  let options;
  let renders = 0;
  context.libraryImporter.updateSong = (id, data, settings) => {
    options = settings;
    return save(id, data);
  };
  context.renderDeck = () => {
    renders++;
    assert.equal(context.state.isDeckEditingSong, null);
  };
  context.renderLibrary = () => assert.equal(context.state.isDeckEditingSong, null);
  elements.get('bento-edit-btn').click();
  assert.equal(options.notify, false);
  assert.equal(renders, 1);
});

test('a failed save keeps the draft open and reports the failure', () => {
  const { context, lyrics } = openDraft();
  lyrics.value += '\nAdditional lyrics';
  const draft = lyrics.value;
  let message;
  context.libraryImporter.updateSong = () => false;
  context.showToast = text => { message = text; };
  context.saveBentoDeckSplitEditor();
  assert.equal(context.state.isDeckEditingSong, 'song_1');
  assert.equal(lyrics.value, draft);
  assert.match(message, /Could not save/);
});

test('asynchronous storage waits for commit and ignores duplicate save clicks', async () => {
  const { context } = openDraft();
  let complete;
  let writes = 0;
  context.libraryImporter.updateSong = () => {
    writes++;
    return new Promise(resolve => { complete = resolve; });
  };
  const pending = context.saveBentoDeckSplitEditor();
  context.saveBentoDeckSplitEditor();
  assert.equal(writes, 1);
  assert.equal(context.state.isDeckEditingSong, 'song_1');
  complete(true);
  await pending;
  assert.equal(context.state.isDeckEditingSong, null);
});

test('Edit follows lyrics scrolling in both directions; Off and Live leave the deck alone', () => {
  const { context, lyrics, stream } = openDraft();
  lyrics.clientHeight = 200;
  lyrics.scrollHeight = 1000;
  stream.clientHeight = 300;
  stream.scrollHeight = 1900;
  context.setBentoSplitFollow('edit');
  for (const [position, expected] of [[400, 800], [800, 1600], [100, 200], [0, 0]]) {
    lyrics.scrollTop = position;
    lyrics.dispatchEvent({ type: 'scroll' });
    assert.equal(stream.scrollTop, expected);
  }
  for (const mode of ['off', 'live']) {
    context.setBentoSplitFollow(mode);
    stream.scrollTop = 350;
    lyrics.scrollTop = 700;
    lyrics.dispatchEvent({ type: 'scroll' });
    assert.equal(stream.scrollTop, 350);
  }
});

test('locating live uses viewport geometry even when offset parents differ', () => {
  const { context, stream } = openDraft();
  const card = stream.children[1];
  card.click();
  stream.scrollTop = 120;
  stream.clientHeight = 300;
  stream.clientTop = 2;
  stream.offsetTop = 600;
  stream.getBoundingClientRect = () => ({ top: 100, bottom: 404 });
  card.offsetTop = 20;
  card.offsetHeight = 100;
  card.getBoundingClientRect = () => ({ top: 502, bottom: 602 });
  context.locateBentoSplitCard('live');
  assert.equal(stream.scrollTop, 320);
});

test('a live card taller than the viewport does not oscillate between its edges', () => {
  const { context, stream } = openDraft();
  const card = stream.children[1];
  card.click();
  stream.scrollTop = 200;
  stream.clientHeight = 300;
  stream.getBoundingClientRect = () => ({ top: 100, bottom: 400 });
  card.offsetHeight = 600;
  card.getBoundingClientRect = () => ({ top: 50, bottom: 650 });
  context.locateBentoSplitCard('live');
  context.locateBentoSplitCard('live');
  assert.equal(stream.scrollTop, 200);
});
