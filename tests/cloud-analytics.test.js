const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../js/cloud-analytics.mjs');
function deps() {const map = new Map(); return {storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}, now:()=>Date.parse('2026-10-12T12:00:00Z'),makeId:()=> '11111111-1111-4111-8111-111111111111'};}
test('analytics defaults on, deduplicates daily activity and never includes workspace content',async () => {
  const {ActivityTracker} = await mod, calls = [];
  const client = {url:'https://test',configured:true,generation:0,config:{appVersion:'2.4.5'},request:async (path,options)=>calls.push({path,...options})};
  const tracker = new ActivityTracker(client,'desktop',deps());
  assert.equal(tracker.consent,true);
  await Promise.all([tracker.track(),tracker.track()]); await tracker.track(); assert.equal(calls.length,1);
  assert.deepEqual(Object.keys(calls[0].body).sort(),['p_app_version','p_consent','p_installation_id','p_platform']);
  client.session = {user:{id:'user'}}; client.accessToken = async ()=>'verified';
  await tracker.track(); assert.equal(calls.length,2); assert.equal(calls[1].token,'verified'); assert.equal(calls[1].body.user_id,undefined);
  tracker.setConsent(false); await tracker.track(); assert.equal(calls.length,2);
});
test('saved opt-outs survive restart and unconfigured clients send nothing',async () => {
  const {ActivityTracker} = await mod, options = deps(); let calls = 0;
  const client = {url:'https://test',configured:true,generation:0,config:{},request:async()=>{calls++;}};
  const tracker = new ActivityTracker(client,'web',options); tracker.setConsent(false);
  const restarted = new ActivityTracker(client,'web',options);
  assert.equal(restarted.consent,false); await restarted.track(); assert.equal(calls,0);
  restarted.setConsent(true); client.configured = false; await restarted.track(); assert.equal(calls,0);
});
test('unavailable preference storage does not enable collection',async () => {
  const {ActivityTracker} = await mod;
  const tracker = new ActivityTracker({url:'https://test'},'web',{storage:{getItem(){throw Error('storage blocked');}}});
  assert.equal(tracker.consent,false);
});
test('withdrawal cancels in-flight collection and prevents retries or completion markers',async () => {
  const {ActivityTracker} = await mod; let signal, release;
  const client = {url:'https://test',configured:true,generation:0,config:{},request:async (_path,options)=>{signal=options.signal; await new Promise(resolve=>release=resolve);}};
  const options = deps(),tracker=new ActivityTracker(client,'web',options); tracker.setConsent(true);
  const pending=tracker.track(); tracker.setConsent(false); assert.equal(signal.aborted,true); release(); await pending;
  assert.equal(options.storage.getItem(tracker.key+':last'),null); assert.equal(options.storage.getItem(tracker.key+':installation'),null);
});
test('failed activity sends remain quiet and are retried only while consent is enabled',async () => {
  const {ActivityTracker} = await mod; let calls=0;
  const client={url:'https://test',configured:true,generation:0,config:{},request:async()=>{calls++;throw Error('offline');}};
  const tracker=new ActivityTracker(client,'web',deps());tracker.setConsent(true);await tracker.track();await tracker.track();assert.equal(calls,2);
  tracker.setConsent(false);await tracker.track();assert.equal(calls,2);
});
