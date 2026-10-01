'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setupTestEnvironment() {
  const elements = new Map();
  function makeElement(id, tagName = 'div') {
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      dataset: {},
      style: {},
      className: '',
      children: [],
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        toggle(c, on) {
          if (on === undefined) on = !this._classes.has(c);
          if (on) this.add(c); else this.remove(c);
          return on;
        },
        contains(c) { return this._classes.has(c); }
      },
      appendChild(child) {
        child.parentElement = el;
        el.children.push(child);
        return child;
      },
      append(...children) {
        children.forEach(c => { if (c && typeof c === 'object') this.appendChild(c); });
      },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      removeAttribute(attr) { delete el[attr]; },
      setAttribute(attr, val) { el[attr] = val; },
      addEventListener() {},
      removeEventListener() {},
      click() {
        if (typeof this.onclick === 'function') this.onclick({ button: 0, target: this, stopPropagation: () => {} });
      }
    };
    elements.set(id, el);
    return el;
  }

  const ids = [
    'prepared-reference', 'prepared-text', 'prepared-slide',
    'bento-deck-title', 'bento-deck-sub', 'deck-container',
    'bento-medley-container', 'auto-project-btn'
  ];
  ids.forEach(id => makeElement(id));

  const state = {
    currentTab: 'songs',
    activeDeckType: 'song',
    activeLiveSlideId: null,
    activeLiveText: '',
    activeLiveRef: '',
    activeSongId: null,
    activeBibleBook: '',
    activeBibleChapter: 1,
    activeBibleVerse: 1,
    bibleVersion: 'KJV',
    liveEngagedDeck: null,
    isMedleyMode: false,
    autoProject: false,
    isHoldLive: false
  };

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

  const context = {
    Element: ElementMock,
    MutationObserver: MutationObserverMock,
    window: {},
    document: {
      createElement: makeElement,
      getElementById: id => elements.get(id) || makeElement(id),
      querySelector: sel => sel.startsWith('#') ? (elements.get(sel.slice(1)) || makeElement(sel.slice(1))) : makeElement('mock'),
      querySelectorAll: () => [],
      body: makeElement('body'),
      addEventListener() {},
      removeEventListener() {}
    },
    localStorage: {
      _store: { sf_projection_workflow: 'smart' },
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    },
    setInterval: () => 1,
    clearInterval: () => {},
    URLSearchParams: global.URLSearchParams,
    location: { search: '' },
    setTimeout: fn => fn(),
    clearTimeout: () => {},
    requestAnimationFrame: fn => fn(),
    console,
    state,
    SONGS_DATABASE
  };

  context.window = context;
  vm.createContext(context);

  // Load operator experience
  const opExpCode = fs.readFileSync(path.join(__dirname, '../js/operator-experience.js'), 'utf8');
  vm.runInContext(opExpCode, context);

  // Load projectSlide and app helpers
  function syncStateFromSlideId(slideId) {
    if (!slideId) return false;
    if (slideId.startsWith('bible_')) {
      const parts = slideId.split('_');
      // bible_Genesis_1_1
      if (parts.length >= 4) {
        state.activeBibleBook = parts[1];
        state.activeBibleChapter = parseInt(parts[2], 10);
        state.activeBibleVerse = parseInt(parts[3], 10);
      }
    } else {
      const matched = SONGS_DATABASE.find(s => slideId.startsWith(s.id + '_') || slideId === s.id);
      if (matched && matched.id !== state.activeSongId) {
        state.activeSongId = matched.id;
      }
    }
    return false;
  }

  function projectSlide(slideId, text, reference, extra = {}) {
    if (state.isHoldLive) return;
    if (context.window.prepareSlideIfNeeded?.(slideId, text, reference, extra)) return;
    if (typeof context.window.cancelPreparedSlide === 'function') {
      context.window.cancelPreparedSlide();
    }

    let isBible = false;
    if (extra.contentType) {
      isBible = (extra.contentType === 'bible');
    } else if (extra.isBible !== undefined) {
      isBible = Boolean(extra.isBible);
    } else if (slideId.startsWith('bible_') || slideId.startsWith('medley_bible_') || slideId.startsWith('para_') || slideId.startsWith('hist_')) {
      isBible = true;
    } else if (slideId.startsWith('song_') || slideId.startsWith('medley_song_') || slideId.startsWith('ai_song_')) {
      isBible = false;
    } else if (state.activeDeckType === 'bible') {
      isBible = true;
    } else if (state.activeDeckType === 'song') {
      isBible = false;
    } else if (state.currentTab === 'bible') {
      isBible = true;
    } else {
      isBible = false;
    }

    state.activeLiveSlideId = slideId;
    state.activeLiveText = text;
    state.activeLiveRef = reference;
    state.activeDeckType = isBible ? 'bible' : 'song';

    syncStateFromSlideId(slideId);

    state.liveEngagedDeck = isBible
      ? { type: 'bible', book: state.activeBibleBook, chapter: state.activeBibleChapter }
      : { type: 'song', songId: state.activeSongId };
  }

  function selectSingleViewSong(songId) {
    const isDifferent = (state.activeSongId !== songId);
    state.activeSongId = songId;
    state.activeDeckType = 'song';
    if (isDifferent) {
      state.liveEngagedDeck = null;
      if (typeof context.window.cancelPreparedSlide === 'function') context.window.cancelPreparedSlide();
    }
  }

  function selectBibleChapter(book, chapterNum) {
    const ch = parseInt(chapterNum, 10) || 1;
    const isDifferent = (state.activeBibleBook !== book || state.activeBibleChapter !== ch);
    state.activeBibleBook = book;
    state.activeBibleChapter = ch;
    state.activeDeckType = 'bible';
    if (isDifferent) {
      state.liveEngagedDeck = null;
      if (typeof context.window.cancelPreparedSlide === 'function') context.window.cancelPreparedSlide();
    }
  }

  function clearAllOutputs() {
    if (context.window.cancelPreparedSlide) context.window.cancelPreparedSlide();
    state.activeLiveSlideId = null;
    state.activeLiveText = '';
    state.activeLiveRef = '';
    state.liveEngagedDeck = null;
  }

  context.projectSlide = projectSlide;
  context.selectSingleViewSong = selectSingleViewSong;
  context.selectBibleChapter = selectBibleChapter;
  context.clearAllOutputs = clearAllOutputs;
  context.window.projectSlide = projectSlide;

  return { context, state, window: context.window };
}

test('Scenario 1: Pick song -> click stanza CUEs -> Space takes Live -> subsequent stanzas Follow-Suit directly', () => {
  const { context, state, window } = setupTestEnvironment();

  // 1. Pick song_1 from library
  context.selectSingleViewSong('song_1');
  assert.equal(state.activeSongId, 'song_1');
  assert.equal(state.liveEngagedDeck, null, 'Deck must not be engaged yet');
  assert.equal(window.getPreparedSlide(), null);

  // 2. Click Stanza 0 -> First click must CUE, not project live
  context.projectSlide('song_1_0', 'Amazing grace how sweet the sound', 'Amazing Grace (Verse 1)');
  const staged = window.getPreparedSlide();
  assert.ok(staged, 'Stanza 0 must be staged in CUE');
  assert.equal(staged.slideId, 'song_1_0');
  assert.equal(state.activeLiveSlideId, null, 'Display must not be live yet');
  assert.equal(state.liveEngagedDeck, null);

  // 3. Spacebar / Enter / Cutout trigger -> Take Live
  window.takePreparedSlide();
  assert.equal(window.getPreparedSlide(), null, 'Staged slide cleared once live');
  assert.equal(state.activeLiveSlideId, 'song_1_0', 'Display now shows Stanza 0');
  assert.ok(state.liveEngagedDeck, 'Deck is now engaged');
  assert.equal(state.liveEngagedDeck.type, 'song');
  assert.equal(state.liveEngagedDeck.songId, 'song_1');

  // 4. Follow-Suit: Clicking Stanza 1 in same song goes LIVE immediately
  context.projectSlide('song_1_1', 'Twas grace that taught my heart to fear', 'Amazing Grace (Verse 2)');
  assert.equal(window.getPreparedSlide(), null, 'Follow-suit slide must not queue');
  assert.equal(state.activeLiveSlideId, 'song_1_1', 'Display directly switches to Stanza 1 live');

  // 5. Follow-Suit: Clicking Stanza 2 in same song also goes LIVE immediately
  context.projectSlide('song_1_2', 'Through many dangers toils and snares', 'Amazing Grace (Verse 3)');
  assert.equal(window.getPreparedSlide(), null);
  assert.equal(state.activeLiveSlideId, 'song_1_2');
});

test('Scenario 2: Selecting another song cleanly disengages follow-suit so its first click CUEs again', () => {
  const { context, state, window } = setupTestEnvironment();

  // Song 1 is live
  context.selectSingleViewSong('song_1');
  context.projectSlide('song_1_0', 'Amazing grace...', 'Amazing Grace (Verse 1)');
  window.takePreparedSlide();
  assert.equal(state.activeLiveSlideId, 'song_1_0');
  assert.equal(state.liveEngagedDeck.songId, 'song_1');

  // Now operator picks Song 2
  context.selectSingleViewSong('song_2');
  assert.equal(state.activeSongId, 'song_2');
  assert.equal(state.liveEngagedDeck, null, 'Deck engagement reset on picking new song');

  // First click on Song 2 Verse 1 -> MUST CUE, NOT GO LIVE
  context.projectSlide('song_2_0', 'O Lord my God...', 'How Great Thou Art (Verse 1)');
  const staged = window.getPreparedSlide();
  assert.ok(staged, 'New song must CUE on first click');
  assert.equal(staged.slideId, 'song_2_0');
  assert.equal(state.activeLiveSlideId, 'song_1_0', 'Sanctuary display remains safely on previous slide');

  // Space takes Song 2 live
  window.takePreparedSlide();
  assert.equal(state.activeLiveSlideId, 'song_2_0');
  assert.equal(state.liveEngagedDeck.songId, 'song_2');

  // Next stanza in Song 2 follows suit live
  context.projectSlide('song_2_1', 'When through the woods...', 'How Great Thou Art (Verse 2)');
  assert.equal(window.getPreparedSlide(), null);
  assert.equal(state.activeLiveSlideId, 'song_2_1');
});

test('Scenario 3: Clear Text disengages deck so subsequent picks always enter CUE', () => {
  const { context, state, window } = setupTestEnvironment();

  // Take slide live
  context.selectSingleViewSong('song_1');
  context.projectSlide('song_1_0', 'Lyrics', 'Ref');
  window.takePreparedSlide();
  assert.equal(state.activeLiveSlideId, 'song_1_0');

  // Operator hits Clear Text
  context.clearAllOutputs();
  assert.equal(state.activeLiveSlideId, null);
  assert.equal(state.liveEngagedDeck, null);
  assert.equal(window.getPreparedSlide(), null);

  // Next click must CUE
  context.projectSlide('song_1_0', 'Lyrics', 'Ref');
  assert.ok(window.getPreparedSlide(), 'Must CUE after clear text');
  assert.equal(state.activeLiveSlideId, null, 'Must not be live yet');
});

test('Scenario 4: Scripture selection CUEs first, Space takes live, subsequent verses follow suit, new chapter CUEs again', () => {
  const { context, state, window } = setupTestEnvironment();

  // Select Genesis 1
  context.selectBibleChapter('Genesis', 1);
  assert.equal(state.liveEngagedDeck, null);

  // Click Genesis 1:1 -> CUE
  context.projectSlide('bible_Genesis_1_1', 'In the beginning...', 'Genesis 1:1');
  assert.ok(window.getPreparedSlide(), 'First verse must CUE');
  assert.equal(state.activeLiveSlideId, null);

  // Take live
  window.takePreparedSlide();
  assert.equal(state.activeLiveSlideId, 'bible_Genesis_1_1');
  assert.equal(state.liveEngagedDeck.type, 'bible');
  assert.equal(state.liveEngagedDeck.book, 'Genesis');
  assert.equal(state.liveEngagedDeck.chapter, 1);

  // Verse 2 in same chapter follows suit live
  context.projectSlide('bible_Genesis_1_2', 'And the earth was without form...', 'Genesis 1:2');
  assert.equal(window.getPreparedSlide(), null);
  assert.equal(state.activeLiveSlideId, 'bible_Genesis_1_2');

  // Switch to Genesis 2 -> disengages
  context.selectBibleChapter('Genesis', 2);
  assert.equal(state.liveEngagedDeck, null);

  // First verse of Genesis 2 must CUE
  context.projectSlide('bible_Genesis_2_1', 'Thus the heavens and earth were finished...', 'Genesis 2:1');
  assert.ok(window.getPreparedSlide(), 'New chapter must CUE first');
  assert.equal(state.activeLiveSlideId, 'bible_Genesis_1_2', 'Display remains untouched');
});

test('Scenario 5: Decoupled tabs: browsing Bible library tab while Song deck is live never breaks follow-suit', () => {
  const { context, state, window } = setupTestEnvironment();

  // Song is live in center deck
  context.selectSingleViewSong('song_1');
  context.projectSlide('song_1_0', 'Verse 1 text', 'Amazing Grace (Verse 1)');
  window.takePreparedSlide();
  assert.equal(state.activeLiveSlideId, 'song_1_0');
  assert.equal(state.activeDeckType, 'song');

  // Operator browses Bible in sidebar library tab
  state.currentTab = 'bible';

  // Operator clicks Stanza 1 in the song deck
  context.projectSlide('song_1_1', 'Verse 2 text', 'Amazing Grace (Verse 2)');

  // Must follow suit live, NOT queue, and NOT switch activeDeckType or liveEngagedDeck to bible!
  assert.equal(window.getPreparedSlide(), null, 'Must follow suit live');
  assert.equal(state.activeLiveSlideId, 'song_1_1');
  assert.equal(state.activeDeckType, 'song', 'Deck type must remain song');
  assert.equal(state.liveEngagedDeck.type, 'song');
  assert.equal(state.liveEngagedDeck.songId, 'song_1');
});
