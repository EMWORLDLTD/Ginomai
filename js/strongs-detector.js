// Ginomai - High-Speed Greek & Hebrew Concordance Lexicon Detector
'use strict';

(function() {
  // Common Greek and Hebrew biblical terms cited in sermons
  const CONCORDANCE_DICTIONARY = [
    // GREEK (New Testament)
    { id: 'G26', lemma: 'ἀγάπη', translit: 'agape', lang: 'Greek', def: 'Unconditional, benevolent, sacrificial divine love', keywords: ['agape', 'agapē', 'agapay'] },
    { id: 'G25', lemma: 'ἀγαπάω', translit: 'agapao', lang: 'Greek', def: 'To love dearly, actively seek the highest good', keywords: ['agapao', 'agapao'] },
    { id: 'G5368', lemma: 'φιλέω', translit: 'phileo', lang: 'Greek', def: 'Brotherly affection, tender friendship, fondness', keywords: ['phileo', 'phileō'] },
    { id: 'G1411', lemma: 'δύναμις', translit: 'dunamis', lang: 'Greek', def: 'Miraculous inherent power, mighty ability, virtue', keywords: ['dunamis', 'dynamis', 'dunamys'] },
    { id: 'G3056', lemma: 'λόγος', translit: 'logos', lang: 'Greek', def: 'The divine Word, divine expression, total revelation', keywords: ['logos'] },
    { id: 'G4487', lemma: 'ῥῆμα', translit: 'rhema', lang: 'Greek', def: 'An active, specific spoken utterance from God', keywords: ['rhema', 'rhēma'] },
    { id: 'G5485', lemma: 'χάρις', translit: 'charis', lang: 'Greek', def: 'Unmerited divine favor, grace, spiritual endowment', keywords: ['charis', 'haris'] },
    { id: 'G4151', lemma: 'πνεῦμα', translit: 'pneuma', lang: 'Greek', def: 'Spirit, breath, wind; Holy Spirit of God', keywords: ['pneuma'] },
    { id: 'G2842', lemma: 'κοινωνία', translit: 'koinonia', lang: 'Greek', def: 'Fellowship, intimate communion, joint participation', keywords: ['koinonia', 'koynonia'] },
    { id: 'G3875', lemma: 'παράκλητος', translit: 'parakletos', lang: 'Greek', def: 'Advocate, comforter, one called alongside to help', keywords: ['parakletos', 'paraclete', 'paracletos'] },
    { id: 'G3341', lemma: 'μετάνοια', translit: 'metanoia', lang: 'Greek', def: 'Repentance, radical transformative change of mind', keywords: ['metanoia'] },
    { id: 'G4982', lemma: 'σῴζω', translit: 'sozo', lang: 'Greek', def: 'To save, heal, make whole, deliver, protect', keywords: ['sozo', 'sōzō'] },
    { id: 'G4991', lemma: 'σωτηρία', translit: 'soteria', lang: 'Greek', def: 'Salvation, complete deliverance, divine preservation', keywords: ['soteria', 'sōtēria'] },
    { id: 'G266', lemma: 'ἁμαρτία', translit: 'hamartia', lang: 'Greek', def: 'Sin, missing the mark, deviation from divine standard', keywords: ['hamartia'] },
    { id: 'G1343', lemma: 'δικαιοσύνη', translit: 'dikaiosyne', lang: 'Greek', def: 'Righteousness, divine justice, upright standing', keywords: ['dikaiosyne', 'dikaiosune'] },
    { id: 'G1577', lemma: 'ἐκκλησία', translit: 'ekklesia', lang: 'Greek', def: 'The church, called-out assembly, congregation', keywords: ['ekklesia', 'ecclesia'] },
    { id: 'G2098', lemma: 'εὐαγγέλιον', translit: 'euangelion', lang: 'Greek', def: 'The gospel, good tidings, proclamation of victory', keywords: ['euangelion', 'evangelion'] },
    { id: 'G4102', lemma: 'πίστις', translit: 'pistis', lang: 'Greek', def: 'Faith, unshakable conviction, trust, fidelity', keywords: ['pistis'] },
    { id: 'G1680', lemma: 'ἐλπίς', translit: 'elpis', lang: 'Greek', def: 'Joyful, confident expectation of good; hope', keywords: ['elpis'] },
    { id: 'G1849', lemma: 'ἐξουσία', translit: 'exousia', lang: 'Greek', def: 'Delegated authority, rightful power, rule', keywords: ['exousia'] },
    { id: 'G2222', lemma: 'ζωή', translit: 'zoe', lang: 'Greek', def: 'The uncreated, eternal life of God', keywords: ['zoe', 'zōē'] },
    { id: 'G932', lemma: 'βασιλεία', translit: 'basileia', lang: 'Greek', def: 'Kingdom, sovereign rule, realm of God', keywords: ['basileia'] },
    { id: 'G3101', lemma: 'μαθητής', translit: 'mathetes', lang: 'Greek', def: 'Disciple, pupil, devoted follower and learner', keywords: ['mathetes', 'mathētēs'] },
    { id: 'G1754', lemma: 'ἐνεργέω', translit: 'energeo', lang: 'Greek', def: 'To operate effectively, work actively with divine power', keywords: ['energeo', 'energēō'] },
    { id: 'G5287', lemma: 'ὑπόστασις', translit: 'hypostasis', lang: 'Greek', def: 'Substance, foundational title-deed, absolute assurance', keywords: ['hypostasis'] },
    { id: 'G5046', lemma: 'τέλειος', translit: 'teleios', lang: 'Greek', def: 'Complete, mature, fully developed, perfected', keywords: ['teleios'] },
    { id: 'G5281', lemma: 'ὑπομονή', translit: 'hypomone', lang: 'Greek', def: 'Steadfast endurance, patient perseverance under trial', keywords: ['hypomone', 'hypomonē'] },
    { id: 'G3466', lemma: 'μυστήριον', translit: 'mysterion', lang: 'Greek', def: 'Mystery, sacred divine secret revealed by the Spirit', keywords: ['mysterion'] },
    { id: 'G602', lemma: 'ἀποκάλυψις', translit: 'apokalupsis', lang: 'Greek', def: 'Revelation, unveiling, disclosure of divine truth', keywords: ['apokalupsis', 'apocalypse'] },
    { id: 'G2962', lemma: 'κύριος', translit: 'kyrios', lang: 'Greek', def: 'Lord, Master, Supreme Owner, Sovereign Ruler', keywords: ['kyrios'] },
    { id: 'G5547', lemma: 'Χριστός', translit: 'christos', lang: 'Greek', def: 'Christ, the Anointed One, Messiah', keywords: ['christos'] },

    // HEBREW (Old Testament)
    { id: 'H7965', lemma: 'שָׁלוֹם', translit: 'shalom', lang: 'Hebrew', def: 'Peace, wholeness, health, total welfare, nothing missing', keywords: ['shalom'] },
    { id: 'H2617', lemma: 'חֶסֶד', translit: 'chesed', lang: 'Hebrew', def: 'Covenant loyal-love, steadfast mercy, unfailing kindness', keywords: ['chesed', 'hesed'] },
    { id: 'H7307', lemma: 'רוּחַ', translit: 'ruach', lang: 'Hebrew', def: 'Spirit, breath of life, mighty wind of God', keywords: ['ruach', 'ruah'] },
    { id: 'H430', lemma: 'אֱלֹהִים', translit: 'elohim', lang: 'Hebrew', def: 'God, Supreme Creator, Plural of Majesty', keywords: ['elohim'] },
    { id: 'H3068', lemma: 'יְהֹוָה', translit: 'yahweh', lang: 'Hebrew', def: 'The LORD, the Self-Existent, Eternal Covenant God', keywords: ['yahweh', 'jehovah', 'yehovah'] },
    { id: 'H136', lemma: 'אֲדֹנָי', translit: 'adonai', lang: 'Hebrew', def: 'Sovereign Lord, Master, Supreme Ruler', keywords: ['adonai'] },
    { id: 'H8085', lemma: 'שָׁמַע', translit: 'shema', lang: 'Hebrew', def: 'To hear attentively, heed, obey with action', keywords: ['shema'] },
    { id: 'H6918', lemma: 'קָדוֹשׁ', translit: 'kadosh', lang: 'Hebrew', def: 'Holy, set apart, consecrated, utterly pure', keywords: ['kadosh', 'qadosh'] },
    { id: 'H1285', lemma: 'בְּרִית', translit: 'berith', lang: 'Hebrew', def: 'Covenant, sacred sovereign treaty, binding pledge', keywords: ['berith', 'brit'] },
    { id: 'H8451', lemma: 'תּוֹרָה', translit: 'torah', lang: 'Hebrew', def: 'Divine instruction, law, guiding teaching of God', keywords: ['torah'] },
    { id: 'H1293', lemma: 'בְּרָכָה', translit: 'berakah', lang: 'Hebrew', def: 'Blessing, divine empowerment for prosperity and life', keywords: ['berakah', 'baruch', 'berakha'] },
    { id: 'H530', lemma: 'אֱמוּנָה', translit: 'emunah', lang: 'Hebrew', def: 'Steadfast faithfulness, truth, firm reliability', keywords: ['emunah'] },
    { id: 'H1984', lemma: 'הָלַל', translit: 'halal', lang: 'Hebrew', def: 'To boast, radiate light, celebrate, shine, praise', keywords: ['halal', 'hallelujah'] },
    { id: 'H3034', lemma: 'יָדָה', translit: 'yadah', lang: 'Hebrew', def: 'Praise with hands extended, public thanksgiving', keywords: ['yadah'] },
    { id: 'H2167', lemma: 'זָמַר', translit: 'zamar', lang: 'Hebrew', def: 'Praise with musical instruments, strike strings', keywords: ['zamar'] },
    { id: 'H8426', lemma: 'תּוֹדָה', translit: 'todah', lang: 'Hebrew', def: 'Sacrifice of thanksgiving, confession of praise', keywords: ['todah'] },
    { id: 'H3519', lemma: 'כָּבוֹד', translit: 'kavod', lang: 'Hebrew', def: 'Glory, weighty presence, majesty, manifest honor', keywords: ['kavod', 'kabod'] },
    { id: 'H7931', lemma: 'שָׁכַן', translit: 'shekinah', lang: 'Hebrew', def: 'Divine dwelling, abiding presence of God among men', keywords: ['shekinah', 'shakan'] },
    { id: 'H3722', lemma: 'כָּפַר', translit: 'kaphar', lang: 'Hebrew', def: 'To atone, cover, reconcile, purge, cleanse', keywords: ['kaphar', 'kippur'] },
    { id: 'H1350', lemma: 'גָּאַל', translit: 'goel', lang: 'Hebrew', def: 'Kinsman-redeemer, to ransom, avenge, redeem', keywords: ['goel', 'gaal'] },
    { id: 'H3444', lemma: 'יְשׁוּעָה', translit: 'yeshuah', lang: 'Hebrew', def: 'Salvation, deliverance, divine victory, Jesus', keywords: ['yeshuah', 'yeshua'] },
    { id: 'H7495', lemma: 'רָפָא', translit: 'rapha', lang: 'Hebrew', def: 'To heal, make whole, physician, cure', keywords: ['rapha', 'rophe'] },
    { id: 'H7462', lemma: 'רָעָה', translit: 'raah', lang: 'Hebrew', def: 'Shepherd, pasture, protect, companion', keywords: ['rohi', 'raah'] },
    { id: 'H6666', lemma: 'צְדָקָה', translit: 'tsedakah', lang: 'Hebrew', def: 'Righteousness, justice, upright conduct', keywords: ['tsedakah', 'tzedek'] },
    { id: 'H4941', lemma: 'מִשְׁפָּט', translit: 'mishpat', lang: 'Hebrew', def: 'Justice, right judgment, divine ordinance', keywords: ['mishpat'] },
    { id: 'H5769', lemma: 'עוֹלָם', translit: 'olam', lang: 'Hebrew', def: 'Eternity, everlasting, world without end', keywords: ['olam'] },
    { id: 'H2451', lemma: 'חָכְמָה', translit: 'chokmah', lang: 'Hebrew', def: 'Wisdom, practical skill for living according to God', keywords: ['chokmah', 'hokhmah'] }
  ];

  // Direct keyword map
  const KEYWORD_MAP = new Map();
  CONCORDANCE_DICTIONARY.forEach(entry => {
    entry.keywords.forEach(kw => {
      KEYWORD_MAP.set(kw.toLowerCase(), entry);
    });
    KEYWORD_MAP.set(entry.translit.toLowerCase(), entry);
  });

  // Direct Strong's pattern: G26, H7965, Strong's G1411
  const STRONGS_ID_REGEX = /\b(?:strong(?:'s)?\s+)?([HG]\d{1,5})\b/i;

  // Context cues pattern: "the greek word", "in greek", "the hebrew word", "in hebrew"
  const CONTEXT_CUE_REGEX = /\b(?:greek|hebrew|in\s+the\s+greek|in\s+the\s+hebrew|original\s+greek|original\s+hebrew)\b/i;

  window.detectConcordanceTerms = function(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const text = rawText.trim();
    if (!text) return [];

    const detected = [];
    const detectedIds = new Set();

    // 1. Direct Strong's number detection (e.g. "Strong's G26" or "H7965")
    const idRegex = /\b(?:strong(?:'s)?\s+)?([HG]\d{1,5})\b/gi;
    let idMatch;
    while ((idMatch = idRegex.exec(text)) !== null) {
      const cleaned = idMatch[1].toUpperCase();
      if (cleaned && !detectedIds.has(cleaned)) {
        const matchEntry = CONCORDANCE_DICTIONARY.find(e => e.id === cleaned);
        if (matchEntry) {
          detected.push(matchEntry);
          detectedIds.add(matchEntry.id);
        }
      }
    }

    // 2. Term recognition in text
    const words = text.toLowerCase().split(/[^a-z0-9]+/);
    const hasContext = CONTEXT_CUE_REGEX.test(text);

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w || w.length < 3) continue;

      const entry = KEYWORD_MAP.get(w);
      if (entry && !detectedIds.has(entry.id)) {
        // Require a nearby language-study cue; worship vocabulary alone is insufficient.
        if (hasContext && words.slice(Math.max(0,i-6),i+7).includes(entry.lang.toLowerCase())) {
          detected.push(entry);
          detectedIds.add(entry.id);
        }
      }
    }

    return detected;
  };

  // Helper to open Strong's Lexicon Inspector without auto-projecting (< 1ms execution time)
  window.projectLexiconById = async function(id) {
    if (!id) return;
    const cleanId = id.toUpperCase();
    if (typeof window.openLexiconInspector === 'function') {
      window.openLexiconInspector(cleanId);
    }
  };

  // Helper to project a Scripture Reference directly (< 1ms)
  window.quickProjectScriptureRef = function(refStr) {
    if (!refStr) return;
    if (typeof window.speechEngine !== 'undefined' && window.speechEngine && typeof window.speechEngine.parseBibleReference === 'function') {
      const parsed = window.speechEngine.parseBibleReference(refStr);
      if (parsed && typeof window.getBibleVerses === 'function') {
        const version = (window.state && window.state.bibleVersion) || 'KJV';
        const chVerses = window.getBibleVerses(parsed.book, parsed.chapter, version);
        let verseText = '';
        if (chVerses && chVerses.length > 0) {
          if (parsed.endVerse && parsed.endVerse > parsed.verse) {
            const range = chVerses.filter(v => v.verse >= parsed.verse && v.verse <= parsed.endVerse);
            if (range.length > 0) verseText = range.map(v => `${v.verse}. ${v.text}`).join(' ');
          } else {
            const vObj = chVerses.find(v => v.verse === parsed.verse);
            if (vObj) verseText = vObj.text;
          }
        }
        if (verseText && typeof window.projectSlide === 'function') {
          const slideId = `bento_verse_${parsed.book}_${parsed.chapter}_${parsed.verse}`;
          window.projectSlide(slideId, verseText, `${parsed.book} ${parsed.chapter}:${parsed.verse} (${version})`);
          if (typeof window.showToast === 'function') {
            window.showToast(`Projected ${parsed.book} ${parsed.chapter}:${parsed.verse}`, 'success');
          }
          return;
        }
      }
    }
    if (typeof window.projectSlide === 'function') {
      window.projectSlide(`ref_${Date.now()}`, refStr, refStr);
    }
  };

  window.CONCORDANCE_DICTIONARY = CONCORDANCE_DICTIONARY;

  // ─────────────────────────────────────────────────────────────────────────────
  // HIGH-SPEED CONCORDANCE SEARCH ENGINE (GREEK & HEBREW + ENGLISH LOOKUP)
  // ─────────────────────────────────────────────────────────────────────────────

  // Asynchronously ensure unified lexicon and KJV_STRONGS are cached in memory (< 0ms blocking)
  window.ensureStrongsDataLoaded = async function() {
    const promises = [];
    if (!window.STRONGS_LEXICON_CACHE) {
      promises.push(
        fetch('/lexicon/strongs_unified.json')
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) window.STRONGS_LEXICON_CACHE = data; })
          .catch(e => { console.warn('Could not load unified lexicon:', e); })
      );
    }
    if (typeof BIBLE_DATABASE !== 'undefined' && (!BIBLE_DATABASE['KJV_STRONGS'] || Object.keys(BIBLE_DATABASE['KJV_STRONGS']).length === 0)) {
      promises.push(
        fetch('/bibles/KJV_STRONGS.json')
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) BIBLE_DATABASE['KJV_STRONGS'] = data; })
          .catch(e => { console.warn('Could not load KJV_STRONGS:', e); })
      );
    }
    await Promise.all(promises);
    return true;
  };

  // Multi-directional search: English word -> Greek/Hebrew, or Greek/Hebrew -> English
  window.searchStrongsConcordance = function(query, options = {}) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim();
    if (!q) return [];

    const lang = (options.lang || 'all').toLowerCase();
    const limit = options.limit || 30;
    const qLower = q.toLowerCase();
    const qUpper = q.toUpperCase();

    // Check for direct Strong ID (e.g. "G1577", "H7965", "1577", "g26")
    const idRegexMatch = qUpper.match(/^([HG]?)(\d{1,5})$/);
    let targetPrefix = '';
    let targetNum = 0;
    if (idRegexMatch) {
      targetPrefix = idRegexMatch[1]; // 'G', 'H', or ''
      targetNum = parseInt(idRegexMatch[2], 10);
    }

    const cache = window.STRONGS_LEXICON_CACHE;
    const candidates = [];

    // Safe regex for exact word boundary
    const escapedQ = qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRegex = new RegExp(`(^|[^a-zA-Z0-9])${escapedQ}([^a-zA-Z0-9]|$)`, 'i');

    if (cache && typeof cache === 'object') {
      for (const key in cache) {
        const entry = cache[key];
        if (!entry) continue;

        const isGreek = entry.lang === 'Greek' || entry.id.startsWith('G');
        const isHebrew = entry.lang === 'Hebrew' || entry.id.startsWith('H');

        if (lang === 'greek' && !isGreek) continue;
        if (lang === 'hebrew' && !isHebrew) continue;

        let score = 0;
        const entryId = (entry.id || key).toUpperCase();
        const lemma = entry.lemma || '';
        const translit = (entry.transliteration || '').toLowerCase();
        const shortDef = (entry.short_definition || '').toLowerCase();
        const kjvDef = (entry.kjv_definition || '').toLowerCase();

        // 1. Direct Strong ID Match
        if (targetNum > 0) {
          const entryNum = parseInt(entryId.replace(/^[HG]/, ''), 10);
          if (entryNum === targetNum) {
            if (!targetPrefix || entryId.startsWith(targetPrefix)) {
              score += 1500;
            }
          }
        }

        // Check if query matches primary keyword in KEYWORD_MAP
        const kwMatch = KEYWORD_MAP.get(qLower);
        if (kwMatch && (entryId === kwMatch.id || entryId === kwMatch.id.replace(/^([GH])0+/, '$1'))) {
          score += 1150;
        }

        // 2. Exact Lemma or Transliteration Match
        const cleanTranslit = translit.normalize ? translit.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : translit;
        const alphaTranslit = cleanTranslit.replace(/[^a-z0-9]/g, '');
        const alphaQ = qLower.replace(/[^a-z0-9]/g, '');

        if (lemma === q) {
          score += 1200;
        } else if (translit === qLower || cleanTranslit === qLower) {
          score += 1000;
        } else if (alphaTranslit === alphaQ || (alphaQ.length >= 4 && alphaTranslit.replace(/w/g, '') === alphaQ.replace(/w/g, ''))) {
          score += 950;
        } else if (alphaTranslit.startsWith(alphaQ) && alphaQ.length >= 4) {
          score += 400;
        }

        // 3. Exact Word Boundary in Definitions
        if (shortDef === qLower) {
          score += 850;
        } else if (wordBoundaryRegex.test(shortDef)) {
          score += 650;
        } else if (wordBoundaryRegex.test(kjvDef)) {
          score += 550;
        }

        // 4. Substring Match
        if (shortDef.includes(qLower)) {
          score += 250;
        } else if (kjvDef.includes(qLower)) {
          score += 150;
        } else if (translit.includes(qLower)) {
          score += 100;
        } else if (lemma.includes(q)) {
          score += 100;
        }

        if (score > 0) {
          candidates.push({ entry, score });
        }
      }
    } else {
      // Fallback to built-in CONCORDANCE_DICTIONARY if full cache not loaded yet
      CONCORDANCE_DICTIONARY.forEach(dictItem => {
        const isGreek = dictItem.lang === 'Greek';
        const isHebrew = dictItem.lang === 'Hebrew';

        if (lang === 'greek' && !isGreek) return;
        if (lang === 'hebrew' && !isHebrew) return;

        let score = 0;
        const id = dictItem.id.toUpperCase();
        const translit = dictItem.translit.toLowerCase();
        const def = (dictItem.def || '').toLowerCase();

        if (id === qUpper || (targetNum > 0 && parseInt(id.replace(/^[HG]/, ''), 10) === targetNum)) score += 1000;
        if (translit === qLower) score += 900;
        if (wordBoundaryRegex.test(def)) score += 500;
        else if (def.includes(qLower)) score += 200;

        if (score > 0) {
          candidates.push({
            entry: {
              id: dictItem.id,
              lang: dictItem.lang,
              lemma: dictItem.lemma,
              transliteration: dictItem.translit,
              short_definition: dictItem.def,
              kjv_definition: dictItem.def
            },
            score
          });
        }
      });
      // Trigger background cache load
      window.ensureStrongsDataLoaded().catch(() => {});
    }

    // Sort descending by relevance score
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, limit).map(c => c.entry);
  };

  // Find all scripture verses containing a given Strong's ID in KJV_STRONGS
  window.getStrongsBibleOccurrences = function(strongId, maxResults = 60) {
    if (!strongId) return { occurrences: [], totalCount: 0 };
    const cleanId = String(strongId).toUpperCase().trim();
    const normId = cleanId.replace(/^([GH])0+(\d+)/, '$1$2');

    const db = (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE['KJV_STRONGS'])
      ? BIBLE_DATABASE['KJV_STRONGS'] : null;

    if (!db) {
      window.ensureStrongsDataLoaded().catch(() => {});
      return { occurrences: [], totalCount: 0, loading: true };
    }

    const tagPattern1 = `<${cleanId}>`;
    const tagPattern2 = `<${normId}>`;

    const occurrences = [];
    let totalCount = 0;

    for (const book in db) {
      const chapters = db[book];
      if (!chapters) continue;
      for (const chap in chapters) {
        const verses = chapters[chap];
        if (!Array.isArray(verses)) continue;
        for (let i = 0; i < verses.length; i++) {
          const v = verses[i];
          if (!v || !v.text) continue;
          if (v.text.includes(tagPattern1) || v.text.includes(tagPattern2)) {
            totalCount++;
            if (occurrences.length < maxResults) {
              const cleanText = (typeof window.stripStrongsTags === 'function')
                ? window.stripStrongsTags(v.text)
                : v.text.replace(/<sup\b[^>]*>.*?<\/sup>/gi, '').replace(/<[HG]\d+>/gi, '').replace(/[ \t]+/g, ' ').trim();

              // Extract which English word(s) this Strong tag was attached to in this verse
              const wordMatchRegex = new RegExp(`([^<\\s]+)?(?:${tagPattern1}|${tagPattern2})`, 'gi');
              const matchedWords = [];
              let wm;
              while ((wm = wordMatchRegex.exec(v.text)) !== null) {
                if (wm[1]) matchedWords.push(wm[1].replace(/[^a-zA-Z0-9'-]/g, ''));
              }

              occurrences.push({
                book: book,
                chapter: parseInt(chap, 10),
                verse: v.verse,
                ref: `${book} ${chap}:${v.verse}`,
                text: cleanText,
                taggedText: v.text,
                matchedWords: matchedWords
              });
            }
          }
        }
      }
    }

    return { occurrences, totalCount, loading: false };
  };

  // Search KJV_STRONGS for an English word to find occurrences and attached Strong's IDs
  window.searchStrongsBibleWords = function(englishWord, maxResults = 30) {
    if (!englishWord || typeof englishWord !== 'string') return [];
    const w = englishWord.trim().toLowerCase();
    if (w.length < 2) return [];

    const db = (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE['KJV_STRONGS'])
      ? BIBLE_DATABASE['KJV_STRONGS'] : null;

    if (!db) {
      window.ensureStrongsDataLoaded().catch(() => {});
      return [];
    }

    const wordRegex = new RegExp(`\\b([a-zA-Z'-]+)<([HG]\\d+)>`, 'gi');
    const results = [];
    const strongIdTally = new Map();

    for (const book in db) {
      const chapters = db[book];
      if (!chapters) continue;
      for (const chap in chapters) {
        const verses = chapters[chap];
        if (!Array.isArray(verses)) continue;
        for (let i = 0; i < verses.length; i++) {
          const v = verses[i];
          if (!v || !v.text) continue;
          if (v.text.toLowerCase().includes(w)) {
            let m;
            wordRegex.lastIndex = 0;
            while ((m = wordRegex.exec(v.text)) !== null) {
              const pairedWord = m[1].toLowerCase();
              const strongId = m[2].toUpperCase();
              if (pairedWord === w || pairedWord.includes(w) || w.includes(pairedWord)) {
                strongIdTally.set(strongId, (strongIdTally.get(strongId) || 0) + 1);
              }
            }

            const cleanText = (typeof window.stripStrongsTags === 'function')
              ? window.stripStrongsTags(v.text)
              : v.text.replace(/<sup\b[^>]*>.*?<\/sup>/gi, '').replace(/<[HG]\d+>/gi, '').replace(/[ \t]+/g, ' ').trim();

            results.push({
              book: book,
              chapter: parseInt(chap, 10),
              verse: v.verse,
              ref: `${book} ${chap}:${v.verse}`,
              text: cleanText,
              taggedText: v.text
            });
            if (results.length >= maxResults) break;
          }
        }
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }

    return {
      verses: results,
      associatedStrongIds: Array.from(strongIdTally.entries()).sort((a, b) => b[1] - a[1]).map(e => ({ id: e[0], count: e[1] }))
    };
  };

  // Auto-init background preload when idle
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => { window.ensureStrongsDataLoaded().catch(() => {}); });
  } else {
    setTimeout(() => { window.ensureStrongsDataLoaded().catch(() => {}); }, 1500);
  }
})();

