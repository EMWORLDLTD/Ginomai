// Import Engine & Online Repository Service for Ginomia

// Canonical Bible Books & Aliases Map
const CANONICAL_BIBLE_BOOKS = [
  { name: 'Genesis', aliases: ['genesis', 'gen', 'ge', 'gn'], num: 1 },
  { name: 'Exodus', aliases: ['exodus', 'exod', 'exo', 'ex'], num: 2 },
  { name: 'Leviticus', aliases: ['leviticus', 'lev', 'le', 'lv'], num: 3 },
  { name: 'Numbers', aliases: ['numbers', 'num', 'nu', 'nm', 'nb'], num: 4 },
  { name: 'Deuteronomy', aliases: ['deuteronomy', 'deut', 'deu', 'de', 'dt'], num: 5 },
  { name: 'Joshua', aliases: ['joshua', 'josh', 'jos', 'jsh'], num: 6 },
  { name: 'Judges', aliases: ['judges', 'judg', 'jdg', 'jgs'], num: 7 },
  { name: 'Ruth', aliases: ['ruth', 'rth', 'ru'], num: 8 },
  { name: '1 Samuel', aliases: ['1 samuel', 'first samuel', '1st samuel', '1 sam', '1st sam', '1sa', '1s', '1samuel'], num: 9 },
  { name: '2 Samuel', aliases: ['2 samuel', 'second samuel', '2nd samuel', '2 sam', '2nd sam', '2sa', '2s', '2samuel'], num: 10 },
  { name: '1 Kings', aliases: ['1 kings', 'first kings', '1st kings', '1 kgs', '1st kgs', '1ki', '1k', '1kings'], num: 11 },
  { name: '2 Kings', aliases: ['2 kings', 'second kings', '2nd kings', '2 kgs', '2nd kgs', '2ki', '2k', '2kings'], num: 12 },
  { name: '1 Chronicles', aliases: ['1 chronicles', 'first chronicles', '1st chronicles', '1 chron', '1st chron', '1ch', '1 chr', '1chronicles'], num: 13 },
  { name: '2 Chronicles', aliases: ['2 chronicles', 'second chronicles', '2nd chronicles', '2 chron', '2nd chron', '2ch', '2 chr', '2chronicles'], num: 14 },
  { name: 'Ezra', aliases: ['ezra', 'ezr'], num: 15 },
  { name: 'Nehemiah', aliases: ['nehemiah', 'neh', 'ne'], num: 16 },
  { name: 'Esther', aliases: ['esther', 'esth', 'est'], num: 17 },
  { name: 'Job', aliases: ['job', 'jb'], num: 18 },
  { name: 'Psalms', aliases: ['psalms', 'psalm', 'psa', 'ps', 'psm', 'pss'], num: 19 },
  { name: 'Proverbs', aliases: ['proverbs', 'proverb', 'prov', 'pro', 'prv', 'pr'], num: 20 },
  { name: 'Ecclesiastes', aliases: ['ecclesiastes', 'eccles', 'ecc', 'ec', 'qoh', 'qoheleth'], num: 21 },
  { name: 'Song of Solomon', aliases: ['song of solomon', 'song of songs', 'canticle of canticles', 'canticles', 'song', 'sos'], num: 22 },
  { name: 'Isaiah', aliases: ['isaiah', 'isa', 'is'], num: 23 },
  { name: 'Jeremiah', aliases: ['jeremiah', 'jer', 'je', 'jr'], num: 24 },
  { name: 'Lamentations', aliases: ['lamentations', 'lam', 'la'], num: 25 },
  { name: 'Ezekiel', aliases: ['ezekiel', 'ezek', 'eze', 'ezk'], num: 26 },
  { name: 'Daniel', aliases: ['daniel', 'dan', 'da', 'dn'], num: 27 },
  { name: 'Hosea', aliases: ['hosea', 'hos', 'ho'], num: 28 },
  { name: 'Joel', aliases: ['joel', 'joe', 'jl'], num: 29 },
  { name: 'Amos', aliases: ['amos', 'am'], num: 30 },
  { name: 'Obadiah', aliases: ['obadiah', 'obad', 'ob'], num: 31 },
  { name: 'Jonah', aliases: ['jonah', 'jnh', 'jon'], num: 32 },
  { name: 'Micah', aliases: ['micah', 'mic', 'mc'], num: 33 },
  { name: 'Nahum', aliases: ['nahum', 'nah', 'na'], num: 34 },
  { name: 'Habakkuk', aliases: ['habakkuk', 'hab', 'hb'], num: 35 },
  { name: 'Zephaniah', aliases: ['zephaniah', 'zeph', 'zep', 'zp'], num: 36 },
  { name: 'Haggai', aliases: ['haggai', 'hag', 'hg'], num: 37 },
  { name: 'Zechariah', aliases: ['zechariah', 'zech', 'zec', 'zc'], num: 38 },
  { name: 'Malachi', aliases: ['malachi', 'mal', 'ml'], num: 39 },
  { name: 'Matthew', aliases: ['matthew', 'matt', 'mat', 'mt'], num: 40 },
  { name: 'Mark', aliases: ['mark', 'mrk', 'mar', 'mk', 'mr'], num: 41 },
  { name: 'Luke', aliases: ['luke', 'luk', 'lu', 'lk'], num: 42 },
  { name: 'John', aliases: ['john', 'jhn', 'joh', 'jn'], num: 43 },
  { name: 'Acts', aliases: ['acts', 'act', 'ac', 'acts of the apostles'], num: 44 },
  { name: 'Romans', aliases: ['romans', 'roman', 'rom', 'ro', 'rm'], num: 45 },
  { name: '1 Corinthians', aliases: ['1 corinthians', 'first corinthians', '1st corinthians', '1 cor', '1st cor', '1co', '1c', '1corinthians'], num: 46 },
  { name: '2 Corinthians', aliases: ['2 corinthians', 'second corinthians', '2nd corinthians', '2 cor', '2nd cor', '2co', '2c', '2corinthians'], num: 47 },
  { name: 'Galatians', aliases: ['galatians', 'galatian', 'gal', 'ga'], num: 48 },
  { name: 'Ephesians', aliases: ['ephesians', 'ephesian', 'eph', 'ep'], num: 49 },
  { name: 'Philippians', aliases: ['philippians', 'philippian', 'phil', 'php', 'pp'], num: 50 },
  { name: 'Colossians', aliases: ['colossians', 'colossian', 'col', 'co'], num: 51 },
  { name: '1 Thessalonians', aliases: ['1 thessalonians', 'first thessalonians', '1st thessalonians', '1 thess', '1st thess', '1th', '1thessalonians'], num: 52 },
  { name: '2 Thessalonians', aliases: ['2 thessalonians', 'second thessalonians', '2nd thessalonians', '2 thess', '2nd thess', '2th', '2thessalonians'], num: 53 },
  { name: '1 Timothy', aliases: ['1 timothy', 'first timothy', '1st timothy', '1 tim', '1st tim', '1ti', '1timothy'], num: 54 },
  { name: '2 Timothy', aliases: ['2 timothy', 'second timothy', '2nd timothy', '2 tim', '2nd tim', '2ti', '2timothy'], num: 55 },
  { name: 'Titus', aliases: ['titus', 'tit', 'ti'], num: 56 },
  { name: 'Philemon', aliases: ['philemon', 'phlm', 'phm', 'pm'], num: 57 },
  { name: 'Hebrews', aliases: ['hebrews', 'hebrew', 'heb', 'he'], num: 58 },
  { name: 'James', aliases: ['james', 'jas', 'jm'], num: 59 },
  { name: '1 Peter', aliases: ['1 peter', 'first peter', '1st peter', '1 pet', '1st pet', '1pe', '1pt', '1peter'], num: 60 },
  { name: '2 Peter', aliases: ['2 peter', 'second peter', '2nd peter', '2 pet', '2nd pet', '2pe', '2pt', '2peter'], num: 61 },
  { name: '1 John', aliases: ['1 john', 'first john', '1st john', '1 jn', '1st jn', '1jhn', '1jo', '1john'], num: 62 },
  { name: '2 John', aliases: ['2 john', 'second john', '2nd john', '2 jn', '2nd jn', '2jhn', '2jo', '2john'], num: 63 },
  { name: '3 John', aliases: ['3 john', 'third john', '3rd john', '3 jn', '3rd jn', '3jhn', '3jo', '3john'], num: 64 },
  { name: 'Jude', aliases: ['jude', 'jud', 'jd'], num: 65 },
  { name: 'Revelation', aliases: ['revelation', 'revelations', 'rev', 're', 'the revelation', 'apocalypse'], num: 66 }
];

class LibraryImportEngine {
  constructor() {
    this.customBibles = JSON.parse(localStorage.getItem('sf_custom_bibles') || '{}');
    this.customSongs = JSON.parse(localStorage.getItem('sf_custom_songs') || '[]');
    this.customSongbooks = JSON.parse(localStorage.getItem('sf_custom_songbooks') || '[]');
    this.db = null;

    this.initStorage();
    this.initIndexedDB();
  }

  initStorage() {
    if (localStorage.getItem('sf_system_formatted') === 'true') {
      if (typeof SONGS_DATABASE !== 'undefined') {
        SONGS_DATABASE.length = 0;
      }
      if (typeof SONGBOOKS_DATABASE !== 'undefined') {
        SONGBOOKS_DATABASE.length = 0;
      }
      if (typeof BIBLE_DATABASE !== 'undefined') {
        for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k];
      }
      this.customBibles = {};
      this.customSongs = [];
      this.customSongbooks = [];
      return;
    }

    // Merge custom bibles into runtime BIBLE_DATABASE
    if (typeof BIBLE_DATABASE !== 'undefined') {
      Object.assign(BIBLE_DATABASE, this.customBibles);
    }
    // Restore installed translation stubs so version selectors know about them immediately
    try {
      const installed = JSON.parse(localStorage.getItem('sf_installed_bibles') || '[]');
      if (Array.isArray(installed)) {
        installed.forEach(code => {
          const upper = (code || '').toUpperCase().trim();
          if (upper && !this.customBibles[upper]) {
            this.customBibles[upper] = this.customBibles[upper] || {};
          }
        });
      }
    } catch (e) {}
    // Merge custom songs into runtime SONGS_DATABASE
    if (typeof SONGS_DATABASE !== 'undefined') {
      this.customSongs.forEach(song => {
        if (!SONGS_DATABASE.some(s => s.id === song.id)) {
          SONGS_DATABASE.push(song);
        }
      });
    }
    // Merge custom songbooks into runtime SONGBOOKS_DATABASE
    if (typeof SONGBOOKS_DATABASE !== 'undefined') {
      this.customSongbooks.forEach(sb => {
        if (!SONGBOOKS_DATABASE.some(s => s.id === sb.id)) {
          SONGBOOKS_DATABASE.push(sb);
        }
      });
    }
    this.sanitizeExistingLibrary();
  }

  clearAllData() {
    this.customBibles = {};
    this.customSongs = [];
    this.customSongbooks = [];
    localStorage.removeItem('sf_custom_bibles');
    localStorage.removeItem('sf_installed_bibles');
    localStorage.removeItem('sf_custom_songs');
    localStorage.removeItem('sf_custom_songbooks');
    localStorage.setItem('sf_system_formatted', 'true');
    if (typeof BIBLE_DATABASE !== 'undefined') {
      for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k];
    }
    if (typeof SONGS_DATABASE !== 'undefined') {
      SONGS_DATABASE.length = 0;
    }
    if (typeof SONGBOOKS_DATABASE !== 'undefined') {
      SONGBOOKS_DATABASE.length = 0;
    }
    if (this.db) {
      try {
        const tx = this.db.transaction(['bibles', 'songs'], 'readwrite');
        tx.objectStore('bibles').clear();
        tx.objectStore('songs').clear();
      } catch (e) {}
    }
  }

  initIndexedDB() {
    if (!('indexedDB' in window)) return;
    const request = indexedDB.open('ScriptureFlowStore', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('bibles')) {
        db.createObjectStore('bibles', { keyPath: 'code' });
      }
      if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => {
      this.db = e.target.result;
      this.loadFromIndexedDB();
    };
  }

  loadFromIndexedDB(onComplete) {
    if (!this.db) return;
    if (localStorage.getItem('sf_system_formatted') === 'true') {
      if (typeof SONGS_DATABASE !== 'undefined') SONGS_DATABASE.length = 0;
      if (typeof SONGBOOKS_DATABASE !== 'undefined') SONGBOOKS_DATABASE.length = 0;
      if (typeof BIBLE_DATABASE !== 'undefined') { for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k]; }
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    try {
      const tx = this.db.transaction(['bibles', 'songs'], 'readonly');
      const biblesStore = tx.objectStore('bibles');
      const songsStore = tx.objectStore('songs');

      let biblesDone = false;
      let songsDone = false;

      const notifyCompletion = () => {
        if (biblesDone && songsDone) {
          this.sanitizeExistingLibrary();
          if (typeof onComplete === 'function') onComplete();
          if (typeof window.onLibraryDataUpdated === 'function') {
            window.onLibraryDataUpdated();
          }
        }
      };

      biblesStore.getAll().onsuccess = (e) => {
        const bibles = e.target.result || [];
        const installedList = [];
        bibles.forEach(b => {
          this.customBibles[b.code] = b.data;
          if (typeof BIBLE_DATABASE !== 'undefined') {
            BIBLE_DATABASE[b.code] = b.data;
          }
          installedList.push(b.code);
        });
        if (installedList.length > 0) {
          try {
            const curInstalled = JSON.parse(localStorage.getItem('sf_installed_bibles') || '[]');
            const merged = Array.from(new Set([...curInstalled, ...installedList]));
            localStorage.setItem('sf_installed_bibles', JSON.stringify(merged));
          } catch (err) {}
        }
        biblesDone = true;
        notifyCompletion();
      };

      songsStore.getAll().onsuccess = (e) => {
        const songs = e.target.result || [];
        songs.forEach(song => {
          if (!this.customSongs.some(s => s.id === song.id)) {
            this.customSongs.push(song);
          }
          if (typeof SONGS_DATABASE !== 'undefined' && !SONGS_DATABASE.some(s => s.id === song.id)) {
            SONGS_DATABASE.push(song);
          }
        });
        songsDone = true;
        notifyCompletion();
      };
    } catch (err) {
      console.warn('IndexedDB sync failed, using localStorage fallback', err);
    }
  }

  // Normalize any book name or abbreviation to canonical English name
  normalizeBookName(rawBook) {
    if (!rawBook || typeof rawBook !== 'string') return '';
    const clean = rawBook.trim().toLowerCase().replace(/[_\.]/g, ' ').replace(/\s+/g, ' ');
    
    // Check direct book list
    for (const b of CANONICAL_BIBLE_BOOKS) {
      if (b.name.toLowerCase() === clean) return b.name;
      if (b.aliases.includes(clean)) return b.name;
    }

    // Check if starts with number e.g. "1samuel" or "1 sam"
    const cleanedNum = clean.replace(/^(\d+)(st|nd|rd|th)?\s*/, '$1 ');
    for (const b of CANONICAL_BIBLE_BOOKS) {
      if (b.aliases.includes(cleanedNum)) return b.name;
    }

    // Capitalize as fallback
    return rawBook.trim().charAt(0).toUpperCase() + rawBook.trim().slice(1);
  }

  // Check if a string represents a canonical Bible book
  isBibleBookName(str) {
    if (!str || typeof str !== 'string') return false;
    const clean = str.trim().toLowerCase().replace(/[_\.]/g, ' ').replace(/\s+/g, ' ');
    return CANONICAL_BIBLE_BOOKS.some(b => b.name.toLowerCase() === clean || b.aliases.includes(clean));
  }

  // Helper to sanitize markup and tags
  cleanMarkup(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .trim();
  }

  // Check if a line is a decorative separator
  isDividerLine(line) {
    if (!line) return false;
    const clean = line.trim();
    return /^[=\-_*~#─━┄┅┈┉\s]{2,}$/.test(clean);
  }

  // Check if a line is a metadata header line
  isMetadataHeader(line) {
    if (!line) return false;
    const clean = line.trim();
    return /^(title|author|artist|composer|by|copyright|ccli|songbook|hymnal|source|tune|words and music|words by|music by|written by|published by|recorded by|meter|key|capo|tempo|tags|theme|topic|hymn\s*number|number|hymn|admin|scripture)\s*:/i.test(clean)
      || /^(copyright|all rights reserved|public domain|used by permission|©)/i.test(clean);
  }

  // Clean raw titles from converter artifacts
  cleanSongTitle(title) {
    if (!title || typeof title !== 'string') return 'Untitled Song';
    let clean = this.cleanMarkup(title);
    clean = clean.replace(/^k[0-9A-Fa-f]{6,8}/i, '').replace(/k$/i, '');
    clean = clean.replace(/^(?:bf[A-Za-z0-9\s]+?s\d+|bbbs\d+|s\d+|bf[A-Za-z0-9\s]+?)(.+)$/i, (match, p1) => p1 || match);
    clean = clean.replace(/\s*(?:sfb|sfbbf[A-Za-z0-9\s]+|sb|fb|sf)\s*$/i, '');
    if (/^b[A-Z0-9]/i.test(clean) && /b$/i.test(clean) && clean.length > 5) {
      clean = clean.slice(1, -1);
    } else if (/^b\s+[A-Z0-9]/i.test(clean) && /b$/i.test(clean)) {
      clean = clean.slice(1, -1).trim();
    }
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean || title.trim() || 'Untitled Song';
  }

  // Clean and sanitize any existing songs in library storage
  sanitizeExistingLibrary() {
    let modified = false;

    const cleanSongObj = (song) => {
      let songModified = false;
      const cleanTitle = this.cleanSongTitle(song.title);
      if (cleanTitle && cleanTitle !== song.title) {
        song.title = cleanTitle;
        songModified = true;
      }
      const cleanAuthor = this.cleanMarkup(song.author);
      if (cleanAuthor && cleanAuthor !== song.author) {
        song.author = cleanAuthor;
        songModified = true;
      }

      if (Array.isArray(song.stanzas)) {
        const initialCount = song.stanzas.length;
        const cleanedStanzas = song.stanzas
          .map(stanza => {
            const cleanText = (stanza.text || '')
              .split(/\r?\n/)
              .filter(line => !this.isDividerLine(line))
              .map(line => this.cleanMarkup(line))
              .filter(line => line.length > 0 && !this.isDividerLine(line))
              .join('\n');
            return {
              type: stanza.type || 'Verse 1',
              text: cleanText
            };
          })
          .filter(stanza => stanza.text && stanza.text.trim().length > 0 && !this.isDividerLine(stanza.text));

        if (cleanedStanzas.length !== initialCount || cleanedStanzas.some((s, i) => s.text !== song.stanzas[i]?.text)) {
          song.stanzas = cleanedStanzas.length > 0 ? cleanedStanzas : [{ type: 'Verse 1', text: '' }];
          songModified = true;
        }
      }
      return songModified;
    };

    this.customSongs.forEach(song => {
      if (cleanSongObj(song)) modified = true;
    });

    if (typeof SONGS_DATABASE !== 'undefined') {
      SONGS_DATABASE.forEach(song => {
        if (cleanSongObj(song)) modified = true;
      });
    }

    if (modified) {
      try {
        localStorage.setItem('sf_custom_songs', JSON.stringify(this.customSongs));
      } catch (error) {
        if (error.name !== 'QuotaExceededError' || !this.db) throw error;
      }
      if (this.db) {
        try {
          const tx = this.db.transaction(['songs'], 'readwrite');
          const store = tx.objectStore('songs');
          this.customSongs.forEach(song => store.put(song));
        } catch (e) {}
      }
    }
  }

  // Intelligent Content Classifier: Determines if file content is a Bible, Song, or Backup
  detectContentKind(content, fileName = '') {
    if (!content) return 'unknown';

    const trimmed = typeof content === 'string' ? content.trim() : '';

    // 0. Check archives and VideoPsalm signatures
    if (fileName && (fileName.endsWith('.vpagd') || fileName.endsWith('.ewsx'))) {
      return 'migration_archive';
    }
    if (typeof content === 'string' && (content.includes('Songs:[') || /[{,]\s*Songs\s*:/i.test(content))) {
      return 'song';
    }

    // 1. Check JSON content
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || typeof content === 'object') {
      try {
        const json = typeof content === 'object' ? content : JSON.parse(trimmed);
        
        // Full Backup
        if (json.customBibles || (json.customSongs && (json.version || json.exportedAt))) {
          return 'backup';
        }

        // Bible JSON check
        if (this.isBibleJSON(json)) {
          return 'bible';
        }

        // Songs JSON check
        if (this.isSongJSON(json)) {
          return 'song';
        }
      } catch (e) {}
    }

    // 2. Check XML content
    if (trimmed.startsWith('<') || trimmed.includes('<?xml')) {
      if (/<(XMLBIBLE|xmlbible|bible|osis|usx|testament|b n=)/i.test(trimmed)) {
        return 'bible';
      }
      if (/<(song|lyrics|openlyrics)/i.test(trimmed)) {
        return 'song';
      }
    }

    // 3. Check USFM markers
    if (/\\id\s+[A-Z0-9]{3}/i.test(trimmed) && (/\\c\s+\d+/i.test(trimmed) || /\\v\s+\d+/i.test(trimmed))) {
      return 'bible';
    }

    // 4. Check CSV / TSV Bible lines
    const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length >= 1) {
      const header = lines[0].toLowerCase();
      if ((header.includes('book') || header.includes('chapter')) && header.includes('verse')) {
        return 'bible';
      }
      
      // Check first lines for Bible reference format
      let bibleLineScore = 0;
      let songHeaderScore = 0;
      for (let i = 0; i < Math.min(lines.length, 30); i++) {
        const line = lines[i].trim();
        if (/^(verse\s*\d+|chorus|bridge|pre-chorus|intro|outro|tag)/i.test(line) || /^\[(verse|chorus|bridge|tag)/i.test(line)) {
          songHeaderScore++;
        }
        if (/^([1-3]?\s*[A-Za-z]+)\s+(\d+)[:\.](\d+)\s+(.+)$/.test(line)) {
          const match = line.match(/^([1-3]?\s*[A-Za-z]+)\s+(\d+)[:\.](\d+)/);
          if (match && this.isBibleBookName(match[1])) {
            bibleLineScore++;
          }
        }
      }
      if (bibleLineScore >= 1 && bibleLineScore > songHeaderScore) {
        return 'bible';
      }
      if (songHeaderScore >= 1) {
        return 'song';
      }
    }

    // 5. Fallback based on filename
    const lowerName = (fileName || '').toLowerCase();
    if (/\b(bible|kjv|niv|esv|nlt|nkjv|amp|rvr|msg|asv|nasb|csb|scripture)\b/i.test(lowerName)) {
      return 'bible';
    }

    return 'song';
  }

  // Check if JSON data represents a Bible database structure
  isBibleJSON(json) {
    if (!json) return false;

    // Direct translation wrapper: e.g. { "KJV": { "Genesis": { ... } } }
    if (typeof json === 'object' && !Array.isArray(json)) {
      const keys = Object.keys(json);
      if (keys.length === 1 && typeof json[keys[0]] === 'object') {
        const innerKeys = Object.keys(json[keys[0]]);
        const matchCount = innerKeys.filter(k => this.isBibleBookName(k)).length;
        if (matchCount >= 1) return true;
      }

      // Keys are direct Bible books: { "Genesis": { ... }, "Exodus": { ... } }
      const matchCount = keys.filter(k => this.isBibleBookName(k)).length;
      if (matchCount >= 2 || (keys.length === 1 && matchCount === 1)) {
        return true;
      }

      // Metadata object with books or verses
      if (json.books || json.chapters || json.verses || json.translation || json.translationCode) {
        return true;
      }
    }

    // Array of verses: [ { book: "Genesis", chapter: 1, verse: 1, text: "..." } ]
    if (Array.isArray(json) && json.length > 0) {
      const first = json[0];
      if (first && typeof first === 'object') {
        if ((first.book || first.book_name || first.b) && (first.chapter || first.c) && (first.verse || first.v)) {
          return true;
        }
        if (first.name && this.isBibleBookName(first.name) && (first.chapters || first.verses)) {
          return true;
        }
      }
    }

    return false;
  }

  // Check if JSON data represents a Song structure
  isSongJSON(json) {
    if (!json) return false;
    if (Array.isArray(json)) {
      return json.length > 0 && json[0] && (json[0].stanzas || (json[0].title && json[0].lyrics));
    }
    if (json.Songs && Array.isArray(json.Songs)) return true;
    return Boolean(json.title && (json.stanzas || json.lyrics || json.author));
  }

  // Universal Bible Parser: parses JSON, XML, USFM, CSV, or Text into normalized Ginomia Bible object
  parseBibleContent(content, fileName = 'Imported Bible') {
    const rawTrimmed = typeof content === 'string' ? content.trim() : '';
    const defaultCode = (fileName || 'BIBLE').replace(/\.[^/.]+$/, "").toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 10) || 'CUSTOM';

    // 1. JSON Parsing
    if (rawTrimmed.startsWith('{') || rawTrimmed.startsWith('[') || typeof content === 'object') {
      try {
        const json = typeof content === 'object' ? content : JSON.parse(rawTrimmed);
        const parsed = this.parseBibleJSON(json, defaultCode);
        return parsed;
      } catch (e) {
        console.warn('JSON Bible parse failed, falling back to text', e);
      }
    }

    // 2. XML Parsing (Zefania / OSIS / OpenSong / USX)
    if (rawTrimmed.startsWith('<') || rawTrimmed.includes('<?xml')) {
      try {
        const parsed = this.parseBibleXML(rawTrimmed, defaultCode);
        if (Object.keys(parsed.data).length > 0) return parsed;
      } catch (e) {
        console.warn('XML Bible parse failed, falling back to text', e);
      }
    }

    // 3. USFM Parsing
    if (/\\id\s+[A-Z0-9]{3}/i.test(rawTrimmed)) {
      const parsed = this.parseBibleUSFM(rawTrimmed, defaultCode);
      if (Object.keys(parsed.data).length > 0) return parsed;
    }

    // 4. CSV / Text Line Parsing
    const parsedText = this.parseBibleText(rawTrimmed, defaultCode);
    return parsedText;
  }

  // Parse JSON Bible formats
  parseBibleJSON(json, defaultCode = 'BIBLE') {
    let translationCode = defaultCode;
    let translationName = defaultCode;
    const bibleData = {};

    if (!json) return { code: translationCode, name: translationName, data: bibleData };

    // Extract metadata if available
    if (json.version || json.translation || json.translationCode || json.code || json.name || json.title) {
      translationCode = (json.code || json.translationCode || json.version || json.translation || defaultCode).toString().toUpperCase().trim();
      translationName = (json.name || json.title || json.translation || translationCode).toString().trim();
    }

    // Format A: Wrapped translation { "KJV": { "Genesis": { ... } } }
    if (typeof json === 'object' && !Array.isArray(json)) {
      const keys = Object.keys(json);
      if (keys.length === 1 && typeof json[keys[0]] === 'object' && !this.isBibleBookName(keys[0])) {
        translationCode = keys[0].toUpperCase();
        return this.parseBibleJSON(json[keys[0]], translationCode);
      }
    }

    // Format B: Direct book keys { "Genesis": { "1": [ { verse: 1, text: "..." } ] } }
    if (typeof json === 'object' && !Array.isArray(json)) {
      const sourceObj = json.books || json;

      // If sourceObj is array of book objects
      if (Array.isArray(sourceObj)) {
        sourceObj.forEach(bookObj => {
          const rawName = bookObj.name || bookObj.book || bookObj.book_name || 'Genesis';
          const normName = this.normalizeBookName(rawName);
          bibleData[normName] = bibleData[normName] || {};

          // Chapters can be array or object
          if (Array.isArray(bookObj.chapters)) {
            bookObj.chapters.forEach((chData, chIdx) => {
              const chNum = chIdx + 1;
              bibleData[normName][chNum] = [];

              if (Array.isArray(chData)) {
                chData.forEach((vItem, vIdx) => {
                  const vNum = typeof vItem === 'object' ? (vItem.verse || vIdx + 1) : (vIdx + 1);
                  const vText = typeof vItem === 'object' ? (vItem.text || '') : String(vItem);
                  bibleData[normName][chNum].push({ verse: parseInt(vNum, 10), text: this.cleanMarkup(vText) });
                });
              } else if (typeof chData === 'object' && chData !== null) {
                const versesArr = chData.verses || chData;
                if (Array.isArray(versesArr)) {
                  versesArr.forEach((vItem, vIdx) => {
                    const vNum = typeof vItem === 'object' ? (vItem.verse || vIdx + 1) : (vIdx + 1);
                    const vText = typeof vItem === 'object' ? (vItem.text || '') : String(vItem);
                    bibleData[normName][chNum].push({ verse: parseInt(vNum, 10), text: this.cleanMarkup(vText) });
                  });
                }
              }
            });
          } else if (typeof bookObj.chapters === 'object' && bookObj.chapters !== null) {
            Object.keys(bookObj.chapters).forEach(chKey => {
              const chNum = parseInt(chKey, 10) || 1;
              bibleData[normName][chNum] = [];
              const rawVerses = bookObj.chapters[chKey];
              if (Array.isArray(rawVerses)) {
                rawVerses.forEach((vItem, vIdx) => {
                  const vNum = typeof vItem === 'object' ? (vItem.verse || vIdx + 1) : (vIdx + 1);
                  const vText = typeof vItem === 'object' ? (vItem.text || '') : String(vItem);
                  bibleData[normName][chNum].push({ verse: parseInt(vNum, 10), text: this.cleanMarkup(vText) });
                });
              } else if (typeof rawVerses === 'object') {
                Object.keys(rawVerses).forEach(vKey => {
                  bibleData[normName][chNum].push({ verse: parseInt(vKey, 10), text: this.cleanMarkup(String(rawVerses[vKey])) });
                });
              }
            });
          }
        });
      } else {
        // Direct key-value book mapping
        Object.keys(sourceObj).forEach(bookKey => {
          if (['version', 'translation', 'code', 'name', 'title', 'testament', 'language'].includes(bookKey.toLowerCase())) return;

          const normName = this.normalizeBookName(bookKey);
          bibleData[normName] = bibleData[normName] || {};
          const rawChapters = sourceObj[bookKey];

          if (typeof rawChapters === 'object' && rawChapters !== null) {
            Object.keys(rawChapters).forEach(chKey => {
              const chNum = parseInt(chKey, 10) || 1;
              bibleData[normName][chNum] = [];
              const chContent = rawChapters[chKey];

              if (Array.isArray(chContent)) {
                chContent.forEach((vItem, vIdx) => {
                  const vNum = typeof vItem === 'object' ? (vItem.verse || vIdx + 1) : (vIdx + 1);
                  const vText = typeof vItem === 'object' ? (vItem.text || '') : String(vItem);
                  bibleData[normName][chNum].push({ verse: parseInt(vNum, 10), text: this.cleanMarkup(vText) });
                });
              } else if (typeof chContent === 'object' && chContent !== null) {
                Object.keys(chContent).forEach(vKey => {
                  const vItem = chContent[vKey];
                  const vText = typeof vItem === 'object' ? (vItem.text || '') : String(vItem);
                  bibleData[normName][chNum].push({ verse: parseInt(vKey, 10), text: this.cleanMarkup(vText) });
                });
              }
            });
          }
        });
      }
    }

    // Format C: Flat Array of Verses [ { book: "Genesis", chapter: 1, verse: 1, text: "..." } ]
    if (Array.isArray(json)) {
      json.forEach(v => {
        if (!v || typeof v !== 'object') return;
        const rawBook = v.book || v.book_name || v.b || 'Genesis';
        const normBook = this.normalizeBookName(rawBook);
        const ch = parseInt(v.chapter || v.c || 1, 10);
        const vNum = parseInt(v.verse || v.v || 1, 10);
        const text = this.cleanMarkup(v.text || v.t || '');

        bibleData[normBook] = bibleData[normBook] || {};
        bibleData[normBook][ch] = bibleData[normBook][ch] || [];
        bibleData[normBook][ch].push({ verse: vNum, text: text });
      });
    }

    return {
      code: translationCode,
      name: translationName,
      data: bibleData
    };
  }

  // Parse XML Bible formats (Zefania, OSIS, OpenSong, USX)
  parseBibleXML(xmlText, defaultCode = 'BIBLE') {
    let translationCode = defaultCode;
    let translationName = defaultCode;
    const bibleData = {};

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');

      // Check Zefania XML: <XMLBIBLE biblename="KJV"> <BIBLEBOOK bname="Genesis"> <CHAPTER cnumber="1"> <VERS vnumber="1">
      const xmlBibleEl = doc.querySelector('XMLBIBLE, xmlbible');
      if (xmlBibleEl) {
        translationName = xmlBibleEl.getAttribute('biblename') || xmlBibleEl.getAttribute('name') || defaultCode;
        translationCode = (xmlBibleEl.getAttribute('biblename') || defaultCode).toUpperCase().slice(0, 10);

        const bookEls = doc.querySelectorAll('BIBLEBOOK, biblebook');
        bookEls.forEach(bEl => {
          const rawBook = bEl.getAttribute('bname') || bEl.getAttribute('name') || bEl.getAttribute('bnumber') || 'Genesis';
          const normBook = this.normalizeBookName(rawBook);
          bibleData[normBook] = bibleData[normBook] || {};

          const chEls = bEl.querySelectorAll('CHAPTER, chapter');
          chEls.forEach(chEl => {
            const chNum = parseInt(chEl.getAttribute('cnumber') || chEl.getAttribute('number') || 1, 10);
            bibleData[normBook][chNum] = [];

            const versEls = chEl.querySelectorAll('VERS, vers');
            versEls.forEach(vEl => {
              const vNum = parseInt(vEl.getAttribute('vnumber') || vEl.getAttribute('number') || 1, 10);
              const text = this.cleanMarkup(vEl.textContent);
              bibleData[normBook][chNum].push({ verse: vNum, text: text });
            });
          });
        });

        return { code: translationCode, name: translationName, data: bibleData };
      }

      // Check OpenSong Scripture XML: <bible> <b n="Genesis"> <c n="1"> <v n="1">
      const openSongBible = doc.querySelector('bible');
      if (openSongBible) {
        const bookEls = doc.querySelectorAll('b');
        bookEls.forEach(bEl => {
          const rawBook = bEl.getAttribute('n') || bEl.getAttribute('name') || 'Genesis';
          const normBook = this.normalizeBookName(rawBook);
          bibleData[normBook] = bibleData[normBook] || {};

          const chEls = bEl.querySelectorAll('c');
          chEls.forEach(chEl => {
            const chNum = parseInt(chEl.getAttribute('n') || 1, 10);
            bibleData[normBook][chNum] = [];

            const versEls = chEl.querySelectorAll('v');
            versEls.forEach(vEl => {
              const vNum = parseInt(vEl.getAttribute('n') || 1, 10);
              const text = this.cleanMarkup(vEl.textContent);
              bibleData[normBook][chNum].push({ verse: vNum, text: text });
            });
          });
        });

        return { code: translationCode, name: translationName, data: bibleData };
      }

      // Check OSIS XML: <osisText osisIDWork="KJV"> <div type="book" osisID="Gen"> <chapter osisID="Gen.1"> <verse osisID="Gen.1.1">
      const osisWork = doc.querySelector('osisText, work');
      if (osisWork) {
        translationCode = (osisWork.getAttribute('osisIDWork') || defaultCode).toUpperCase();
        const verseEls = doc.querySelectorAll('verse');
        verseEls.forEach(vEl => {
          const osisId = vEl.getAttribute('osisID') || '';
          const parts = osisId.split('.');
          if (parts.length >= 3) {
            const normBook = this.normalizeBookName(parts[0]);
            const ch = parseInt(parts[1], 10);
            const v = parseInt(parts[2], 10);
            bibleData[normBook] = bibleData[normBook] || {};
            bibleData[normBook][ch] = bibleData[normBook][ch] || [];
            bibleData[normBook][ch].push({ verse: v, text: this.cleanMarkup(vEl.textContent) });
          }
        });
        return { code: translationCode, name: translationName, data: bibleData };
      }
    } catch (e) {
      console.warn('DOMParser failed on XML Bible', e);
    }

    return { code: translationCode, name: translationName, data: bibleData };
  }

  // Parse USFM (.usfm / .sfm) Bible files
  parseBibleUSFM(usfmText, defaultCode = 'BIBLE') {
    const bibleData = {};
    let currentBook = 'Genesis';
    let currentChapter = 1;

    const lines = usfmText.split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('\\')) return;

      if (trimmed.startsWith('\\id ')) {
        const idCode = trimmed.replace(/^\\id\s+/, '').split(/\s+/)[0];
        currentBook = this.normalizeBookName(idCode);
        bibleData[currentBook] = bibleData[currentBook] || {};
      } else if (trimmed.startsWith('\\h ') || trimmed.startsWith('\\toc1 ') || trimmed.startsWith('\\toc2 ')) {
        const bookHeader = trimmed.replace(/^\\(h|toc1|toc2)\s+/, '');
        currentBook = this.normalizeBookName(bookHeader);
        bibleData[currentBook] = bibleData[currentBook] || {};
      } else if (trimmed.startsWith('\\c ')) {
        currentChapter = parseInt(trimmed.replace(/^\\c\s+/, ''), 10) || 1;
        bibleData[currentBook] = bibleData[currentBook] || {};
        bibleData[currentBook][currentChapter] = bibleData[currentBook][currentChapter] || [];
      } else if (trimmed.startsWith('\\v ')) {
        const match = trimmed.match(/^\\v\s+(\d+)\s*(.*)$/);
        if (match) {
          const vNum = parseInt(match[1], 10);
          const rawText = match[2]
            .replace(/\\[a-z0-9]+\*?/gi, '') // strip inline USFM markup e.g. \f ... \f*
            .replace(/\s+/g, ' ')
            .trim();
          bibleData[currentBook] = bibleData[currentBook] || {};
          bibleData[currentBook][currentChapter] = bibleData[currentBook][currentChapter] || [];
          bibleData[currentBook][currentChapter].push({ verse: vNum, text: rawText });
        }
      }
    });

    return {
      code: defaultCode,
      name: defaultCode,
      data: bibleData
    };
  }

  // Parse Text / CSV Scripture files with reference lines
  parseBibleText(text, defaultCode = 'BIBLE') {
    const bibleData = {};
    let currentBook = 'Genesis';
    let currentChapter = 1;

    const lines = text.split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || this.isDividerLine(trimmed)) return;

      // 1. Check CSV Line: "Genesis", 1, 1, "In the beginning..."
      const csvParts = trimmed.split(/[\t,|;]/).map(s => s.trim().replace(/^["']|["']$/g, ''));
      if (csvParts.length >= 4 && !isNaN(parseInt(csvParts[1], 10)) && !isNaN(parseInt(csvParts[2], 10))) {
        const bookName = this.normalizeBookName(csvParts[0]);
        if (this.isBibleBookName(bookName)) {
          const ch = parseInt(csvParts[1], 10);
          const v = parseInt(csvParts[2], 10);
          const txt = this.cleanMarkup(csvParts.slice(3).join(' '));
          bibleData[bookName] = bibleData[bookName] || {};
          bibleData[bookName][ch] = bibleData[bookName][ch] || [];
          bibleData[bookName][ch].push({ verse: v, text: txt });
          return;
        }
      }

      // 2. Check Line with Book Ref: "Genesis 1:1 In the beginning..." or "1 Cor 13:4 Love is..."
      const refMatch = trimmed.match(/^([1-3]?\s*[A-Za-z\s]+?)\s+(\d+)[:\.](\d+)\s*[:\-–]?\s*(.+)$/);
      if (refMatch && this.isBibleBookName(refMatch[1])) {
        const book = this.normalizeBookName(refMatch[1]);
        const ch = parseInt(refMatch[2], 10);
        const v = parseInt(refMatch[3], 10);
        const txt = this.cleanMarkup(refMatch[4]);

        bibleData[book] = bibleData[book] || {};
        bibleData[book][ch] = bibleData[book][ch] || [];
        bibleData[book][ch].push({ verse: v, text: txt });
        currentBook = book;
        currentChapter = ch;
        return;
      }

      // 3. Check Chapter Header: "Chapter 1" or "# Genesis 1"
      const chHeaderMatch = trimmed.match(/^(?:#\s*)?(?:Chapter|CHAPTER)\s+(\d+)/i) || trimmed.match(/^(?:#\s*)?([1-3]?\s*[A-Za-z\s]+?)\s+(\d+)$/);
      if (chHeaderMatch) {
        if (chHeaderMatch[2] && this.isBibleBookName(chHeaderMatch[1])) {
          currentBook = this.normalizeBookName(chHeaderMatch[1]);
          currentChapter = parseInt(chHeaderMatch[2], 10);
        } else if (chHeaderMatch[1]) {
          currentChapter = parseInt(chHeaderMatch[1], 10);
        }
        bibleData[currentBook] = bibleData[currentBook] || {};
        bibleData[currentBook][currentChapter] = bibleData[currentBook][currentChapter] || [];
        return;
      }

      // 4. Check Numbered Verse Line: "1. In the beginning..." or "1 In the beginning..."
      const vLineMatch = trimmed.match(/^(\d+)[\.\:]?\s+(.+)$/);
      if (vLineMatch) {
        const vNum = parseInt(vLineMatch[1], 10);
        const txt = this.cleanMarkup(vLineMatch[2]);
        bibleData[currentBook] = bibleData[currentBook] || {};
        bibleData[currentBook][currentChapter] = bibleData[currentBook][currentChapter] || [];
        bibleData[currentBook][currentChapter].push({ verse: vNum, text: txt });
      }
    });

    return {
      code: defaultCode,
      name: defaultCode,
      data: bibleData
    };
  }

  // Unified File Importer: Auto-detects content kind and routes to Bible or Song database
  importRawFile(content, fileName = 'Imported File', overwrite = true, skipNotify = false) {
    const kind = this.detectContentKind(content, fileName);

    if (kind === 'backup') {
      try {
        const jsonData = typeof content === 'object' ? content : JSON.parse(content);
        let biblesCount = 0;
        let songsCount = 0;

        if (jsonData.customBibles) {
          Object.keys(jsonData.customBibles).forEach(code => {
            this.importBibleData(code, jsonData.customBibles[code]);
            biblesCount++;
          });
        }
        if (jsonData.customSongs) {
          const res = this.importSongsData(jsonData.customSongs, overwrite, skipNotify);
          songsCount += res.importedCount;
        }
        return {
          type: 'backup',
          success: true,
          biblesCount,
          songsCount,
          message: `Restored backup: ${biblesCount} Bible(s), ${songsCount} Song(s)`
        };
      } catch (err) {
        return { type: 'backup', success: false, error: err.message };
      }
    }

    if (kind === 'bible') {
      try {
        const parsedBible = this.parseBibleContent(content, fileName);
        const bookCount = Object.keys(parsedBible.data).length;
        if (bookCount === 0) {
          throw new Error('No scripture books found in file');
        }

        this.importBibleData(parsedBible.code, parsedBible.data, parsedBible.name);

        return {
          type: 'bible',
          success: true,
          code: parsedBible.code,
          name: parsedBible.name,
          bookCount: bookCount,
          message: `Installed Bible translation "${parsedBible.code}" with ${bookCount} book(s)`
        };
      } catch (err) {
        return { type: 'bible', success: false, error: err.message };
      }
    }

    // Default: Song
    try {
      const rawText = typeof content === 'string' ? content : '';
      if (rawText && (rawText.includes('Songs:[') || /[{,]\s*Songs\s*:/i.test(rawText))) {
        const vpData = this.parseVideoPsalmRelaxedJson(rawText);
        if (vpData && Array.isArray(vpData.Songs)) {
          const bookTitle = vpData.Text || vpData.Abbreviation || fileName.replace(/\.[^/.]+$/, "") || 'VideoPsalm Songbook';
          const convertedSongs = vpData.Songs.map(s => this.convertVideoPsalmSong(s, bookTitle));
          const res = this.importSongsData(convertedSongs, overwrite, skipNotify);
          return {
            type: 'song',
            success: true,
            importedCount: res.importedCount,
            message: `Imported ${res.importedCount} song(s) from "${bookTitle}" into Songbook`
          };
        }
      }

      if (typeof content === 'object' || (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('[')))) {
        const songJson = typeof content === 'object' ? content : JSON.parse(content);
        const res = this.importSongsData(songJson, overwrite, skipNotify);
        return {
          type: 'song',
          success: true,
          importedCount: res.importedCount,
          message: `Imported ${res.importedCount} song(s) into Songbook`
        };
      } else {
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
        const parsedSong = this.parseSongText(content, fileNameWithoutExt);
        const res = this.importSongsData(parsedSong, overwrite, skipNotify);
        return {
          type: 'song',
          success: true,
          title: parsedSong.title,
          importedCount: res.importedCount,
          message: `Added "${parsedSong.title}" to Songbook`
        };
      }
    } catch (err) {
      return { type: 'song', success: false, error: err.message };
    }
  }

  // Smart song parser handling plain text, headers, and brackets
  parseSongText(text, title = 'Imported Song', author = 'Unknown', songbook = 'Custom Library') {
    // Check if OpenLyrics XML
    if (text.includes('<song') || text.includes('<lyrics>')) {
      return this.parseOpenLyricsXML(text, title, author, songbook);
    }

    const lines = text.split(/\r?\n/);
    const stanzas = [];
    let currentType = 'Verse 1';
    let currentLines = [];

    let extractedTitle = title;
    let extractedAuthor = author;

    lines.forEach(line => {
      const rawTrimmed = line.trim();
      
      // 1. Skip completely empty lines
      if (!rawTrimmed) {
        if (currentLines.length > 0) {
          stanzas.push({ type: currentType, text: currentLines.join('\n') });
          currentLines = [];
        }
        return;
      }

      // 2. Filter out decorative divider lines
      if (this.isDividerLine(rawTrimmed)) {
        if (currentLines.length > 0) {
          stanzas.push({ type: currentType, text: currentLines.join('\n') });
          currentLines = [];
        }
        return;
      }

      // 3. Match metadata headers
      if (/^title\s*:\s*(.+)$/i.test(rawTrimmed)) {
        extractedTitle = this.cleanSongTitle(rawTrimmed.replace(/^title\s*:\s*/i, ''));
        return;
      } else if (/^(author|artist|composer|by)\s*:\s*(.+)$/i.test(rawTrimmed)) {
        extractedAuthor = this.cleanMarkup(rawTrimmed.replace(/^(author|artist|composer|by)\s*:\s*/i, ''));
        return;
      } else if (/^(?:source|hymnal|songbook)\s*:\s*(.+)$/i.test(rawTrimmed)) {
        songbook = this.cleanMarkup(rawTrimmed.replace(/^(?:source|hymnal|songbook)\s*:\s*/i, ''));
        return;
      } else if (this.isMetadataHeader(rawTrimmed)) {
        return;
      }

      // 4. Match stanza section headers e.g. [Verse 1], Verse 2, [Chorus], Chorus 1, Bridge, Tag, etc.
      if (/^\[?(verse|chorus|bridge|pre-chorus|tag|intro|outro|v|c|b|p)\s*\d*\]?:?$/i.test(rawTrimmed)) {
        if (currentLines.length > 0) {
          stanzas.push({ type: currentType, text: currentLines.join('\n') });
          currentLines = [];
        }
        let cleanTag = rawTrimmed.replace(/[\[\]:]/g, '').trim();
        currentType = cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);
        return;
      }

      // 4b. Match numbered hymn stanzas e.g. "1 He paid a debt...", "2 He paid that debt..."
      let lyricLineToProcess = rawTrimmed;
      const hymnNumMatch = rawTrimmed.match(/^(\d+)[\.\)\:\s]+(.*)$/);
      if (hymnNumMatch) {
        const vNum = parseInt(hymnNumMatch[1], 10);
        const restOfLine = hymnNumMatch[2].trim();
        if (vNum >= 1 && vNum <= 25) {
          if (currentLines.length === 0) {
            currentType = `Verse ${vNum}`;
            lyricLineToProcess = restOfLine;
          } else if (vNum > 1) {
            stanzas.push({ type: currentType, text: currentLines.join('\n') });
            currentLines = [];
            currentType = `Verse ${vNum}`;
            lyricLineToProcess = restOfLine;
          }
        }
      }

      // 5. Clean lyric line from embedded formatting tags
      const cleanedLyricLine = this.cleanMarkup(lyricLineToProcess);
      if (cleanedLyricLine && !this.isDividerLine(cleanedLyricLine)) {
        currentLines.push(cleanedLyricLine);
      }
    });

    if (currentLines.length > 0) {
      stanzas.push({ type: currentType, text: currentLines.join('\n') });
    }

    const validStanzas = stanzas.filter(s => s && s.text && s.text.trim().length > 0 && !this.isDividerLine(s.text));

    if (validStanzas.length === 0) {
      const fallbackClean = this.cleanMarkup(text).split(/\r?\n/).filter(l => !this.isDividerLine(l)).join('\n').trim();
      validStanzas.push({ type: 'Verse 1', text: fallbackClean || 'Lyrics' });
    }

    return {
      id: 'song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: this.cleanSongTitle(extractedTitle),
      author: this.cleanMarkup(extractedAuthor) || 'Unknown',
      songbook: songbook.trim() || 'Custom Library',
      stanzas: validStanzas
    };
  }

  // Parse OpenLyrics XML format
  parseOpenLyricsXML(xmlText, fallbackTitle, fallbackAuthor, songbook) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      
      const titleEl = doc.querySelector('title');
      const title = titleEl ? titleEl.textContent : fallbackTitle;

      const authorEl = doc.querySelector('author');
      const author = authorEl ? authorEl.textContent : fallbackAuthor;

      const stanzas = [];
      const verseEls = doc.querySelectorAll('verse');

      verseEls.forEach((v, idx) => {
        const nameAttr = v.getAttribute('name') || `v${idx + 1}`;
        let typeName = 'Verse ' + (idx + 1);
        if (nameAttr.startsWith('c')) typeName = 'Chorus ' + (nameAttr.slice(1) || '1');
        else if (nameAttr.startsWith('b')) typeName = 'Bridge ' + (nameAttr.slice(1) || '1');
        else if (nameAttr.startsWith('p')) typeName = 'Pre-Chorus';
        else if (nameAttr.startsWith('v')) typeName = 'Verse ' + (nameAttr.slice(1) || '1');

        const linesEl = v.querySelectorAll('lines');
        let linesText = '';
        if (linesEl.length > 0) {
          linesText = Array.from(linesEl).map(l => this.cleanMarkup(l.textContent)).filter(l => !this.isDividerLine(l)).join('\n');
        } else {
          linesText = this.cleanMarkup(v.textContent).split(/\r?\n/).filter(l => !this.isDividerLine(l)).join('\n');
        }

        if (linesText && linesText.trim().length > 0 && !this.isDividerLine(linesText)) {
          stanzas.push({ type: typeName, text: linesText });
        }
      });

      if (stanzas.length === 0) {
        stanzas.push({ type: 'Verse 1', text: this.cleanMarkup(xmlText) });
      }

      return {
        id: 'song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        title: this.cleanSongTitle(title) || 'Imported XML Song',
        author: this.cleanMarkup(author) || 'Unknown',
        songbook: songbook || 'OpenLyrics',
        stanzas: stanzas
      };
    } catch (e) {
      console.warn('OpenLyrics parsing failed, falling back to text', e);
      return {
        id: 'song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        title: this.cleanSongTitle(fallbackTitle),
        author: this.cleanMarkup(fallbackAuthor),
        songbook: songbook,
        stanzas: [{ type: 'Verse 1', text: this.cleanMarkup(xmlText) }]
      };
    }
  }

  // Import Song JSON or Array of Songs with duplicate detection (supports batch mode)
  importSongsData(songsData, overwriteDuplicates = false, skipNotify = false) {
    const songsArray = Array.isArray(songsData) ? songsData : [songsData];
    let importedCount = 0;
    let skippedCount = 0;
    const importedSongs = [];

    songsArray.forEach(song => {
      if (song && (song.title || song.name) && (song.stanzas || song.lyrics)) {
        const rawTitle = song.title || song.name || 'Untitled';
        const cleanTitle = this.cleanSongTitle(rawTitle);
        const lowerTitle = cleanTitle.toLowerCase();
        const targetId = song.id || '';

        const existingCustomIdx = this.customSongs.findIndex(s =>
          (targetId && s.id === targetId) || (s.title && s.title.toLowerCase() === lowerTitle)
        );
        const existingDbIdx = (typeof SONGS_DATABASE !== 'undefined' && Array.isArray(SONGS_DATABASE))
          ? SONGS_DATABASE.findIndex(s => (targetId && s.id === targetId) || (s.title && s.title.toLowerCase() === lowerTitle))
          : -1;

        let stanzas = song.stanzas;
        if (!stanzas && typeof song.lyrics === 'string') {
          const parsed = this.parseSongText(song.lyrics, cleanTitle, song.author);
          stanzas = parsed.stanzas;
        }

        // Preserve existing song ID if updating, otherwise keep provided ID or create a clean custom one
        const assignedId = (existingCustomIdx !== -1 && this.customSongs[existingCustomIdx].id)
          ? this.customSongs[existingCustomIdx].id
          : ((existingDbIdx !== -1 && SONGS_DATABASE[existingDbIdx].id)
            ? SONGS_DATABASE[existingDbIdx].id
            : (song.id || ('song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4))));

        const formattedSong = {
          id: assignedId,
          title: cleanTitle,
          author: this.cleanMarkup(song.author) || 'Unknown',
          songbook: song.songbook || 'Custom Library',
          stanzas: (Array.isArray(stanzas) && stanzas.length > 0) ? stanzas : [{ type: 'Verse 1', text: cleanTitle }]
        };

        if (existingCustomIdx !== -1 || existingDbIdx !== -1) {
          if (overwriteDuplicates) {
            if (existingCustomIdx !== -1) {
              this.customSongs[existingCustomIdx] = formattedSong;
            } else {
              this.customSongs.push(formattedSong);
            }
            if (typeof SONGS_DATABASE !== 'undefined') {
              if (existingDbIdx !== -1) {
                SONGS_DATABASE[existingDbIdx] = formattedSong;
              } else {
                SONGS_DATABASE.push(formattedSong);
              }
            }
            importedCount++;
            importedSongs.push(formattedSong);
          } else {
            formattedSong.title = `${formattedSong.title} (Imported)`;
            this.customSongs.push(formattedSong);
            if (typeof SONGS_DATABASE !== 'undefined') SONGS_DATABASE.push(formattedSong);
            importedCount++;
            importedSongs.push(formattedSong);
          }
        } else {
          this.customSongs.push(formattedSong);
          if (typeof SONGS_DATABASE !== 'undefined') {
            SONGS_DATABASE.push(formattedSong);
          }
          importedCount++;
          importedSongs.push(formattedSong);
        }

        if (this.db) {
          try {
            const tx = this.db.transaction(['songs'], 'readwrite');
            tx.objectStore('songs').put(formattedSong);
          } catch(e){}
        }
      }
    });

    if (!skipNotify) {
      this.finishBatchImport();
    }

    return { importedCount, skippedCount, songs: importedSongs };
  }

  // Finalizes batch song imports with safe single-write and single-notify
  finishBatchImport() {
    try {
      localStorage.removeItem('sf_system_formatted');
      try {
        localStorage.setItem('sf_custom_songs', JSON.stringify(this.customSongs));
      } catch (e) {
        console.warn('LocalStorage quota reached for custom songs, IndexedDB remains active.', e);
      }
    } catch(e){}
    if (typeof window.onLibraryDataUpdated === 'function') {
      window.onLibraryDataUpdated();
    }
  }

  // Update existing song in library
  updateSong(songId, updatedData, { notify = true, durableFallback = false } = {}) {
    const songIndex = SONGS_DATABASE.findIndex(s => s.id === songId);
    if (songIndex === -1) return false;

    const existingSong = SONGS_DATABASE[songIndex];
    const newSongObj = {
      id: existingSong.id,
      title: updatedData.title ? this.cleanSongTitle(updatedData.title) : existingSong.title,
      author: updatedData.author ? this.cleanMarkup(updatedData.author) : existingSong.author,
      songbook: existingSong.songbook || 'Custom Library',
      stanzas: updatedData.stanzas || existingSong.stanzas
    };

    const nextSongs = this.customSongs.slice();
    const customIdx = nextSongs.findIndex(s => s.id === songId);
    if (customIdx !== -1) {
      nextSongs[customIdx] = newSongObj;
    } else {
      nextSongs.push(newSongObj);
    }

    const commit = () => {
      SONGS_DATABASE[songIndex] = newSongObj;
      this.customSongs = nextSongs;
      if (notify && typeof window.onLibraryDataUpdated === 'function') window.onLibraryDataUpdated();
      return true;
    };
    try {
      localStorage.setItem('sf_custom_songs', JSON.stringify(nextSongs));
    } catch (error) {
      if (!durableFallback || error.name !== 'QuotaExceededError' || !this.db) throw error;
      // Migrate the complete cache before removing it, so reload cannot restore stale lyrics.
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['songs'], 'readwrite');
        tx.onabort = () => reject(tx.error || new Error('Song storage transaction was aborted.'));
        tx.oncomplete = () => {
          try {
            localStorage.removeItem('sf_custom_songs');
            resolve(commit());
          } catch (failure) { reject(failure); }
        };
        try {
          const store = tx.objectStore('songs');
          nextSongs.forEach(song => store.put(song));
        } catch (failure) {
          tx.abort();
          reject(failure);
        }
      });
    }

    if (this.db) {
      try {
        const tx = this.db.transaction(['songs'], 'readwrite');
        tx.objectStore('songs').put(newSongObj);
      } catch (e) {}
    }
    return commit();
  }

  // Delete song from library
  deleteSong(songId) {
    const songIdx = SONGS_DATABASE.findIndex(s => s.id === songId);
    if (songIdx !== -1) SONGS_DATABASE.splice(songIdx, 1);

    const customIdx = this.customSongs.findIndex(s => s.id === songId);
    if (customIdx !== -1) this.customSongs.splice(customIdx, 1);

    localStorage.setItem('sf_custom_songs', JSON.stringify(this.customSongs));

    if (this.db) {
      try {
        const tx = this.db.transaction(['songs'], 'readwrite');
        tx.objectStore('songs').delete(songId);
      } catch (e) {}
    }
    if (typeof window.onLibraryDataUpdated === 'function') {
      window.onLibraryDataUpdated();
    }
    return true;
  }

  // Delete individual Bible translation from storage
  deleteBible(code) {
    if (!code) return false;
    const upperCode = code.toUpperCase().trim();
    
    delete this.customBibles[upperCode];
    if (typeof BIBLE_DATABASE !== 'undefined') {
      delete BIBLE_DATABASE[upperCode];
    }

    try {
      localStorage.setItem('sf_custom_bibles', JSON.stringify(this.customBibles));
    } catch (e) {}

    try {
      const installed = JSON.parse(localStorage.getItem('sf_installed_bibles') || '[]');
      const filtered = installed.filter(c => c !== upperCode);
      localStorage.setItem('sf_installed_bibles', JSON.stringify(filtered));
    } catch (e) {}

    if (this.db) {
      try {
        const tx = this.db.transaction(['bibles'], 'readwrite');
        tx.objectStore('bibles').delete(upperCode);
      } catch (e) {}
    }

    if (typeof window.onLibraryDataUpdated === 'function') {
      window.onLibraryDataUpdated();
    }
    return true;
  }

  // Clear Only Downloaded Bibles
  clearBiblesOnly() {
    this.customBibles = {};
    localStorage.removeItem('sf_custom_bibles');
    localStorage.removeItem('sf_installed_bibles');
    if (typeof BIBLE_DATABASE !== 'undefined') {
      for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k];
    }
    if (this.db) {
      try {
        const tx = this.db.transaction(['bibles'], 'readwrite');
        tx.objectStore('bibles').clear();
      } catch (e) {}
    }
    if (typeof window.onLibraryDataUpdated === 'function') {
      window.onLibraryDataUpdated();
    }
  }

  // Clear Only Saved Songs
  clearSongsOnly() {
    this.customSongs = [];
    this.customSongbooks = [];
    localStorage.removeItem('sf_custom_songs');
    localStorage.removeItem('sf_custom_songbooks');
    if (typeof SONGS_DATABASE !== 'undefined') {
      SONGS_DATABASE.length = 0;
    }
    if (typeof SONGBOOKS_DATABASE !== 'undefined') {
      SONGBOOKS_DATABASE.length = 0;
    }
    if (this.db) {
      try {
        const tx = this.db.transaction(['songs'], 'readwrite');
        tx.objectStore('songs').clear();
      } catch (e) {}
    }
    if (typeof window.onLibraryDataUpdated === 'function') {
      window.onLibraryDataUpdated();
    }
  }

  // Dynamic Real-time Online Lyrics Search across global cloud repositories with multi-provider fallback
  async searchOnlineLyrics(query, artist = '', title = '') {
    const qTerm = (query || `${title} ${artist}`).trim();
    if (!qTerm) return [];

    if (!this._lyricsSearchCache) {
      this._lyricsSearchCache = new Map();
    }
    const cacheKey = qTerm.toLowerCase();
    const cached = this._lyricsSearchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 3600000)) {
      return cached.results;
    }

    // 1. Try local server lyrics proxy (handles caching, lrclib & server-side fallback)
    try {
      const url = `/api/lyrics/search?q=${encodeURIComponent(qTerm)}&artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          this._lyricsSearchCache.set(cacheKey, { results: data.results, timestamp: Date.now() });
          return data.results;
        }
      }
    } catch (e) {
      // Backend proxy unreachable or timed out
    }

    // 2. Client-side fallback 1: Direct lrclib.net
    try {
      const directUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(qTerm)}`;
      const resp = await fetch(directUrl, {
        headers: { 'User-Agent': 'Ginomia/1.0' },
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list)) {
          const formatted = list
            .filter(item => (item.plainLyrics || item.syncedLyrics) && (item.trackName || item.name))
            .map(item => {
              const raw = item.plainLyrics || item.syncedLyrics || '';
              const trackTitle = this.cleanSongTitle(item.trackName || item.name || 'Untitled');
              const trackArtist = this.cleanMarkup(item.artistName || artist || 'Unknown Artist');
              const parsed = this.parseSongText(raw, trackTitle, trackArtist, 'Cloud Worship');
              const preview = parsed.stanzas.map(s => s.text).join(' ').slice(0, 160) + '...';
              return {
                id: item.id ? `lrc_${item.id}` : `song_cloud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                title: trackTitle,
                author: trackArtist,
                album: item.albumName || '',
                duration: item.duration || 0,
                songbook: 'Cloud Worship',
                source: item.source || 'LRCLIB',
                previewText: preview,
                stanzas: parsed.stanzas
              };
            });
          if (formatted.length > 0) {
            this._lyricsSearchCache.set(cacheKey, { results: formatted, timestamp: Date.now() });
            return formatted;
          }
        }
      }
    } catch (err) {
      // lrclib 503 or network failure
    }

    // 3. Client-side fallback 2: Direct Genius Open & Lyrics Search
    try {
      const gHeaders = { 'Accept': 'application/json' };
      const [gResMulti, gResLyric] = await Promise.allSettled([
        fetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(qTerm)}`, { headers: gHeaders, signal: AbortSignal.timeout(4500) }),
        fetch(`https://genius.com/api/search/lyric?q=${encodeURIComponent(qTerm)}`, { headers: gHeaders, signal: AbortSignal.timeout(4500) })
      ]);
      const hits = [];
      const seenHitIds = new Set();
      if (gResLyric.status === 'fulfilled' && gResLyric.value.ok) {
        try {
          const gData = await gResLyric.value.json();
          const lHits = gData?.response?.sections?.[0]?.hits || gData?.response?.hits || [];
          for (const hit of lHits) {
            const res = hit.result;
            if (res && res.title && (res.artist_names || res.primary_artist?.name) && !seenHitIds.has(res.id)) {
              seenHitIds.add(res.id);
              hits.push(res);
            }
          }
        } catch (e) {}
      }
      if (gResMulti.status === 'fulfilled' && gResMulti.value.ok) {
        try {
          const gData = await gResMulti.value.json();
          const sections = gData?.response?.sections || [];
          for (const sec of sections) {
            if ((sec.type === 'song' || sec.type === 'top_hit' || sec.type === 'lyric') && Array.isArray(sec.hits)) {
              for (const hit of sec.hits) {
                const res = hit.result;
                if (res && res.title && (res.artist_names || res.primary_artist?.name) && !seenHitIds.has(res.id)) {
                  seenHitIds.add(res.id);
                  hits.push(res);
                }
              }
            }
          }
        } catch (e) {}
      }

        if (hits.length > 0) {
          const topHits = hits.slice(0, 4);
          const formattedGenius = await Promise.all(topHits.map(async h => {
            const trackTitle = this.cleanSongTitle(h.title || 'Untitled');
            const trackArtist = this.cleanMarkup(h.artist_names || h.primary_artist?.name || 'Unknown Artist');
            let parsedStanzas = null;
            let preview = `${trackTitle} by ${trackArtist}`;

            try {
              const lrcUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackTitle)}&artist_name=${encodeURIComponent(trackArtist)}`;
              const lrcRes = await fetch(lrcUrl, { headers: { 'User-Agent': 'Ginomia/1.0' }, signal: AbortSignal.timeout(3000) });
              if (lrcRes.ok) {
                const lrcData = await lrcRes.json();
                const rawLyrics = lrcData.plainLyrics || lrcData.syncedLyrics;
                if (rawLyrics) {
                  const parsed = this.parseSongText(rawLyrics, trackTitle, trackArtist, 'Cloud Worship');
                  if (parsed && parsed.stanzas && parsed.stanzas.length > 0) {
                    parsedStanzas = parsed.stanzas;
                    preview = parsed.stanzas.map(s => s.text).join(' ').slice(0, 160) + '...';
                  }
                }
              }
            } catch (err) {}

            return {
              id: `genius_${h.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: trackTitle,
              author: trackArtist,
              album: h.album?.name || '',
              duration: 0,
              songbook: 'Cloud Worship',
              source: 'Genius',
              previewText: preview,
              stanzas: parsedStanzas || [{ type: 'Verse 1', text: `${trackTitle}\nBy ${trackArtist}` }]
            };
          }));

          if (formattedGenius.length > 0) {
            this._lyricsSearchCache.set(cacheKey, { results: formattedGenius, timestamp: Date.now() });
            return formattedGenius;
          }
        }
    } catch (gErr) {
      // Genius fallback failed
    }

    // 4. Client-side fallback 3: Direct lyrics.ovh
    try {
      const suggestUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(qTerm)}`;
      const suggestRes = await fetch(suggestUrl, { signal: AbortSignal.timeout(4500) });
      if (suggestRes.ok) {
        const suggestData = await suggestRes.json();
        const tracks = (suggestData.data || []).slice(0, 4);
        const settled = await Promise.allSettled(
          tracks.map(async t => {
            const trackArtist = this.cleanMarkup(t.artist?.name || artist || 'Unknown Artist');
            const trackTitle = this.cleanSongTitle(t.title || 'Untitled');
            const lr = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(trackArtist)}/${encodeURIComponent(trackTitle)}`, {
              signal: AbortSignal.timeout(3500)
            });
            if (!lr.ok) return null;
            const ld = await lr.json();
            if (!ld || !ld.lyrics) return null;
            const parsed = this.parseSongText(ld.lyrics, trackTitle, trackArtist, 'Cloud Worship');
            const preview = parsed.stanzas.map(s => s.text).join(' ').slice(0, 160) + '...';
            return {
              id: `ovh_${t.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: trackTitle,
              author: trackArtist,
              album: t.album?.title || '',
              duration: t.duration || 0,
              songbook: 'Cloud Worship',
              source: 'lyrics.ovh',
              previewText: preview,
              stanzas: parsed.stanzas
            };
          })
        );
        const validOvhResults = settled.map(s => s.value).filter(Boolean);
        if (validOvhResults.length > 0) {
          this._lyricsSearchCache.set(cacheKey, { results: validOvhResults, timestamp: Date.now() });
          return validOvhResults;
        }
      }
    } catch (ovhErr) {
      // lyrics.ovh fallback failed
    }

    return [];
  }

  // On-demand Bible downloader saving directly into IndexedDB
  async downloadCloudBible(code, name = '', onProgress = null) {
    if (!code) throw new Error('Bible code required');
    const upperCode = code.toUpperCase().trim();

    if (typeof onProgress === 'function') onProgress({ status: 'downloading', percent: 20 });

    let bibleData = null;

    // 1. Try server download endpoint
    try {
      const res = await fetch(`/api/bibles/download/${upperCode}`);
      if (res.ok) {
        bibleData = await res.json();
      }
    } catch (e) {}

    // 2. Fallback to direct static path /bibles/{code}.json
    if (!bibleData) {
      try {
        const res = await fetch(`/bibles/${upperCode}.json`);
        if (res.ok) {
          bibleData = await res.json();
        }
      } catch (e) {}
    }

    if (!bibleData || typeof bibleData !== 'object' || Object.keys(bibleData).length === 0) {
      throw new Error(`Could not download ${upperCode}. Ensure the server is online or import a Bible file.`);
    }

    if (typeof onProgress === 'function') onProgress({ status: 'saving', percent: 80 });

    // Store in memory & IndexedDB
    const bookCount = this.importBibleData(upperCode, bibleData, name || upperCode);

    if (typeof onProgress === 'function') onProgress({ status: 'complete', percent: 100 });

    return {
      success: true,
      code: upperCode,
      name: name || upperCode,
      booksCount: bookCount
    };
  }

  // Alias for downloadCloudBible
  async installCloudBible(code, name = '') {
    return this.downloadCloudBible(code, name);
  }

  // Import Bible Data into database
  importBibleData(translationCode, bibleData, translationName) {
    if (!translationCode || !bibleData || typeof bibleData !== 'object') {
      throw new Error('Invalid Bible JSON format');
    }

    const code = translationCode.toUpperCase().trim();

    // Store in customBibles and runtime BIBLE_DATABASE
    this.customBibles[code] = bibleData;
    if (typeof BIBLE_DATABASE !== 'undefined') {
      BIBLE_DATABASE[code] = bibleData;
    }

    // Save to IndexedDB for large Bible versions
    if (this.db) {
      try {
        const tx = this.db.transaction(['bibles'], 'readwrite');
        tx.objectStore('bibles').put({ code: code, data: bibleData, name: translationName || code });
      } catch (e) {}
    }

    // Persist installed translation codes safely without overflowing 5MB localStorage
    try {
      const installed = JSON.parse(localStorage.getItem('sf_installed_bibles') || '[]');
      if (!installed.includes(code)) {
        installed.push(code);
        localStorage.setItem('sf_installed_bibles', JSON.stringify(installed));
      }
    } catch (e) {}

    try {
      localStorage.removeItem('sf_system_formatted');
      localStorage.setItem('sf_custom_bibles', JSON.stringify(this.customBibles));
    } catch (e) {
      console.warn('LocalStorage quota exceeded for Bible, saved in IndexedDB & memory.', e);
    }

    if (typeof window.onLibraryDataUpdated === 'function') {
      window.onLibraryDataUpdated();
    }
    return Object.keys(bibleData).length;
  }

  // Export full custom library as JSON file
  exportCustomLibrary() {
    const exportData = {
      version: '2.4.0',
      exportedAt: new Date().toISOString(),
      customBibles: this.customBibles,
      customSongs: this.customSongs
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ginomia_library_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Parse VideoPsalm relaxed JSON (unquoted keys, multiline string literals, BOM)
  parseVideoPsalmRelaxedJson(text) {
    if (!text || typeof text !== 'string') return null;
    text = text.replace(/^\uFEFF/, '').trim();
    if (!text) return null;

    let inString = false;
    let escapeNext = false;
    const out = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escapeNext) {
          out.push(ch);
          escapeNext = false;
        } else if (ch === '\\') {
          out.push(ch);
          escapeNext = true;
        } else if (ch === '"') {
          out.push(ch);
          inString = false;
        } else if (ch === '\n') {
          out.push('\\n');
        } else if (ch === '\r') {
          out.push('\\r');
        } else if (ch === '\t') {
          out.push('\\t');
        } else {
          out.push(ch);
        }
      } else {
        if (ch === '"') {
          inString = true;
          out.push(ch);
        } else {
          out.push(ch);
        }
      }
    }

    let sanitized = out.join('');
    sanitized = sanitized.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
    sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(sanitized);
    } catch (err) {
      return null;
    }
  }

  // Clean chords and formatting tags from lyric lines
  cleanLyricsText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/\[[A-Ga-g][b#]?[^\]]*\]/g, '') // remove chords e.g. [G/B], [C#m7]
      .replace(/<[^>]+>/g, '')                 // remove tags
      .replace(/\r/g, '')
      .trim();
  }

  // Convert VideoPsalm song object into Ginomia song format
  convertVideoPsalmSong(vpSong, songbookName = 'VideoPsalm Import', mediaMap = {}) {
    const rawTitle = (vpSong.Text || (vpSong.Verses && vpSong.Verses[0] && vpSong.Verses[0].Text) || 'Untitled Song').trim();
    const title = rawTitle.split('\n')[0].replace(/\[.*?\]/g, '').trim() || 'Untitled Song';
    const author = (vpSong.Author || 'Unknown').trim();
    const stanzas = [];

    if (Array.isArray(vpSong.Verses)) {
      let verseIdx = 1;
      let chorusIdx = 1;
      let bridgeIdx = 1;

      vpSong.Verses.forEach((v) => {
        const lyricText = this.cleanLyricsText(v.Text);
        if (!lyricText) return;

        let type = 'Verse ' + verseIdx;
        if (v.Tag === 1) {
          type = chorusIdx === 1 ? 'Chorus' : 'Chorus ' + chorusIdx;
          chorusIdx++;
        } else if (v.Tag === 2) {
          type = 'Pre-Chorus';
        } else if (v.Tag === 3) {
          type = bridgeIdx === 1 ? 'Bridge' : 'Bridge ' + bridgeIdx;
          bridgeIdx++;
        } else if (v.Tag === 4) {
          type = 'Intro';
        } else if (v.Tag === 5) {
          type = 'Outro';
        } else if (v.Tag === 8) {
          type = 'Ending';
        } else {
          verseIdx++;
        }

        stanzas.push({ type, text: lyricText });
      });
    }

    if (stanzas.length === 0) {
      stanzas.push({ type: 'Verse 1', text: title });
    }

    let theme = null;
    const bgStyle = vpSong.Style && vpSong.Style.Background;
    if (bgStyle) {
      const rawMedia = bgStyle.Video || bgStyle.Image;
      if (rawMedia && mediaMap[rawMedia]) {
        theme = mediaMap[rawMedia];
      } else if (rawMedia) {
        theme = rawMedia;
      }
    }

    return {
      id: 'song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: this.cleanSongTitle(title),
      author: this.cleanMarkup(author) || 'Unknown',
      songbook: songbookName || 'VideoPsalm Import',
      stanzas,
      theme: theme || null
    };
  }

  // Scan folder for software migration via server API
  async scanMigrationFolder(folderPath) {
    const res = await fetch('/api/migrate/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: folderPath.trim() })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server responded with ${res.status}`);
    }
    return await res.json();
  }

  // Execute software migration via server API
  async executeMigration(options = {}) {
    const res = await fetch('/api/migrate/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server responded with ${res.status}`);
    }
    const result = await res.json();

    // 1. Ingest imported songs into client memory & IndexedDB
    if (result.songs && result.songs.length > 0) {
      this.importSongsData(result.songs, true, true);
    }

    // 2. Refresh custom backgrounds / sanctuary media
    if (result.mediaItems && result.mediaItems.length > 0) {
      if (typeof window.loadSanctuaryUploads === 'function') {
        window.loadSanctuaryUploads();
      }
    }

    // 3. Activate/install detected Bibles into memory and storage
    if (result.bibles && result.bibles.length > 0) {
      for (const b of result.bibles) {
        try {
          if (b.data && typeof b.data === 'object' && Object.keys(b.data).length > 0) {
            this.importBibleData(b.code, b.data, b.name);
          } else {
            await this.downloadCloudBible(b.code, b.name);
          }
        } catch (e) {
          console.warn(`Could not auto-install Bible ${b.code}:`, e.message);
        }
      }
    }

    // 4. Save any extracted agendas
    if (result.agendas && result.agendas.length > 0) {
      try {
        const existingAgendas = JSON.parse(localStorage.getItem('sf_custom_agendas') || '[]');
        result.agendas.forEach(ag => {
          if (!existingAgendas.some(x => x.name === ag.name)) {
            existingAgendas.push(ag);
          }
        });
        localStorage.setItem('sf_custom_agendas', JSON.stringify(existingAgendas));
      } catch (e) {}
    }

    // 5. Finalize batch import and notify UI
    this.finishBatchImport();

    return result;
  }
}

// Cloud Bible Translation Directory
const CLOUD_REPOSITORIES = {
  bibles: [
    { code: "KJV", name: "King James Version", lang: "English", size: "4.6 MB", booksCount: 66 },
    { code: "NIV", name: "New International Version", lang: "English", size: "4.3 MB", booksCount: 66 },
    { code: "NKJV", name: "New King James Version", lang: "English", size: "4.5 MB", booksCount: 66 },
    { code: "ESV", name: "English Standard Version", lang: "English", size: "4.4 MB", booksCount: 66 },
    { code: "NLT", name: "New Living Translation", lang: "English", size: "4.4 MB", booksCount: 66 },
    { code: "AMP", name: "Amplified Bible", lang: "English", size: "5.2 MB", booksCount: 66 },
    { code: "AMPC", name: "Amplified Classic Bible", lang: "English", size: "5.2 MB", booksCount: 66 },
    { code: "CSB", name: "Christian Standard Bible", lang: "English", size: "4.4 MB", booksCount: 66 },
    { code: "BSB", name: "Berean Standard Bible", lang: "English", size: "4.3 MB", booksCount: 66 },
    { code: "NASB", name: "New American Standard Bible (1995)", lang: "English", size: "4.5 MB", booksCount: 66 },
    { code: "NASU", name: "New American Standard Update", lang: "English", size: "4.3 MB", booksCount: 66 },
    { code: "TPT", name: "The Passion Translation", lang: "English", size: "3.2 MB", booksCount: 66 },
    { code: "NET", name: "New English Translation", lang: "English", size: "4.5 MB", booksCount: 66 },
    { code: "NIRV", name: "New International Reader's Version", lang: "English", size: "4.9 MB", booksCount: 66 },
    { code: "NRSV", name: "New Revised Standard Version", lang: "English", size: "4.4 MB", booksCount: 66 },
    { code: "RSV", name: "Revised Standard Version", lang: "English", size: "4.4 MB", booksCount: 66 },
    { code: "ASV", name: "American Standard Version", lang: "English", size: "4.6 MB", booksCount: 66 },
    { code: "DARBY", name: "Darby Bible", lang: "English", size: "4.6 MB", booksCount: 66 },
    { code: "EASY", name: "EasyEnglish Bible", lang: "English", size: "5.3 MB", booksCount: 66 },
    { code: "ERV", name: "Easy-to-Read Version", lang: "English", size: "4.8 MB", booksCount: 66 },
    { code: "GNT", name: "Good News Translation", lang: "English", size: "4.3 MB", booksCount: 66 },
    { code: "GW", name: "God's Word Translation", lang: "English", size: "4.4 MB", booksCount: 66 },
    { code: "HCSB", name: "Holman Christian Standard Bible", lang: "English", size: "4.3 MB", booksCount: 66 },
    { code: "LSB", name: "Legacy Standard Bible", lang: "English", size: "4.6 MB", booksCount: 66 },
    { code: "MEV", name: "Modern English Version", lang: "English", size: "4.5 MB", booksCount: 66 },
    { code: "TLB", name: "The Living Bible", lang: "English", size: "4.3 MB", booksCount: 66 },
    { code: "TYNDALE", name: "Tyndale 1537", lang: "English", size: "4.7 MB", booksCount: 66 },
    { code: "YLT", name: "Young's Literal Translation", lang: "English", size: "4.6 MB", booksCount: 66 },
    { code: "RVR1960", name: "Reina-Valera 1960", lang: "Spanish", size: "1.8 MB", booksCount: 66 },
    { code: "YOR", name: "Bibeli Mimo", lang: "Yoruba", size: "1.6 MB", booksCount: 66 },
    { code: "IGBO", name: "Baibul Nso", lang: "Igbo", size: "1.6 MB", booksCount: 66 },
    { code: "HAUSA", name: "Littafi Mai Tsarki", lang: "Hausa", size: "1.6 MB", booksCount: 66 }
  ]
};

window.libraryImporter = new LibraryImportEngine();
