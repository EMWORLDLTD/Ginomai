// Ginomia - High-Speed Greek & Hebrew Concordance Lexicon Detector
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
})();
