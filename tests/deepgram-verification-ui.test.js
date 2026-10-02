'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const code=source.slice(source.indexOf('async function testDeepgramConnection()'),source.indexOf('\nfunction updateDeepgramModelSetting'));
function harness(){
 const status={style:{},textContent:''},input={value:'test-key'},model={value:'nova-3'},sockets=[],timers=new Map();let id=0;
 const ctx=vm.createContext({state:{},document:{getElementById:id=>({'setting-deepgram-api-key':input,'setting-deepgram-model-select':model,'deepgram-test-status':status}[id])},window:{SpeechAiEngine:class{buildDeepgramParams(){return `model=${this.deepgramModel}&keyterm=Matthew`;}}},
 WebSocket:class{constructor(url,protocols){this.url=url;this.protocols=protocols;sockets.push(this);}close(){this.closed=true;}},
 setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),showToast(){},fetch(){throw Error('Must not call projects endpoint');},navigator:{mediaDevices:{getUserMedia(){throw Error('Must not capture audio');}}}});
 vm.runInContext(code,ctx);return {ctx,status,input,model,sockets,timers};
}
test('tests selected live endpoint and closes socket and timer on success',async()=>{
 const h=harness();await h.ctx.testDeepgramConnection();const ws=h.sockets[0];
 assert.match(ws.url,/\/v1\/listen\?model=nova-3&keyterm=Matthew/);assert.equal(ws.protocols[1],'test-key');
 ws.onopen();assert.match(h.status.textContent,/verified · nova-3/);assert.equal(ws.closed,true);assert.equal(h.timers.size,0);
});
test('failed handshake is not mislabelled as an invalid key',async()=>{
 const h=harness();await h.ctx.testDeepgramConnection();h.sockets[0].onerror();
 assert.match(h.status.textContent,/connection failed/);assert.doesNotMatch(h.status.textContent,/invalid key/i);assert.equal(h.timers.size,0);
});
test('timeout cleans up and edited credentials cannot receive an old success',async()=>{
 const h=harness();await h.ctx.testDeepgramConnection();[...h.timers.values()][0]();assert.match(h.status.textContent,/timed out/);assert.equal(h.sockets[0].closed,true);
 await h.ctx.testDeepgramConnection();h.input.value='different';h.sockets[1].onopen();assert.doesNotMatch(h.status.textContent,/verified/);
});
test('retesting cancels the old socket; active connection only satisfies the same model',async()=>{
 const h=harness();await h.ctx.testDeepgramConnection();await h.ctx.testDeepgramConnection();assert.equal(h.sockets[0].closed,true);
 h.ctx.speechAi={provider:'deepgram',connectionState:'listening',deepgramApiKey:'test-key',deepgramModel:'nova-3'};
 await h.ctx.testDeepgramConnection();assert.match(h.status.textContent,/Live connection active/);assert.equal(h.sockets.length,2);
 h.model.value='nova-2';await h.ctx.testDeepgramConnection();assert.equal(h.sockets.length,3);
});
