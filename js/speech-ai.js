// Ginomia - Web Speech AI & Intelligent Bible / Song Detection Engine
'use strict';

class SpeechAiEngine {
  constructor(options = {}) {
    // Support either options object or legacy positional arguments
    if (typeof options === 'function') {
      this.onVerseDetected = arguments[0] || null;
      this.onTranscript = arguments[1] || null;
      this.onParaphraseDetected = arguments[2] || null;
      this.onSongDetected = arguments[3] || null;
    } else {
      this.onVerseDetected = options.onVerseDetected || null;
      this.onSongDetected = options.onSongDetected || null;
      this.onTranscript = options.onTranscript || null;
      this.onParaphraseDetected = options.onParaphraseDetected || null;
    }

    this.onDiagnostic = typeof options === 'object' ? options.onDiagnostic || null : null;
    this.onReferencePending = typeof options === 'object' ? options.onReferencePending || null : null;
    this.onStatusChange = typeof options === 'object' ? options.onStatusChange || null : null;
    this.onAudioHealth = typeof options === 'object' ? options.onAudioHealth || null : null;
    this.audioHealth = null;
    this.getScriptureVerses = typeof options === 'object' ? options.getScriptureVerses || null : null;
    this.getQuotationSource = typeof options === 'object' ? options.getQuotationSource || null : null;
    this.semanticSearch = typeof options === 'object' ? options.semanticSearch || null : null;
    this.semanticQueryId = 0;
    this.quotationMatcher = typeof options === 'object' ? options.quotationMatcher || null : null;
    this.quotationGeneration = 0;
    this.quotationQueryId = 0;
    this.resetScriptureContext();
    this.connectionState = 'idle';
    this.statusMessage = '';
    this.sessionGeneration = 0;
    this.session = null;
    this.reconnectAttempts = 0;
    this.recognition = null;
    this.isListening = false;
    this.restartTimer = null;
    this.lastProcessedText = '';
    this.lastVerseDetectedTime = 0;
    this.lastSongDetectedTime = 0;

    // AI Speech Provider Configuration
    this.provider = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_ai_provider')) || 'deepgram';
    this.deepgramApiKey = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_api_key')) || '';
    this.deepgramModel = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_model')) || 'nova-2';
    this.churchCustomTerms = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_church_custom_terms')) || '';
    this.selectedDeviceId = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_selected_mic_device')) || 'default';
    this.deepgramSocket = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.processedAudioStream = null;
    this.audioProcessingContext = null;

    // Number word dictionary for speech-to-integer conversion
    this.wordToNumMap = {
      'zero': 0, 'one': 1, 'first': 1, '1st': 1,
      'two': 2, 'second': 2, '2nd': 2,
      'three': 3, 'third': 3, '3rd': 3,
      'four': 4, 'fourth': 4, '4th': 4,
      'five': 5, 'fifth': 5, '5th': 5,
      'six': 6, 'sixth': 6, '6th': 6,
      'seven': 7, 'seventh': 7, '7th': 7,
      'eight': 8, 'eighth': 8, '8th': 8,
      'nine': 9, 'ninth': 9, '9th': 9,
      'ten': 10, 'tenth': 10, '10th': 10,
      'eleven': 11, 'eleventh': 11, '11th': 11,
      'twelve': 12, 'twelfth': 12, '12th': 12,
      'thirteen': 13, 'thirteenth': 13,
      'fourteen': 14, 'fourteenth': 14,
      'fifteen': 15, 'fifteenth': 15,
      'sixteen': 16, 'sixteenth': 16,
      'seventeen': 17, 'seventeenth': 17,
      'eighteen': 18, 'eighteenth': 18,
      'nineteen': 19, 'nineteenth': 19,
      'twenty': 20, 'twentieth': 20,
      'thirty': 30, 'thirtieth': 30,
      'forty': 40, 'fourty': 40, 'fortieth': 40,
      'fifty': 50, 'fiftieth': 50,
      'sixty': 60, 'sixtieth': 60,
      'seventy': 70, 'seventieth': 70,
      'eighty': 80, 'eightieth': 80,
      'ninety': 90, 'ninetieth': 90,
      'hundred': 100, 'hundredth': 100
    };

    // Standardized Bible Books Map with all aliases, abbreviations, max chapters, and spoken forms
    this.bibleBooks = [
      { name: 'Genesis', maxChapters: 50, aliases: ['genesis', 'gen', 'ge', 'gn'] },
      { name: 'Exodus', maxChapters: 40, aliases: ['exodus', 'exod', 'exo', 'ex'] },
      { name: 'Leviticus', maxChapters: 27, aliases: ['leviticus', 'lev', 'le', 'lv'] },
      { name: 'Numbers', maxChapters: 36, aliases: ['numbers', 'num', 'nu', 'nm', 'nb'] },
      { name: 'Deuteronomy', maxChapters: 34, aliases: ['deuteronomy', 'deut', 'deu', 'de', 'dt'] },
      { name: 'Joshua', maxChapters: 24, aliases: ['joshua', 'josh', 'jos', 'jsh'] },
      { name: 'Judges', maxChapters: 21, aliases: ['judges', 'judg', 'jdg', 'jgs'] },
      { name: 'Ruth', maxChapters: 4, aliases: ['ruth', 'rth', 'ru'] },
      { name: '1 Samuel', maxChapters: 31, aliases: ['1 samuel', 'first samuel', '1st samuel', '1 sam', '1st sam', '1sa', 'first sam'] },
      { name: '2 Samuel', maxChapters: 24, aliases: ['2 samuel', 'second samuel', '2nd samuel', '2 sam', '2nd sam', '2sa', 'second sam'] },
      { name: '1 Kings', maxChapters: 22, aliases: ['1 kings', 'first kings', '1st kings', '1 kgs', '1st kgs', '1ki', 'first kgs'] },
      { name: '2 Kings', maxChapters: 25, aliases: ['2 kings', 'second kings', '2nd kings', '2 kgs', '2nd kgs', '2ki', 'second kgs'] },
      { name: '1 Chronicles', maxChapters: 29, aliases: ['1 chronicles', 'first chronicles', '1st chronicles', '1 chron', '1st chron', '1ch', '1 chr'] },
      { name: '2 Chronicles', maxChapters: 36, aliases: ['2 chronicles', 'second chronicles', '2nd chronicles', '2 chron', '2nd chron', '2ch', '2 chr'] },
      { name: 'Ezra', maxChapters: 10, aliases: ['ezra', 'ezr'] },
      { name: 'Nehemiah', maxChapters: 13, aliases: ['nehemiah', 'neh', 'ne'] },
      { name: 'Esther', maxChapters: 10, aliases: ['esther', 'esth', 'est'] },
      { name: 'Job', maxChapters: 42, aliases: ['job', 'jb'] },
      { name: 'Psalms', maxChapters: 150, aliases: ['psalms', 'psalm', 'psa', 'ps', 'psm', 'pss'] },
      { name: 'Proverbs', maxChapters: 31, aliases: ['proverbs', 'proverb', 'prov', 'pro', 'prv', 'pr'] },
      { name: 'Ecclesiastes', maxChapters: 12, aliases: ['ecclesiastes', 'eccles', 'ecc', 'ec', 'qoh', 'qoheleth'] },
      { name: 'Song of Solomon', maxChapters: 8, aliases: ['song of solomon', 'song of songs', 'canticle of canticles', 'canticles', 'song'] },
      { name: 'Isaiah', maxChapters: 66, aliases: ['isaiah', 'isa', 'is'] },
      { name: 'Jeremiah', maxChapters: 52, aliases: ['jeremiah', 'jer', 'je', 'jr'] },
      { name: 'Lamentations', maxChapters: 5, aliases: ['lamentations', 'lam', 'la'] },
      { name: 'Ezekiel', maxChapters: 48, aliases: ['ezekiel', 'ezek', 'eze', 'ezk'] },
      { name: 'Daniel', maxChapters: 12, aliases: ['daniel', 'dan', 'da', 'dn'] },
      { name: 'Hosea', maxChapters: 14, aliases: ['hosea', 'hos', 'ho'] },
      { name: 'Joel', maxChapters: 3, aliases: ['joel', 'joe', 'jl'] },
      { name: 'Amos', maxChapters: 9, aliases: ['amos', 'am'] },
      { name: 'Obadiah', maxChapters: 1, aliases: ['obadiah', 'obad', 'ob'] },
      { name: 'Jonah', maxChapters: 4, aliases: ['jonah', 'jnh', 'jon'] },
      { name: 'Micah', maxChapters: 7, aliases: ['micah', 'mic', 'mc'] },
      { name: 'Nahum', maxChapters: 3, aliases: ['nahum', 'nah', 'na'] },
      { name: 'Habakkuk', maxChapters: 3, aliases: ['habakkuk', 'hab', 'hb'] },
      { name: 'Zephaniah', maxChapters: 3, aliases: ['zephaniah', 'zeph', 'zep', 'zp'] },
      { name: 'Haggai', maxChapters: 2, aliases: ['haggai', 'hag', 'hg'] },
      { name: 'Zechariah', maxChapters: 14, aliases: ['zechariah', 'zech', 'zec', 'zc'] },
      { name: 'Malachi', maxChapters: 4, aliases: ['malachi', 'mal', 'ml'] },
      { name: 'Matthew', maxChapters: 28, aliases: ['matthew', 'matt', 'mat', 'mt'] },
      { name: 'Mark', maxChapters: 16, aliases: ['mark', 'mrk', 'mar', 'mk', 'mr'] },
      { name: 'Luke', maxChapters: 24, aliases: ['luke', 'luk', 'lu', 'lk'] },
      { name: 'John', maxChapters: 21, aliases: ['john', 'jhn', 'joh', 'jn'] },
      { name: 'Acts', maxChapters: 28, aliases: ['acts', 'act', 'ac', 'acts of the apostles'] },
      { name: 'Romans', maxChapters: 16, aliases: ['romans', 'roman', 'rom', 'ro', 'rm'] },
      { name: '1 Corinthians', maxChapters: 16, aliases: ['1 corinthians', 'first corinthians', '1st corinthians', '1 cor', '1st cor', '1co', 'first cor'] },
      { name: '2 Corinthians', maxChapters: 13, aliases: ['2 corinthians', 'second corinthians', '2nd corinthians', '2 cor', '2nd cor', '2co', 'second cor'] },
      { name: 'Galatians', maxChapters: 6, aliases: ['galatians', 'galatian', 'gal', 'ga'] },
      { name: 'Ephesians', maxChapters: 6, aliases: ['ephesians', 'ephesian', 'eph', 'ep'] },
      { name: 'Philippians', maxChapters: 4, aliases: ['philippians', 'philippian', 'phil', 'php', 'pp'] },
      { name: 'Colossians', maxChapters: 4, aliases: ['colossians', 'colossian', 'col', 'co'] },
      { name: '1 Thessalonians', maxChapters: 5, aliases: ['1 thessalonians', 'first thessalonians', '1st thessalonians', '1 thess', '1st thess', '1th', 'first thess'] },
      { name: '2 Thessalonians', maxChapters: 3, aliases: ['2 thessalonians', 'second thessalonians', '2nd thessalonians', '2 thess', '2nd thess', '2th', 'second thess'] },
      { name: '1 Timothy', maxChapters: 6, aliases: ['1 timothy', 'first timothy', '1st timothy', '1 tim', '1st tim', '1ti', 'first tim'] },
      { name: '2 Timothy', maxChapters: 4, aliases: ['2 timothy', 'second timothy', '2nd timothy', '2 tim', '2nd tim', '2ti', 'second tim'] },
      { name: 'Titus', maxChapters: 3, aliases: ['titus', 'tit', 'ti'] },
      { name: 'Philemon', maxChapters: 1, aliases: ['philemon', 'phlm', 'phm', 'pm'] },
      { name: 'Hebrews', maxChapters: 13, aliases: ['hebrews', 'hebrew', 'heb', 'he'] },
      { name: 'James', maxChapters: 5, aliases: ['james', 'jas', 'jm'] },
      { name: '1 Peter', maxChapters: 5, aliases: ['1 peter', 'first peter', '1st peter', '1 pet', '1st pet', '1pe', '1pt', 'first pet'] },
      { name: '2 Peter', maxChapters: 3, aliases: ['2 peter', 'second peter', '2nd peter', '2 pet', '2nd pet', '2pe', '2pt', 'second pet'] },
      { name: '1 John', maxChapters: 5, aliases: ['1 john', 'first john', '1st john', '1 jn', '1st jn', '1jhn', '1jo', 'first jn'] },
      { name: '2 John', maxChapters: 1, aliases: ['2 john', 'second john', '2nd john', '2 jn', '2nd jn', '2jhn', '2jo', 'second jn'] },
      { name: '3 John', maxChapters: 1, aliases: ['3 john', 'third john', '3rd john', '3 jn', '3rd jn', '3jhn', '3jo', 'third jn'] },
      { name: 'Jude', maxChapters: 1, aliases: ['jude', 'jud', 'jd'] },
      { name: 'Revelation', maxChapters: 22, aliases: ['revelation', 'revelations', 'rev', 're', 'the revelation'] }
    ];

    // Semantic AI Paraphrase Knowledge Base
    this.paraphraseDatabase = [
      {
        keywords: ['god so loved the world', 'gave his only begotten son', 'whosoever believeth in him', 'everlasting life'],
        reference: 'John 3:16',
        text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
      },
      {
        keywords: ['lord is my shepherd', 'i shall not want', 'still waters', 'green pastures', 'leadeth me beside'],
        reference: 'Psalms 23:1',
        text: 'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters.'
      },
      {
        keywords: ['valley of the shadow of death', 'fear no evil', 'thy rod and thy staff', 'thou art with me'],
        reference: 'Psalms 23:4',
        text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.'
      },
      {
        keywords: ['in the beginning was the word', 'word was with god', 'word was god'],
        reference: 'John 1:1',
        text: 'In the beginning was the Word, and the Word was with God, and the Word was God.'
      },
      {
        keywords: ['i am the way', 'the truth and the life', 'no man cometh unto the father'],
        reference: 'John 14:6',
        text: 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.'
      },
      {
        keywords: ['all things work together for good', 'called according to his purpose', 'them that love god'],
        reference: 'Romans 8:28',
        text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.'
      },
      {
        keywords: ['if god be for us', 'who can be against us', 'what shall we say to these things'],
        reference: 'Romans 8:31',
        text: 'What shall we then say to these things? If God be for us, who can be against us?'
      },
      {
        keywords: ['i can do all things', 'through christ which strengtheneth me', 'christ who strengthens me'],
        reference: 'Philippians 4:13',
        text: 'I can do all things through Christ which strengtheneth me.'
      },
      {
        keywords: ['trust in the lord with all thine heart', 'lean not unto thine own understanding', 'acknowledge him'],
        reference: 'Proverbs 3:5',
        text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.'
      },
      {
        keywords: ['faith is the substance', 'things hoped for', 'evidence of things not seen'],
        reference: 'Hebrews 11:1',
        text: 'Now faith is the substance of things hoped for, the evidence of things not seen.'
      },
      {
        keywords: ['be strong and of a good courage', 'be not afraid neither be thou dismayed', 'lord thy god is with thee'],
        reference: 'Joshua 1:9',
        text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.'
      },
      {
        keywords: ['they that wait upon the lord', 'renew their strength', 'mount up with wings as eagles', 'run and not be weary'],
        reference: 'Isaiah 40:31',
        text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.'
      },
      {
        keywords: ['nicodemus', 'born again', 'enter the second time', 'born of water and spirit'],
        reference: 'John 3:3',
        text: 'Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.'
      },
      {
        keywords: ['charity suffereth long', 'is kind', 'envieth not', 'love never fails'],
        reference: '1 Corinthians 13:4',
        text: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,'
      },
      {
        keywords: ['light of the world', 'city on a hill', 'cannot be hid'],
        reference: 'Matthew 5:14',
        text: 'Ye are the light of the world. A city that is set on an hill cannot be hid.'
      },
      {
        keywords: ['wipe away all tears', 'no more death', 'neither sorrow nor crying'],
        reference: 'Revelation 21:4',
        text: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain.'
      },
      {
        keywords: ['all glory to jesus', 'all glory to god', 'glory and honour and power', 'thou art worthy o lord', 'created all things'],
        reference: 'Revelation 4:11',
        text: 'Thou art worthy, O Lord, to receive glory and honour and power: for thou hast created all things, and for thy pleasure they are and were created.'
      },
      {
        keywords: ['by his stripes we are healed', 'wounded for our transgressions', 'bruised for our iniquities', 'chastisement of our peace'],
        reference: 'Isaiah 53:5',
        text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.'
      },
      {
        keywords: ['no weapon formed against you shall prosper', 'no weapon formed against thee shall prosper', 'heritage of the servants of the lord'],
        reference: 'Isaiah 54:17',
        text: 'No weapon that is formed against thee shall prosper; and every tongue that shall rise against thee in judgment thou shalt condemn.'
      },
      {
        keywords: ['seek ye first the kingdom of god', 'and his righteousness', 'all these things shall be added'],
        reference: 'Matthew 6:33',
        text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.'
      },
      {
        keywords: ['god hath not given us the spirit of fear', 'spirit of fear', 'power and of love and of a sound mind'],
        reference: '2 Timothy 1:7',
        text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.'
      },
      {
        keywords: ['the lord is my light and my salvation', 'whom shall i fear', 'strength of my life'],
        reference: 'Psalms 27:1',
        text: 'The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?'
      },
      {
        keywords: ['thoughts of peace and not of evil', 'to give you an expected end', 'i know the thoughts that i think toward you'],
        reference: 'Jeremiah 29:11',
        text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.'
      },
      {
        keywords: ['ask and it shall be given you', 'seek and ye shall find', 'knock and it shall be opened'],
        reference: 'Matthew 7:7',
        text: 'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you:'
      },
      {
        keywords: ['come unto me all ye that labour', 'heavy laden', 'i will give you rest'],
        reference: 'Matthew 11:28',
        text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.'
      },
      {
        keywords: ['great is thy faithfulness', 'mercies of the lord', 'they are new every morning'],
        reference: 'Lamentations 3:22-23',
        text: 'It is of the LORD\'s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.'
      },
      {
        keywords: ['name of the lord is a strong tower', 'righteous runneth into it and is safe', 'strong tower'],
        reference: 'Proverbs 18:10',
        text: 'The name of the LORD is a strong tower: the righteous runneth into it, and is safe.'
      }
    ];

  }

  // isListening is the user's start/stop intent. connectionState reports readiness.
  setConnectionState(status, message = '') {
    this.connectionState = status;
    this.statusMessage = message;
    if (this.onStatusChange) this.onStatusChange({
      status, message, isRequested: this.isListening, isListening: status === 'listening'
    });
  }

  isCurrentSession(session) {
    return this.isListening && this.session === session && !session.closed;
  }

  start() {
    if (this.isListening) return;
    this.isListening = true;
    this.reconnectAttempts = 0;
    this.beginSession();
  }

  beginSession(status = 'connecting') {
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.disposeSession();
    const session = { id: ++this.sessionGeneration, provider: this.provider, closed: false };
    this.session = session;
    this.lastProcessedText = '';
    this.resetScriptureContext();
    this.hasSelectedAudioEnergy = false;
    this.setConnectionState(status, status === 'reconnecting' ? 'Reconnecting speech recognition...' : 'Connecting speech recognition...');
    if (!this.isCurrentSession(session)) return;
    if (session.provider === 'deepgram') this.startDeepgram(session);
    else this.startNative(session);
  }

  stop() {
    this.isListening = false;
    this.resetScriptureContext();
    ++this.sessionGeneration;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.disposeSession();
    this.setConnectionState('idle', 'Speech recognition stopped.');
  }

  failSession(session, message) {
    if (!this.isCurrentSession(session)) return;
    this.stop();
    this.setConnectionState('error', message);
  }

  reconnect(session, message, normalNativeEnd = false) {
    if (!this.isCurrentSession(session)) return;
    if (!normalNativeEnd && ++this.reconnectAttempts > 6) {
      this.failSession(session, 'Speech connection could not recover. Check your network and speech settings, then start again.');
      return;
    }
    this.onDiagnostic?.('reconnecting', { reason: message });
    this.resetScriptureContext();
    this.disposeSession();
    const generation = this.sessionGeneration;
    this.setConnectionState('reconnecting', message);
    const delay = normalNativeEnd ? 300 : Math.min(30000, 1000 * (2 ** (this.reconnectAttempts - 1)));
    this.restartTimer = setTimeout(() => {
      if (this.isListening && this.sessionGeneration === generation) this.beginSession('reconnecting');
    }, delay);
  }

  disposeSession() {
    const session = this.session;
    if (!session) return;
    session.closed = true; // Invalidate callbacks before closing anything.
    clearTimeout(session.connectTimer);
    clearInterval(session.healthTimer);
    clearInterval(session.audioMonitorTimer);
    this.setAudioActivity(false);
    this.publishAudioHealth({ status: 'idle', percent: 0, message: 'Start listening to check input.' });
    if (session.recognition) {
      const recognition = session.recognition;
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch (_) {}
    }
    if (session.recorder) {
      session.recorder.ondataavailable = session.recorder.onerror = null;
      try { if (session.recorder.state !== 'inactive') session.recorder.stop(); } catch (_) {}
    }
    if (session.socket) {
      const socket = session.socket;
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'CloseStream' }));
        socket.close();
      } catch (_) {}
    }
    for (const stream of [session.stream, session.processedStream]) {
      if (stream) stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
    }
    if (session.context) {
      try { Promise.resolve(session.context.close()).catch(() => {}); } catch (_) {}
    }
    this.session = null;
    this.recognition = this.deepgramSocket = this.mediaRecorder = null;
    this.audioStream = this.processedAudioStream = this.audioProcessingContext = null;
  }

  startNative(session) {
    this.publishAudioHealth({ status: 'unavailable', percent: 0, message: 'Browser Native uses the browser microphone; selected input and signal monitoring are unavailable. Use Deepgram to verify input.' });
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.failSession(session, 'Browser speech recognition is unavailable. Select Deepgram in speech settings.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      session.recognition = this.recognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onstart = () => {
        if (!this.isCurrentSession(session)) return;
        clearTimeout(session.connectTimer);
        this.setConnectionState('listening', 'Listening with Browser Native (browser microphone; input monitoring unavailable).');
      };
      recognition.onresult = event => {
        if (!this.isCurrentSession(session)) return;
        let finalText = '', interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += ' ' + event.results[i][0].transcript;
          else interimText += ' ' + event.results[i][0].transcript;
        }
        for (const [text, final] of [[finalText, true], [interimText, false]]) {
          if (!this.isCurrentSession(session)) return;
          const clean = text.trim();
          if (clean && (final || clean !== this.lastProcessedText)) {
            this.reconnectAttempts = 0;
            this.lastProcessedText = clean;
            this.processSpokenText(clean, final);
          }
        }
      };
      recognition.onerror = event => {
        if (!this.isCurrentSession(session) || event.error === 'no-speech') return;
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(event.error)) {
          this.failSession(session, 'Microphone or speech access is unavailable. Check permissions and your input device.');
        } else {
          this.reconnect(session, 'Browser speech connection interrupted. Reconnecting...');
        }
      };
      recognition.onend = () => this.reconnect(session, 'Restarting browser speech recognition...', true);
      session.connectTimer = setTimeout(() => this.reconnect(session, 'Speech startup timed out. Reconnecting...'), 15000);
      recognition.start();
    } catch (_) {
      this.failSession(session, 'Could not start browser speech recognition. Check microphone access.');
    }
  }

  buildDeepgramParams() {
    const model = this.deepgramModel || 'nova-2';
    const nova3 = /^nova-3(?:-|$)/i.test(model);
    const params = new URLSearchParams({ model, smart_format: 'true', punctuate: 'true',
      interim_results: 'true', endpointing: '300', language: 'en' });
    const agenda = typeof state !== 'undefined' && Array.isArray(state.agendaItems)
      ? state.agendaItems.filter(item => item.type === 'song' || item.songId) : [];
    const library = typeof SONGS_DATABASE !== 'undefined' && Array.isArray(SONGS_DATABASE) ? SONGS_DATABASE : [];
    // Explicit church vocabulary gets first priority; the general song library is last.
    const candidates = [
      ...(this.churchCustomTerms || '').split(/[,;\n]/),
      ...this.bibleBooks.map(book => book.name),
      ...agenda.slice(0, 15).map(song => song.title),
      ...library.slice(0, 30).map(song => song.title)
    ];
    const seen = new Set();
    let byteBudget = 0;
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const term = candidate.normalize('NFKC').replace(/:\s*\d+(?:\.\d+)?\s*$/, '').replace(/\s+/g, ' ').trim();
      const key = term.toLowerCase();
      if (!term || term.length > 80 || seen.has(key)) continue;
      // Nova-3 caps the combined prompt at 500 model tokens. Use a conservative
      // UTF-8 byte budget (including a separator per term), not a word-count guess.
      const bytes = new TextEncoder().encode(term).length + 1;
      if (nova3 && byteBudget + bytes > 450) continue;
      if (seen.size >= (nova3 ? 50 : 100)) break;
      seen.add(key);
      byteBudget += bytes;
      params.append(nova3 ? 'keyterm' : 'keywords', nova3 ? term : `${term}:1`);
    }
    return params;
  }

  async startDeepgram(session) {
    const apiKey = this.deepgramApiKey;
    if (!apiKey) {
      this.failSession(session, 'Deepgram API key required. Open Studio Preferences → AI Speech Engine.');
      return;
    }
    let stream;
    try {
      const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: true };
      if (this.selectedDeviceId && this.selectedDeviceId !== 'default') audio.deviceId = { exact: this.selectedDeviceId };
      stream = await navigator.mediaDevices.getUserMedia({ audio });
      if (!this.isCurrentSession(session)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      session.stream = this.audioStream = stream;
      stream.getTracks().forEach(track => {
        track.onended = () => this.failSession(session, 'Microphone disconnected. Select an input and start again.');
      });
      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      if (this.selectedDeviceId !== 'default' && settings.deviceId && settings.deviceId !== this.selectedDeviceId) {
        this.failSession(session, 'The captured microphone does not match the selected input. Select the input again.');
        return;
      }
      // Monitor the original stream passed to MediaRecorder; no second capture or downmix.
      const streamToSend = stream;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio unavailable');
        const context = new AudioCtx();
        session.context = this.audioProcessingContext = context;
        if (context.state === 'suspended') await context.resume();
        if (!this.isCurrentSession(session)) return;
        this.monitorAudio(session, stream, context, settings);
      } catch (_) {
        if (!this.isCurrentSession(session)) return;
        this.publishAudioHealth({ status: 'unavailable', percent: 0, message: 'Transcription input connected; signal monitoring unavailable.' });
      }
      if (!this.isCurrentSession(session)) return;
      this.connectDeepgram(session, streamToSend, apiKey);
    } catch (_) {
      this.failSession(session, 'Could not access the microphone. Check input device and permissions.');
    }
  }

  publishAudioHealth(health) {
    this.audioHealth = health;
    if (this.onAudioHealth) this.onAudioHealth(health);
  }

  monitorAudio(session, stream, context, settings) {
    const source = context.createMediaStreamSource(stream);
    const channelCount = Number.isInteger(settings.channelCount) && settings.channelCount > 0 && settings.channelCount <= 32 ? settings.channelCount : null;
    const count = Math.max(1, Math.min(32, channelCount || 1));
    const splitter = context.createChannelSplitter(count);
    source.connect(splitter);
    const analysers = Array.from({ length: count }, (_, i) => {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      splitter.connect(analyser, i);
      return { analyser, samples: new Float32Array(analyser.fftSize) };
    });
    session.audioNodes = [source, splitter, ...analysers.map(a => a.analyser)];
    let lastSignal = Date.now();
    const sample = () => {
      if (!this.isCurrentSession(session)) return;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') {
        this.failSession(session, 'Microphone disconnected. Select an input and start again.');
        return;
      }
      const channels = analysers.map(({ analyser, samples }, index) => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0, peak = 0;
        for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
        const rms = Math.sqrt(sum / samples.length);
        return { channel: index + 1, rms, peak, dbfs: rms > 0 ? 20 * Math.log10(rms) : -120 };
      });
      const rms = Math.max(...channels.map(c => c.rms));
      const active = !track.muted && context.state === 'running' && rms > 0.00316;
      if (active) lastSignal = Date.now();
      this.setAudioActivity(active);
      const status = track.muted ? 'muted' : context.state !== 'running' ? 'suspended' :
        channels.some(c => c.peak >= 0.99) ? 'clipping' : Date.now() - lastSignal >= 8000 ? 'silence' : 'ok';
      const messages = { muted: 'Microphone muted or unavailable.', suspended: 'Audio monitoring suspended.',
        clipping: 'Input is clipping; lower microphone or mixer gain.', silence: 'No input signal for 8 seconds; check microphone and mixer routing.', ok: 'Input connected.' };
      this.publishAudioHealth({ status, percent: active ? Math.round(Math.min(100, Math.max(0, (20 * Math.log10(rms) + 60) / 60 * 100))) : 0,
        message: messages[status], deviceId: settings.deviceId || null, deviceLabel: track.label || 'Microphone',
        channelCount, channelsVerified: channelCount !== null, sampleRate: settings.sampleRate || context.sampleRate,
        channels });
    };
    sample();
    session.audioMonitorTimer = setInterval(sample, 100);
  }

  connectDeepgram(session, stream, apiKey) {
    let socket;
    try {
      socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${this.buildDeepgramParams()}`, ['token', apiKey]);
    } catch (_) {
      this.failSession(session, 'Could not create the speech connection. Check speech settings.');
      return;
    }
    session.socket = this.deepgramSocket = socket;
    session.connectTimer = setTimeout(() => this.reconnect(session, 'Speech connection timed out. Reconnecting...'), 15000);
    socket.onopen = () => {
      if (!this.isCurrentSession(session)) return;
      clearTimeout(session.connectTimer);
      try {
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
          .find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error('Unsupported audio format');
        const recorder = new MediaRecorder(stream, { mimeType });
        session.recorder = this.mediaRecorder = recorder;
        session.lastSentAt = session.lastTranscriptAt = Date.now();
        recorder.ondataavailable = event => {
          if (!this.isCurrentSession(session) || socket.readyState !== WebSocket.OPEN || !event.data?.size) return;
          if (socket.bufferedAmount > 1024 * 1024) {
            this.reconnect(session, 'Speech upload stalled. Reconnecting...');
            return;
          }
          try { socket.send(event.data); session.lastSentAt = Date.now(); }
          catch (_) { this.reconnect(session, 'Speech upload interrupted. Reconnecting...'); }
        };
        recorder.onerror = () => this.failSession(session, 'Audio recording failed. Check your microphone and start again.');
        recorder.start(250);
        session.healthTimer = setInterval(() => this.checkDeepgramHealth(session), 1000);
        this.setConnectionState('listening', `Listening with Deepgram (${this.deepgramModel})...`);
      } catch (_) {
        this.failSession(session, 'Could not record audio in a supported format. Try Browser Native or restart the app.');
      }
    };
    socket.onmessage = event => {
      if (!this.isCurrentSession(session)) return;
      let data;
      try { data = JSON.parse(event.data); } catch (_) { return; }
      if (data.type === 'Error') {
        this.failSession(session, 'Speech provider rejected the request. Check your API key, model and vocabulary settings.');
        return;
      }
      const clean = (data.channel?.alternatives?.[0]?.transcript || '').trim();
      const final = data.is_final === true;
      if (clean) {
        session.lastTranscriptAt = Date.now();
        this.reconnectAttempts = 0;
        if (clean !== this.lastProcessedText || final) {
          this.lastProcessedText = clean;
          this.processSpokenText(clean, final, { recognitionConfidence: data.channel?.alternatives?.[0]?.confidence });
        }
      }
    };
    socket.onerror = () => this.reconnect(session, 'Speech connection failed. Reconnecting...');
    socket.onclose = event => {
      if ([1003, 1007, 1008].includes(event.code)) {
        this.failSession(session, 'Speech provider rejected the connection. Check your API key and speech settings.');
      } else {
        this.reconnect(session, 'Speech connection lost. Reconnecting...');
      }
    };
  }

  checkDeepgramHealth(session) {
    if (!this.isCurrentSession(session)) return;
    const now = Date.now();
    if (now - session.lastSentAt >= 3000) {
      try {
        session.socket.send(JSON.stringify({ type: 'KeepAlive' }));
        session.lastSentAt = now;
      } catch (_) {
        this.reconnect(session, 'Speech connection interrupted. Reconnecting...');
        return;
      }
    }
    // Use the existing activity signal, with a freshness check. Silence alone
    // must never cause reconnect loops. Unifying capture/meter is a later task.
    const audible = this.hasSelectedAudioEnergy && now - this.lastAudioActivityAt < 2000;
    if (!audible) session.audibleSince = null;
    else if (session.audibleSince == null) session.audibleSince = now;
    if (session.audibleSince != null && now - Math.max(session.audibleSince, session.lastTranscriptAt) >= 45000) {
      this.reconnect(session, 'Audio is active but transcription has stalled. Reconnecting...');
    }
  }

  setAudioDeviceId(deviceId) {
    this.setProviderConfig({ selectedDeviceId: deviceId });
  }

  setAudioActivity(isActive) {
    this.hasSelectedAudioEnergy = !!isActive;
    this.lastAudioActivityAt = Date.now();
  }

  setProviderConfig(cfg = {}) {
    let changed = false;
    for (const key of ['provider', 'deepgramApiKey', 'deepgramModel', 'churchCustomTerms', 'selectedDeviceId']) {
      if (cfg[key] !== undefined && cfg[key] !== this[key]) {
        this[key] = cfg[key];
        changed = true;
      }
    }
    if (changed && this.isListening) {
      this.reconnectAttempts = 0;
      this.beginSession();
    }
  }

  toggle() {
    if (this.isListening) this.stop();
    else this.start();
    return this.isListening;
  }

  // Process live or simulated speech text through all detection pipelines
  processSpokenText(text, isFinal = false, metadata = {}) {
    if (!text || typeof text !== 'string') return;
    const cleanText = text.trim();
    if (!cleanText) return;

    if (this.onTranscript) {
      this.onTranscript(cleanText, isFinal);
    }

    // Interim hypotheses can be revised by the provider; display them only.
    if (!isFinal) {
      if (this.pendingChapter) this.deferChapterSuggestion(this.pendingChapter);
      return;
    }

    // 1. Bible Reference & Quote Detection
    this.parseScriptureReferences(cleanText, metadata);

    // 2. Song Title & Lyrics Matching (Worldwide Church Adaptive Index)
    this.parseSongLyrics(cleanText);

    // 3. Semantic Paraphrases
    this.parseSemanticParaphrases(cleanText);
  }

  // Simulation harness for testing from dashboard UI or scripts
  simulateTranscript(text) {
    this.processSpokenText(text, true);
  }

  // Helper: Normalize speech text converting word numbers into digit integers
  normalizeSpokenNumbers(text) {
    if (!text) return '';
    let lower = text.toLowerCase().replace(/([a-z])[-_]([a-z])/g, '$1 $2').replace(/([a-z])([,.;!?])/g, '$1 $2');

    // Normalize ordinal prefixes e.g. "1 st" -> "1st", "2 nd" -> "2nd"
    lower = lower.replace(/\b(1|2|3)\s*(st|nd|rd|th)\b/g, '$1$2');

    // Replace composite number words like "twenty three" -> "23", "one hundred nineteen" -> "119"
    const tokens = lower.split(/\s+/);
    const resultTokens = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (this.wordToNumMap[token] !== undefined) {
        let val = this.wordToNumMap[token];

        if (i + 1 < tokens.length) {
          const next = tokens[i + 1];
          if (val >= 20 && val < 100 && this.wordToNumMap[next] !== undefined && this.wordToNumMap[next] < 10) {
            val += this.wordToNumMap[next];
            i++;
          } else if (val < 10 && (next === 'hundred' || next === 'hundreds')) {
            val = val * 100;
            i++;
            if (i + 1 < tokens.length && tokens[i + 1] === 'and') {
              i++;
            }
            if (i + 1 < tokens.length && this.wordToNumMap[tokens[i + 1]] !== undefined) {
              val += this.wordToNumMap[tokens[i + 1]];
              i++;
              if (i + 1 < tokens.length && this.wordToNumMap[tokens[i + 1]] !== undefined && this.wordToNumMap[tokens[i + 1]] < 10) {
                val += this.wordToNumMap[tokens[i + 1]];
                i++;
              }
            }
          }
        }
        resultTokens.push(val.toString());
      } else {
        resultTokens.push(token);
      }
      i++;
    }

    return resultTokens.join(' ');
  }

  cancelChapterSuggestion() {
    if (this.chapterSuggestionTimer != null) clearTimeout(this.chapterSuggestionTimer);
    this.chapterSuggestionTimer = null;
    this.pendingChapter = null;
  }

  deferChapterSuggestion(result) {
    this.cancelChapterSuggestion();
    this.pendingChapter = result;
    this.onReferencePending?.();
    this.chapterSuggestionTimer = setTimeout(() => {
      if (this.pendingChapter !== result) return;
      this.chapterSuggestionTimer = null;
      this.pendingChapter = null;
      this.onVerseDetected?.(result);
    }, 2500);
  }

  resetScriptureContext() {
    this.cancelChapterSuggestion();
    this.quotationContextGeneration = (this.quotationContextGeneration || 0) + 1;
    this.quotationPending?.clear();
    this.scriptureContext = null;
    this.pendingReference = null;
  }

  // Bounded finalized-segment assembly. Provisional text never mutates context.
  parseScriptureReferences(text, metadata = {}) {
    const now = Date.now();
    if (this.scriptureContext && now - this.scriptureContext.at > 60000) this.scriptureContext = null;
    let normalized = this.normalizeSpokenNumbers(text).replace(/[–—]/g, '-');
    if (this.pendingReference && now - this.pendingReference.at <= 8000 &&
        /^(?:\d|chapter\b|verses?\b|to\b|through\b)/.test(normalized)) {
      normalized = `${this.pendingReference.text} ${normalized}`;
      this.cancelChapterSuggestion();
    }
    this.pendingReference = null;
    const aliases = this.bibleBooks.flatMap(book => book.aliases.map(alias => ({ book, alias: this.normalizeSpokenNumbers(alias) })))
      .sort((a,b) => b.alias.length - a.alias.length);
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byAlias = new Map(aliases.map(a => [a.alias, a.book]));
    const bookPattern = new RegExp(`\\b(?:${[...byAlias.keys()].map(escape).join('|')})\\b`, 'g');
    const version = normalized.match(/\b(kjv|niv|nkjv|nlt|esv|nasb|amp|msg|asv)\b/i)?.[1]?.toUpperCase() || null;
    const mentions = [...normalized.matchAll(bookPattern)].filter(m => {
      const book = byAlias.get(m[0]);
      return /^\d/.test(book.name) || !/\b[123]\s+$/.test(normalized.slice(0,m.index));
    });
    const outputs = [];
    // A new book (including an invalid replacement) supersedes a waiting chapter.
    if (mentions.length) this.cancelChapterSuggestion();
    const emit = (book, chapter, verse, endVerse, query, explicit, correction = false) => {
      if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.maxChapters ||
          (verse !== null && (!Number.isInteger(verse) || verse < 1 || verse > 176)) ||
          (endVerse !== null && (verse === null || endVerse < verse || endVerse > 176))) return false;
      const rows = this.getScriptureVerses ? this.getScriptureVerses(book.name, chapter, version) : null;
      const validated = Array.isArray(rows) && rows.length > 0;
      if (Array.isArray(rows) && (!rows.length || (verse !== null &&
          Array.from({length:(endVerse || verse)-verse+1}, (_,i) => verse+i).some(n => !rows.some(v => v.verse === n))))) return false;
      const rawReference = `${book.name} ${chapter}${verse === null ? '' : `:${verse}${endVerse !== null ? `-${endVerse}` : ''}`}`;
      const detectionScore = verse === null ? 90 : explicit ? 98 : 94;
      const recognitionConfidence = Number.isFinite(metadata.recognitionConfidence) && metadata.recognitionConfidence >= 0 && metadata.recognitionConfidence <= 1 ? metadata.recognitionConfidence : null;
      const result = { book: book.name, chapter, verse, endVerse, kind: verse === null ? 'chapter' : 'verse', rawReference,
        detectionScore, confidence: detectionScore, recognitionConfidence, validation: validated ? 'verified' : 'unavailable',
        version, autoProjectEligible: validated && verse !== null && explicit && !correction && (recognitionConfidence === null || recognitionConfidence >= .8),
        matchedQuery: query, timestamp: now, correction };
      if (correction && outputs.length) outputs.pop();
      outputs.push(result);
      this.scriptureContext = { book, chapter, verse, at: now };
      return true;
    };
    const followups = (tail, context, correction = false) => {
      if (!context) return;
      const re = /\b(?:(chapter)\s+(\d+)(?:\s*[, :]?\s*verses?\s+(\d+))?|verses?\s+(\d+))(?:\s*(?:to|through|until|-)\s*(\d+))?/g;
      for (const m of tail.matchAll(re)) {
        const before = tail.slice(0,m.index);
        const corrected = correction || /(?:\bno|\bsorry|\bi mean|\brather|\bcorrection)[,\s]*$/.test(before);
        const chapter = m[1] ? +m[2] : context.chapter;
        const verse = m[1] ? (m[3] ? +m[3] : null) : +m[4];
        if (/^\s*(?:year|people|percent|dollars|minutes|hours)\b/.test(tail.slice(m.index+m[0].length))) continue;
        if (emit(context.book, chapter, verse, m[5] ? +m[5] : null, m[0], false, corrected)) context = this.scriptureContext;
      }
    };
    if (!mentions.length) {
      const correction = normalized.match(/^(?:no|sorry|i mean|rather|correction)[,\s]+(\d+)(?:\s*(?:to|through|-)\s*(\d+))?[.!]?$/);
      if (correction && this.scriptureContext) {
        const c = this.scriptureContext;
        emit(c.book, c.chapter, +correction[1], correction[2] ? +correction[2] : null, normalized, false, true);
      } else followups(normalized, this.scriptureContext);
    } else {
      for (let i=0; i<mentions.length; i++) {
        const mention = mentions[i], book = byAlias.get(mention[0]);
        this.scriptureContext = null;
        const after = normalized.slice(mention.index+mention[0].length, mentions[i+1]?.index);
        const before = normalized.slice(0,mention.index);
        const correction = /(?:\bno|\bsorry|\bi mean|\brather|\bcorrection)[,\s]*$/.test(before);
        // Explicit separators or two bare numbers; lexical suffixes reject prose lookalikes.
        const m = after.match(/^\s*(?:(chapter|chap|ch)\s*)?(\d+)(?:(\s*:\s*|\s*,?\s*(?:verses?|vs?)\s*|\s+)(\d+))?(?:\s*(?:to|through|until|-)\s*(\d+))?/);
        if (!m) {
          if (i === mentions.length-1 && /^\s*(?:chapter|verses?)?\s*[.,]?\s*$/.test(after) && mention[0].length > 2) this.pendingReference = { text: `${mention[0]}${after.replace(/[.,]/g,'')}`, at:now };
          continue;
        }
        const rest = after.slice(m[0].length);
        if (/^\s*(?:years?|people|percent|dollars|minutes|hours|children|men|women|times|days|months|weeks|students|arrived)\b/.test(rest)) continue;
        const cue = /\b(?:book of|turn (?:with me )?to|open (?:your bibles? )?to|read from)\s*$/.test(before);
        const explicitSyntax = Boolean(m[1] || (m[3] && /[:a-z]/.test(m[3])));
        if (mention[0].length <= 2 && !explicitSyntax && !cue) continue;
        // An unfinished range must not project its start verse.
        if (/^\s*(?:to|through|until|-|:|verses?)\s*[.,]?\s*$/.test(rest)) {
          this.pendingReference={text:`${mention[0]}${after.replace(/[.,]/g,'')}`,at:now};continue;
        }
        if (/^\s*(?:to\b|through\b|until\b|-|:|verses?\b)/.test(rest) || /^\.\d/.test(rest)) continue;
        if (!m[4] && !m[1] && !cue && book.maxChapters !== 1 && ['job','mark','john','james','ruth','numbers','song'].includes(mention[0])) {
          if (/^[.,\s]*$/.test(rest)) this.pendingReference = { text: mention[0]+m[0], at: now };
          continue;
        }
        let chapter=+m[2], verse=m[4] ? +m[4] : null, end=m[5] ? +m[5] : null;
        if (book.maxChapters===1 && !m[1] && verse===null) { verse=chapter;chapter=1; }
        if (emit(book,chapter,verse,end,mention[0]+m[0],true,correction)) {
          if (verse === null && /^[.,\s]*$/.test(rest)) this.pendingReference = { text: mention[0]+m[0], at: now };
          const correctedRest = rest.replace(/\b(no|sorry|i mean|rather|correction)[,\s]+(?=\d)/g, '$1 verse ');
          followups(correctedRest,this.scriptureContext);
          for (const extra of correctedRest.matchAll(/\band\s+(\d+)(?:\s*(?:to|through|-)\s*(\d+))?/g)) {
            if (/^[.,\s]*$/.test(correctedRest.slice(extra.index+extra[0].length))) emit(book,chapter,+extra[1],extra[2] ? +extra[2] : null,extra[0],false);
          }
        } else this.scriptureContext = null;
      }
    }
    // Same-utterance corrections replace the previous candidate before any callbacks run.
    if (outputs.length) this.cancelChapterSuggestion();
    for (const [index, result] of outputs.entries()) {
      // Final STT segments are not necessarily complete spoken references.
      if (result.kind === 'chapter' && index === outputs.length - 1) this.deferChapterSuggestion(result);
      else this.onVerseDetected?.(result);
    }
  }

  // ── Song Titles, Lyrics, & Stanzas Auto-Detection (Worldwide Adaptive Index) ────
  parseSongLyrics(text) {
    if (!text || typeof text !== 'string') return;

    const cleanInput = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanInput.length < 5) return;

    // Filter out filler words for density calculation
    const musicalFillers = new Set(['oh', 'yeah', 'woah', 'amen', 'hallelujah', 'we', 'you', 'and', 'the', 'is', 'are', 'in', 'of', 'to', 'for']);
    const inputWords = cleanInput.split(' ').filter(w => w.length > 2);
    const meaningfulInputWords = [...new Set(inputWords.filter(w => !musicalFillers.has(w)))];
    if (inputWords.length === 0) return;

    // Collect active Agenda song IDs for priority weighting
    const agendaSongIds = new Set();
    if (typeof state !== 'undefined' && Array.isArray(state.agendaItems)) {
      state.agendaItems.forEach(item => {
        if (item.songId) agendaSongIds.add(item.songId);
      });
    }

    let bestMatch = null;
    let highestScore = 0;
    const songEvidence = new Map();

    const songsList = (typeof SONGS_DATABASE !== 'undefined' && Array.isArray(SONGS_DATABASE)) ? SONGS_DATABASE : [];

    for (let sIdx = 0; sIdx < songsList.length; sIdx++) {
      const song = songsList[sIdx];
      if (!song || !song.title) continue;

      const isAgenda = agendaSongIds.has(song.id);
      const agendaBoost = 0; // Agenda membership is metadata, never evidence.

      if (!song._cleanTitle) {
        song._cleanTitle = song.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
      }
      const songTitle = song._cleanTitle;

      // 1. Direct Title Match Check
      if ((songTitle.split(/\s+/).length >= 3 && (cleanInput === songTitle || /\b(?:song|sing|singing|hymn|titled|called)\b/.test(cleanInput)) && (` ${cleanInput} `).includes(` ${songTitle} `)) ||
          (songTitle.split(/\s+/).length >= 2 && cleanInput === songTitle)) {
        const firstStanza = song.stanzas && song.stanzas.length > 0 ? song.stanzas[0] : null;
        const score = Math.min(99, 94 + agendaBoost);
        songEvidence.set(song.id, Math.max(songEvidence.get(song.id) || 0, score));
        if (score > highestScore) {
          highestScore = score;
          bestMatch = {
            songId: song.id,
            title: song.title,
            author: song.author || '',
            songbook: song.songbook || 'Library',
            stanzaIndex: 0,
            stanzaType: firstStanza ? (firstStanza.type || 'Verse 1') : 'Verse 1',
            fullStanzaText: firstStanza ? firstStanza.text : '',
            matchedSnippet: `Matched Title: "${song.title}"`,
            confidence: score,
            isAgenda: isAgenda
          };
        }
      }

      // 2. Fast Stanza & Lyric Lines Matching (N-Gram & Line Substrings)
      if (song.stanzas && Array.isArray(song.stanzas)) {
        for (let stIdx = 0; stIdx < song.stanzas.length; stIdx++) {
          const stanza = song.stanzas[stIdx];
          if (!stanza || !stanza.text) continue;

          if (!stanza._clean) {
            stanza._clean = stanza.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
            stanza._words = stanza._clean.split(' ').filter(w => w.length > 2);
            stanza._lines = stanza.text.split('\n').map(l => l.trim()).filter(Boolean);
            stanza._cleanLines = stanza._lines.map(l => l.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim());
          }

          // Exact line or large substring match
          let lineMatched = false;
          for (let lIdx = 0; lIdx < stanza._cleanLines.length; lIdx++) {
            const cl = stanza._cleanLines[lIdx];
            if (cl.split(/\s+/).length >= 4 && meaningfulInputWords.length >= 3 && (` ${cleanInput} `).includes(` ${cl} `)) {
              const score = Math.min(99, 95 + agendaBoost);
              songEvidence.set(song.id, Math.max(songEvidence.get(song.id) || 0, score));
              if (score > highestScore) {
                highestScore = score;
                bestMatch = {
                  songId: song.id,
                  title: song.title,
                  author: song.author || '',
                  songbook: song.songbook || 'Library',
                  stanzaIndex: stIdx,
                  stanzaType: stanza.type || `Verse ${stIdx + 1}`,
                  fullStanzaText: stanza.text,
                  matchedSnippet: stanza._lines[lIdx] || stanza.text.slice(0, 40),
                  confidence: score,
                  isAgenda: isAgenda
                };
              }
              lineMatched = true;
              break;
            }
          }

          if (!lineMatched) {
            // Token overlap ratio on meaningful words
            let matchedCount = 0;
            const stanzaWords = stanza._words;
            for (let wIdx = 0; wIdx < meaningfulInputWords.length; wIdx++) {
              if (stanzaWords.includes(meaningfulInputWords[wIdx])) matchedCount++;
            }

            const minWordsNeeded = 4;
            const ratio = meaningfulInputWords.length > 0 ? (matchedCount / meaningfulInputWords.length) : 0;

            if (matchedCount >= Math.max(5,minWordsNeeded) && ratio >= 0.8 && meaningfulInputWords.some((_,i) => i+3 <= meaningfulInputWords.length && stanza._clean.includes(meaningfulInputWords.slice(i,i+3).join(' ')))) {
              const score = Math.min(99, Math.round(55 + (ratio * 35) + (matchedCount * 3) + agendaBoost));
              songEvidence.set(song.id, Math.max(songEvidence.get(song.id) || 0, score));
              if (score > highestScore) {
                highestScore = score;
                bestMatch = {
                  songId: song.id,
                  title: song.title,
                  author: song.author || '',
                  songbook: song.songbook || 'Library',
                  stanzaIndex: stIdx,
                  stanzaType: stanza.type || `Verse ${stIdx + 1}`,
                  fullStanzaText: stanza.text,
                  matchedSnippet: stanza._lines[0] || stanza.text.slice(0, 40),
                  confidence: score,
                  isAgenda: isAgenda
                };
              }
            }
          }
        }
      }
    }

    const rankedSongs = [...songEvidence.values()].sort((a,b) => b-a);
    if (rankedSongs.length > 1 && rankedSongs[0]-rankedSongs[1] < 5) return;
    if (bestMatch && highestScore >= 90) {
      if (this.onSongDetected) {
        this.onSongDetected({
          ...bestMatch,
          autoProjectEligible: false, // Text alone cannot distinguish preaching from singing.
          timestamp: Date.now()
        });
      }
      return;
    }

    // Worship vocabulary alone does not establish that a song is being sung.
  }

  // Fuzzy phrase word-overlap calculation
  fuzzyPhraseOverlap(inputPhrase, targetPhrase) {
    if (!inputPhrase || !targetPhrase) return 0;
    const inputWords = inputPhrase.split(' ').filter(w => w.length > 2);
    const targetWords = targetPhrase.split(' ').filter(w => w.length > 2);
    if (inputWords.length === 0 || targetWords.length === 0) return 0;

    let matchCount = 0;
    for (const word of targetWords) {
      if (inputWords.includes(word)) {
        matchCount++;
      }
    }

    return matchCount / Math.min(inputWords.length, targetWords.length);
  }

  async retrieveSemantic(text) {
    if (!this.semanticSearch || !text || text.length > 2000) return;
    const source = this.getQuotationSource?.();
    if (source?.version !== 'KJV') return;
    const id = ++this.semanticQueryId, session = this.sessionGeneration, context = this.quotationContextGeneration, at = Date.now();
    try {
      const result = await this.semanticSearch(text, source.version);
      if (!result || id !== this.semanticQueryId || session !== this.sessionGeneration || context !== this.quotationContextGeneration || Date.now()-at > 15000) return;
      const current = this.getQuotationSource?.();
      if (current?.bible !== source.bible || current?.version !== source.version) return;
      if (this.onParaphraseDetected) this.onParaphraseDetected({ ...result, autoProjectEligible: false, timestamp: Date.now() });
    } catch (_) { this.onDiagnostic?.('semantic-failed', { reason: 'local-retrieval-unavailable' }); }
  }

  // Worker results are suggestions only and cannot survive capture/session boundaries.
  parseSemanticParaphrases(text) {
    if (this.quotationMatcher) {
      const match = this.quotationMatcher.match(text);
      if (match && this.onParaphraseDetected) this.onParaphraseDetected({ ...match, timestamp: Date.now() });
      return;
    }
    const source = this.getQuotationSource?.();
    if (!source?.bible || typeof Worker === 'undefined') return;
    if (this.quotationSource !== source.bible || this.quotationVersion !== source.version) {
      this.quotationWorker?.terminate();
      this.quotationSource = source.bible;
      this.quotationVersion = source.version;
      this.quotationGeneration++;
      this.quotationReady = false;
      this.quotationPending = new Map();
      const generation = this.quotationGeneration;
      let worker;
      try { worker = this.quotationWorker = new Worker('js/quotation-worker.js'); }
      catch (_) { this.quotationWorker = null; return; }
      worker.onmessage = ({ data }) => {
        if (generation !== this.quotationGeneration || data.generation !== generation) return;
        if (data.type === 'ready') { this.quotationReady = true; return; }
        if (data.type === 'error') { this.onDiagnostic?.('quotation-failed', { reason: 'index-error' }); this.quotationPending.clear(); return; }
        const pending = this.quotationPending.get(data.id);
        this.quotationPending.delete(data.id);
        if (!pending || pending.session !== this.sessionGeneration || pending.context !== this.quotationContextGeneration || Date.now()-pending.at > 5000) return;
        const current = this.getQuotationSource?.();
        if (current?.bible !== this.quotationSource || current?.version !== this.quotationVersion) return;
        if (data.match && this.onParaphraseDetected) this.onParaphraseDetected({ ...data.match, timestamp: Date.now() });
        else if (!data.match) this.retrieveSemantic(pending.text);
      };
      worker.onerror = () => { this.onDiagnostic?.('quotation-failed', { reason: 'worker-error' }); this.quotationPending.clear(); worker.terminate(); if (this.quotationWorker === worker) this.quotationWorker = null; };
      worker.postMessage({ type: 'build', bible: source.bible, version: source.version, generation });
    }
    if (!this.quotationWorker) return;
    const id = ++this.quotationQueryId;
    this.quotationPending.set(id, { session: this.sessionGeneration, context: this.quotationContextGeneration, at: Date.now(), text });
    while (this.quotationPending.size > 8) this.quotationPending.delete(this.quotationPending.keys().next().value);
    this.quotationWorker.postMessage({ type: 'query', text: text.slice(-4000), id, generation: this.quotationGeneration });
  }

}

window.SpeechAiEngine = SpeechAiEngine;
