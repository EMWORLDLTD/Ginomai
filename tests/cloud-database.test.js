const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const backup = {app:'Ginomai',type:'cloud_backup',formatVersion:1,sourcePlatform:'desktop',createdAt:new Date().toISOString(),songs:[],sessions:[{id:'s',name:'Sunday',agenda:[]}]};
async function connect() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${alice}',now()), ('${bob}',now());`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120001_cloud_backups.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120002_cloud_activity.sql'),'utf8'));
  return db;
}
async function identity(db, user, role = 'authenticated') {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']); await db.exec(`set role ${role}`);
}
test('real PostgreSQL policies and functions enforce ownership, retention, size and atomic failed saves', async t => {
  const db = await connect(); t.after(() => db.close());
  await identity(db,alice);
  let latest;
  for (let i=0;i<6;i++) latest = (await db.query('select public.cloud_backup_save($1::jsonb) as id',[JSON.stringify(backup)])).rows[0].id;
  assert.equal((await db.query('select * from public.cloud_backup_list()')).rows.length,5);
  await assert.rejects(db.query('select public.cloud_backup_save($1::jsonb)',[JSON.stringify({...backup,type:'invalid'})]),/Invalid/);
  await assert.rejects(db.query('select public.cloud_backup_save($1::jsonb)',[JSON.stringify({...backup,extra:'x'.repeat(21*1048576)})]),/20 MiB/);
  assert.equal((await db.query('select * from public.cloud_backup_list()')).rows.length,5);
  await identity(db,bob);
  assert.equal((await db.query('select * from public.cloud_backups')).rows.length,0);
  assert.equal((await db.query('select public.cloud_backup_get($1) as payload',[latest])).rows[0].payload,null);
  await assert.rejects(db.query('select public.cloud_backup_delete($1)',[latest]),/not found/);
  await assert.rejects(db.query('insert into public.cloud_backups(user_id,source_platform,byte_size,payload) values($1,\'web\',1,\'{}\')',[alice]),/permission denied/);
  await identity(db,null,'anon'); await assert.rejects(db.query('select public.cloud_backup_list()'),/permission denied/);
  await identity(db,alice); await db.query('select public.cloud_backup_delete($1)',[latest]);
  assert.equal((await db.query('select * from public.cloud_backup_list()')).rows.length,4);
});
test('activity derives verified accounts from server identity and reports require an assigned admin', async t => {
  const db=await connect(); t.after(()=>db.close());
  const installation='33333333-3333-4333-8333-333333333333', second='44444444-4444-4444-8444-444444444444';
  await identity(db,null,'anon');
  await db.query('select public.record_cloud_activity($1,\'web\',\'2.4.5\',false)',[installation]);
  await db.query('select public.record_cloud_activity($1,\'web\',\'2.4.5\',true)',[installation]);
  await assert.rejects(db.query('select public.cloud_admin_report()'),/permission denied/);
  await assert.rejects(db.query('select * from ginomai_private.installation_activity'),/permission denied/);
  await identity(db,alice);
  await assert.rejects(db.query('select public.cloud_admin_report()'),/Administrator/);
  for(const install of [installation,installation,second]) await db.query('select public.record_cloud_activity($1,\'desktop\',\'2.4.5\',true)',[install]);
  await identity(db,bob); await db.query('select public.record_cloud_activity($1,\'web\',\'2.4.5\',true)',[installation]);
  await assert.rejects(db.query('insert into ginomai_private.administrators values($1)',[bob]),/permission denied/);
  await db.exec('reset role'); await db.query('insert into ginomai_private.administrators values($1)',[alice]);
  await identity(db,alice);
  const report=(await db.query('select public.cloud_admin_report() as report')).rows[0].report;
  assert.equal(report.verified_accounts,2);assert.equal(report.daily_accounts,2);assert.equal(report.monthly_accounts,2);
  assert.equal(report.daily_installations,2);assert.equal(report.monthly_installations,2);
  await db.exec('reset role');
  await db.query("insert into ginomai_private.installation_activity values($1, (now() at time zone 'UTC')::date - 30, 'web','old')",['55555555-5555-4555-8555-555555555555']);
  await identity(db,alice);assert.equal((await db.query('select public.cloud_admin_report() as r')).rows[0].r.monthly_installations,2);
});
