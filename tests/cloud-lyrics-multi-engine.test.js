const { test } = require('node:test');
const assert = require('node:assert/strict');

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

function cleanHtmlToPlainText(html) {
  if (!html) return '';
  let text = html
    .replace(/<br\s*\/?>[ \t]*\r?\n?/gi, '\n')
    .replace(/<\/p>[ \t]*\r?\n?/gi, '\n\n')
    .replace(/<\/div>[ \t]*\r?\n?/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  return text.split(/\r?\n/).map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractLyricsFromGeneralHtml(html) {
  if (!html) return null;
  // 1. AZLyrics comment signature
  const azMatch = /<!-- Usage of azlyrics\.com content[\s\S]*?-->([\s\S]*?)<\/div>/i.exec(html);
  if (azMatch && azMatch[1]) {
    const cleaned = cleanHtmlToPlainText(azMatch[1]);
    if (cleaned.length > 30) return cleaned;
  }

  // 2. SongLyrics container signature
  const slMatch = /<p[^>]*id="songLyricsDiv"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (slMatch && slMatch[1]) {
    const cleaned = cleanHtmlToPlainText(slMatch[1]);
    if (cleaned.length > 30 && !cleaned.includes('do not have the lyrics for this song')) return cleaned;
  }

  // 3. Genius data-lyrics-container signature
  const geniusContainers = [...html.matchAll(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi)].map(m => m[1]);
  if (geniusContainers.length > 0) {
    const combined = geniusContainers.join('\n\n');
    const cleaned = cleanHtmlToPlainText(combined);
    if (cleaned.length > 30) return cleaned;
  }

  // 4. Common lyrics classes / ids
  const genericMatch = /<(?:div|p|article|section)[^>]*(?:id|class)="[^"]*(?:entry-content|song-content|lyrics-body|lyric-body|lyrics-content|lyrics-text)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|article|section)>/i.exec(html);
  if (genericMatch && genericMatch[1]) {
    const cleaned = cleanHtmlToPlainText(genericMatch[1]);
    if (cleaned.length > 30) return cleaned;
  }

  return null;
}

function parseLyricsToStanzas(rawLyrics, fallbackTitle = '') {
  if (!rawLyrics || typeof rawLyrics !== 'string') return [{ type: 'Verse 1', text: fallbackTitle || 'Lyrics' }];
  let clean = rawLyrics.replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
  const rawLines = clean.split(/\r?\n/).map(l => l.trim());
  const stanzas = [];
  let currentType = 'Verse 1';
  let currentLines = [];
  let verseCounter = 1;
  let chorusCounter = 1;
  let bridgeCounter = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) {
      if (currentLines.length > 0) {
        stanzas.push({ type: currentType, text: currentLines.join('\n') });
        currentLines = [];
        if (currentType.startsWith('Verse')) {
          verseCounter++;
          currentType = `Verse ${verseCounter}`;
        }
      }
      continue;
    }

    const headerMatch = line.match(/^\[?(verse|chorus|bridge|pre-chorus|tag|intro|outro|v|c|b|p)\s*(\d*)\]?:?$/i);
    if (headerMatch) {
      if (currentLines.length > 0) {
        stanzas.push({ type: currentType, text: currentLines.join('\n') });
        currentLines = [];
      }
      const rawTag = headerMatch[1].toLowerCase();
      const num = headerMatch[2];
      if (rawTag.startsWith('v')) {
        currentType = num ? `Verse ${num}` : `Verse ${verseCounter++}`;
      } else if (rawTag.startsWith('c')) {
        currentType = num ? `Chorus ${num}` : (chorusCounter > 1 ? `Chorus ${chorusCounter}` : 'Chorus');
        chorusCounter++;
      } else if (rawTag.startsWith('b')) {
        currentType = num ? `Bridge ${num}` : (bridgeCounter > 1 ? `Bridge ${bridgeCounter}` : 'Bridge');
        bridgeCounter++;
      } else if (rawTag.startsWith('p')) {
        currentType = 'Pre-Chorus';
      } else {
        currentType = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
      }
      continue;
    }

    currentLines.push(line);
    if (currentLines.length >= 4 && (i + 1 < rawLines.length && !rawLines[i + 1])) {
      stanzas.push({ type: currentType, text: currentLines.join('\n') });
      currentLines = [];
      if (currentType.startsWith('Verse')) {
        verseCounter++;
        currentType = `Verse ${verseCounter}`;
      }
    }
  }

  if (currentLines.length > 0) {
    stanzas.push({ type: currentType, text: currentLines.join('\n') });
  }

  return stanzas.length > 0 ? stanzas : [{ type: 'Verse 1', text: rawLyrics.trim() }];
}

test('Multi-engine: Genius data-lyrics-container extraction and stanza parsing', () => {
  const html = `
    <div class="Lyrics__Container-sc-1" data-lyrics-container="true">
      [Verse 1]<br/>
      I love You, Lord<br/>
      For Your mercy never fails me<br/>
      All my days, I&#39;ve been held in Your hands
    </div>
    <div class="Lyrics__Container-sc-2" data-lyrics-container="true">
      [Chorus]<br/>
      And all my life You have been faithful<br/>
      And all my life You have been so, so good<br/>
      With every breath that I am able<br/>
      Oh, I will sing of the goodness of God
    </div>
  `;
  const extracted = extractLyricsFromGeneralHtml(html);
  assert.ok(extracted, 'Should extract lyrics from Genius containers');
  assert.ok(extracted.includes("I've been held"), 'Should decode HTML entities');

  const stanzas = parseLyricsToStanzas(extracted, 'Goodness of God');
  assert.equal(stanzas.length, 2);
  assert.equal(stanzas[0].type, 'Verse 1');
  assert.equal(stanzas[1].type, 'Chorus');
  assert.ok(stanzas[1].text.includes('goodness of God'));
});

test('Multi-engine: SongLyrics HTML extraction with clean stanzas', () => {
  const html = `
    <p id="songLyricsDiv" class="songLyricsV14">
      Amazing Grace, how sweet the sound<br />
      That saved a wretch like me<br />
      I once was lost, but now am found<br />
      Was blind, but now I see<br /><br />
      &#39;Twas grace that taught my heart to fear<br />
      And grace my fears relieved<br />
      How precious did that grace appear<br />
      The hour I first believed
    </p>
  `;
  const extracted = extractLyricsFromGeneralHtml(html);
  assert.ok(extracted, 'Should extract lyrics from songLyricsDiv');
  const stanzas = parseLyricsToStanzas(extracted, 'Amazing Grace');
  assert.equal(stanzas.length, 2);
  assert.equal(stanzas[0].type, 'Verse 1');
  assert.equal(stanzas[1].type, 'Verse 2');
});

test('Multi-engine: AZLyrics comment boundary extractor', () => {
  const html = `
    <div>
      <!-- Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement. Sorry about that. -->
      Way Maker, Miracle Worker<br>
      Promise Keeper, Light in the darkness<br>
      My God, that is who You are
    </div>
  `;
  const extracted = extractLyricsFromGeneralHtml(html);
  assert.ok(extracted, 'Should extract lyrics from AZLyrics signature');
  assert.ok(extracted.includes('Promise Keeper'));
  const stanzas = parseLyricsToStanzas(extracted, 'Way Maker');
  assert.equal(stanzas.length, 1);
});

test('Multi-engine: ChartLyrics XML parsing', () => {
  const xml = `
    <ArrayOfSearchLyricResult xmlns="http://api.chartlyrics.com/">
      <SearchLyricResult>
        <LyricId>99912</LyricId>
        <LyricChecksum>abcdef</LyricChecksum>
        <Artist>Hillsong Worship</Artist>
        <Song>What A Beautiful Name</Song>
      </SearchLyricResult>
    </ArrayOfSearchLyricResult>
  `;
  const results = [];
  const itemMatches = xml.matchAll(/<SearchLyricResult>([\s\S]*?)<\/SearchLyricResult>/gi);
  for (const match of itemMatches) {
    const block = match[1];
    const lyricId = (/<LyricId>([^<]+)<\/LyricId>/i.exec(block) || [])[1];
    const lyricChecksum = (/<LyricChecksum>([^<]+)<\/LyricChecksum>/i.exec(block) || [])[1];
    const artist = (/<Artist>([^<]+)<\/Artist>/i.exec(block) || [])[1];
    const song = (/<Song>([^<]+)<\/Song>/i.exec(block) || [])[1];
    if (lyricId && lyricChecksum && song) {
      results.push({ lyricId, lyricChecksum, artist, song });
    }
  }
  assert.equal(results.length, 1);
  assert.equal(results[0].song, 'What A Beautiful Name');
  assert.equal(results[0].artist, 'Hillsong Worship');
});

test('Multi-engine: Deduplication merges identical titles from multiple providers', () => {
  const rawList = [
    { title: 'Goodness of God', author: 'Bethel Music', source: 'LRCLIB', id: '1' },
    { title: 'goodness of god', author: 'Bethel Music', source: 'Genius', id: '2' },
    { title: 'Way Maker', author: 'Sinach', source: 'Genius', id: '3' },
    { title: 'WAY MAKER', author: 'Sinach', source: 'Web Search', id: '4' }
  ];

  const seen = new Set();
  const unique = [];
  for (const item of rawList) {
    const key = `${item.title.toLowerCase().trim()}___${item.author.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  assert.equal(unique.length, 2);
  assert.equal(unique[0].title, 'Goodness of God');
  assert.equal(unique[0].source, 'LRCLIB');
  assert.equal(unique[1].title, 'Way Maker');
  assert.equal(unique[1].source, 'Genius');
});

test('Multi-engine: Genius contributor and song lyrics header stripping', () => {
  function cleanGeniusText(text) {
    if (!text) return '';
    return text
      .replace(/^\d+\s*Contributors?.*?Lyrics\s*/is, '')
      .replace(/^\d+\s*Contributors?\s*/is, '')
      .replace(/^.*?Lyrics\s*(?=\[)/is, '')
      .replace(/You might also like/gi, '')
      .replace(/\d*\s*Embed$/gi, '')
      .trim();
  }

  const raw1 = '2 ContributorsSong of the Redeemed Lyrics The hope that I have is sure';
  assert.equal(cleanGeniusText(raw1), 'The hope that I have is sure');

  const raw2 = '1 ContributorHe Set Me Free Lyrics He set me free He set me free My Jesus came and rescued me';
  assert.equal(cleanGeniusText(raw2), 'He set me free He set me free My Jesus came and rescued me');

  const raw3 = '1 ContributorSong of the Redeemed (Live) Lyrics [Verse 1]\nJesus, Your name is lifted high';
  assert.equal(cleanGeniusText(raw3), '[Verse 1]\nJesus, Your name is lifted high');
});

test('Multi-engine: Hymnary.org column HTML extraction', () => {
  const hymnaryHtml = `
    <div class="authority_columns">
      <p>1 He paid a debt He did not owe,<br>
      I owed a debt I could not pay;<br>
      I needed someone to wash my sins away.<br>
      And now I sing a brand new song, "Amazing Grace,"<br>
      Christ Jesus paid a debt that I could never pay.</p>
    </div>
  `;
  const hymnaryMatch = /<div[^>]*class="[^"]*(?:authority_columns|text_columns|hymn-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(hymnaryHtml);
  assert.ok(hymnaryMatch && hymnaryMatch[1]);
  const cleaned = cleanHtmlToPlainText(hymnaryMatch[1]);
  assert.ok(cleaned.includes('He paid a debt He did not owe'));

  const stanzas = parseLyricsToStanzas(cleaned, 'He Paid a Debt He Did Not Owe');
  assert.ok(stanzas.length >= 1);
  assert.ok(stanzas[0].text.includes('Christ Jesus paid a debt'));
});

test('Multi-engine: Relevance scorer ranks "He Paid a Debt He Did Not Owe" #1 over loose Genius matches', () => {
  const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'and', 'or', 'for', 'to', 'by', 'with', 'lyrics', 'song', 'live']);

  function scoreSongRelevance(song, query) {
    const qClean = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const titleClean = (song.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const authorClean = (song.author || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    if (titleClean === qClean) return 1000;
    if (titleClean.includes(qClean)) return 500;
    if (qClean.includes(titleClean) && titleClean.length > 5) return 400;

    const qTokens = qClean.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
    const tTokens = titleClean.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

    if (qTokens.length === 0) return 10;

    let matches = 0;
    for (const qt of qTokens) {
      if (tTokens.includes(qt)) {
        matches++;
      } else if (tTokens.some(tt => tt.includes(qt) || qt.includes(tt))) {
        matches += 0.5;
      }
    }

    let score = (matches / qTokens.length) * 200;

    for (const qt of qTokens) {
      if (authorClean.includes(qt)) {
        score += 25;
      }
    }

    return Math.round(score);
  }

  const query = 'He Paid a Debt He Did Not Owe';
  const songs = [
    { title: 'Song of the Redeemed', author: 'Ascend the Hill', source: 'Genius' },
    { title: 'He Set Me Free', author: 'Thad Cockrell', source: 'Genius' },
    { title: 'Song of the Redeemed (Live)', author: 'East Coast Christian Center', source: 'Genius' },
    { title: 'He Paid a Debt He Did Not Owe', author: 'Austin Dilbert Matthews', source: 'Hymnary' }
  ];

  for (const song of songs) {
    song._score = scoreSongRelevance(song, query);
  }
  songs.sort((a, b) => b._score - a._score);

  assert.equal(songs[0].title, 'He Paid a Debt He Did Not Owe');
  assert.equal(songs[0]._score, 1000);

  const highestScore = songs[0]._score;
  const filtered = songs.filter(s => !(highestScore >= 250 && s._score < 40));
  // "Song of the Redeemed (Live)" with 0 score should be dropped
  assert.ok(!filtered.some(s => s.title === 'Song of the Redeemed (Live)'));
  assert.equal(filtered[0].title, 'He Paid a Debt He Did Not Owe');
});

test('Multi-engine: Strips leading verse numbers and excludes source citations from slides', () => {
  function isMetadataOrSourceLine(line) {
    if (!line) return false;
    const clean = line.trim();
    return /^(source|hymnal|songbook|tune|author|composer|written by|words and music|words by|music by|copyright|ccli|published by|recorded by|album|key|meter|scripture)\s*:/i.test(clean)
      || /^(copyright|all rights reserved|public domain|used by permission|©)/i.test(clean);
  }

  function parseLyricsToStanzasUpdated(rawLyrics, fallbackTitle = '') {
    if (!rawLyrics || typeof rawLyrics !== 'string') return [{ type: 'Verse 1', text: fallbackTitle || 'Lyrics' }];
    let clean = rawLyrics.replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    const rawLines = clean.split(/\r?\n/).map(l => l.trim());
    const stanzas = [];
    let currentType = 'Verse 1';
    let currentLines = [];
    let verseCounter = 1;

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      if (!line) {
        if (currentLines.length > 0) {
          stanzas.push({ type: currentType, text: currentLines.join('\n') });
          currentLines = [];
          if (currentType.startsWith('Verse')) {
            verseCounter++;
            currentType = `Verse ${verseCounter}`;
          }
        }
        continue;
      }

      if (isMetadataOrSourceLine(line)) {
        continue;
      }

      const hymnNumMatch = line.match(/^(\d+)[\.\)\:\s]+(.*)$/);
      if (hymnNumMatch) {
        const vNum = parseInt(hymnNumMatch[1], 10);
        const restOfLine = hymnNumMatch[2].trim();
        if (vNum >= 1 && vNum <= 25) {
          if (currentLines.length === 0) {
            currentType = `Verse ${vNum}`;
            verseCounter = vNum + 1;
            line = restOfLine;
          } else if (vNum > 1) {
            stanzas.push({ type: currentType, text: currentLines.join('\n') });
            currentLines = [];
            currentType = `Verse ${vNum}`;
            verseCounter = vNum + 1;
            line = restOfLine;
          }
        }
      }

      currentLines.push(line);
    }

    if (currentLines.length > 0) {
      stanzas.push({ type: currentType, text: currentLines.join('\n') });
    }

    return stanzas;
  }

  const rawLyricsWithSource = `
    1 He paid a debt He did not owe,
    I owed a debt I could not pay,
    I needed someone to wash my sins away;
    And now I sing a brand new song,
    "Amazing Grace,"
    Christ Jesus paid a debt that I could never pay.

    2 He paid that debt at Calvary,
    He cleansed my soul and set me free,
    I'm glad that Jesus did all my sins erase;
    I now can sing a brand new song,
    "Amazing Grace,"
    Christ Jesus paid a debt that I could never pay.

    3 One day He's coming back for me,
    To live with Him eternally,
    Won't it be glory to see Him on that day!
    I then will sing a brand new song,
    "Amazing Grace,"
    Christ Jesus paid a debt that I could never pay.

    Source: Sing 'N' Praise Hymnal Vol. 2 #21
  `;

  const parsed = parseLyricsToStanzasUpdated(rawLyricsWithSource, 'He Paid a Debt He Did Not Owe');
  
  // Exactly 3 stanzas, NOT 4 (Source line must not be a slide!)
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].type, 'Verse 1');
  assert.equal(parsed[1].type, 'Verse 2');
  assert.equal(parsed[2].type, 'Verse 3');

  // Verify leading numbers "1 ", "2 ", "3 " are completely removed from lyrics text
  assert.ok(parsed[0].text.startsWith('He paid a debt He did not owe'));
  assert.ok(!parsed[0].text.startsWith('1 '));
  assert.ok(!parsed[0].text.startsWith('1'));

  assert.ok(parsed[1].text.startsWith('He paid that debt at Calvary'));
  assert.ok(!parsed[1].text.startsWith('2 '));
  assert.ok(!parsed[1].text.startsWith('2'));

  assert.ok(parsed[2].text.startsWith("One day He's coming back for me"));
  assert.ok(!parsed[2].text.startsWith('3 '));
  assert.ok(!parsed[2].text.startsWith('3'));

  // Ensure "Source:" never exists in any stanza
  for (const s of parsed) {
    assert.ok(!s.text.toLowerCase().includes('source:'));
    assert.ok(!s.text.toLowerCase().includes('sing \'n\' praise'));
  }
});

test('Multi-engine: Normalizes Roman numerals and featured tags to rank Gaise Baba at top relevance', () => {
  function normalizeTitle(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\s*\((?:feat\.|ft\.|with|version|remix|live|official|video|audio).*?\)/gi, '')
      .replace(/\s*\[(?:feat\.|ft\.|with|version|remix|live|official|video|audio).*?\]/gi, '')
      .replace(/\s*(?:feat\.|ft\.|with)\s+.*$/gi, '')
      .replace(/\b(?:ii|iii|iv|v|vi|part\s*\d+|pt\.?\s*\d+)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const query = 'No Turning Back';
  const songTitle = 'No Turning Back II (feat. Lawrence Oyor)';
  assert.equal(normalizeTitle(songTitle), 'no turning back');
  assert.equal(normalizeTitle(query), 'no turning back');
});

test('Multi-engine: Refrain scoring ranks hymn "I Have Decided to Follow Jesus" at top when searching "No Turning Back"', () => {
  const query = 'No Turning Back';
  const hymnSong = {
    title: 'I Have Decided to Follow Jesus',
    author: 'Traditional Hymn',
    source: 'Hymnary',
    album: 'Christian Hymnal',
    stanzas: [
      { type: 'Verse 1', text: 'I have decided to follow Jesus;\nI have decided to follow Jesus;\nI have decided to follow Jesus;\nNo turning back, no turning back.' },
      { type: 'Verse 2', text: 'The world behind me, the cross before me;\nThe world behind me, the cross before me;\nThe world behind me, the cross before me;\nNo turning back, no turning back.' }
    ]
  };

  const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'and', 'or', 'for', 'to', 'by', 'with', 'lyrics', 'song', 'live']);
  function normalizeTitle(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/\s*\((?:feat\.|ft\.|with|version|remix|live|official|video|audio).*?\)/gi, '')
      .replace(/\b(?:ii|iii|iv|v|vi|part\s*\d+|pt\.?\s*\d+)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreSongRelevance(song, query) {
    const qClean = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleClean = (song.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleNorm = normalizeTitle(song.title);
    const qNorm = normalizeTitle(query);

    let baseScore = 0;
    if (titleClean === qClean) {
      baseScore = 1000;
    } else if (titleNorm && qNorm && titleNorm === qNorm) {
      baseScore = 980;
    }

    let refrainScore = 0;
    if (Array.isArray(song.stanzas)) {
      for (const st of song.stanzas) {
        const stType = (st.type || '').toLowerCase();
        const stTextNorm = (st.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
        if (qClean && stTextNorm.includes(qClean)) {
          const isChorus = /chorus|refrain/i.test(stType);
          const occurrences = (stTextNorm.match(new RegExp(`\\b${qClean}\\b`, 'g')) || []).length;
          const scoreForStanza = isChorus
            ? 850 + Math.min(occurrences * 40, 100)
            : 600 + Math.min(occurrences * 30, 80);
          if (scoreForStanza > refrainScore) refrainScore = scoreForStanza;
        }
      }
    }

    let score = Math.max(baseScore, refrainScore);
    const isChristianSource = /hymnary|hymnal|church|christian/i.test(song.source || '')
      || /hymn|worship|gospel|praise|christ/i.test(song.album || '');
    if (isChristianSource) score += 60;
    return score;
  }

  const score = scoreSongRelevance(hymnSong, query);
  // Score should be high (> 650) even though the title doesn't contain "No Turning Back"
  assert.ok(score >= 700, `Expected score >= 700 but got ${score}`);
});

test('Multi-engine: Deduplicates artist variations (Gaise Baba vs Gaise Baba ft. Lawrence Oyor)', () => {
  function normalizeArtist(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\s*\((?:feat\.|ft\.|with).*?\)/gi, '')
      .replace(/\s*\[(?:feat\.|ft\.|with).*?\]/gi, '')
      .replace(/\s*(?:feat\.|ft\.|with)\s+.*$/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const a1 = 'Gaise Baba';
  const a2 = 'Gaise Baba (Ft. Lawrence Oyor)';
  const a3 = 'Gaise Baba feat. Lawrence Oyor';
  assert.equal(normalizeArtist(a1), 'gaise baba');
  assert.equal(normalizeArtist(a2), 'gaise baba');
  assert.equal(normalizeArtist(a3), 'gaise baba');
});

test('Multi-engine: In-line lyrics search scores highly even when user does not know song title', () => {
  const song = {
    title: 'I Surrender',
    author: 'Hillsong Worship',
    source: 'Genius',
    album: 'Cornerstone',
    stanzas: [
      { type: 'Verse 1', text: 'Here I am, down on my knees again\nSurrendering all, surrendering all' },
      { type: 'Chorus', text: 'I surrender all to You\nEverything I give to You\nWithholding nothing, withholding nothing' }
    ]
  };

  // Searching by an in-line phrase from the chorus: "everything I give to you"
  const lyricQuery = 'everything I give to you';
  const qClean = lyricQuery.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const qTokens = qClean.split(/\s+/).filter(w => w.length > 1);

  let lyricScore = 0;
  for (const st of song.stanzas) {
    const stTextNorm = (st.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
    if (stTextNorm.includes(qClean)) {
      lyricScore = Math.max(lyricScore, 850);
    }
  }

  assert.ok(lyricScore >= 800, `Expected in-line lyric search to score >= 800, got ${lyricScore}`);
});

test('Multi-engine: CeeNaija HTML extraction and African gospel title parsing', () => {
  function extractLyricsFromCeeNaijaHtml(html) {
    if (!html) return null;
    const entryMatch = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const content = entryMatch ? entryMatch[1] : html;

    const lyricHeaderMatch = /(?:<h[2-4][^>]*>|<strong[^>]*>|<b[^>]*>|<p[^>]*>)\s*(?:lyrics|lyrics\s*video|official\s*lyrics|lyrics\s*below)[\s\S]*?<\/(?:h[2-4]|strong|b|p)>([\s\S]*)$/i.exec(content);
    let rawBlock = lyricHeaderMatch ? lyricHeaderMatch[1] : content;

    rawBlock = rawBlock.replace(/(?:<h[2-4][^>]*>|<strong[^>]*>|<b[^>]*>|<p[^>]*>)\s*(?:download|watch\s*video|stream|share|related|comments|audio|mp3)[\s\S]*$/i, '');

    const cleaned = cleanHtmlToPlainText(rawBlock);
    return cleaned.length > 30 ? cleaned : cleanHtmlToPlainText(content);
  }

  const sampleHtml = `
    <article>
      <div class="entry-content">
        <p>Award-winning gospel minister Gaise Baba is back with another hit worship anthem.</p>
        <p>Download the free audio below.</p>
        <h3>Lyrics: No Turning Back II by Gaise Baba</h3>
        <p>I have decided to follow Jesus<br>
        No turning back, no turning back</p>
        <p>The cross before me, the world behind me<br>
        No turning back, no turning back</p>
        <h3>Download Audio MP3</h3>
        <p><a href="#">Click here to download</a></p>
      </div>
    </article>
  `;

  const extracted = extractLyricsFromCeeNaijaHtml(sampleHtml);
  assert.ok(extracted.includes('I have decided to follow Jesus'));
  assert.ok(extracted.includes('The cross before me'));
  assert.ok(!extracted.includes('Award-winning gospel minister'));
  assert.ok(!extracted.includes('Click here to download'));
});



