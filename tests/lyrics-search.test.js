const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Local Lyrics Search: resilient matching across line breaks, punctuation, and contractions', async () => {
  // Load app.js matching functions into a sandbox
  const appJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  // Extract normalizeSearchText, extractSnippetAroundMatch, getSongSearchIndex, matchSongQuery
  const startIdx = appJsCode.indexOf('function normalizeSearchText');
  const endIdx = appJsCode.indexOf('// Render Zone 1 Library');
  const matchingCode = appJsCode.slice(startIdx, endIdx);

  const sandbox = {
    window: {},
    console,
    String,
    Array,
    Object,
    Boolean,
    Math,
    RegExp
  };

  vm.createContext(sandbox);
  vm.runInContext(matchingCode, sandbox);

  const { matchSongQuery, normalizeSearchText, getSongSearchIndex } = sandbox;

  const mockSong = {
    id: 'song_promise_keeper',
    title: 'Promise Keeper',
    author: 'Sounds of Salem & Pst. Oche Ogebe',
    stanzas: [
      {
        type: 'Intro',
        text: 'Goalkeeper (Salem)\nWey pass goalkeeper\n(Na-na-na-na-na) goalkeeper'
      },
      {
        type: 'Pre-Chorus',
        text: 'You have promised me oh,\nYou said, you will never fail!\nYou are faithful till the end.'
      },
      {
        type: 'Chorus',
        text: "You're my promise keeper (eh he)\nMy promise keeper\nMy promise keeper, aah"
      }
    ]
  };

  // Test 1: User searches by title
  assert.strictEqual(matchSongQuery(mockSong, 'Promise Keeper'), true, 'Should match by song title');

  // Test 2: User searches by author
  assert.strictEqual(matchSongQuery(mockSong, 'Sounds of Salem'), true, 'Should match by author');

  // Test 3: User searches by lyrics without comma or punctuation
  assert.strictEqual(
    matchSongQuery(mockSong, 'you said you will never fail'),
    true,
    'Should match lyrics phrase even though the stanza has a comma and exclamation mark'
  );
  assert.ok(mockSong._matchedSnippet, 'Should set _matchedSnippet for UI preview');
  assert.match(
    mockSong._matchedSnippet.toLowerCase(),
    /you said.*you will never fail/i,
    'Matched snippet should contain the matching line'
  );

  // Test 4: User searches across line breaks
  assert.strictEqual(
    matchSongQuery(mockSong, 'promised me oh you said'),
    true,
    'Should match lyric text across line break boundaries'
  );

  // Test 5: Token set overlap (multi-word phrase where user omits a filler word)
  assert.strictEqual(
    matchSongQuery(mockSong, 'said never fail faithful end'),
    true,
    'Should match when key words of a stanza are searched'
  );

  // Test 6: Non-matching query
  assert.strictEqual(
    matchSongQuery(mockSong, 'hallelujah in the highest heavens'),
    false,
    'Should not match completely unrelated lyrics'
  );
});

test('Server Lyrics Extraction: balanced container extraction preserves stanzas with nested tags', async () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  // Extract extractLyricsFromGeneralHtml and dependencies
  const startIdx = serverCode.indexOf('function decodeHtmlEntities');
  const endIdx = serverCode.indexOf('// Specialized extractor for CeeNaija');
  const extractCode = serverCode.slice(startIdx, endIdx);

  const sandbox = {
    console,
    String,
    Array,
    Object,
    Boolean,
    Math,
    RegExp
  };

  vm.createContext(sandbox);
  vm.runInContext(extractCode, sandbox);

  const { extractLyricsFromGeneralHtml } = sandbox;

  // Mock Genius HTML with nested <div> inside data-lyrics-container="true"
  const mockGeniusHtml = `
    <html>
      <body>
        <div data-lyrics-container="true" class="Lyrics__Container">
          <div data-exclude-from-selection="true" class="LyricsHeader">
            <button><span>Contributors</span></button>
          </div>
          [Pre-Chorus]<br/>
          You have promised me oh<br/>
          You said you will never fail<br/>
          You are faithful till the end<br/>
        </div>
        <div data-lyrics-container="true" class="Lyrics__Container">
          [Chorus]<br/>
          Promise keeper wey pass goalkeeper<br/>
          My promise keeper<br/>
        </div>
      </body>
    </html>
  `;

  const extracted = extractLyricsFromGeneralHtml(mockGeniusHtml);
  assert.ok(extracted, 'Extracted lyrics should not be null');
  assert.match(extracted, /You said you will never fail/i, 'Should not be cut off by nested div in header');
  assert.match(extracted, /Promise keeper wey pass goalkeeper/i, 'Should include subsequent containers');
});

test('Server Lyrics Extraction: supports common lyrics classes like .lyrics, .song-panel, .song-main', async () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  const startIdx = serverCode.indexOf('function decodeHtmlEntities');
  const endIdx = serverCode.indexOf('// Specialized extractor for CeeNaija');
  const extractCode = serverCode.slice(startIdx, endIdx);

  const sandbox = {
    console,
    String,
    Array,
    Object,
    Boolean,
    Math,
    RegExp
  };

  vm.createContext(sandbox);
  vm.runInContext(extractCode, sandbox);

  const { extractLyricsFromGeneralHtml } = sandbox;

  const mockWebHtml = `
    <div class="song-panel">
      <div class="lyrics">
        You said you will never fail me Lord<br/>
        From generation to generation<br/>
        Your faithfulness remains sure.
      </div>
    </div>
  `;

  const extracted = extractLyricsFromGeneralHtml(mockWebHtml);
  assert.ok(extracted, 'Should extract lyrics from class="lyrics" and class="song-panel"');
  assert.match(extracted, /You said you will never fail me Lord/i);
});

test('Relevance Scorer: ranks lyrics-matched songs with high scores', async () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  const startIdx = serverCode.indexOf('function normalizeTitle');
  const endIdx = serverCode.indexOf('function isMetadataOrSourceLine');
  const scoreCode = serverCode.slice(startIdx, endIdx);

  const sandbox = {
    console,
    String,
    Array,
    Object,
    Boolean,
    Math,
    RegExp,
    Set
  };

  vm.createContext(sandbox);
  vm.runInContext(scoreCode, sandbox);

  const { scoreSongRelevance } = sandbox;

  const songWithLyrics = {
    title: 'Promise Keeper',
    author: 'Sounds of Salem',
    source: 'Genius',
    stanzas: [
      {
        type: 'Chorus',
        text: 'You have promised me oh\nYou said you will never fail\nYou are faithful till the end'
      }
    ]
  };

  const songUnrelated = {
    title: 'Random Song',
    author: 'Another Artist',
    source: 'Genius',
    stanzas: [
      {
        type: 'Verse 1',
        text: 'Walking down the empty street late at night'
      }
    ]
  };

  const scoreMatched = scoreSongRelevance(songWithLyrics, 'you said you will never fail');
  const scoreUnrelated = scoreSongRelevance(songUnrelated, 'you said you will never fail');

  assert.ok(scoreMatched >= 650, `Matched song score should be high (got ${scoreMatched})`);
  assert.ok(scoreUnrelated < 40, `Unrelated song score should be low (got ${scoreUnrelated})`);
  assert.ok(scoreMatched > scoreUnrelated * 10, 'Matched song should dramatically outscore unrelated song');
});
