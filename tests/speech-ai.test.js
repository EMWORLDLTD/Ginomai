'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const quotationMatcher = new (require('../js/quotation-index.js').QuotationIndex)(require('../bibles/KJV.json'),'KJV');
function harness(songs = []) {
  let now = Date.now(), timerId = 0;
  const timers = new Map();
  const tick = ms => {
    const target = now + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = target;
  };
  const context = vm.createContext({ window: {}, console: { warn() {} }, SONGS_DATABASE: songs,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/speech-ai.js'), 'utf8'), context);
  const verses = [], songsFound = [], paraphrases = [], transcripts = [];
  const engine = new context.window.SpeechAiEngine({
    quotationMatcher,
    getScriptureVerses: (book, chapter) => require('../bibles/KJV.json')[book]?.[chapter] || [],
    onVerseDetected: v => verses.push(v), onSongDetected: v => songsFound.push(v),
    onParaphraseDetected: v => paraphrases.push(v), onTranscript: (v, final) => transcripts.push({ v, final })
  });
  return { engine, verses, songsFound, paraphrases, transcripts, tick };
}

test('interim revisions stay visible without creating detections', () => {
  const h = harness();
  h.engine.processSpokenText('John 3:16', false);
  assert.equal(h.transcripts.length, 1);
  assert.equal(h.verses.length, 0);
  h.engine.processSpokenText('John 3:17', true);
  assert.equal(h.verses[0].rawReference, 'John 3:17');
});

test('numbered epistles, punctuation, and ranges are preserved', () => {
  for (const [input, expected] of [
    ['First John chapter three verse sixteen', '1 John 3:16'],
    ['2 John 1:6', '2 John 1:6'],
    ['John 3:16-18', 'John 3:16-18'],
    ['John chapter three verse sixteen.', 'John 3:16'],
    ['Psalm one hundred and nineteen verse twenty-one', 'Psalms 119:21'],
    ['Jude 5', 'Jude 1:5']
  ]) {
    const h = harness(); h.engine.simulateTranscript(input);
    assert.equal(h.verses[0]?.rawReference, expected, input);
  }
});

test('ordinary speech and invalid numbered epistles do not become references', () => {
  for (const input of ['This is one of our plans', 'I am two minutes late', 'John three people arrived', 'First John 20:2', 'John 3:18-16']) {
    const h = harness(); h.engine.simulateTranscript(input);
    assert.equal(h.verses.length, 0, input);
  }
});

test('chapter-only references are suggestions', () => {
  const h = harness(); h.engine.simulateTranscript('Romans chapter eight');
  assert.equal(h.verses.length, 0);
  h.tick(2499); assert.equal(h.verses.length, 0);
  h.tick(1);
  assert.equal(h.verses[0].rawReference, 'Romans 8');
  assert.equal(h.verses[0].autoProjectEligible, false);
});

test('chapter suggestions wait for continuation and retain complete verse detection', () => {
  const h = harness(); h.engine.simulateTranscript('Luke chapter one');
  h.tick(2000); assert.equal(h.verses.length, 0);
  h.engine.simulateTranscript('verse seventeen'); h.tick(3000);
  assert.deepEqual(h.verses.map(v => v.rawReference), ['Luke 1:17']);
  const p = harness(); p.engine.simulateTranscript('Romans chapter eight');
  p.tick(2000); p.engine.processSpokenText('verse twenty', false);
  p.tick(2000); assert.equal(p.verses.length, 0);
  p.engine.simulateTranscript('verse twenty eight'); p.tick(3000);
  assert.deepEqual(p.verses.map(v => v.rawReference), ['Romans 8:28']);
});

test('pending chapters cannot escape Stop, context reset or a replacement reference', () => {
  for (const action of [h => h.engine.stop(), h => h.engine.resetScriptureContext(),
    h => h.engine.simulateTranscript('John 3:99'), h => h.engine.simulateTranscript('John 3:16')]) {
    const h = harness(); h.engine.simulateTranscript('Romans chapter eight');
    action(h); h.tick(3000);
    assert.equal(h.verses.some(v => v.kind === 'chapter'), false);
  }
});

test('short or repeated worship vocabulary does not match songs', () => {
  const songs = [{ id: 'a', title: 'Amazing Grace', stanzas: [{ text: 'Amazing grace how sweet the sound\nThat saved a wretch like me' }] }];
  for (const input of ['grace', 'grace grace grace grace', 'how sweet', 'The Lord has mercy for every person today']) {
    const h = harness(songs); h.engine.simulateTranscript(input);
    assert.equal(h.songsFound.length, 0, input);
  }
  const h = harness(songs); h.engine.simulateTranscript('Amazing grace how sweet the sound');
  assert.equal(h.songsFound[0].songId, 'a');
  assert.equal(h.songsFound[0].autoProjectEligible, false);
});

test('paraphrases require corroboration and remain suggestions', () => {
  const h = harness(); h.engine.simulateTranscript('We talked about everlasting life');
  assert.equal(h.paraphrases.length, 0);
  h.engine.simulateTranscript('God so loved the world and gave his only begotten son');
  assert.equal(h.paraphrases[0].reference, 'John 3:16');
  assert.equal(h.paraphrases[0].autoProjectEligible, false);
});

test('delayed final transcript replaces provisional text without a timer commit', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/sermon-transcript.js'), 'utf8');
  const method = source.slice(source.indexOf('  addUtterance('), source.indexOf('  // Commit finalized speech'));
  const commits = [];
  const ctx = vm.createContext({ clearTimeout() {}, setTimeout() { throw Error('Must not finalize provisional speech on a timer'); } });
  const recorder = vm.runInContext(`({ isRecordingSermon: true, cleanSpeechStutter: s => s, ${method.trim()} })`, ctx);
  recorder.commitFinalUtterance = text => commits.push(text);
  recorder.addUtterance('John three sixteen', false);
  assert.equal(commits.length, 0);
  recorder.addUtterance('John three seventeen', true);
  assert.deepEqual(commits, ['John three seventeen']);
  assert.equal(recorder.currentInterimText, '');
});

test('invalid verse ranges neither project nor enter the sermon log', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const handler = source.slice(source.indexOf('function handleDetectedVerse('), source.indexOf('function handleDetectedSong('));
  const projected = [], logged = [];
  const ctx = vm.createContext({
    state: { bibleVersion: 'KJV', autoProject: true, aiDetectedVerses: [], aiSuggestions: [] },
    BIBLE_DATABASE: { KJV: {} }, getBibleBooks: () => ['John'],
    getBibleVerses: () => [{ verse: 35, text: 'Verse 35' }, { verse: 36, text: 'Verse 36' }],
    window: { sermonManager: { addScripture: v => logged.push(v) } },
    getAutoProjectionPolicy: () => ({offer:v=>{if(v.autoProjectEligible)projected.push(v);}}),
    renderAiHud() {}, broadcastSpeechAiUpdate() {}, projectDetectedVerse: v => projected.push(v)
  });
  vm.runInContext(handler, ctx);
  const verse = { book: 'John', chapter: 3, verse: 35, endVerse: 99, rawReference: 'John 3:35-99', confidence: 98, autoProjectEligible: true };
  ctx.handleDetectedVerse(verse);
  assert.equal(logged.length, 0); assert.equal(projected.length, 0);
  ctx.handleDetectedVerse({ ...verse, endVerse: 36, rawReference: 'John 3:35-36' });
  assert.equal(logged.length, 1); assert.equal(projected.length, 1);
  ctx.handleDetectedVerse({ ...verse, endVerse: null, rawReference: 'John 3:35', autoProjectEligible: false });
  assert.equal(projected.length, 1);
});

test('final segments assemble book, chapter, verse and unfinished range without interim effects', () => {
  for (const chunks of [['Luke chapter one','verse seventeen'],['John','three sixteen'],['John three','sixteen'],['John 3:16 through','eighteen']]) {
    const h=harness(); chunks.forEach(t=>h.engine.simulateTranscript(t));
    assert.equal(h.verses.at(-1).rawReference, chunks[0].startsWith('Luke') ? 'Luke 1:17' : chunks[0].includes('through') ? 'John 3:16-18' : 'John 3:16');
  }
  const h=harness();h.engine.processSpokenText('John 3:16',false);h.engine.simulateTranscript('verse ten');assert.equal(h.verses.length,0);
});

test('follow-up verses use current context, expire and reset at session boundaries',()=>{
 const h=harness();h.engine.simulateTranscript('James 4:7');h.engine.simulateTranscript('Now verse ten');
 assert.equal(h.verses.at(-1).rawReference,'James 4:10');assert.equal(h.verses.at(-1).autoProjectEligible,false);
 h.engine.scriptureContext.at=Date.now()-61000;const count=h.verses.length;h.engine.simulateTranscript('verse eleven');assert.equal(h.verses.length,count);
 h.engine.simulateTranscript('John 3:16');h.engine.resetScriptureContext();h.engine.simulateTranscript('verse eighteen');assert.equal(h.verses.at(-1).rawReference,'John 3:16');
});

test('multiple references follow spoken order; corrections suppress superseded same-utterance candidates',()=>{
 const h=harness();h.engine.simulateTranscript('Romans 8:28 and John 3:16');assert.deepEqual(h.verses.map(v=>v.rawReference),['Romans 8:28','John 3:16']);
 const c=harness();c.engine.simulateTranscript('John 3:16, no, verse seventeen');assert.deepEqual(c.verses.map(v=>v.rawReference),['John 3:17']);assert.equal(c.verses[0].autoProjectEligible,false);
 c.engine.simulateTranscript('Sorry eighteen');assert.equal(c.verses.at(-1).rawReference,'John 3:18');
 const r=harness();r.engine.simulateTranscript('John chapter three verses sixteen through eighteen');assert.equal(r.verses[0].rawReference,'John 3:16-18');
});

test('Bible validation rejects invalid full ranges and ordinary numerical speech',()=>{
 for(const text of ['John three sixteen year olds arrived','John 3:99','John 3:35-99','John 3:16 through bananas','John 3:16.5','Jude 26','First John 20:2','Mark three people arrived','This is forty three today']) {
  const h=harness();h.engine.simulateTranscript(text);assert.equal(h.verses.length,0,text);
 }
});

test('recognition confidence is distinct from match score; unverified or low-confidence results cannot auto-project',()=>{
 const h=harness();h.engine.processSpokenText('John 3:16',true,{recognitionConfidence:.42});
 assert.equal(h.verses[0].detectionScore,98);assert.equal(h.verses[0].recognitionConfidence,.42);assert.equal(h.verses[0].autoProjectEligible,false);
 h.engine.getScriptureVerses=()=>null;h.engine.simulateTranscript('Romans 8:28');assert.equal(h.verses.at(-1).validation,'unavailable');assert.equal(h.verses.at(-1).autoProjectEligible,false);
});

test('dangling verse markers assemble while expired fragments and invalid new chapters clear context',()=>{
 for(const first of ['John chapter three verse','John 3:']) {
  const h=harness();h.engine.simulateTranscript(first);assert.equal(h.verses.length,0);h.engine.simulateTranscript('sixteen');assert.equal(h.verses[0].rawReference,'John 3:16');
 }
 const h=harness();h.engine.simulateTranscript('John');h.engine.pendingReference.at=Date.now()-9000;h.engine.simulateTranscript('three sixteen');assert.equal(h.verses.length,0);
 h.engine.simulateTranscript('John 3:16');h.engine.simulateTranscript('Romans 99:1');h.engine.simulateTranscript('verse ten');assert.equal(h.verses.length,1);
});

test('chapter-only callbacks do not log or auto-project an invented verse',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 const handler=source.slice(source.indexOf('function handleDetectedVerse('),source.indexOf('function handleDetectedSong('));
 const ctx=vm.createContext({state:{bibleVersion:'KJV',autoProject:true,aiDetectedVerses:[],aiSuggestions:[]},BIBLE_DATABASE:{KJV:{}},
 getBibleBooks:()=>['Romans'],getBibleVerses:()=>[{verse:1,text:'Verse one'}],window:{sermonManager:{addScripture(){throw Error('chapter logged as verse');}}},
 getAutoProjectionPolicy:()=>({offer:v=>assert.equal(v.autoProjectEligible,false)}),renderAiHud(){},broadcastSpeechAiUpdate(){},projectDetectedVerse(){throw Error('chapter auto-projected');}});
 vm.runInContext(handler,ctx);ctx.handleDetectedVerse({book:'Romans',chapter:8,verse:null,kind:'chapter',rawReference:'Romans 8',autoProjectEligible:true,confidence:98});
 assert.equal(ctx.state.aiDetectedVerses[0].rawReference,'Romans 8');assert.equal(ctx.state.aiDetectedVerses[0].autoProjectEligible,false);
});
