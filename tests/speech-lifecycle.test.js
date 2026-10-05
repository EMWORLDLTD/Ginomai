'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const speechSource = fs.readFileSync(path.join(root, 'js/speech-ai.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function stream() {
  const track = { stopped: false, stop() { this.stopped = true; }, onended: null };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}
function harness(options = {}) {
  let now = 100000, timerId = 0;
  const timers = new Map(), sockets = [], recorders = [], recognizers = [], streams = [], statuses = [], transcripts = [];
  const schedule = (fn, delay, interval = 0) => { const id=++timerId; timers.set(id,{fn,time:now+delay,interval}); return id; };
  const tick = ms => {
    const target = now + ms;
    for (;;) {
      const next = [...timers].filter(([,t]) => t.time <= target).sort((a,b) => a[1].time-b[1].time)[0];
      if (!next) break;
      const [id,t] = next; now=t.time;
      if (t.interval) t.time += t.interval; else timers.delete(id);
      t.fn();
    }
    now=target;
  };
  class Socket {
    static OPEN = 1;
    constructor(url, protocols) { this.url=url; this.protocols=protocols; this.readyState=0; this.bufferedAmount=0; this.sent=[]; sockets.push(this); }
    open() { this.readyState=1; this.onopen?.(); }
    message(data) { this.onmessage?.({data:JSON.stringify(data)}); }
    send(data) { if (this.readyState!==1) throw Error('closed'); this.sent.push(data); }
    close() { this.readyState=3; this.onclose?.({code:1000}); }
    drop(code=1006) { this.readyState=3; this.onclose?.({code}); }
  }
  class Recorder {
    static isTypeSupported() { return !options.unsupported; }
    constructor(input) { this.stream=input; this.state='inactive'; recorders.push(this); }
    start() { this.state='recording'; }
    stop() { this.state='inactive'; }
    chunk() { this.ondataavailable?.({data:{size:250}}); }
  }
  class Recognition {
    constructor() { recognizers.push(this); }
    start() { this.started=true; }
    abort() { this.aborted=true; this.onend?.(); }
    result(text, final=true) { this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:final})]}); }
  }
  const context = vm.createContext({
    window:{ SpeechRecognition: options.noNative ? undefined : Recognition, AudioContext: options.AudioContext },
    navigator:{mediaDevices:{getUserMedia:options.getUserMedia || (async () => { const s=stream(); streams.push(s); return s; })}},
    WebSocket:Socket, MediaRecorder:Recorder, URLSearchParams, TextEncoder,
    Date:class extends Date { static now() { return now; } },
    setTimeout:(fn,ms)=>schedule(fn,ms), clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>schedule(fn,ms,ms), clearInterval:id=>timers.delete(id),
    console:{warn(){}}, state:options.state || {}, SONGS_DATABASE:options.songs || []
  });
  vm.runInContext(speechSource,context);
  const engine = new context.window.SpeechAiEngine({onStatusChange:s=>statuses.push(s),onTranscript:(text,final)=>transcripts.push({text,final})});
  engine.deepgramApiKey='test-key';
  return {engine,context,tick,timers,sockets,recorders,recognizers,streams,statuses,transcripts};
}
async function connected(h) { h.engine.start(); await settle(); h.sockets.at(-1).open(); }
function result(text='The sermon continues', final=true) { return {type:'Results',is_final:final,channel:{alternatives:[{transcript:text}]}}; }

test('startup only becomes listening after the socket and recorder are ready; stop releases resources', async () => {
  const h=harness(); h.engine.start();
  assert.equal(h.statuses.at(-1).status,'connecting'); assert.equal(h.statuses.at(-1).isListening,false);
  await settle(); h.sockets[0].open();
  assert.equal(h.statuses.at(-1).status,'listening');
  h.recorders[0].chunk(); assert.equal(h.sockets[0].sent[0].size,250);
  h.engine.stop();
  assert.equal(h.statuses.at(-1).isRequested,false); assert.equal(h.streams[0].track.stopped,true);
  assert.equal(h.recorders[0].state,'inactive'); assert.equal(h.timers.size,0);
});

test('stop during microphone permission prevents a late capture from connecting', async () => {
  const pending=deferred(), captured=stream(); const h=harness({getUserMedia:()=>pending.promise});
  h.engine.start(); h.engine.stop(); pending.resolve(captured); await settle();
  assert.equal(captured.track.stopped,true); assert.equal(h.sockets.length,0); assert.equal(h.engine.connectionState,'idle');
});

test('overlapping device changes release late streams without touching the newest session', async () => {
  const pending=[deferred(),deferred(),deferred()]; let index=0;
  const h=harness({getUserMedia:()=>pending[index++].promise});
  h.engine.start(); h.engine.setAudioDeviceId('second'); h.engine.setAudioDeviceId('third');
  const newest=stream(); pending[2].resolve(newest); await settle(); h.sockets[0].open();
  const oldA=stream(),oldB=stream(); pending[0].resolve(oldA); pending[1].resolve(oldB); await settle();
  assert.equal(oldA.track.stopped,true); assert.equal(oldB.track.stopped,true); assert.equal(newest.track.stopped,false);
  assert.equal(h.sockets.length,1); assert.equal(h.engine.connectionState,'listening');
  h.engine.stop(); h.tick(10000); await settle(); assert.equal(h.sockets.length,1);
});

test('late socket messages, close events and recorder data cannot act on a replacement session', async () => {
  const h=harness(); await connected(h);
  const old=h.sockets[0], message=old.onmessage, close=old.onclose, data=h.recorders[0].ondataavailable;
  h.engine.setAudioDeviceId('new-mic'); await settle(); const current=h.sockets[1]; current.open();
  message({data:JSON.stringify(result('John 3:16'))}); close({code:1006}); data({data:{size:500}});
  assert.equal(h.transcripts.length,0); assert.equal(current.sent.length,0);
  assert.equal(h.recorders[1].state,'recording'); assert.equal(h.engine.connectionState,'listening');
});

test('stop cancels a scheduled reconnect and repeated starts are idempotent', async () => {
  const h=harness(); await connected(h); h.engine.start(); assert.equal(h.sockets.length,1);
  h.sockets[0].drop(); assert.equal(h.engine.connectionState,'reconnecting');
  h.engine.stop(); h.tick(60000); await settle();
  assert.equal(h.sockets.length,1); assert.equal(h.engine.isListening,false); assert.equal(h.timers.size,0);
});

test('reconnect opens a new recorder with a fresh container stream', async () => {
  const h=harness(); await connected(h); h.sockets[0].drop(); h.tick(1000); await settle(); h.sockets[1].open();
  assert.equal(h.recorders.length,2); assert.equal(h.recorders[0].state,'inactive');
  h.recorders[1].chunk(); h.sockets[1].message(result());
  assert.equal(h.transcripts.length,1); assert.equal(h.engine.reconnectAttempts,0);
});

test('repeated connection failures stop after a bounded retry budget', async () => {
  const h=harness(); h.engine.start(); await settle();
  for (let attempt=0;attempt<7;attempt++) {
    h.sockets.at(-1).drop();
    if (attempt<6) { h.tick(Math.min(30000,1000*2**attempt)); await settle(); }
  }
  assert.equal(h.sockets.length,7); assert.equal(h.engine.connectionState,'error');
  assert.equal(h.engine.isListening,false); assert.equal(h.timers.size,0);
});

test('a connection that never opens times out and a rejected request stops with an error', async () => {
  const h=harness(); h.engine.start(); await settle(); h.tick(15000);
  assert.equal(h.engine.connectionState,'reconnecting'); h.tick(1000); await settle();
  h.sockets[1].open(); h.sockets[1].message({type:'Error',description:'bad request'});
  assert.equal(h.engine.connectionState,'error'); assert.equal(h.engine.isListening,false);
  assert.equal(h.timers.size,0);
});

test('permission denial is terminal and does not retry with a different microphone', async () => {
  let calls=0; const h=harness({getUserMedia:async()=>{calls++;throw Object.assign(Error('denied'),{name:'NotAllowedError'});}});
  h.engine.start(); await settle(); assert.equal(calls,1); assert.equal(h.engine.connectionState,'error');
  assert.equal(h.engine.isListening,false); assert.equal(h.sockets.length,0);
});

test('stop while AudioContext resumes closes its resources and prevents connection', async () => {
  const pending=deferred(),contexts=[];
  class AudioContext { constructor(){this.state='suspended';contexts.push(this);} resume(){return pending.promise;} close(){this.closed=true;return Promise.resolve();} }
  const h=harness({AudioContext}); h.engine.start(); await settle(); h.engine.stop(); pending.resolve(); await settle();
  assert.equal(contexts[0].closed,true); assert.equal(h.streams[0].track.stopped,true); assert.equal(h.sockets.length,0);
});

test('unsupported recording format leaves neither a live indicator nor an open stream', async () => {
  const h=harness({unsupported:true}); await connected(h);
  assert.equal(h.engine.connectionState,'error'); assert.equal(h.streams[0].track.stopped,true); assert.equal(h.timers.size,0);
});

test('KeepAlive is a text frame after idle upload, not sent in addition to regular audio', async () => {
  const h=harness(); await connected(h); h.tick(3000);
  assert.ok(h.sockets[0].sent.includes('{"type":"KeepAlive"}'));
  const count=h.sockets[0].sent.filter(x=>typeof x==='string').length;
  for(let i=0;i<12;i++){h.recorders[0].chunk();h.tick(250);}
  assert.equal(h.sockets[0].sent.filter(x=>typeof x==='string').length,count);
});

test('silence does not trigger recovery, but sustained fresh activity without transcription does', async () => {
  const h=harness(); await connected(h); h.tick(120000); assert.equal(h.engine.connectionState,'listening');
  h.engine.setAudioActivity(true); h.tick(60000); assert.equal(h.engine.connectionState,'listening','stale meter signal is ignored');
  for(let i=0;i<47;i++){h.engine.setAudioActivity(true);h.tick(1000);}
  assert.equal(h.engine.connectionState,'reconnecting');
});

test('transcription progress resets the stalled-speech window', async () => {
  const h=harness(); await connected(h);
  for(let i=0;i<80;i++){
    h.engine.setAudioActivity(true);if(i%20===0)h.sockets[0].message(result());h.tick(1000);
  }
  assert.equal(h.engine.connectionState,'listening'); assert.equal(h.sockets.length,1);
});

test('native recognition is session-owned and reports permission and unsupported failures', () => {
  const h=harness();h.engine.provider='native';h.engine.start(); const old=h.recognizers[0];old.onstart();
  const oldResult=old.onresult,oldEnd=old.onend;h.engine.stop();h.engine.start();h.recognizers[1].onstart();
  oldResult({resultIndex:0,results:[Object.assign([{transcript:'John 3:16'}],{isFinal:true})]});oldEnd();
  assert.equal(h.transcripts.length,0); assert.equal(h.engine.connectionState,'listening');
  h.recognizers[1].onerror({error:'not-allowed'});assert.equal(h.engine.connectionState,'error');
  const unsupported=harness({noNative:true});unsupported.engine.provider='native';unsupported.engine.start();
  assert.equal(unsupported.engine.isListening,false);assert.equal(unsupported.engine.connectionState,'error');
});

test('native automatic restarts are cancellable and provider switches invalidate old events', async () => {
  const h=harness();h.engine.provider='native';h.engine.start();h.recognizers[0].onstart();
  h.recognizers[0].onend();h.engine.stop();h.tick(300);assert.equal(h.recognizers.length,1);
  h.engine.start(); const oldEnd=h.recognizers[1].onend;
  h.engine.setProviderConfig({provider:'deepgram'});await settle();h.sockets[0].open();oldEnd();
  assert.equal(h.engine.connectionState,'listening');assert.equal(h.recognizers[1].aborted,true);
});

test('Nova-3 uses plain deduplicated keyterms with a bounded prompt; Nova-2 caps weighted keywords', () => {
  const songs=Array.from({length:40},(_,i)=>({title:`Library song ${i}`}));
  const h=harness({songs,state:{agendaItems:songs.map(s=>({...s,type:'song'}))}});
  h.engine.churchCustomTerms='  Koinonia, koinonia, John:3, café; Grace\nGrace, Dunamis, Rhema, Shalom';
  h.engine.deepgramModel='nova-3';let params=h.engine.buildDeepgramParams(),terms=params.getAll('keyterm');
  assert.equal(params.getAll('keywords').length,0);assert.equal(terms[0],'Koinonia');
  assert.equal(terms.filter(t=>t.toLowerCase()==='john').length,1);assert.ok(terms.every(t=>!/:\d/.test(t)));
  assert.ok(terms.length<=50);assert.ok(terms.reduce((n,t)=>n+new TextEncoder().encode(t).length+1,0)<=450);
  h.engine.deepgramModel='nova-2';params=h.engine.buildDeepgramParams();terms=params.getAll('keywords');
  assert.equal(params.getAll('keyterm').length,0);assert.equal(terms.length,100);
  assert.equal(new Set(terms.map(t=>t.toLowerCase())).size,100);assert.ok(terms.every(t=>t.endsWith(':1')));
});

test('changing the selected model restarts the live connection with new parameters', async () => {
  const h=harness();h.engine.deepgramModel='nova-2';await connected(h);
  assert.equal(new URL(h.sockets[0].url).searchParams.get('model'),'nova-2');
  h.engine.setProviderConfig({deepgramModel:'nova-2'});await settle();
  assert.equal(h.sockets.length,1,'Selecting the current model must preserve the live session');
  assert.equal(h.sockets[0].readyState,1);
  h.engine.setProviderConfig({deepgramModel:'nova-3'});await settle();
  assert.equal(h.sockets[0].readyState,3);assert.equal(h.streams[0].track.stopped,true);
  assert.equal(new URL(h.sockets[1].url).searchParams.get('model'),'nova-3');
  h.sockets[1].open();assert.equal(h.engine.connectionState,'listening');
  h.engine.stop();h.tick(60000);assert.equal(h.engine.isListening,false);
});

function recordingHarness() {
  const source=fs.readFileSync(path.join(root,'js/sermon-transcript.js'),'utf8');
  const context=vm.createContext({window:{},clearTimeout(){}});
  vm.runInContext(source.slice(0,source.indexOf('// Global instantiation'))+'\nglobalThis.Manager = SermonTranscriptManager;',context);
  const manager=Object.create(context.Manager.prototype),saved=[];
  const moment={id:'recording',title:'Teaching',isRecording:true,paragraphs:[],scriptures:[],concordance:[]};
  const session={id:'service',title:'Service',recordings:[moment],paragraphs:[]};
  Object.assign(manager,{session,sessions:[session],isRecordingSermon:true,activeRecordingMoment:moment,
    currentInterimText:'These are the final words',getAllParagraphs:()=>moment.paragraphs,
    saveSession(){saved.push(JSON.parse(JSON.stringify(this.session)));},notifyUpdate(){},persistSessions(){}});
  return {manager,moment,session,saved};
}

test('stopping recording commits pending words before closing and persists them once', () => {
  const {manager,moment,saved}=recordingHarness();manager.toggleSermonRecording();
  assert.equal(moment.paragraphs[0].text,'These are the final words');assert.equal(moment.isRecording,false);
  assert.equal(saved.at(-1).recordings[0].paragraphs.length,1);assert.equal(manager.currentInterimText,'');
  manager.setRecordingState(false);assert.equal(moment.paragraphs.length,1);
  manager.addUtterance('Late final text',true);assert.equal(moment.paragraphs.length,1);
});

test('microphone stop flushes the recording; reconnect boundaries preserve it without duplication', () => {
  const {manager,moment}=recordingHarness();manager.flushPendingUtterance();manager.flushPendingUtterance();
  assert.equal(manager.isRecordingSermon,true);assert.equal(moment.paragraphs.length,1);
  manager.currentInterimText='More words after reconnect';manager.setRecordingState(false);
  assert.match(moment.paragraphs[0].text,/More words after reconnect/);assert.equal(manager.isRecordingSermon,false);
});

test('switching service sessions saves the old pending words into the old recording', () => {
  const {manager,moment}=recordingHarness();const target={id:'other',title:'Other',recordings:[]};manager.sessions.push(target);
  manager.switchSession('other');assert.equal(moment.paragraphs[0].text,'These are the final words');
  assert.equal(manager.session,target);assert.equal(target.recordings.length,0);assert.equal(moment.isRecording,false);
});

test('UI status reflects real readiness in both themes and does not stop a recording during recovery', () => {
  const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  const controls=new Map(),broadcasts=[],toasts=[];let stopped=0,flushed=0;
  function element() { const classes=new Set();return {textContent:'',style:{},attributes:{},classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k)},setAttribute(k,v){this.attributes[k]=v;},querySelector(){return null;}}; }
  for(const id of ['ai-mic-btn','bento-mic-btn','bento-mic-btn-text','mic-signal-indicator','bento-ai-live-dot','ai-transcript-text','bento-ai-transcript-text'])controls.set(id,element());
  const ctx=vm.createContext({state:{},REMOTE_MODE:false,document:{getElementById:id=>controls.get(id),querySelector:()=>null},
    window:{sermonManager:{setRecordingState(){stopped++;},flushPendingUtterance(){flushed++;}}},
    recordDetectionDiagnostic(){},stopAudioVuMeter(){},broadcastSpeechAiUpdate:u=>broadcasts.push(u),showToast:(...args)=>toasts.push(args)});
  vm.runInContext(source.slice(source.indexOf('function syncSpeechAiStatusControls()'),source.indexOf('// Speech AI Setup & Handlers')),ctx);
  const change=(status,isRequested,isListening)=>ctx.handleSpeechAiStatus({status,isRequested,isListening,message:status});
  change('connecting',true,false);assert.equal(controls.get('bento-mic-btn').classList.contains('active'),false);
  assert.match(controls.get('bento-mic-btn-text').textContent,/connecting/);
  change('listening',true,true);assert.equal(controls.get('ai-mic-btn').classList.contains('active'),true);
  change('reconnecting',true,false);assert.equal(stopped,0);assert.equal(flushed,2);
  assert.equal(controls.get('bento-ai-transcript-text').textContent,'reconnecting');
  change('error',false,false);assert.equal(stopped,1);assert.equal(toasts.length,1);
  assert.equal(broadcasts.at(-1).status,'error');assert.equal(ctx.state.aiListening,false);
});

test('Stop from the UI works during recovery even with no saved provider or key', () => {
  const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');let stopped=0;
  const ctx=vm.createContext({speechAi:{isListening:true,stop(){stopped++;}}});
  vm.runInContext(source.slice(source.indexOf('function toggleSpeechAi()'),source.indexOf('function handleDetectedVerse(')),ctx);
  ctx.toggleSpeechAi();assert.equal(stopped,1);
});

test('capture or recorder failure is terminal and stale capture rejection cannot overwrite a new session', async () => {
  const h=harness();await connected(h);h.streams[0].track.onended();assert.equal(h.engine.connectionState,'error');
  h.engine.start();await settle();h.sockets[1].open();h.recorders[1].onerror();assert.equal(h.engine.connectionState,'error');
  const old=deferred();let requests=0;const newer=stream();
  const race=harness({getUserMedia:()=>++requests===1?old.promise:Promise.resolve(newer)});
  race.engine.start();race.engine.stop();race.engine.start();await settle();race.sockets[0].open();old.reject(Error('old failure'));await settle();
  assert.equal(race.engine.connectionState,'listening');assert.equal(newer.track.stopped,false);
});

test('remote reconnect snapshots preserve the distinction between requested and listening', () => {
  const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');let synced=0;
  const ctx=vm.createContext({state:{},REMOTE_MODE:true,document:{getElementById:()=>null,querySelector:()=>null},
    renderAiHud(){},syncSpeechAiStatusControls(){synced++;}});
  vm.runInContext(source.slice(source.indexOf('function applyHostSpeechAiUpdate('),source.indexOf('// ── Operator Identity Management')),ctx);
  ctx.applyHostSpeechAiUpdate({fullSync:true,hostSpeechState:{isListening:false,isRequested:true,status:'reconnecting',message:'Reconnecting...'}});
  assert.equal(ctx.state.aiSpeechStatus,'reconnecting');assert.equal(ctx.state.aiListening,false);assert.equal(ctx.state.aiSpeechRequested,true);
  ctx.applyHostSpeechAiUpdate({isListening:true,isRequested:true,status:'listening',message:'Listening...'});
  assert.equal(ctx.state.aiSpeechStatus,'listening');assert.equal(ctx.state.aiListening,true);assert.equal(synced,2);
});

test('opening input settings never captures a second microphone', async () => {
  const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  const h=monitoredHarness(),elements=new Map(),levels=[],broadcasts=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:''});return elements.get(id);};
  const ctx=vm.createContext({navigator:{mediaDevices:{getUserMedia:()=>assert.fail('Settings must reuse the speech input')}},
    document:{getElementById:element},state:{aiListening:false},speechAi:h.engine,
    updateMicSignalBars:level=>levels.push(level),broadcastSpeechAiUpdate:update=>broadcasts.push(update)});
  vm.runInContext(source.slice(source.indexOf('function syncSpeechInputHealth('),source.indexOf('function syncActiveSpeechSettings('))+
    source.slice(source.indexOf('async function startAudioVuMeter('),source.indexOf('function updateMicSignalBars('))+
    source.slice(source.indexOf('function stopAudioVuMeter('),source.indexOf('// Auto-detect plugged / unplugged microphones')),ctx);
  await ctx.startAudioVuMeter('default');assert.equal(h.calls(),0);
  assert.equal(element('mic-vu-level-text').textContent,'0%');
  assert.equal(element('mic-audio-health').textContent,'Start listening to check input.');
  h.engine.onAudioHealth=health=>ctx.syncSpeechInputHealth(health);
  await connected(h);ctx.state.aiListening=true;
  h.analysers[0].level=0.1;h.tick(200);
  const percent=h.engine.audioHealth.percent;
  assert.ok(percent>0);assert.equal(element('mic-vu-meter-bar').style.width,percent+'%');
  assert.equal(element('mic-vu-level-text').textContent,percent+'%');assert.equal(levels.at(-1),percent);
  assert.equal(broadcasts.at(-1).audioLevel,percent);
  const recorder=h.recorders[0],input=h.captured;
  await ctx.startAudioVuMeter('mixer');await ctx.startAudioVuMeter('mixer');ctx.stopAudioVuMeter();
  assert.equal(h.calls(),1);assert.equal(h.recorders[0],recorder);assert.equal(recorder.state,'recording');
  assert.equal(input.track.stopped,false,'Settings must not stop the shared input');
  assert.equal(element('mic-vu-level-text').textContent,'0%');
  h.tick(200);assert.equal(element('mic-vu-level-text').textContent,percent+'%');
  h.engine.stop();ctx.state.aiListening=false;
  assert.equal(element('mic-vu-level-text').textContent,'0%');assert.equal(levels.at(-1),0);
  assert.equal(input.track.stopped,true);assert.equal(h.timers.size,0);
});

function monitoredHarness() {
  const captured=stream();captured.track.label='Mixer';captured.track.readyState='live';
  captured.track.getSettings=()=>({deviceId:'mixer',channelCount:2,sampleRate:48000});
  const analysers=[],sources=[];let calls=0;
  class AudioContext {
    constructor(){this.state='running';this.sampleRate=48000;}
    createMediaStreamSource(input){sources.push(input);return {connect(){}};}
    createChannelSplitter(){return {connect(){}};}
    createAnalyser(){const a={level:0,getFloatTimeDomainData(buffer){buffer.fill(this.level);}};analysers.push(a);return a;}
    close(){this.state='closed';return Promise.resolve();}
  }
  const h=harness({AudioContext,getUserMedia:async options=>{calls++;assert.equal(options.audio.deviceId.exact,'mixer');return captured;}});
  h.engine.selectedDeviceId='mixer';
  return {...h,captured,analysers,sources,calls:()=>calls};
}

test('monitor and recorder share exact capture; channels detect signal, clipping, mute, silence and recover',async()=>{
  const h=monitoredHarness();await connected(h);
  assert.equal(h.calls(),1);assert.equal(h.sources[0],h.recorders[0].stream);
  assert.equal(h.engine.audioHealth.channelCount,2);
  h.analysers[1].level=.2;h.tick(100);
  assert.equal(h.engine.audioHealth.channels[0].rms,0);assert.ok(h.engine.audioHealth.channels[1].rms>.19);
  assert.equal(h.engine.hasSelectedAudioEnergy,true);
  h.analysers[1].level=1;h.tick(100);assert.equal(h.engine.audioHealth.status,'clipping');
  h.captured.track.muted=true;h.tick(100);assert.equal(h.engine.audioHealth.status,'muted');assert.equal(h.engine.hasSelectedAudioEnergy,false);
  h.captured.track.muted=false;h.analysers[1].level=0;h.tick(8100);assert.equal(h.engine.audioHealth.status,'silence');
  h.analysers[0].level=.1;h.tick(100);assert.equal(h.engine.audioHealth.status,'ok');
  h.engine.stop();assert.equal(h.timers.size,0);assert.equal(h.captured.track.stopped,true);assert.equal(h.engine.audioHealth.status,'idle');
});

test('missing selected device never silently falls back and wrong captured device is rejected',async()=>{
  let calls=0;const h=harness({getUserMedia:async()=>{calls++;throw Object.assign(Error('missing'),{name:'NotFoundError'});}});
  h.engine.selectedDeviceId='missing';h.engine.start();await settle();assert.equal(calls,1);assert.equal(h.engine.connectionState,'error');
  const captured=stream();captured.track.getSettings=()=>({deviceId:'wrong'});
  const other=harness({getUserMedia:async()=>captured});other.engine.selectedDeviceId='selected';other.engine.start();await settle();
  assert.equal(other.engine.connectionState,'error');assert.equal(captured.track.stopped,true);assert.equal(other.sockets.length,0);
});

test('native monitoring is explicitly unavailable and disconnected monitored tracks stop capture',async()=>{
  const native=harness();native.engine.provider='native';native.engine.start();assert.equal(native.engine.audioHealth.status,'unavailable');native.engine.stop();
  const h=monitoredHarness();await connected(h);h.captured.track.readyState='ended';h.tick(100);
  assert.equal(h.engine.connectionState,'error');assert.equal(h.timers.size,0);
});

test('Deepgram recognition confidence reaches detections and reconnect clears scripture context',async()=>{
 const h=harness();const found=[];
 h.engine.getScriptureVerses=(book,chapter)=>require('../bibles/KJV.json')[book]?.[chapter] || [];
 h.engine.onVerseDetected=v=>found.push(v);
 await connected(h);
 h.sockets[0].message({type:'Results',is_final:true,channel:{alternatives:[{transcript:'John 3:16',confidence:.45}]}});
 assert.equal(found[0].recognitionConfidence,.45);assert.equal(found[0].detectionScore,98);assert.equal(found[0].autoProjectEligible,false);
 h.sockets[0].drop();h.tick(1000);await settle();h.sockets[1].open();
 h.sockets[1].message(result('verse eighteen'));assert.equal(found.length,1);
 h.engine.stop();
});

test('a pending chapter is cancelled immediately when the connection drops', async () => {
 const h = harness(), found = [];
 h.engine.getScriptureVerses = (book, chapter) => require('../bibles/KJV.json')[book]?.[chapter] || [];
 h.engine.onVerseDetected = v => found.push(v);
 await connected(h);
 h.sockets[0].message(result('Romans chapter eight'));
 assert.ok(h.engine.pendingChapter);
 h.sockets[0].drop();
 assert.equal(h.engine.pendingChapter, null);
 h.tick(3000);
 assert.equal(found.length, 0);
 h.engine.stop();
});

test('normal native restart retains scripture context but stopping clears it',()=>{
 const h=harness();h.engine.provider='native';h.engine.start();h.recognizers[0].onstart();
 const found=[];h.engine.onVerseDetected=v=>found.push(v);
 h.engine.simulateTranscript('Matthew 1:21');
 h.recognizers[0].onend();h.tick(300);h.recognizers[1].onstart();
 h.engine.simulateTranscript('From that same chapter go back to verse seven');
 assert.equal(found.at(-1).rawReference,'Matthew 1:7');
 h.engine.stop();assert.equal(h.engine.scriptureContext,null);
});
