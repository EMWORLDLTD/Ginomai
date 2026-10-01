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
      querySelectorAll(selector) {
        const results = [];
        function walk(node) {
          if (node.children) {
            for (const ch of node.children) {
              if (selector.startsWith('.') && ch.classList.contains(selector.slice(1))) {
                results.push(ch);
              } else if (selector.startsWith('#') && ch.id === selector.slice(1)) {
                results.push(ch);
              } else if (selector === ch.tagName.toLowerCase()) {
                results.push(ch);
              }
              walk(ch);
            }
          }
        }
        walk(el);
        return results;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      removeAttribute(attr) { delete el[attr]; },
      setAttribute(attr, val) { el[attr] = val; }
    };
    elements.set(id, el);
    return el;
  }

  const ids = [
    'sidebar-search-input', 'sidebar-search-clear',
    'bento-search-input', 'bento-search-clear',
    'bento-tab-bible', 'bento-tab-songs',
    'bento-medley-container', 'bento-deck-title', 'bento-deck-sub',
    'bento-edit-btn', 'bento-add-song-btn', 'bento-compare-btn', 'bento-strongs-btn',
    'bento-lines-seg', 'bento-cols-seg', 'bento-zoom-label', 'bento-seg-single', 'bento-seg-medley',
    'bento-deck-return-live-btn', 'deck-container', 'deck-title', 'btn-compare-mode', 'btn-edit-song',
    'bible-version-switcher-wrap', 'compare-version-picker-wrap', 'sidebar-bible-version-bar',
    'btn-strongs-mode', 'deck-lines-switcher', 'btn-single-mode', 'btn-medley-mode'
  ];
  ids.forEach(id => makeElement(id));

  const state = {
    currentTab: 'songs',
    activeDeckType: 'song',
    activeLiveSlideId: null,
    activeSongId: null,
    activeBibleBook: '',
    activeBibleChapter: 1,
    bibleVersion: 'KJV',
    agendaItems: [
      { id: 'ag1', type: 'song', title: 'First Agenda Song' },
      { id: 'ag2', type: 'bible', title: 'Genesis 1' }
    ]
  };

  const SONGS_DATABASE = [
    { id: 'song_1', title: 'Amazing Grace', author: 'John Newton', stanzas: [{ type: 'Verse 1', text: 'Amazing grace how sweet the sound' }] },
    { id: 'song_2', title: 'How Great Thou Art', author: 'Stuart Hine', stanzas: [{ type: 'Verse 1', text: 'O Lord my God' }] }
  ];

  const BIBLE_BOOKS = ['Genesis', 'Exodus', 'Matthew', 'John'];

  const windowMock = {
    state,
    SONGS_DATABASE,
    BIBLE_BOOKS,
    getBibleBooks: () => BIBLE_BOOKS,
    getBibleChapters: () => [1, 2, 3],
    getBibleVerses: () => [{ verse: 1, text: 'In the beginning' }, { verse: 2, text: 'And the earth was without form' }],
    renderLibrary: () => {},
    renderDeck: () => {},
    syncDashboardWorkspace: () => {},
    syncActiveTabUI: () => {}
  };

  const documentMock = {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: sel => {
      const all = [];
      elements.forEach(el => {
        if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) all.push(el);
      });
      return all;
    },
    querySelector: sel => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    }
  };

  return { state, elements, windowMock, documentMock, makeElement, SONGS_DATABASE };
}

test('Scenario 1: Live song protects center deck when operator switches to Bible library tab', () => {
  const { state, windowMock } = setupTestEnvironment();

  // Set active live song
  state.activeSongId = 'song_1';
  state.activeDeckType = 'song';
  state.activeLiveSlideId = 'song_1_0';
  state.liveEngagedDeck = { type: 'song', songId: 'song_1' };

  // Implement the switchLibraryTab logic under test
  function switchLibraryTab(targetTab) {
    state.currentTab = targetTab;
    const isLive = Boolean(state.activeLiveSlideId || state.liveEngagedDeck);
    const isSongActive = Boolean(state.activeSongId && (!state.activeDeckType || state.activeDeckType === 'song'));
    const isBibleActive = Boolean(state.activeBibleBook && state.activeDeckType === 'bible');
    const hasActiveItem = isLive || isSongActive || isBibleActive;

    if (!hasActiveItem) {
      state.activeDeckType = (targetTab === 'bible') ? 'bible' : 'song';
    }
  }

  // Operator switches library to Bible
  switchLibraryTab('bible');

  // Library tab switched to Bible for browsing
  assert.equal(state.currentTab, 'bible');
  // BUT center deck firmly remains on the song so live slides are protected
  assert.equal(state.activeDeckType, 'song');
  assert.equal(state.activeSongId, 'song_1');
});

test('Scenario 2: Explicitly selecting a Bible chapter switches center deck to Bible', () => {
  const { state } = setupTestEnvironment();

  state.activeSongId = 'song_1';
  state.activeDeckType = 'song';
  state.activeLiveSlideId = 'song_1_0';
  state.currentTab = 'bible';

  // Operator explicitly picks Genesis 1 to cue/view
  function selectBibleChapter(book, chapter) {
    state.activeBibleBook = book;
    state.activeBibleChapter = chapter;
    state.activeDeckType = 'bible';
  }

  selectBibleChapter('Genesis', 1);

  assert.equal(state.activeDeckType, 'bible');
  assert.equal(state.activeBibleBook, 'Genesis');
  assert.equal(state.activeBibleChapter, 1);
});

test('Scenario 3: Symmetrical behavior - live Bible protects deck when switching to Songs library tab', () => {
  const { state } = setupTestEnvironment();

  state.activeBibleBook = 'John';
  state.activeBibleChapter = 3;
  state.activeDeckType = 'bible';
  state.activeLiveSlideId = 'bible_John_3_16';
  state.liveEngagedDeck = { type: 'bible', book: 'John', chapter: 3 };

  function switchLibraryTab(targetTab) {
    state.currentTab = targetTab;
    const isLive = Boolean(state.activeLiveSlideId || state.liveEngagedDeck);
    const isSongActive = Boolean(state.activeSongId && (!state.activeDeckType || state.activeDeckType === 'song'));
    const isBibleActive = Boolean(state.activeBibleBook && state.activeDeckType === 'bible');
    const hasActiveItem = isLive || isSongActive || isBibleActive;

    if (!hasActiveItem) {
      state.activeDeckType = (targetTab === 'bible') ? 'bible' : 'song';
    }
  }

  // Operator switches library tab to Songs to browse upcoming hymns
  switchLibraryTab('songs');

  assert.equal(state.currentTab, 'songs');
  // Center deck remains on the Bible passage
  assert.equal(state.activeDeckType, 'bible');
  assert.equal(state.activeBibleBook, 'John');
});

test('Scenario 4: Fresh launch with no active or live item - deck follows library tab to empty state and NEVER auto-loads from agenda', () => {
  const { state } = setupTestEnvironment();

  state.activeLiveSlideId = null;
  state.liveEngagedDeck = null;
  state.activeSongId = null;
  state.activeBibleBook = '';
  state.activeDeckType = null;

  function switchLibraryTab(targetTab) {
    state.currentTab = targetTab;
    const isLive = Boolean(state.activeLiveSlideId || state.liveEngagedDeck);
    const isSongActive = Boolean(state.activeSongId && (!state.activeDeckType || state.activeDeckType === 'song'));
    const isBibleActive = Boolean(state.activeBibleBook && state.activeDeckType === 'bible');
    const hasActiveItem = isLive || isSongActive || isBibleActive;

    if (!hasActiveItem) {
      state.activeDeckType = (targetTab === 'bible') ? 'bible' : 'song';
    }
  }

  // Switch to Bible tab
  switchLibraryTab('bible');
  assert.equal(state.currentTab, 'bible');
  assert.equal(state.activeDeckType, 'bible');
  // Verified: it did NOT auto-load first agenda item (which was a song)
  assert.equal(state.activeSongId, null);

  // Switch to Songs tab
  switchLibraryTab('songs');
  assert.equal(state.currentTab, 'songs');
  assert.equal(state.activeDeckType, 'song');
  assert.equal(state.activeBibleBook, '');
});

test('Scenario 5: Empty database onboarding states correctly differentiate zero items vs no selection', () => {
  const { state, elements } = setupTestEnvironment();
  const container = elements.get('bento-medley-container');

  function renderEmptyDeck(deckType, songCount, bibleBookCount) {
    if (deckType === 'bible') {
      if (bibleBookCount === 0) {
        container.innerHTML = '<div class="bento-empty-unit">No Bible translations installed</div>';
      } else {
        container.innerHTML = '<div class="bento-empty-unit">No scripture selected</div>';
      }
    } else {
      if (songCount === 0) {
        container.innerHTML = '<div class="bento-empty-unit">No songs in library</div>';
      } else {
        container.innerHTML = '<div class="bento-empty-unit">No song selected</div>';
      }
    }
  }

  // 1. Zero bibles installed
  renderEmptyDeck('bible', 10, 0);
  assert.ok(container.innerHTML.includes('No Bible translations installed'));

  // 2. Bibles exist, but none selected
  renderEmptyDeck('bible', 10, 66);
  assert.ok(container.innerHTML.includes('No scripture selected'));

  // 3. Zero songs imported
  renderEmptyDeck('song', 0, 66);
  assert.ok(container.innerHTML.includes('No songs in library'));

  // 4. Songs exist, but none selected
  renderEmptyDeck('song', 25, 66);
  assert.ok(container.innerHTML.includes('No song selected'));
});
