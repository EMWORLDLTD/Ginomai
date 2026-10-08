'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setupTestEnvironment() {
  const domState = {
    elements: {},
    localStorage: {}
  };

  const createFakeElement = (id) => ({
    id,
    dataset: {},
    style: { display: '' },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this.contains(c)) this.remove(c);
          else this.add(c);
        } else if (force) {
          this.add(c);
        } else {
          this.remove(c);
        }
      }
    },
    innerHTML: '',
    textContent: '',
    value: '',
    setAttribute() {},
    removeAttribute() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    click() {}
  });

  const getElementById = (id) => {
    if (!domState.elements[id]) {
      domState.elements[id] = createFakeElement(id);
    }
    return domState.elements[id];
  };

  class FakeBroadcastChannel {
    constructor(name) { this.name = name; }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }

  const context = vm.createContext({
    console,
    BroadcastChannel: FakeBroadcastChannel,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    URLSearchParams,
    location: { search: '' },
    window: {
      location: { search: '' }
    },
    document: {
      readyState: 'complete',
      getElementById,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag) => createFakeElement(tag),
      addEventListener: () => {},
      body: { getAttribute: () => 'bento' }
    },
    localStorage: {
      getItem: (k) => domState.localStorage[k] || null,
      setItem: (k, v) => { domState.localStorage[k] = String(v); },
      removeItem: (k) => { delete domState.localStorage[k]; }
    },
    escapeHtml: (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    state: {
      currentTab: 'bible',
      bibleVersion: 'KJV',
      compareBibleVersion: 'NIV',
      isMedleyMode: false,
      isCompareMode: false,
      strongsMode: true,
      activeBibleBook: 'Matthew',
      activeBibleChapter: 16,
      agendaItems: []
    },
    BIBLE_DATABASE: {
      KJV: {},
      KJV_STRONGS: {
        'Matthew': {
          16: [
            { verse: 18, text: 'And<G1161> I say<G3004> also<G2504> unto thee<G4671>, That<G3754> thou<G4771> art<G1488> Peter<G4074>, and<G2532> upon<G1909> this<G5026> rock<G4073> I will build<G3618> my<G3450> church<G1577>; and<G2532> the gates<G4439> of hell<G86> shall<G2729> not<G3756> prevail against<G2729> it<G846>.' }
          ]
        },
        'Acts': {
          2: [
            { verse: 47, text: 'Praising<G134> God<G2316>, and<G2532> having<G2192> favour<G5485> with<G4314> all<G3650> the people<G2992>. And<G1161> the Lord<G2962> added<G4369> to the church<G1577> daily<G2596> <G2250> such as should be saved<G4982>.' }
          ]
        },
        'Genesis': {
          1: [
            { verse: 1, text: 'In the beginning<H7225> God<H430> created<H1254> the heaven<H8064> and the earth<H776>.' }
          ]
        }
      }
    },
    SONGS_DATABASE: [],
    showActionToast: () => {},
    showToast: () => {}
  });
  context.window = context;

  // Load strongs_unified fixture or real lexicon
  const lexPath = path.join(__dirname, '../lexicon/strongs_unified.json');
  if (fs.existsSync(lexPath)) {
    context.STRONGS_LEXICON_CACHE = JSON.parse(fs.readFileSync(lexPath, 'utf8'));
  }

  return { context, domState, getElementById };
}

test('searchStrongsConcordance finds Greek G1577 when searching "church"', () => {
  const { context } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);

  assert.equal(typeof context.searchStrongsConcordance, 'function');
  const results = context.searchStrongsConcordance('church');

  assert.ok(results.length > 0, 'Should return at least 1 match');
  const topResult = results[0];
  assert.equal(topResult.id, 'G1577');
  assert.equal(topResult.lang, 'Greek');
  assert.equal(topResult.lemma, 'ἐκκλησία');
  assert.ok(topResult.short_definition.toLowerCase().includes('assembly') || topResult.kjv_definition.toLowerCase().includes('church'));
});

test('searchStrongsConcordance finds Greek and Hebrew words when searching "love"', () => {
  const { context } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);

  const results = context.searchStrongsConcordance('love', { limit: 15 });
  assert.ok(results.length > 0);

  const hasGreek = results.some(r => r.lang === 'Greek' && (r.id === 'G25' || r.id === 'G26'));
  const hasHebrew = results.some(r => r.lang === 'Hebrew' && (r.id === 'H157' || r.id === 'H160' || r.id === 'H2617'));

  assert.ok(hasGreek, 'Should find Greek words for love (agapao / agape)');
  assert.ok(hasHebrew, 'Should find Hebrew words for love (ahab / ahabah)');
});

test('searchStrongsConcordance finds entries by transliteration and Strong ID', () => {
  const { context } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);

  // Search by transliteration: "shalom"
  const shalomMatches = context.searchStrongsConcordance('shalom');
  assert.ok(shalomMatches.length > 0);
  assert.equal(shalomMatches[0].id, 'H7965');
  assert.ok(shalomMatches[0].lemma.includes('ש') && shalomMatches[0].lemma.includes('ל') && shalomMatches[0].lemma.includes('ם'));

  // Search by direct Strong ID: "G1577"
  const idMatches = context.searchStrongsConcordance('G1577');
  assert.ok(idMatches.length > 0);
  assert.equal(idMatches[0].id, 'G1577');

  // Search by Greek script: "ἀγάπη"
  const scriptMatches = context.searchStrongsConcordance('ἀγάπη');
  assert.ok(scriptMatches.length > 0);
  assert.equal(scriptMatches[0].id, 'G26');
});

test('searchStrongsConcordance respects language filtering', () => {
  const { context } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);

  const greekOnly = context.searchStrongsConcordance('love', { lang: 'greek' });
  assert.ok(greekOnly.length > 0);
  assert.ok(greekOnly.every(r => r.lang === 'Greek' || r.id.startsWith('G')));

  const hebrewOnly = context.searchStrongsConcordance('love', { lang: 'hebrew' });
  assert.ok(hebrewOnly.length > 0);
  assert.ok(hebrewOnly.every(r => r.lang === 'Hebrew' || r.id.startsWith('H')));
});

test('getStrongsBibleOccurrences locates verses containing Strong ID in KJV_STRONGS', () => {
  const { context } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);

  assert.equal(typeof context.getStrongsBibleOccurrences, 'function');
  const occ = context.getStrongsBibleOccurrences('G1577');

  assert.equal(occ.totalCount, 2);
  assert.equal(occ.occurrences.length, 2);
  assert.equal(occ.occurrences[0].ref, 'Matthew 16:18');
  assert.equal(occ.occurrences[1].ref, 'Acts 2:47');
  assert.ok(occ.occurrences[0].text.includes('church'));
  assert.ok(occ.occurrences[0].matchedWords.includes('church'));
});

test('searchStrongsBibleWords associates English words with Strong IDs', () => {
  const { context } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);

  assert.equal(typeof context.searchStrongsBibleWords, 'function');
  const wordResult = context.searchStrongsBibleWords('church');

  assert.ok(wordResult.verses.length > 0);
  const foundG1577 = wordResult.associatedStrongIds.find(a => a.id === 'G1577');
  assert.ok(foundG1577, 'Should map "church" to G1577');
});

test('switchOmniSearchMode supports strongs concordance mode', () => {
  const { context, getElementById } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);
  vm.runInContext(appCode, context);

  const tabStrongs = getElementById('omni-tab-strongs');
  const input = getElementById('omni-search-input');

  context.switchOmniSearchMode('strongs', false);

  assert.equal(context.omniSearchCurrentMode, 'strongs');
  assert.ok(tabStrongs.classList.contains('active'));
  assert.ok(input.placeholder.toLowerCase().includes("strong's") || input.placeholder.toLowerCase().includes("concordance"));
});

test('handleStrongsDrawerSearch populates live dropdown and selectStrongsDrawerSearchItem switches entry', () => {
  const { context, getElementById } = setupTestEnvironment();
  const strongsDetectorCode = fs.readFileSync(path.join(__dirname, '../js/strongs-detector.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.runInContext(strongsDetectorCode, context);
  vm.runInContext(appCode, context);

  const dropdown = getElementById('strongs-drawer-search-dropdown');
  const input = getElementById('strongs-drawer-search-input');

  context.handleStrongsDrawerSearch('church');
  assert.equal(dropdown.style.display, 'block');
  assert.ok(dropdown.innerHTML.includes('G1577'));
  assert.ok(dropdown.innerHTML.includes('ἐκκλησία'));

  let inspectedId = null;
  context.openLexiconInspector = (id) => { inspectedId = id; };

  context.selectStrongsDrawerSearchItem('G1577', 'church');
  assert.equal(input.value, '');
  assert.equal(dropdown.style.display, 'none');
  assert.equal(inspectedId, 'G1577');
});
