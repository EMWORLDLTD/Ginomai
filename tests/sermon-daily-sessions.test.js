'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.TZ = 'Africa/Lagos';
const source = fs.readFileSync(path.join(__dirname, '../js/sermon-transcript.js'), 'utf8');

function harness(initial = {}, start = '2026-10-09T10:00:00+01:00', remote = false) {
  let now = Date.parse(start), timer;
  const storage = new Map(Object.entries(initial)), toasts = [], downloads = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const context = vm.createContext({
    Date: Clock, Intl, console, localStorage, clearTimeout(){}, clearInterval(){},
    setInterval(callback) { timer = callback; return 1; }, setTimeout(callback) { callback(); },
    window: { isRemoteOperator: remote, showToast: (...args) => toasts.push(args), showCustomConfirm: async () => true },
    Blob, URL: {createObjectURL: () => 'blob:transcript', revokeObjectURL(){}},
    document: {
      getElementById: () => null,
      createElement: () => ({click() { downloads.push(this.download); }}),
      body: {appendChild(){}, removeChild(){}}
    }
  });
  vm.runInContext(source.slice(0, source.indexOf('// Global instantiation')) + '\nglobalThis.Manager = SermonTranscriptManager;', context);
  const manager = new context.Manager();
  const advance = date => { now = Date.parse(date); };
  return {manager, storage, toasts, downloads, localStorage, window: context.window, advance, tick: () => timer(),
    saved: () => JSON.parse(storage.get(manager.historyKey) || '[]')};
}

test('opening, saving, or leaving the app idle does not persist an automatic empty session', () => {
  const h = harness();
  h.manager.saveSession(); h.tick();
  h.advance('2026-10-12T10:00:00+01:00'); h.tick(); h.manager.saveSession();
  assert.equal(h.saved().length, 0);
  assert.equal(h.storage.has(h.manager.storageKey), false);
});

test('successful AI use creates one session per local day, including use without recording', () => {
  const h = harness();
  h.manager.setAiListening(true);
  const first = h.manager.session;
  h.manager.recordAiTranscript('The first day', true);
  h.manager.recordAiTranscript('More words', true);
  assert.equal(h.manager.getWordCount(), 5);
  assert.equal(h.saved().length, 1);
  h.advance('2026-10-10T00:00:01+01:00'); h.tick();
  h.manager.recordAiTranscript('The second day', true);
  assert.equal(h.manager.session.dayKey, '2026-10-10');
  assert.equal(h.saved().length, 2);
  assert.equal(first.transcriptLog.length, 2);
  assert.equal(first.isActive, false);
  assert.equal(h.manager.session.transcriptLog[0].text, 'The second day');
});

test('stopping AI before midnight skips inactive days; reload preserves yesterday unchanged', () => {
  const h = harness(); h.manager.setAiListening(true);
  h.manager.recordAiTranscript('Saved yesterday', true); h.manager.setAiListening(false);
  const firstId = h.manager.session.id;
  h.advance('2026-10-12T11:00:00+01:00'); h.tick();
  assert.equal(h.saved().length, 1);
  const reopened = harness(Object.fromEntries(h.storage), '2026-10-12T11:00:00+01:00');
  assert.equal(reopened.manager.session.id, firstId);
  reopened.manager.setAiListening(true);
  assert.equal(reopened.saved().length, 2);
  assert.equal(reopened.manager.session.dayKey, '2026-10-12');
  assert.equal(reopened.saved().find(s => s.id === firstId).transcriptLog[0].text, 'Saved yesterday');
});

test('recording crosses midnight without stopping and flushes pending words into the previous day once', () => {
  const h = harness({}, '2026-10-09T23:59:58+01:00');
  h.manager.toggleSermonRecording();
  const previous = h.manager.session, oldMoment = h.manager.activeRecordingMoment;
  h.manager.addUtterance('Before midnight', false);
  h.advance('2026-10-10T00:00:01+01:00'); h.tick();
  assert.equal(h.manager.isRecordingSermon, true);
  assert.equal(oldMoment.isRecording, false);
  assert.equal(oldMoment.endTimestamp, Date.parse('2026-10-10T00:00:00+01:00'));
  assert.equal(oldMoment.durationSeconds, 2);
  assert.equal(oldMoment.paragraphs.length, 1);
  assert.equal(oldMoment.paragraphs[0].text, 'Before midnight');
  assert.equal(h.manager.activeRecordingMoment.startTimestamp, oldMoment.endTimestamp);
  assert.equal(h.manager.activeRecordingMoment.durationSeconds, 1);
  h.manager.addUtterance('After midnight', true);
  assert.equal(h.manager.session.paragraphs[0].text, 'After midnight');
  assert.equal(previous.paragraphs.length, 1);
  assert.equal(h.saved().length, 2);
});

test('stopping just after midnight does not commit pending words twice', () => {
  const h = harness({}, '2026-10-09T23:59:58+01:00');
  h.manager.toggleSermonRecording(); const previous = h.manager.session;
  h.manager.addUtterance('The last words', false);
  h.advance('2026-10-10T00:00:01+01:00'); h.manager.toggleSermonRecording();
  assert.equal(previous.paragraphs.length, 1);
  assert.equal(h.manager.session.paragraphs.length, 0);
  assert.equal(h.manager.isRecordingSermon, false);
});

test('viewing a previous session permits export, and new activity returns to the existing current day', () => {
  const h = harness(); h.manager.recordAiTranscript('Old words', true);
  const previous = h.manager.session;
  h.advance('2026-10-10T10:00:00+01:00'); h.manager.setAiListening(true);
  const today = h.manager.session;
  h.manager.switchSession(previous.id); h.tick();
  assert.equal(h.manager.session.id, previous.id);
  h.manager.downloadTxt();
  assert.match(h.downloads[0], /2026-10-09\.txt$/);
  h.manager.recordAiTranscript('New words', true);
  assert.equal(h.manager.session.id, today.id);
  assert.equal(previous.transcriptLog.length, 1);
  assert.equal(h.saved().length, 2);
});

test('recording after selecting archived history cannot append to the old day', () => {
  const h = harness(); h.manager.recordAiTranscript('Old words', true);
  const previous = h.manager.session;
  h.advance('2026-10-10T10:00:00+01:00'); h.manager.toggleSermonRecording();
  h.manager.addUtterance('Today sermon', true);
  assert.equal(previous.recordings.length, 0);
  assert.equal(h.manager.session.dayKey, '2026-10-10');
});

test('legacy history retains its content and separates future activity by local date', () => {
  const legacy = {id:'legacy', title:'Original service', speaker:'Pastor', isActive:true,
    startTimestamp:Date.parse('2026-10-08T23:30:00+01:00'), paragraphs:[{text:'Legacy words', time:'11:30 PM'}]};
  const h = harness({sf_sermon_transcript_session: JSON.stringify(legacy)});
  h.manager.toggleSermonRecording(); h.manager.addUtterance('New day', true);
  assert.equal(h.saved().length, 2);
  assert.equal(h.saved().find(s => s.id === 'legacy').paragraphs[0].text, 'Legacy words');
});

test('exports contain full local dates, seconds and timezone for recordings, logs and scripture', () => {
  const h = harness(); h.manager.recordAiTranscript('AI only words', true);
  h.manager.toggleSermonRecording(); h.manager.addUtterance('Recorded words', true);
  h.manager.addScripture({reference:'John 3:16', text:'For God so loved the world'});
  const txt = h.manager.generateTxt(), momentTxt = h.manager.generateMomentTxt(h.manager.activeRecordingMoment);
  for (const text of [txt, momentTxt]) {
    assert.match(text, /2026/); assert.match(text, /10:00:00/); assert.match(text, /GMT\+1|WAT/);
    assert.match(text, /John 3:16/); assert.match(text, /Recorded words/);
  }
  assert.match(txt, /AI only words/);
  h.advance('2026-10-11T10:00:00+01:00'); h.manager.downloadMomentTxt(h.manager.activeRecordingMoment.id);
  assert.match(h.downloads[0], /2026-10-09\.txt$/);
});

test('deleting the last session does not resurrect it or leave a live recording reference', async () => {
  const h = harness(); h.manager.toggleSermonRecording();
  h.manager.addUtterance('Delete these words', true);
  h.manager.currentInterimText = 'Pending words';
  const originalId = h.manager.session.id;
  await h.manager.confirmDeleteSession(originalId);
  assert.equal(h.manager.isRecordingSermon, false);
  assert.equal(h.manager.activeRecordingMoment, null);
  assert.equal(h.saved().length, 0);
  const reopened = harness(Object.fromEntries(h.storage));
  assert.equal(reopened.manager.sessions.length, 0);
  assert.notEqual(reopened.manager.session.id, originalId);
});

test('remote operators never create their own daily sessions', () => {
  const h = harness({}, '2026-10-09T23:59:58+01:00', true);
  h.manager.setAiListening(true);
  h.advance('2026-10-10T00:00:01+01:00'); h.tick();
  h.manager.recordAiTranscript('Remote text', true);
  assert.equal(h.saved().length, 0);
});

test('deleting a live moment stops recording and does not recreate its consolidated transcript', async () => {
  const h = harness(); h.manager.toggleSermonRecording();
  const id = h.manager.activeRecordingMoment.id;
  h.manager.recordAiTranscript('Remove me', true);
  h.manager.addUtterance('Remove me', true);
  await h.manager.deleteMoment(id);
  assert.equal(h.manager.activeRecordingMoment, null);
  assert.equal(h.manager.isRecordingSermon, false);
  assert.equal(h.manager.getAllParagraphs().length, 0);
  assert.equal(h.saved()[0].recordings.length, 0);
  assert.equal(h.saved()[0].transcriptLog.length, 0);
});

test('reload closes a previously live moment at its saved duration without resuming recording', () => {
  const h = harness(); h.manager.toggleSermonRecording();
  h.advance('2026-10-09T10:00:05+01:00'); h.tick(); h.manager.saveSession();
  const reopened = harness(Object.fromEntries(h.storage), '2026-10-10T10:00:00+01:00');
  const moment = reopened.manager.session.recordings[0];
  assert.equal(reopened.manager.isRecordingSermon, false);
  assert.equal(moment.isRecording, false);
  assert.equal(moment.endTimestamp, Date.parse('2026-10-09T10:00:05+01:00'));
  assert.doesNotMatch(reopened.manager.generateTxt(), /Recording\.\.\./);
});

test('storage failures are visible and do not send new-day speech into archived history', () => {
  const h = harness(); h.manager.recordAiTranscript('Preserve me', true);
  const previous = h.manager.session;
  h.localStorage.setItem = () => {throw Error('Quota exceeded');};
  h.advance('2026-10-10T10:00:00+01:00');
  h.manager.recordAiTranscript('Cannot save', true);
  assert.equal(previous.transcriptLog.length, 1);
  assert.equal(h.toasts.length, 1);
  assert.match(h.toasts[0][0], /could not be saved/);
});

test('scripture detected before recording remains in session history and exports', () => {
  const h = harness(); h.manager.addScripture({reference:'Psalm 23:1'});
  h.manager.toggleSermonRecording();
  h.manager.addScripture({reference:'John 3:16'});
  assert.equal(h.manager.getAllScriptures().length, 2);
  assert.match(h.manager.generateTxt(), /Psalm 23:1/);
});

test('concordance extracted from pending speech at midnight retains the previous day timestamp', () => {
  const h = harness({}, '2026-10-09T23:59:58+01:00');
  // Inject the same optional concordance detector used by the application.
  h.window.detectConcordanceTerms = () => [{id:'G26', lemma:'agape'}];
  h.manager.toggleSermonRecording(); const previous = h.manager.session;
  h.manager.addUtterance('Love', false);
  h.advance('2026-10-10T00:00:01+01:00'); h.tick();
  assert.equal(previous.concordance[0].timestamp, Date.parse('2026-10-09T23:59:59.999+01:00'));
});
