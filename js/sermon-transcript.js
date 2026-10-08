// Ginomai - Live Sermon Audio Transcription & Multi-Session Engine
'use strict';

class SermonTranscriptManager {
  constructor() {
    this.storageKey = 'sf_sermon_transcript_session';
    this.historyKey = 'sf_sermon_sessions_history';
    
    this.sessions = this.loadAllSessions();
    this.session = this.getActiveSession();
    
    // Selective transcription state: false = Paused (e.g. during singing), true = Recording Pastor
    this.isRecordingSermon = false;
    this.lastUtteranceTime = 0;
    this.timerInterval = null;
    this.listeners = [];
    this.userScrolledUp = false;
    this.searchFilter = '';
    this.sessionSearchFilter = '';

    this.startTimer();
  }

  loadAllSessions() {
    try {
      const raw = localStorage.getItem(this.historyKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load sessions history:', e);
    }

    // Migration from single session if available
    try {
      const singleRaw = localStorage.getItem(this.storageKey);
      if (singleRaw) {
        const single = JSON.parse(singleRaw);
        if (single && single.id) {
          single.isActive = true;
          const list = [single];
          this.persistSessions(list);
          return list;
        }
      }
    } catch (e) {}

    const initial = this.createInitialSession();
    initial.isActive = true;
    const initialList = [initial];
    this.persistSessions(initialList);
    return initialList;
  }

  persistSessions(list = this.sessions) {
    try {
      localStorage.setItem(this.historyKey, JSON.stringify(list));
      if (this.session) {
        localStorage.setItem(this.storageKey, JSON.stringify(this.session));
      }
    } catch (e) {}
  }

  getActiveSession() {
    let active = this.sessions.find(s => s.isActive);
    if (!active && this.sessions.length > 0) {
      active = this.sessions[0];
      active.isActive = true;
      this.persistSessions();
    }
    return active || this.createInitialSession();
  }

  createInitialSession(customTitle, customSpeaker) {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const dateShort = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const defaultTitle = customTitle || `Sunday Service • ${dateShort}`;

    return {
      id: 'sermon_' + Date.now(),
      title: defaultTitle,
      speaker: customSpeaker || localStorage.getItem('sf_sermon_speaker') || 'Pastor',
      date: formattedDate,
      startTimestamp: Date.now(),
      totalDurationSeconds: 0,
      recordings: [], // [{ id, title, type, startTime, endTime, startTimestamp, endTimestamp, durationSeconds, paragraphs: [], scriptures: [], concordance: [], isRecording: false }]
      paragraphs: [], // consolidated paragraphs
      scriptures: [], // consolidated scriptures
      concordance: [],
      includeTimestampsInExport: localStorage.getItem('sf_sermon_export_timestamps') !== 'false',
      includeScripturesInExport: localStorage.getItem('sf_sermon_export_scriptures') !== 'false',
      includeConcordanceInExport: localStorage.getItem('sf_sermon_export_concordance') !== 'false',
      isActive: true,
      isBookmarked: false
    };
  }

  ensureRecordings(sess = this.session) {
    if (!sess) return [];
    if (!Array.isArray(sess.recordings)) {
      sess.recordings = [];
    }
    // Backward compatibility: If recordings array is empty but session has legacy paragraphs, wrap them as Moment 1
    if (sess.recordings.length === 0 && Array.isArray(sess.paragraphs) && sess.paragraphs.length > 0) {
      const legacyMoment = {
        id: 'rec_' + (sess.startTimestamp || Date.now()),
        title: 'Teaching / Sermon',
        type: 'teaching',
        startTime: sess.paragraphs[0].time || 'Start',
        endTime: sess.paragraphs[sess.paragraphs.length - 1].time || 'End',
        startTimestamp: sess.startTimestamp || Date.now(),
        endTimestamp: Date.now(),
        durationSeconds: sess.totalDurationSeconds || 0,
        paragraphs: [...sess.paragraphs],
        scriptures: [...(sess.scriptures || [])],
        concordance: [...(sess.concordance || [])],
        isRecording: false
      };
      sess.recordings.push(legacyMoment);
    }
    return sess.recordings;
  }

  getActiveMoment() {
    if (!this.session) return null;
    this.ensureRecordings(this.session);
    if (this.activeRecordingMoment) {
      const found = this.session.recordings.find(r => r.id === this.activeRecordingMoment.id);
      if (found) return found;
    }
    if (this.session.recordings.length > 0) {
      return this.session.recordings[this.session.recordings.length - 1];
    }
    return null;
  }

  startNewRecordingMoment(type = 'teaching') {
    this.ensureRecordings(this.session);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const count = this.session.recordings.length + 1;
    const defaultTitle = `${this.capitalizeFirst(type)} #${count}`;

    const moment = {
      id: 'rec_' + Date.now(),
      title: defaultTitle,
      type: type, // 'teaching' | 'prophecy' | 'instruction' | 'prayer' | 'other'
      startTime: timeStr,
      endTime: null,
      startTimestamp: Date.now(),
      endTimestamp: null,
      durationSeconds: 0,
      paragraphs: [],
      scriptures: [],
      concordance: [],
      isRecording: true
    };

    this.session.recordings.push(moment);
    this.activeRecordingMoment = moment;
    this.saveSession();
    return moment;
  }

  stopCurrentRecordingMoment() {
    const moment = this.activeRecordingMoment || (this.session.recordings && this.session.recordings.length > 0 ? this.session.recordings[this.session.recordings.length - 1] : null);
    if (moment && moment.isRecording) {
      const now = new Date();
      moment.endTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      moment.endTimestamp = Date.now();
      moment.isRecording = false;
    }
    this.activeRecordingMoment = null;
    this.saveSession();
  }

  setMomentTitle(momentId, title) {
    this.ensureRecordings(this.session);
    const moment = this.session.recordings.find(r => r.id === momentId);
    if (!moment) return;
    moment.title = (title || '').trim() || moment.title;
    this.saveSession();
    this.notifyUpdate(true);
  }

  setMomentType(momentId, type) {
    this.ensureRecordings(this.session);
    const moment = this.session.recordings.find(r => r.id === momentId);
    if (!moment) return;
    const oldType = moment.type;
    moment.type = type;
    if (moment.title.toLowerCase().startsWith(oldType.toLowerCase()) || moment.title.toLowerCase().startsWith('moment')) {
      const idx = this.session.recordings.indexOf(moment) + 1;
      moment.title = `${this.capitalizeFirst(type)} #${idx}`;
    }
    this.saveSession();
    this.notifyUpdate(true);
  }

  async deleteMoment(momentId) {
    this.ensureRecordings(this.session);
    const moment = this.session.recordings.find(r => r.id === momentId);
    if (!moment) return;

    let confirmed = false;
    if (typeof window.showCustomConfirm === 'function') {
      confirmed = await window.showCustomConfirm({
        title: 'Delete Recorded Moment',
        message: `Are you sure you want to delete "${moment.title}"? Spoken paragraphs in this moment will be removed.`,
        confirmText: 'Delete',
        danger: true,
        icon: 'trash'
      });
    } else {
      confirmed = confirm(`Delete "${moment.title}"?`);
    }

    if (!confirmed) return;

    this.session.recordings = this.session.recordings.filter(r => r.id !== momentId);
    this.session.paragraphs = this.getAllParagraphs();
    this.session.scriptures = this.getAllScriptures();
    this.saveSession();
    this.notifyUpdate(true);

    if (typeof window.showToast === 'function') {
      window.showToast(`Deleted "${moment.title}"`, 'info');
    }
  }

  saveSession() {
    if (!this.session) return;
    const idx = this.sessions.findIndex(s => s.id === this.session.id);
    if (idx !== -1) {
      this.sessions[idx] = this.session;
    } else {
      this.sessions.unshift(this.session);
    }
    this.persistSessions();
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.isRecordingSermon && !window.isRemoteOperator) {
        this.session.totalDurationSeconds = (this.session.totalDurationSeconds || 0) + 1;
        if (this.activeRecordingMoment) {
          this.activeRecordingMoment.durationSeconds = (this.activeRecordingMoment.durationSeconds || 0) + 1;
        }
        this.notifyUpdate(false);
      }
    }, 1000);
  }

  // Preaching recording toggle: Multiple recordings / moments within active service session
  toggleSermonRecording() {
    if (window.isRemoteOperator) {
      this.isRecordingSermon = !this.isRecordingSermon;
      this.syncTopBarRecordBtn();
      window.sendRemoteCommand({type:'SET_SERMON_RECORDING',enabled:this.isRecordingSermon});
      return;
    }
    const willRecord = !this.isRecordingSermon;

    if (willRecord) {
      // 1. Start a new recording moment in the current service session
      const moment = this.startNewRecordingMoment('teaching');
      this.isRecordingSermon = true;

      // Auto start AI mic if recording was activated while AI mic was off
      if (window.state && !window.state.aiListening && !window.state.aiSpeechRequested) {
        if (typeof window.toggleSpeechAi === 'function') {
          window.toggleSpeechAi();
        }
      }

      if (!this.isRecordingSermon) return; // A synchronous startup failure already paused it.
      this.saveSession();
      this.notifyUpdate(true);

      if (typeof window.showToast === 'function') {
        window.showToast(`Started recording "${moment.title}" (Alt+R to finish)`, 'success');
      }
    } else {
      // 2. Stop active moment, commit in-flight speech, and keep active session intact!
      this.flushPendingUtterance();
      this.isRecordingSermon = false;
      this.stopCurrentRecordingMoment();
      this.saveSession();
      this.notifyUpdate(true);

      if (typeof window.showToast === 'function') {
        const lastMoment = this.session.recordings && this.session.recordings.length > 0
          ? this.session.recordings[this.session.recordings.length - 1]
          : null;
        const name = lastMoment ? lastMoment.title : 'Recording';
        const dur = lastMoment ? this.formatDuration(lastMoment.durationSeconds) : '';
        window.showToast(`Saved "${name}" (${dur}) in ${this.session.title}`, 'info');
      }
    }
  }

  flushPendingUtterance() {
    clearTimeout(this.interimCommitTimer);
    if (!this.isRecordingSermon || !this.currentInterimText) return;
    const pending = this.currentInterimText;
    this.commitFinalUtterance(pending);
    this.currentInterimText = '';
  }

  setRecordingState(isListening) {
    // When microphone hardware is turned completely off, pause sermon recording and commit pending
    if (!isListening && this.isRecordingSermon) {
      this.flushPendingUtterance();
      this.isRecordingSermon = false;
      this.stopCurrentRecordingMoment();
      this.saveSession();
      this.notifyUpdate(true);
    }
  }

  // Multi-session operations
  switchSession(sessionId) {
    if (!sessionId) return;
    const target = this.sessions.find(s => s.id === sessionId);
    if (!target) return;

    this.setRecordingState(false);
    if (typeof speechAi !== 'undefined') speechAi?.resetScriptureContext?.();
    window.cancelPendingAutoProjection?.('service-changed');
    this.sessions.forEach(s => { s.isActive = (s.id === sessionId); });
    this.session = target;
    this.isRecordingSermon = false;
    this.activeRecordingMoment = null;
    this.ensureRecordings(this.session);
    this.persistSessions();
    this.notifyUpdate(true);

    if (typeof window.showToast === 'function') {
      window.showToast(`Opened service: "${target.title}"`, 'info');
    }
  }

  async promptCloseOrNewSession() {
    this.ensureRecordings(this.session);
    const hasContent = (this.session.recordings && this.session.recordings.length > 0) ||
                       (this.session.paragraphs && this.session.paragraphs.length > 0);

    if (!hasContent) {
      this.startNewServiceSession();
      return;
    }

    let chosenTitle = null;
    const defaultName = this.session.title || `Sunday Service • ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

    if (typeof window.showCustomPrompt === 'function') {
      chosenTitle = await window.showCustomPrompt({
        title: 'Name Session to Keep Forever',
        message: 'Name this service session to bookmark it in your history vault before starting a fresh service:',
        defaultValue: defaultName,
        placeholder: 'e.g. Sunday 1st Service',
        confirmText: 'Save & Start New',
        cancelText: 'Cancel',
        icon: 'bookmark'
      });
    } else {
      chosenTitle = prompt('Name this session before starting fresh (e.g. Sunday 1st Service):', defaultName);
    }

    if (chosenTitle !== null && chosenTitle !== undefined) {
      if (chosenTitle.trim()) {
        this.session.title = chosenTitle.trim();
        this.session.isBookmarked = true;
        this.saveSession();
      }
      this.startNewServiceSession();
      if (typeof window.showToast === 'function') {
        window.showToast('Previous service saved to history! Started fresh session.', 'success');
      }
    }
  }

  promptNewSession() {
    this.promptCloseOrNewSession();
  }

  startNewServiceSession(customTitle) {
    this.setRecordingState(false);
    if (typeof speechAi !== 'undefined') speechAi?.resetScriptureContext?.();
    window.cancelPendingAutoProjection?.('service-changed');
    const now = new Date();
    const dateShort = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const defaultTitle = customTitle || `Sunday Service • ${dateShort}`;
    const currentSpeaker = (this.session && this.session.speaker) ? this.session.speaker : 'Pastor';
    const newSession = this.createInitialSession(defaultTitle, currentSpeaker);

    this.sessions.forEach(s => { s.isActive = false; });
    newSession.isActive = true;
    this.sessions.unshift(newSession);
    this.session = newSession;
    this.isRecordingSermon = false;
    this.activeRecordingMoment = null;
    this.currentInterimText = '';
    this.persistSessions();
    this.notifyUpdate(true);
    return newSession;
  }

  async confirmDeleteSession(sessionId) {
    const target = this.sessions.find(s => s.id === sessionId);
    if (!target) return;

    let confirmed = false;
    if (typeof window.showCustomConfirm === 'function') {
      confirmed = await window.showCustomConfirm({
        title: 'Delete Sermon Session',
        message: `Are you sure you want to permanently delete "${target.title}"?`,
        confirmText: 'Delete',
        danger: true,
        icon: 'trash'
      });
    } else {
      confirmed = confirm(`Delete sermon session "${target.title}"?`);
    }

    if (!confirmed) return;

    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    if (this.sessions.length === 0) {
      const fresh = this.createInitialSession();
      fresh.isActive = true;
      this.sessions = [fresh];
      this.session = fresh;
    } else if (this.session && this.session.id === sessionId) {
      this.session = this.sessions[0];
      this.session.isActive = true;
    }
    this.persistSessions();
    this.notifyUpdate(true);

    if (typeof window.showToast === 'function') {
      window.showToast(`Deleted session "${target.title}"`, 'info');
    }
  }

  setTitle(title) {
    if (!this.session) return;
    this.session.title = (title || '').trim() || 'Sunday Service Sermon';
    this.saveSession();
    this.notifyUpdate(true);
  }

  setSpeaker(speaker) {
    if (!this.session) return;
    this.session.speaker = (speaker || '').trim() || 'Pastor';
    this.saveSession();
    this.notifyUpdate(true);
  }

  setExportOption(key, val) {
    if (!this.session) return;
    if (key === 'timestamps') {
      this.session.includeTimestampsInExport = !!val;
      localStorage.setItem('sf_sermon_export_timestamps', String(this.session.includeTimestampsInExport));
    } else if (key === 'scriptures') {
      this.session.includeScripturesInExport = !!val;
      localStorage.setItem('sf_sermon_export_scriptures', String(this.session.includeScripturesInExport));
    } else if (key === 'concordance') {
      this.session.includeConcordanceInExport = !!val;
      localStorage.setItem('sf_sermon_export_concordance', String(this.session.includeConcordanceInExport));
    }
    this.saveSession();
  }

  // Helper to clean up audio stutter and consecutive repeated words/phrases
  cleanSpeechStutter(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();
    // 1. Remove duplicate adjacent words with optional comma/punctuation: "is is" -> "is", "is, is" -> "is"
    cleaned = cleaned.replace(/\b([A-Za-z0-9]+)[,\s]+(?:\1\b[,\s]*)+/gi, (m, g) => g + ' ');
    // 2. Remove duplicate adjacent 2-6 word phrases
    cleaned = cleaned.replace(/(\b[A-Za-z0-9\s]{3,35}\b[?!.,]?)\s+(?:\1)/gi, (m, g) => g + ' ');
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  }

  // Ingest live speech utterances
  addUtterance(rawText, isFinal = true) {
    // Only transcribe when sermon recording is explicitly active!
    if (!this.isRecordingSermon) return;
    if (!rawText || typeof rawText !== 'string') return;
    const cleanText = this.cleanSpeechStutter(rawText);
    if (!cleanText) return;

    // Keep provisional text editable until the provider finalizes it. Pause/stop
    // already flush pending text; a timer here duplicates delayed corrections.
    if (!isFinal) {
      this.currentInterimText = cleanText;
      clearTimeout(this.interimCommitTimer);
      return;
    }

    clearTimeout(this.interimCommitTimer);
    this.currentInterimText = '';
    this.commitFinalUtterance(cleanText);
  }

  // Commit finalized speech segments cleanly to paragraphs
  commitFinalUtterance(cleanText) {
    if (!this.isRecordingSermon || !cleanText) return;

    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timeSinceLastUtterance = now - (this.lastUtteranceTime || 0);

    let moment = this.activeRecordingMoment || this.getActiveMoment();
    if (!moment) {
      moment = this.startNewRecordingMoment('teaching');
    }
    if (!moment.paragraphs) moment.paragraphs = [];

    const paragraphs = moment.paragraphs;
    let currentPara = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : null;

    let shouldStartNewPara = !currentPara;
    if (currentPara) {
      const existing = currentPara.text.trim();
      const lastChar = existing.slice(-1);
      const isSentenceEnd = ['.', '!', '?', ':'].includes(lastChar);
      const words = existing.split(/\s+/).filter(Boolean).length;
      
      // Natural paragraph breaks:
      // 1. Natural speech pause of 3.5s+
      // 2. Completed a sentence and has at least 25 words
      // 3. Or reaches 40 words
      if (timeSinceLastUtterance > 3500 || (words >= 25 && isSentenceEnd) || words >= 40) {
        shouldStartNewPara = true;
      }
    }

    if (shouldStartNewPara) {
      currentPara = {
        id: 'p_' + now + '_' + Math.random().toString(36).slice(2, 6),
        time: timeStr,
        timestamp: now,
        text: this.capitalizeFirst(cleanText),
        scriptures: [],
        concordance: []
      };
      paragraphs.push(currentPara);
    } else {
      const existing = currentPara.text.trim();
      const lastChar = existing.slice(-1);
      const isSentenceEnd = ['.', '!', '?', ':'].includes(lastChar);
      
      // Prevent duplicate sentences or overlapping phrases
      if (!existing.toLowerCase().endsWith(cleanText.toLowerCase())) {
        const sep = isSentenceEnd ? ' ' : '. ';
        currentPara.text = (existing + sep + this.capitalizeFirst(cleanText)).replace(/\s{2,}/g, ' ');
      }
    }

    // Mirror into session.paragraphs for legacy search/listeners
    this.session.paragraphs = this.getAllParagraphs();

    // Auto-detect Strong's Greek/Hebrew terms in speech
    if (typeof window.detectConcordanceTerms === 'function') {
      const detectedTerms = window.detectConcordanceTerms(cleanText);
      if (detectedTerms && detectedTerms.length > 0) {
        this.addConcordance(detectedTerms);
      }
    }

    this.lastUtteranceTime = now;
    this.saveSession();
    this.notifyUpdate(true);
  }

  // Track detected scriptures in transcript & active moment
  addScripture(detected) {
    if (!detected || (!detected.reference && !detected.rawReference)) return;
    const ref = (detected.reference || detected.rawReference).trim();
    const text = (detected.text || '').trim();
    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (!this.session.scriptures) this.session.scriptures = [];
    const last = this.session.scriptures[this.session.scriptures.length - 1];
    if (last && last.reference === ref && (now - last.timestamp < 25000)) {
      return;
    }

    const scriptureEntry = {
      id: 'scrip_' + now,
      reference: ref,
      text: text,
      time: timeStr,
      timestamp: now
    };

    this.session.scriptures.push(scriptureEntry);

    const moment = this.activeRecordingMoment || this.getActiveMoment();
    if (moment) {
      if (!moment.scriptures) moment.scriptures = [];
      moment.scriptures.push(scriptureEntry);

      if (moment.paragraphs && moment.paragraphs.length > 0) {
        const currentPara = moment.paragraphs[moment.paragraphs.length - 1];
        if (currentPara) {
          if (!currentPara.scriptures) currentPara.scriptures = [];
          if (!currentPara.scriptures.includes(ref)) {
            currentPara.scriptures.push(ref);
          }
        }
      }
    }

    this.saveSession();
    this.notifyUpdate(true);
  }

  // Track detected Greek & Hebrew concordance terms in transcript
  addConcordance(terms) {
    if (!terms || !Array.isArray(terms) || terms.length === 0) return;
    if (!this.session.concordance) this.session.concordance = [];
    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const moment = this.activeRecordingMoment || this.getActiveMoment();
    const currentPara = moment && moment.paragraphs ? moment.paragraphs[moment.paragraphs.length - 1] : null;

    for (const item of terms) {
      if (!item || !item.id) continue;
      
      // Check session duplicate in last 30s
      const last = this.session.concordance[this.session.concordance.length - 1];
      if (last && last.id === item.id && (now - last.timestamp < 30000)) {
        continue;
      }

      const concordanceEntry = {
        id: item.id,
        lemma: item.lemma,
        translit: item.translit,
        def: item.def,
        lang: item.lang,
        time: timeStr,
        timestamp: now
      };

      this.session.concordance.push(concordanceEntry);
      if (moment) {
        if (!moment.concordance) moment.concordance = [];
        moment.concordance.push(concordanceEntry);
      }

      if (currentPara) {
        if (!currentPara.concordance) currentPara.concordance = [];
        if (!currentPara.concordance.some(c => c.id === item.id)) {
          currentPara.concordance.push(concordanceEntry);
        }
      }
    }

    this.saveSession();
    this.notifyUpdate(true);
  }

  getAllParagraphs(sess = this.session) {
    if (!sess) return [];
    this.ensureRecordings(sess);
    if (sess.recordings && sess.recordings.length > 0) {
      const all = [];
      for (const m of sess.recordings) {
        if (Array.isArray(m.paragraphs)) {
          all.push(...m.paragraphs);
        }
      }
      return all;
    }
    return sess.paragraphs || [];
  }

  getAllScriptures(sess = this.session) {
    if (!sess) return [];
    this.ensureRecordings(sess);
    if (sess.recordings && sess.recordings.length > 0) {
      const all = [];
      const seen = new Set();
      for (const m of sess.recordings) {
        if (Array.isArray(m.scriptures)) {
          for (const sc of m.scriptures) {
            if (!seen.has(sc.reference)) {
              seen.add(sc.reference);
              all.push(sc);
            }
          }
        }
      }
      return all;
    }
    return sess.scriptures || [];
  }

  getWordCount(sess = this.session) {
    if (!sess) return 0;
    const paras = this.getAllParagraphs(sess);
    let count = 0;
    for (const p of paras) {
      if (p.text) {
        count += p.text.trim().split(/\s+/).filter(Boolean).length;
      }
    }
    return count;
  }

  getMomentWordCount(moment) {
    if (!moment || !moment.paragraphs) return 0;
    let count = 0;
    for (const p of moment.paragraphs) {
      if (p.text) {
        count += p.text.trim().split(/\s+/).filter(Boolean).length;
      }
    }
    return count;
  }

  formatDuration(totalSecs) {
    const secs = totalSecs || 0;
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${mins}m ${s.toString().padStart(2, '0')}s`;
  }

  getFormattedDuration(sess = this.session) {
    if (!sess) return '0m 00s';
    return this.formatDuration(sess.totalDurationSeconds);
  }

  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Format complete individual moment TXT report
  generateMomentTxt(moment) {
    if (!moment) return '';
    const separator = '================================================================================';
    const subSep = '--------------------------------------------------------------------------------';
    const lines = [];

    lines.push(separator);
    lines.push(` GINOMAI — RECORDED MOMENT: ${moment.title.toUpperCase()} [${moment.type.toUpperCase()}]`);
    lines.push(separator);
    lines.push(` Service:     ${this.session.title || 'Sunday Service'}`);
    lines.push(` Speaker:     ${this.session.speaker || 'Pastor'}`);
    lines.push(` Date:        ${this.session.date || new Date().toLocaleDateString()}`);
    lines.push(` Time:        ${moment.startTime} ${moment.endTime ? '– ' + moment.endTime : ''}`);
    lines.push(` Duration:    ${this.formatDuration(moment.durationSeconds)}`);
    lines.push(` Word Count:  ${this.getMomentWordCount(moment).toLocaleString()} words`);
    lines.push(` Scriptures:  ${(moment.scriptures || []).length} cited`);
    lines.push(separator);
    lines.push('');

    if (!moment.paragraphs || moment.paragraphs.length === 0) {
      lines.push('[No spoken text recorded in this moment]');
      lines.push('');
    } else {
      for (let i = 0; i < moment.paragraphs.length; i++) {
        const p = moment.paragraphs[i];
        if (!p.text || !p.text.trim()) continue;
        lines.push(`[${p.time || '00:00:00'}]`);
        lines.push(p.text.trim());
        if (p.scriptures && p.scriptures.length > 0) {
          lines.push(`  ↳ Cited Scripture: ${p.scriptures.join(', ')}`);
        }
        lines.push('');
      }
    }

    if (moment.scriptures && moment.scriptures.length > 0) {
      lines.push(subSep);
      lines.push(' SCRIPTURES CITED IN THIS MOMENT:');
      lines.push(subSep);
      for (let i = 0; i < moment.scriptures.length; i++) {
        const sc = moment.scriptures[i];
        lines.push(`${(i + 1).toString().padStart(2, ' ')}. [${sc.time}] ${sc.reference}`);
        if (sc.text) lines.push(`    "${sc.text.trim()}"`);
      }
      lines.push('');
    }

    lines.push(separator);
    lines.push(' Transcribed live via Ginomai — The Word in Motion');
    lines.push(separator);

    return lines.join('\n');
  }

  downloadMomentTxt(momentId) {
    this.ensureRecordings(this.session);
    const moment = this.session.recordings.find(r => r.id === momentId);
    if (!moment) return;

    const textContent = this.generateMomentTxt(moment);
    const safeTitle = (moment.title || 'Moment')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}_${dateStr}.txt`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    if (typeof window.showToast === 'function') {
      window.showToast(`Exported "${filename}"`, 'success');
    }
  }

  copyMoment(momentId) {
    this.ensureRecordings(this.session);
    const moment = this.session.recordings.find(r => r.id === momentId);
    if (!moment) return;

    const textContent = this.generateMomentTxt(moment);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textContent).then(() => {
        if (typeof window.showToast === 'function') {
          window.showToast(`Copied "${moment.title}" to clipboard!`, 'success');
        }
      }).catch(() => {
        this.fallbackCopy(textContent);
      });
    } else {
      this.fallbackCopy(textContent);
    }
  }

  // Format complete clean service TXT report with all moments
  generateTxt(options = {}) {
    this.ensureRecordings(this.session);
    const separator = '================================================================================';
    const lines = [];

    const moments = this.session.recordings || [];
    const momentsCount = moments.length;
    const allScriptures = this.getAllScriptures();

    lines.push(separator);
    lines.push(' GINOMAI — SERVICE TRANSCRIPT & RECORDINGS');
    lines.push(separator);
    lines.push(` Service:     ${this.session.title || 'Sunday Service'}`);
    lines.push(` Speaker:     ${this.session.speaker || 'Pastor'}`);
    lines.push(` Date:        ${this.session.date || new Date().toLocaleDateString()}`);
    lines.push(` Total Time:  ${this.getFormattedDuration()} across ${momentsCount} recorded moment${momentsCount === 1 ? '' : 's'}`);
    lines.push(` Word Count:  ${this.getWordCount().toLocaleString()} words`);
    lines.push(` Scriptures:  ${allScriptures.length} cited`);
    lines.push(` Generated:   ${new Date().toLocaleString()}`);
    lines.push(separator);
    lines.push('');

    if (momentsCount === 0) {
      const paras = this.session.paragraphs || [];
      if (paras.length === 0) {
        lines.push('[No live sermon recordings captured in this session yet]');
        lines.push('');
      } else {
        lines.push('--- RECORDED TRANSCRIPT ---');
        lines.push('');
        for (let i = 0; i < paras.length; i++) {
          const p = paras[i];
          if (!p.text || !p.text.trim()) continue;
          lines.push(`[${p.time || '00:00:00'}] #${i + 1}`);
          lines.push(p.text.trim());
          if (p.scriptures && p.scriptures.length > 0) {
            lines.push(`  ↳ Cited Scripture: ${p.scriptures.join(', ')}`);
          }
          lines.push('');
        }
      }
    } else {
      for (let mIdx = 0; mIdx < moments.length; mIdx++) {
        const m = moments[mIdx];
        lines.push(separator);
        lines.push(` MOMENT ${mIdx + 1}: ${m.title.toUpperCase()} [${m.type.toUpperCase()}]`);
        lines.push(` Time: ${m.startTime} ${m.endTime ? '– ' + m.endTime : '(Recording...)'} • Duration: ${this.formatDuration(m.durationSeconds)} • ${this.getMomentWordCount(m)} words`);
        lines.push(separator);
        lines.push('');

        if (!m.paragraphs || m.paragraphs.length === 0) {
          lines.push('[No spoken text recorded in this moment]');
          lines.push('');
        } else {
          for (let i = 0; i < m.paragraphs.length; i++) {
            const p = m.paragraphs[i];
            if (!p.text || !p.text.trim()) continue;
            lines.push(`[${p.time || '00:00:00'}]`);
            lines.push(p.text.trim());
            if (p.scriptures && p.scriptures.length > 0) {
              lines.push(`  ↳ Cited Scripture: ${p.scriptures.join(', ')}`);
            }
            lines.push('');
          }
        }
      }
    }

    if (allScriptures.length > 0) {
      lines.push(separator);
      lines.push(' SCRIPTURES REFERENCED IN THIS SERVICE (CHRONOLOGICAL)');
      lines.push(separator);
      lines.push('');
      for (let i = 0; i < allScriptures.length; i++) {
        const sc = allScriptures[i];
        lines.push(`${(i + 1).toString().padStart(2, ' ')}. [${sc.time}] ${sc.reference}`);
        if (sc.text) {
          lines.push(`    "${sc.text.trim()}"`);
        }
        lines.push('');
      }
    }

    lines.push(separator);
    lines.push(' Transcribed live via Ginomai — The Word in Motion');
    lines.push(separator);

    return lines.join('\n');
  }

  downloadTxt() {
    const textContent = this.generateTxt();
    const safeTitle = (this.session.title || 'Service')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}_Transcript_${dateStr}.txt`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    if (typeof window.showToast === 'function') {
      window.showToast(`Service transcript saved as "${filename}"`, 'success');
    }
  }

  copyToClipboard() {
    const textContent = this.generateTxt();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textContent).then(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('Full service transcript copied to clipboard!', 'success');
        }
      }).catch(() => {
        this.fallbackCopy(textContent);
      });
    } else {
      this.fallbackCopy(textContent);
    }
  }

  fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (typeof window.showToast === 'function') {
        window.showToast('Sermon transcript copied to clipboard!', 'success');
      }
    } catch (e) {
      if (typeof window.showToast === 'function') {
        window.showToast('Could not copy to clipboard', 'warning');
      }
    }
    document.body.removeChild(ta);
  }

  onUpdate(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyUpdate(fullRender = true) {
    for (const cb of this.listeners) {
      try { cb(this.session, fullRender); } catch (e) {}
    }
    this.syncBentoUi();
    this.syncModalUi();
    this.syncTopBarRecordBtn();
    if (fullRender && !window.isRemoteOperator) {
      window.broadcastSpeechAiUpdate?.({sermon:{session:this.session,isRecording:this.isRecordingSermon,interimText:this.currentInterimText || ''}});
    }
  }

  applyHostState(sermon) {
    if (!window.isRemoteOperator || !sermon.session) return;
    this.session = sermon.session;
    const index = this.sessions.findIndex(session => session.id === this.session.id);
    if (index === -1) this.sessions.unshift(this.session);
    else this.sessions[index] = this.session;
    this.isRecordingSermon = !!sermon.isRecording;
    this.currentInterimText = sermon.interimText || '';
    this.activeRecordingMoment = this.session.recordings?.find(moment => moment.isRecording) || null;
    this.notifyUpdate(true);
  }

  syncTopBarRecordBtn() {
    const recBtn = document.getElementById('bento-rec-sermon-btn');
    const recLabel = document.getElementById('bento-rec-sermon-label');
    this.ensureRecordings(this.session);
    const momentsCount = (this.session.recordings || []).length;
    const activeMoment = this.activeRecordingMoment;

    if (recBtn) {
      recBtn.classList.toggle('active', this.isRecordingSermon);
      if (this.isRecordingSermon) {
        const dur = this.formatDuration(activeMoment ? activeMoment.durationSeconds : 0);
        recBtn.title = `Recording Moment #${momentsCount} (${dur}) • Click to Stop Moment (Alt+R)`;
      } else {
        recBtn.title = `Record Moment in ${this.session.title} (Alt+R)`;
      }
    }
    if (recLabel) {
      if (this.isRecordingSermon) {
        const dur = this.formatDuration(activeMoment ? activeMoment.durationSeconds : 0);
        recLabel.textContent = `Recording (#${momentsCount} - ${dur})`;
      } else {
        recLabel.textContent = momentsCount > 0 ? `Record Moment (${momentsCount})` : 'Record Moment';
      }
    }
  }

  // Bento Right Column AI Feed HUD
  syncBentoUi() {
    const docBadgeEl = document.getElementById('bento-transcript-badge-text');
    if (docBadgeEl) {
      docBadgeEl.textContent = 'History';
    }
  }

  // Master-Detail Modal UI Synchronization
  syncModalUi() {
    const modal = document.getElementById('sermon-transcript-modal-backdrop');
    if (!modal || !modal.classList.contains('open')) return;

    this.renderSessionsSidebar();
    this.renderDocumentViewer();
  }

  setSessionSearch(val) {
    this.sessionSearchFilter = (val || '').toLowerCase().trim();
    this.renderSessionsSidebar();
  }

  renderSessionsSidebar() {
    const listEl = document.getElementById('sermon-sessions-list');
    if (!listEl) return;

    let html = '';
    const filter = this.sessionSearchFilter || '';

    for (const sess of this.sessions) {
      if (filter && !sess.title.toLowerCase().includes(filter) && !sess.speaker.toLowerCase().includes(filter)) {
        continue;
      }

      this.ensureRecordings(sess);
      const isActive = (this.session && this.session.id === sess.id);
      const isLiveRec = isActive && this.isRecordingSermon;
      const words = this.getWordCount(sess);
      const duration = this.getFormattedDuration(sess);
      const momentsCount = (sess.recordings || []).length;
      const momentLabel = momentsCount === 1 ? '1 moment' : `${momentsCount} moments`;

      html += `
        <div class="sermon-session-row ${isActive ? 'active' : ''}" onclick="window.sermonManager.switchSession('${sess.id}')">
          <div class="session-row-top">
            <span class="session-row-title">${this.escapeHtml(sess.title)}</span>
            ${isLiveRec ? `<span class="session-live-tag">LIVE</span>` : (isActive ? `<span class="session-active-tag">ACTIVE</span>` : '')}
          </div>
          <div class="session-row-sub">
            <span>${momentLabel} • ${duration} • ${words.toLocaleString()}w</span>
            <button type="button" class="session-row-del-btn" onclick="event.stopPropagation(); window.sermonManager.confirmDeleteSession('${sess.id}')" title="Delete Service Session">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;
  }

  renderDocumentViewer() {
    const titleInput = document.getElementById('sermon-modal-title-input');
    const speakerInput = document.getElementById('sermon-modal-speaker-input');
    const statsEl = document.getElementById('sermon-modal-stats-pill');
    const statusBadge = document.getElementById('sermon-modal-status-badge');
    const listEl = document.getElementById('sermon-modal-para-list');
    const emptyEl = document.getElementById('sermon-modal-empty');

    this.ensureRecordings(this.session);

    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = this.session.title || '';
    }
    if (speakerInput && document.activeElement !== speakerInput) {
      speakerInput.value = this.session.speaker || '';
    }

    const moments = this.session.recordings || [];
    const momentsCount = moments.length;
    const totalWords = this.getWordCount();
    const totalDuration = this.getFormattedDuration();
    const allScriptures = this.getAllScriptures();
    const allConcordance = this.session.concordance || [];

    if (statsEl) {
      statsEl.textContent = `${totalWords.toLocaleString()} words • ${totalDuration} • ${momentsCount} recorded moment${momentsCount === 1 ? '' : 's'} • ${allScriptures.length} scriptures`;
    }
    if (statusBadge) {
      statusBadge.className = this.isRecordingSermon ? 'sermon-status-tag live' : 'sermon-status-tag standby';
      statusBadge.style.cursor = 'pointer';
      statusBadge.title = 'Click to start or stop recording moments in this service (Alt+R)';
      statusBadge.onclick = () => this.toggleSermonRecording();
      statusBadge.innerHTML = this.isRecordingSermon
        ? `<i></i> LIVE RECORDING (#${momentsCount})`
        : `<i></i> SERVICE STANDBY (${momentsCount} moments)`;
    }

    if (!listEl) return;

    const hasMoments = momentsCount > 0;
    const hasInterim = Boolean(this.currentInterimText && this.isRecordingSermon);
    const hasAnyContent = hasMoments || hasInterim || allScriptures.length > 0;

    if (!hasAnyContent) {
      listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        const descEl = emptyEl.querySelector('.sermon-empty-desc');
        if (descEl) {
          descEl.textContent = 'Click "Record Moment" or press Alt+R whenever the pastor teaches, gives prophecy, or ministers. You can record multiple times during this service.';
        }
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const filterQuery = (this.searchFilter || '').toLowerCase().trim();

    let html = `<div class="sermon-article-stream"><div class="doc-sheet-article">`;

    // ── Render Each Recorded Moment Card ──
    for (let mIdx = 0; mIdx < moments.length; mIdx++) {
      const moment = moments[mIdx];
      const isLiveThisMoment = moment.isRecording && this.isRecordingSermon;
      const momentWords = this.getMomentWordCount(moment);
      const momentDur = this.formatDuration(moment.durationSeconds);
      const momentParas = moment.paragraphs || [];

      // If search filter is active and moment has no matching text, skip
      if (filterQuery) {
        const matchesText = momentParas.some(p => p.text && p.text.toLowerCase().includes(filterQuery));
        const matchesTitle = moment.title.toLowerCase().includes(filterQuery);
        if (!matchesText && !matchesTitle) continue;
      }

      html += `
        <div class="sermon-moment-card ${isLiveThisMoment ? 'live' : ''}" id="moment-${moment.id}">
          <div class="moment-header">
            <div class="moment-header-left">
              <span class="moment-badge ${isLiveThisMoment ? 'live' : ''}">${isLiveThisMoment ? 'LIVE' : this.escapeHtml(moment.type.toUpperCase())}</span>
              <input type="text" class="moment-title-input" value="${this.escapeHtml(moment.title)}" onchange="window.sermonManager.setMomentTitle('${moment.id}', this.value)" title="Click to rename this moment" />
              
              <div class="moment-type-pills">
                <button type="button" class="type-pill ${moment.type === 'teaching' ? 'active' : ''}" onclick="window.sermonManager.setMomentType('${moment.id}', 'teaching')" title="Tag as Teaching / Sermon">Teaching</button>
                <button type="button" class="type-pill ${moment.type === 'prophecy' ? 'active' : ''}" onclick="window.sermonManager.setMomentType('${moment.id}', 'prophecy')" title="Tag as Prophecy">Prophecy</button>
                <button type="button" class="type-pill ${moment.type === 'instruction' ? 'active' : ''}" onclick="window.sermonManager.setMomentType('${moment.id}', 'instruction')" title="Tag as Instruction">Instruction</button>
                <button type="button" class="type-pill ${moment.type === 'prayer' ? 'active' : ''}" onclick="window.sermonManager.setMomentType('${moment.id}', 'prayer')" title="Tag as Prayer">Prayer</button>
              </div>
            </div>

            <div class="moment-header-right">
              <span class="moment-time-meta">${moment.startTime} ${moment.endTime ? '– ' + moment.endTime : '(Recording...)'} • ${momentDur} • ${momentWords.toLocaleString()}w</span>
              
              <button type="button" class="moment-btn" onclick="window.sermonManager.copyMoment('${moment.id}')" title="Copy this moment to clipboard">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Copy</span>
              </button>
              <button type="button" class="moment-btn" onclick="window.sermonManager.downloadMomentTxt('${moment.id}')" title="Export this moment as a separate .txt file">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Export .txt</span>
              </button>
              <button type="button" class="moment-del-btn" onclick="window.sermonManager.deleteMoment('${moment.id}')" title="Delete this moment">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>

          <div class="moment-body">
      `;

      if (momentParas.length === 0 && !isLiveThisMoment) {
        html += `<div style="font-size:11.5px; color:#64748b; font-style:italic;">No spoken paragraphs recorded in this moment yet.</div>`;
      } else {
        for (let i = 0; i < momentParas.length; i++) {
          const p = momentParas[i];
          if (filterQuery && !p.text.toLowerCase().includes(filterQuery)) continue;

          html += `
            <div class="doc-para-block">
              <span class="doc-para-time">${p.time}</span>
              <div class="doc-para-content">
                <p class="doc-para-text">${this.highlightText(this.escapeHtml(p.text), filterQuery)}</p>
                
                ${p.scriptures && p.scriptures.length > 0 ? `
                  <div class="doc-para-citations">
                    <span class="citation-label">Scriptures:</span>
                    ${p.scriptures.map(s => `<span class="citation-tag">${this.escapeHtml(s)}</span>`).join('')}
                  </div>
                ` : ''}

                ${p.concordance && p.concordance.length > 0 ? `
                  <div class="doc-para-citations concordance">
                    <span class="citation-label">Strong's:</span>
                    ${p.concordance.map(c => `<span class="citation-tag concordance" style="cursor:pointer;" onclick="if(window.openLexiconInspector)window.openLexiconInspector('${this.escapeHtml(c.id)}')">${c.id}: ${c.lemma} (${c.translit})</span>`).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }
      }

      // If this moment is actively recording, show live speech typing preview
      if (isLiveThisMoment && this.currentInterimText) {
        html += `
          <div class="doc-para-block interim" style="opacity:0.85; font-style:italic; border-left:2px solid #22c55e; padding-left:10px;">
            <span class="doc-para-time" style="color:#22c55e; font-weight:700;">LIVE</span>
            <div class="doc-para-content">
              <p class="doc-para-text" style="color:var(--txt, #f8fafc);">${this.escapeHtml(this.currentInterimText)} <span style="display:inline-block; width:6px; height:12px; background:#22c55e; vertical-align:middle; animation:blink 0.8s infinite;"></span></p>
            </div>
          </div>
        `;
      }

      html += `</div></div>`; // Close moment-body and sermon-moment-card
    }

    html += `</div>`; // Close .doc-sheet-article

    // ── Consolidated Scripture Appendix ──
    if (allScriptures.length > 0) {
      html += `
        <div class="doc-appendix-section">
          <div class="doc-appendix-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>All Referenced Scriptures in Service (${allScriptures.length})</span>
          </div>
          <div class="doc-appendix-list">
            ${allScriptures.map((sc, idx) => `
              <div class="doc-appendix-row">
                <span class="appendix-idx">${idx + 1}.</span>
                <span class="appendix-time">[${sc.time}]</span>
                <span class="appendix-ref">${this.escapeHtml(sc.reference)}</span>
                ${sc.text ? `<span class="appendix-snippet">"${this.escapeHtml(sc.text)}"</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (allConcordance.length > 0) {
      html += `
        <div class="doc-appendix-section">
          <div class="doc-appendix-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <span>Strong's Greek & Hebrew Terms Cited (${allConcordance.length})</span>
          </div>
          <div class="doc-appendix-list">
            ${allConcordance.map((c, idx) => `
              <div class="doc-appendix-row">
                <span class="appendix-idx">${idx + 1}.</span>
                <span class="appendix-time">[${c.time}]</span>
                <span class="appendix-ref">${c.id}: ${c.lemma} (${c.translit}, ${c.lang})</span>
                <span class="appendix-snippet">${this.escapeHtml(c.def)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`; // Close .sermon-article-stream
    listEl.innerHTML = html;

    const scrollContainer = document.getElementById('sermon-modal-scroll-area');
    if (scrollContainer && this.isRecordingSermon && !this.userScrolledUp) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  setSearchFilter(query) {
    this.searchFilter = query || '';
    this.syncModalUi();
  }

  highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background:var(--amber, #f2b93b);color:#131218;border-radius:3px;padding:0 2px;">$1</mark>');
  }

  openModal() {
    const modal = document.getElementById('sermon-transcript-modal-backdrop');
    if (modal) {
      modal.classList.add('open');
      this.syncModalUi();
    }
  }

  closeModal() {
    const modal = document.getElementById('sermon-transcript-modal-backdrop');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// Global instantiation
window.sermonManager = new SermonTranscriptManager();

// Automatically persist sermon transcript on tab close or page reload
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    if (window.sermonManager) {
      window.sermonManager.flushPendingUtterance();
      window.sermonManager.saveSession();
    }
  });
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && window.sermonManager) {
      window.sermonManager.saveSession();
    }
  });
}

// Global Keyboard Shortcuts (Alt+R = Toggle Sermon Recording, Alt+T = Open/Close Transcript Sessions)
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('keydown', (e) => {
    // Avoid triggering if inside an input/textarea
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) {
      return;
    }

    // Alt+R: Toggle Sermon Recording
    if (e.altKey && (e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (window.sermonManager) {
        window.sermonManager.toggleSermonRecording();
      }
      return;
    }

    // Alt+T: Toggle Sermon Transcript Modal
    if (e.altKey && (e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (window.sermonManager) {
        const modal = document.getElementById('sermon-transcript-modal-backdrop');
        if (modal && modal.classList.contains('open')) {
          window.sermonManager.closeModal();
        } else {
          window.sermonManager.openModal();
        }
      }
      return;
    }
  });
}
