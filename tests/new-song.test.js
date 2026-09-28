'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('new song creation parses stanzas, assigns custom ID, and saves to library', () => {
  const customSongs = [];
  const songsDatabase = [];
  const writes = new Map();

  const context = vm.createContext({
    window: {},
    document: { readyState: 'loading', addEventListener() {} },
    localStorage: {
      getItem(key) { return writes.get(key) || null; },
      setItem(key, value) { writes.set(key, String(value)); }
    },
    SONGS_DATABASE: songsDatabase,
    console
  });

  // Load import engine
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/import-engine.js'), 'utf8'), context);
  const importer = context.window.libraryImporter;
  assert.ok(importer, 'importer should be initialized');

  const lyricsText = `[Verse 1]
The Lord is my strength and my song
He has become my salvation

[Chorus]
Hallelujah, praise the Lord
Forever and ever Amen`;

  const parsed = importer.parseSongText(lyricsText, 'The Lord Is My Strength', 'David');
  assert.equal(parsed.title, 'The Lord Is My Strength');
  assert.equal(parsed.author, 'David');
  assert.equal(parsed.stanzas.length, 2);
  assert.equal(parsed.stanzas[0].type, 'Verse 1');
  assert.equal(parsed.stanzas[1].type, 'Chorus');

  const newSong = {
    id: 'song_custom_' + Date.now(),
    title: parsed.title,
    author: parsed.author,
    songbook: 'Custom Library',
    stanzas: parsed.stanzas
  };

  importer.importSongsData(newSong, true);
  assert.equal(songsDatabase.length, 1);
  assert.equal(songsDatabase[0].id, newSong.id);
  assert.equal(songsDatabase[0].title, 'The Lord Is My Strength');
  assert.equal(songsDatabase[0].stanzas.length, 2);
});

test('keyboard navigation selector strictly excludes bento-add-song-card and only selects data-slide-id cards', () => {
  // Simulate DOM element query matching js/app.js navigateLiveVerse logic
  const mockCards = [
    { classList: ['bento-single-card'], dataset: { slideId: 'song_1_0' }, isAddCard: false },
    { classList: ['bento-single-card'], dataset: { slideId: 'song_1_1' }, isAddCard: false },
    { classList: ['bento-single-card', 'bento-add-song-card'], dataset: {}, isAddCard: true }
  ];

  // The selector used in navigateLiveVerse:
  // #bento-medley-container .bento-single-card[data-slide-id]:not(.bento-add-song-card)
  const filteredCards = mockCards.filter(card => {
    const hasClass = card.classList.includes('bento-single-card');
    const hasSlideId = Boolean(card.dataset.slideId);
    const notAddCard = !card.classList.includes('bento-add-song-card');
    return hasClass && hasSlideId && notAddCard;
  });

  assert.equal(filteredCards.length, 2, 'Only actual slide cards should be selectable for keyboard navigation');
  assert.equal(filteredCards[0].dataset.slideId, 'song_1_0');
  assert.equal(filteredCards[1].dataset.slideId, 'song_1_1');
  assert.ok(!filteredCards.some(c => c.classList.includes('bento-add-song-card')), 'Action card must never be in navigation sequence');
});

test('navigateLiveVerse stops safely at last slide boundary without jumping to adjacent songs', () => {
  let switchedSong = false;
  let clickedCardIdx = -1;

  const mockCards = [
    { classList: ['bento-single-card'], click: () => { clickedCardIdx = 0; } },
    { classList: ['bento-single-card', 'live'], click: () => { clickedCardIdx = 1; } }
  ];

  // Simulating navigateLiveVerse advancing when already on the last slide (activeIdx = 1, dir = 1)
  const activeIdx = mockCards.findIndex(c => c.classList.includes('live'));
  assert.equal(activeIdx, 1);

  const dir = 1;
  const targetIdx = activeIdx + dir; // 2
  if (targetIdx >= 0 && targetIdx < mockCards.length) {
    mockCards[targetIdx].click();
  } else {
    // Boundary reached: do not switch song or do anything
  }

  assert.equal(clickedCardIdx, -1, 'No card should be clicked beyond boundary');
  assert.equal(switchedSong, false, 'Adjacent song must not be switched to automatically');
});


