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
  recorder.ensureDailySession = () => true;
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
  ctx.handleDetectedVerse({ ...verse, endVerse: 36, rawReference: 'John 3:35-36' });
  assert.equal(ctx.state.aiDetectedVerses[0].rawReference, 'John 3:35-36');
  assert.equal(ctx.state.aiDetectedVerses.length, 2);
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

test('same chapter recall survives a sermon pause and joined digits remain suggestions',()=>{
 const h=harness();h.engine.simulateTranscript('Matthew 1:21');h.tick(90000);
 h.engine.simulateTranscript('Let us think about what this means for us today');
 h.engine.simulateTranscript('Okay from that same chapter if you go back to verse seven');
 assert.equal(h.verses.at(-1).rawReference,'Matthew 1:7');
 h.engine.simulateTranscript('Matthew 121');
 assert.equal(h.verses.at(-1).rawReference,'Matthew 1:21');
 assert.equal(h.verses.at(-1).autoProjectEligible,false);
 const other=harness();other.engine.simulateTranscript('Matthew 121');
 assert.deepEqual(other.verses.map(v=>v.rawReference),['Matthew 1:21','Matthew 12:1']);
 assert(other.verses.every(v=>!v.autoProjectEligible));
});

test('merged references recover only when the number is not a valid literal chapter',()=>{
 const h=harness();h.engine.simulateTranscript('Revelation 52');
 assert.equal(h.verses.at(-1).rawReference,'Revelation 5:2');
 assert.equal(h.verses.at(-1).inferredReference,true);
 assert.equal(h.verses.at(-1).autoProjectEligible,false);
 h.engine.simulateTranscript('Mark 14');
 assert.equal(h.verses.length,1);
 h.tick(2600);assert.equal(h.verses.at(-1).rawReference,'Mark 14');
 assert.equal(h.verses.at(-1).autoProjectEligible,false);
 h.engine.simulateTranscript('verse three');assert.equal(h.verses.at(-1).rawReference,'Mark 14:3');
});
test('explicit chapters are not split, separated numbers stay explicit, and prose is rejected',()=>{
 const h=harness();h.engine.simulateTranscript('Mark chapter fourteen');h.tick(2600);
 assert.deepEqual(h.verses.map(v=>v.rawReference),['Mark 14']);
 h.engine.simulateTranscript('Mark one four');assert.equal(h.verses.at(-1).rawReference,'Mark 1:4');
 assert.equal(h.verses.at(-1).inferredReference,undefined);
 h.engine.simulateTranscript('Revelation five two');assert.equal(h.verses.at(-1).rawReference,'Revelation 5:2');
 const count=h.verses.length;h.engine.simulateTranscript('Mark 14 people arrived');h.engine.simulateTranscript('Revelation 50');h.tick(2600);
 assert.equal(h.verses.length,count);
});

test('OSOM complete references accept natural fillers, conjunctions and spoken colons',()=>{
 for(const [text,expected] of [
  ['With Romans chapter number six and verse seven he that is dead is freed from sin','Romans 6:7'],
  ['To some Jewish folks in John chapter number five and thirty nine he said to them yes such the scriptures','John 5:39'],
  ['Daniel chapter number 12 and verse three, saying the same thing.','Daniel 12:3'],
  ['Because in Ephesians five and eighteen Paul gave that as an instruction','Ephesians 5:18'],
  ['Like in Romans one:one it says called','Romans 1:1'],
  ['The word spodazo. 2Timothy four:nine, Ruth.','2 Timothy 4:9'],
  ['From first Peter five and two yesterday','1 Peter 5:2']
 ]){const h=harness();h.engine.simulateTranscript(text);assert.deepEqual(h.verses.filter(v=>v.kind==='verse').map(v=>v.rawReference),[expected],text);}
});

test('verse-first and chapter-first inverse references retain their numbers',()=>{
 for(const [text,expected] of [
  ['They prayed in verse 31 of Acts chapter four. When they had prayed','Acts 4:31'],
  ['Read from verse one of Romans chapter six','Romans 6:1'],
  ['Verses two through four of Romans chapter six','Romans 6:2-4']
 ]){const h=harness();h.engine.simulateTranscript(text);assert.equal(h.verses[0]?.rawReference,expected,text);}
 const h=harness();h.engine.simulateTranscript('The local church. In chapter three of second Timothy,');h.tick(14000);
 h.engine.simulateTranscript('Verse 14 the same Paul to Timothy is, but continue thou in the things which thou has learned');
 assert.equal(h.verses.at(-1).rawReference,'2 Timothy 3:14');assert.equal(h.verses.at(-1).autoProjectEligible,false);
});

test('unfinished OSOM references wait without emitting guessed verses',()=>{
 for(const [first,last,expected] of [
  ['Genesis 18 and verse','19 God vowed for him. God said I know him','Genesis 18:19'],
  ['Solomon in Proverbs chapter number 11 and verse','30 says, the fruit of the righteous is a tree of life','Proverbs 11:30'],
  ['John chapter number five and','thirty nine','John 5:39']
 ]){const h=harness();h.engine.simulateTranscript(first);h.tick(5000);assert.equal(h.verses.length,0,first);h.engine.simulateTranscript(last);assert.equal(h.verses[0]?.rawReference,expected,first);}
});

test('valid chapter mentions do not invent chapter and verse splits',()=>{
 for(const [text,expected] of [
  ['Matthew 19 Again I will start from verse one.','Matthew 19:1'],
  ['So they quoted Deuteronomy 24 from verse one.','Deuteronomy 24:1'],
  ['In Matthew 21 and verse 16. This happened in the temple','Matthew 21:16']
 ]){const h=harness();h.engine.simulateTranscript(text);assert.deepEqual(h.verses.filter(v=>v.kind==='verse').map(v=>v.rawReference),[expected],text);}
 for(const text of ['Genesis 18','Matthew 19','First Corinthians 15','John 16','From John 21 we just jump to Romans one.']){
  const h=harness();h.engine.simulateTranscript(text);h.tick(3000);assert(h.verses.length>0,text);assert(h.verses.every(v=>v.kind==='chapter'&&!v.autoProjectEligible),text);
 }
 const h=harness();h.engine.simulateTranscript('John111');assert.deepEqual(h.verses.map(v=>v.rawReference),['John 1:11','John 11:1']);assert(h.verses.every(v=>!v.autoProjectEligible));
});

test('ordinary sermon words preserve active and pending scripture context',()=>{
 const h=harness();h.engine.simulateTranscript('John 3:16');
 h.engine.simulateTranscript('The word of God is life and he who seeks life receives revelation');
 h.engine.simulateTranscript('Verse seventeen is clear');assert.equal(h.verses.at(-1).rawReference,'John 3:17');
 h.engine.simulateTranscript('The vision is the same and the mission is the same.');
 h.engine.simulateTranscript('In verse eighteen');assert.equal(h.verses.at(-1).rawReference,'John 3:18');
 const p=harness();p.engine.simulateTranscript('Romans chapter eight');p.tick(1000);p.engine.simulateTranscript('He is speaking about revelation');p.tick(1600);
 assert.equal(p.verses[0]?.rawReference,'Romans 8');
});

test('consecutive verse calls and adjacent verse lists follow spoken order',()=>{
 for(const [text,expected] of [
  ['Ephesians three verse one verse two if ye have heard. The dispensation of the grace of God. Which is given me to you what',['Ephesians 3:1','Ephesians 3:2']],
  ['John 3:16 verse seventeen',['John 3:16','John 3:17']],
  ['John 3:16 and seventeen verse eighteen',['John 3:16','John 3:17','John 3:18']],
  ['Second Corinthians three five and six. So',['2 Corinthians 3:5','2 Corinthians 3:6']],
  ['Matthew chapter nineteen verses four, five, and six',['Matthew 19:4','Matthew 19:5','Matthew 19:6']]
 ]){const h=harness();h.engine.simulateTranscript(text);assert.deepEqual(h.verses.filter(v=>v.kind==='verse').map(v=>v.rawReference),expected,text);}
});

test('reading cues recover contextual numbers but ordinary counts do not',()=>{
 const h=harness();h.engine.simulateTranscript('John seven verse 38');h.tick(4000);h.engine.simulateTranscript('Scripture has said out of his belly shall flow rivers');h.tick(4000);
 h.engine.simulateTranscript('Of living water. And 39, John now explained that this spake he');assert.equal(h.verses.at(-1).rawReference,'John 7:39');assert.equal(h.verses.at(-1).autoProjectEligible,false);
 h.engine.simulateTranscript('And 40 people came');h.engine.simulateTranscript('15 people now came');h.engine.simulateTranscript('There are 41 days remaining');assert.equal(h.verses.length,2);
 const p=harness();p.engine.simulateTranscript('John chapter three');p.engine.simulateTranscript('15 now says that whosoever believeth');assert.equal(p.verses.at(-1).rawReference,'John 3:15');assert.equal(p.verses.at(-1).autoProjectEligible,false);
});

test('explicit returns retain bounded chapter recall without reviving expired context',()=>{
 const h=harness();h.engine.simulateTranscript('2 Timothy 4:9');h.tick(90000);h.engine.simulateTranscript('Look at verse twenty one');assert.equal(h.verses.at(-1).rawReference,'2 Timothy 4:9');
 h.engine.simulateTranscript('Go back to verse twenty one');assert.equal(h.verses.at(-1).rawReference,'2 Timothy 4:21');assert.equal(h.verses.at(-1).autoProjectEligible,false);
 h.tick(10*60*1000+1);h.engine.simulateTranscript('Go back to verse nine');assert.equal(h.verses.at(-1).rawReference,'2 Timothy 4:21');
});

test('assembled references preserve confidence from all finalized evidence',()=>{
 const h=harness();h.engine.processSpokenText('John three',true,{recognitionConfidence:.4});h.tick(1000);h.engine.processSpokenText('sixteen',true,{recognitionConfidence:.99});
 assert.equal(h.verses[0].recognitionConfidence,.4);assert.equal(h.verses[0].autoProjectEligible,false);
 h.engine.processSpokenText('John 3:17',true,{recognitionConfidence:.99});assert.equal(h.verses.at(-1).recognitionConfidence,.99);assert.equal(h.verses.at(-1).autoProjectEligible,true);
 const p=harness();p.engine.processSpokenText('Proverbs chapter number eleven and verse',true,{recognitionConfidence:.55});p.tick(5000);p.engine.processSpokenText('thirty',true,{recognitionConfidence:.97});assert.equal(p.verses[0].recognitionConfidence,.55);assert.equal(p.verses[0].autoProjectEligible,false);
});

test('new grammar still rejects invalid references, malformed tails and numerical prose',()=>{
 for(const text of ['Romans chapter number 99 and verse one','Daniel chapter number twelve and verse 99','John three and sixteen year olds arrived','Ephesians five and eighteen people','John chapter three verses eighteen through sixteen','Verse 99 of Acts chapter four','John 3:16 verse bananas']){
  const h=harness();h.engine.simulateTranscript(text);h.tick(3000);assert.equal(h.verses.length,0,text);
 }
 const h=harness();h.engine.simulateTranscript('John 3:16');h.engine.simulateTranscript('Acts chapter number 99');h.engine.simulateTranscript('verse seventeen');assert.equal(h.verses.length,1);
 const p=harness();p.engine.simulateTranscript('Genesis 18 and verse');p.tick(9000);p.engine.simulateTranscript('nineteen');assert.equal(p.verses.length,0);
});
