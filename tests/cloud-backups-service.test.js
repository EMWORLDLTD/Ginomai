const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../js/cloud-backups-service.mjs');
const backup = {app:'Ginomai', type:'cloud_backup', formatVersion:1, sourcePlatform:'web', createdAt:new Date().toISOString(), songs:[], sessions:[{id:'s',name:'Sunday',agenda:[]}]};
test('backup calls carry verified authorization and server-owned IDs, with no owner supplied by the client', async () => {
  const {CloudBackups} = await mod, calls = [];
  const client = {generation:0, accessToken:async () => 'verified-token', request:async (path, options) => {calls.push({path,...options}); return path.endsWith('_get') ? backup : [];}};
  const service = new CloudBackups(client);
  await service.save(backup); await service.list(); await service.get('backup-id'); await service.delete('backup-id');
  assert.ok(calls.every(call => call.token === 'verified-token'));
  assert.equal(calls[0].body.p_payload.type, 'cloud_backup'); assert.equal(calls[0].body.user_id, undefined);
  assert.deepEqual(calls[2].body, {p_id:'backup-id'});
});
test('invalid and oversized snapshots are rejected before upload', async () => {
  const {CloudBackups} = await mod; let count = 0;
  const service = new CloudBackups({request:async () => count++});
  assert.throws(() => service.save({...backup,formatVersion:2}));
  assert.throws(() => service.save({...backup,extra:'x'.repeat(21*1048576)}), /20 MiB/); assert.equal(count,0);
});
test('account changes during download prevent stale restore data being returned', async () => {
  const {CloudBackups} = await mod;
  const client = {generation:0, accessToken:async () => 'token', request:async () => {client.generation++; return backup;}};
  await assert.rejects(new CloudBackups(client).get('old-account-backup'), /Account changed/);
});
