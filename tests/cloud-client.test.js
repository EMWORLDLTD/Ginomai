const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../js/cloud-client.mjs');
const config = {url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test'};
const session = (expires_at = 9999999999) => ({access_token: 'access', refresh_token: 'refresh', expires_at, user: {id: 'user', email: 'test@example.com'}});
function fixture(fetcher, now = () => 100000) {
  const map = new Map([['sf_saved_sessions', 'keep services'], ['sf_custom_songs', 'keep songs']]);
  return {storage: {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key)}, fetcher, now};
}
const response = (data, status = 200) => ({ok: status < 400, status, json: async () => data});
test('email codes create accounts, persist login, enforce resend cooldown and leave workspace untouched', async () => {
  const {CloudClient} = await modulePromise, requests = [];
  const deps = fixture(async (url, options) => {requests.push({url, ...options}); return response(url.endsWith('/verify') ? session() : {});});
  const c = new CloudClient(config, deps);
  await c.sendCode(' test@example.com ');
  assert.equal(JSON.parse(requests[0].body).create_user, true);
  await assert.rejects(c.sendCode('test@example.com'), /60 seconds/);
  await assert.rejects(c.verifyCode('bad'), /6–10 digit/);
  await c.verifyCode('123456');
  assert.equal(JSON.parse(requests[1].body).type, 'email');
  assert.equal(new CloudClient(config, deps).session.user.id, 'user');
  assert.equal(deps.storage.getItem('sf_saved_sessions'), 'keep services'); assert.equal(deps.storage.getItem('sf_custom_songs'), 'keep songs');
});
test('OTP verification accepts 6–10 digits and sends leading zeros unchanged', async () => {
  const {CloudClient} = await modulePromise;
  for (const token of ['012345','0123456','01234567','012345678','0123456789']) {
    const requests=[];
    const c=new CloudClient(config,fixture(async (url,options)=>{requests.push({url,body:JSON.parse(options.body)});return response(url.endsWith('/verify')?session():{});}));
    await c.sendCode('test@example.com');await c.verifyCode(` ${token} `);
    assert.equal(requests[1].body.token,token);assert.equal(typeof requests[1].body.token,'string');assert.equal(c.session.user.id,'user');
  }
});
test('OTP verification rejects malformed and out-of-range codes without sending them', async () => {
  const {CloudClient} = await modulePromise;let requests=0;
  const c=new CloudClient(config,fixture(async ()=>{requests++;return response({});}));
  c.pending={email:'test@example.com'};
  for(const token of ['','12345','12345678901','12345a','+123456','１２３４５６','123 456','123456.0']) await assert.rejects(c.verifyCode(token),/6–10 digit/);
  assert.equal(requests,0);
});
test('wrong or expired codes and server rate limits are shown without erasing local work', async () => {
  const {CloudClient} = await modulePromise;
  const c = new CloudClient(config, fixture(async url => response({msg: 'Code expired'}, url.endsWith('/otp') ? 200 : 403)));
  await c.sendCode('test@example.com'); await assert.rejects(c.verifyCode('123456'), /expired/); assert.equal(c.session, null);
  const rate = new CloudClient(config, fixture(async () => response({}, 429)));
  await assert.rejects(rate.sendCode('test@example.com'), /Too many/);
});
test('expired sessions refresh once for simultaneous requests and rejected refresh signs out locally', async () => {
  const {CloudClient} = await modulePromise; let count = 0;
  const c = new CloudClient(config, fixture(async () => {count++; await new Promise(resolve => setTimeout(resolve, 5)); return response(session());}));
  c.saveSession(session(1)); assert.deepEqual(await Promise.all([c.accessToken(), c.accessToken()]), ['access', 'access']); assert.equal(count, 1);
  const bad = new CloudClient(config, fixture(async () => response({msg: 'Expired login'}, 400))); bad.saveSession(session(1));
  await assert.rejects(bad.accessToken(), /Expired login/); assert.equal(bad.session, null);
});
test('offline refresh retains login and sign-out clears only account storage', async () => {
  const {CloudClient} = await modulePromise, deps = fixture(async () => {throw Error('Offline');});
  const c = new CloudClient(config, deps); c.saveSession(session(1));
  await assert.rejects(c.accessToken(), /Offline/); assert.ok(c.session);
  await c.signOut(); assert.equal(c.session, null); assert.equal(deps.storage.getItem('sf_saved_sessions'), 'keep services');
});
test('a refresh finishing after sign-out cannot resurrect the previous account', async () => {
  const {CloudClient} = await modulePromise; let release;
  const c = new CloudClient(config, fixture(async url => url.includes('/token') ? await new Promise(resolve => release = () => resolve(response(session()))) : response(null, 204)));
  c.saveSession(session(1)); const refreshing = c.accessToken(); await c.signOut(); release();
  await assert.rejects(refreshing, /Account changed/); assert.equal(c.session, null);
});
test('missing configuration and privileged keys never send a network request', async () => {
  const {CloudClient} = await modulePromise; let count = 0;
  const deps = fixture(async () => {count++; return response({});});
  for (const cfg of [{}, {...config, enabled:false}, {...config, publishableKey: 'sb_secret_privileged'}, {...config, publishableKey: `a.${btoa(JSON.stringify({role:'service_role'}))}.b`}]) {
    const c = new CloudClient(cfg, deps); await assert.rejects(c.sendCode('test@example.com'), /not configured/);
  }
  assert.equal(count, 0);
});
test('local delivery testing enables only explicit HTTP loopback contexts and keeps hosted releases gated', async () => {
  const {CloudClient}=await modulePromise;
  const testConfig={...config,enabled:false,localTesting:true};
  const options=fixture(async ()=>response({}));
  for(const hostname of ['localhost','127.0.0.1','[::1]']) {
    const c=new CloudClient(testConfig,{...options,pageLocation:{hostname,protocol:'http:'}});
    assert.equal(c.testingLocally,true);assert.equal(c.configured,true);
  }
  for(const pageLocation of [{hostname:'ginomai.com',protocol:'https:'},{hostname:'localhost.evil.test',protocol:'https:'},{hostname:'192.168.1.10',protocol:'http:'},{hostname:'localhost',protocol:'file:'},undefined]) {
    const c=new CloudClient(testConfig,{...options,pageLocation});assert.equal(c.testingLocally,false);assert.equal(c.configured,false);
  }
  const secret=new CloudClient({...testConfig,publishableKey:'sb_secret_private'},{...options,pageLocation:{hostname:'localhost',protocol:'http:'}});
  assert.equal(secret.configured,false);
});
test('changing the sign-in email clears pending verification and preserves account and workspace data',async()=>{
  const {CloudClient}=await modulePromise;
  const deps=fixture(async()=>response({})),client=new CloudClient(config,deps);
  await client.sendCode('test@example.com');const generation=client.generation;
  client.resetPending();assert.equal(client.pending,null);assert.equal(client.generation,generation+1);
  assert.equal(deps.storage.getItem(client.key+':pending'),null);assert.equal(deps.storage.getItem('sf_saved_sessions'),'keep services');
});
