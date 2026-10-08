'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setupEnvironment() {
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
    replaceChildren() {},
    insertBefore() {},
    children: [],
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
      currentTab: 'songs',
      bibleVersion: 'KJV',
      compareBibleVersion: 'NIV',
      isMedleyMode: false,
      isCompareMode: false,
      strongsMode: false,
      activeBibleBook: '1 Corinthians',
      activeBibleChapter: 4,
      activeSongId: 'song_1'
    },
    BIBLE_DATABASE: {
      KJV_STRONGS: {
        '1 Corinthians': {
          4: [
            { verse: 1, text: 'Let<G3049> a man<G444> so<G3779> account<G3049> of us<G2248>, as<G5613> of the ministers<G5257> of Christ<G5547>, and<G2532> stewards<G3623> of the mysteries<G3466> of God<G2316>.' },
            { verse: 2, text: '<G3739> <G1161> Moreover<G3063> it is required<G2212> in<G1722> stewards<G3623>, that<G2443> a man<G5100> be found<G2147> faithful<G4103>.' },
            { verse: 3, text: "But<G1161> with me<G1698> it is<G2076> a very small thing<G1519> <G1646> that<G2443> I should be judged<G350> of<G5259> you<G5216>, or<G2228> of<G5259> man's<G442> judgment<G2250>: yea<G235>, I judge<G350> not<G3761> mine own self<G1683>. <sup>judgment: Gr. day</sup>" }
          ]
        }
      }
    },
    SONGS_DATABASE: [
      { id: 'song_1', title: 'The Presence of the Lord (Live)', verses: ['Verse 1 text'] }
    ],
    showActionToast: () => {}
  });
  context.window = context;

  return { context, domState, getElementById };
}

test('stripStrongsTags cleanly strips Strong tags, empty word tokens, and footnotes', () => {
  const { context } = setupEnvironment();
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.runInContext(appCode, context);

  assert.equal(typeof context.stripStrongsTags, 'function');

  // Test verse 1
  const v1 = 'Let<G3049> a man<G444> so<G3779> account<G3049> of us<G2248>, as<G5613> of the ministers<G5257> of Christ<G5547>, and<G2532> stewards<G3623> of the mysteries<G3466> of God<G2316>.';
  assert.equal(
    context.stripStrongsTags(v1),
    'Let a man so account of us, as of the ministers of Christ, and stewards of the mysteries of God.'
  );

  // Test verse 2 with untranslated tokens <G3739> <G1161>
  const v2 = '<G3739> <G1161> Moreover<G3063> it is required<G2212> in<G1722> stewards<G3623>, that<G2443> a man<G5100> be found<G2147> faithful<G4103>.';
  assert.equal(
    context.stripStrongsTags(v2),
    'Moreover it is required in stewards, that a man be found faithful.'
  );

  // Test verse 3 with footnote <sup>judgment: Gr. day</sup>
  const v3 = "But<G1161> with me<G1698> it is<G2076> a very small thing<G1519> <G1646> that<G2443> I should be judged<G350> of<G5259> you<G5216>, or<G2228> of<G5259> man's<G442> judgment<G2250>: yea<G235>, I judge<G350> not<G3761> mine own self<G1683>. <sup>judgment: Gr. day</sup>";
  assert.equal(
    context.stripStrongsTags(v3),
    "But with me it is a very small thing that I should be judged of you, or of man's judgment: yea, I judge not mine own self."
  );

  // Test Hebrew verse
  const hebrew = 'In the beginning<H7225> God<H430> created<H1254> the heaven<H8064> and the earth<H776>.';
  assert.equal(
    context.stripStrongsTags(hebrew),
    'In the beginning God created the heaven and the earth.'
  );
});

test('formatStrongsVerseHtml handles footnotes cleanly and outputs interactive word tags', () => {
  const { context } = setupEnvironment();
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.runInContext(appCode, context);

  const v3 = "But<G1161> with me<G1698> it is<G2076> mine own self<G1683>. <sup>judgment: Gr. day</sup>";
  const html = context.formatStrongsVerseHtml(v3);

  // Footnote <sup> is removed
  assert.ok(!html.includes('judgment: Gr. day'));
  // Interactive tags are created
  assert.ok(html.includes('data-strong="G1161"'));
  assert.ok(html.includes('data-strong="G1698"'));
  assert.ok(html.includes('data-strong="G1683"'));
});

test('bento-strongs-btn is hidden when currentTab is songs and visible when bible', () => {
  const { context, getElementById } = setupEnvironment();
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const bentoCode = fs.readFileSync(path.join(__dirname, '../js/bento-integration.js'), 'utf8');
  vm.runInContext(appCode, context);
  vm.runInContext(bentoCode, context);

  const strongsBtn = getElementById('bento-strongs-btn');

  // 1. When on songs tab
  context.state.currentTab = 'songs';
  context.renderBentoDeck();
  assert.equal(strongsBtn.style.display, 'none');

  // 2. When on bible tab
  context.state.currentTab = 'bible';
  context.renderBentoDeck();
  assert.equal(strongsBtn.style.display, 'inline-flex');

  // 3. Switch back to songs
  context.state.currentTab = 'songs';
  context.renderBentoDeck();
  assert.equal(strongsBtn.style.display, 'none');
});

test('projectSlide sanitizes scripture slide text and does not project raw Strong tags', () => {
  const { context } = setupEnvironment();
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.runInContext(appCode, context);

  let capturedText = null;
  context.updateLivePreview = (payload) => {
    capturedText = payload.text;
  };
  context.broadcastState = (payload) => {
    if (payload && payload.text) capturedText = payload.text;
  };

  const rawTaggedVerse = 'Let<G3049> a man<G444> so<G3779> account<G3049> of us<G2248>, as<G5613> of the ministers<G5257> of Christ<G5547>. <sup>minister: Gr. hypēretēs</sup>';
  context.projectSlide('bible_KJV_1 Corinthians_4_1', rawTaggedVerse, '1 Corinthians 4:1 (KJV)');

  assert.equal(
    capturedText,
    'Let a man so account of us, as of the ministers of Christ.'
  );
  assert.ok(!capturedText.includes('<G'));
  assert.ok(!capturedText.includes('<sup>'));
});
