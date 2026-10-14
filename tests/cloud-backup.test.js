const test = require('node:test');
const assert = require('node:assert/strict');
const {createJournal} = require('../js/cloud-restore-journal.js');
const cloud = import('../js/cloud-backup.mjs');
const model = import('../web/model.mjs');
const fixture = () => ({sessions: [{id: 'service', name: 'Sunday', notes: 'Preparation', agendaItems: [{type: 'song', id: 'song', title: 'Song'}, {type: 'bible', id: 'John', book: 'John', chapter: 3, version: 'KJV', title: 'John 3'}, {type: 'media', id: 'file', title: 'Announcement', path: 'C:/private/file.mp4'}]}]});
const songs = [{id: 'song', title: 'Song', author: 'Author', stanzas: [{type: 'Chorus', text: 'Line one\nLine two'}], apiKey: 'secret'}];
test('desktop to web to desktop preserves songs, chapters, notes and placeholders without private fields', async () => {
  const c = await cloud, m = await model;
  const source = fixture(); source.sessions[0].medleyBibleSlots = [null,{book:'John',chapter:3,version:'KJV'},null];
  const backup = c.makeCloudBackup('desktop', source, songs);
  assert.doesNotMatch(JSON.stringify(backup), /private|apiKey|secret|file.mp4/);
  const current = m.newWorkspace(), active = current.activeSessionId;
  const web = c.mergeCloudBackup('web', current, [], backup).workspace;
  m.validateWorkspace(web);
  assert.equal(web.activeSessionId, active); assert.equal(current.sessions.length, 1);
  assert.equal(web.sessions[1].agenda[1].wholeChapter, true);
  assert.equal(web.sessions[1].agenda[2].type, 'placeholder');
  const back = c.makeCloudBackup('web', web);
  const desktop = c.mergeCloudBackup('desktop', fixture(), songs, back);
  assert.equal(desktop.additions.length, 0);
  assert.equal(desktop.workspace.sessions.at(-1).agendaItems[0].id, 'song');
  assert.equal(desktop.workspace.sessions.at(-1).notes, 'Preparation');
  assert.equal(desktop.workspace.sessions.at(-1).medleyBibleSlots[0], null);
  assert.equal(desktop.workspace.sessions.at(-1).medleyBibleSlots[1].book, 'John');
  assert.match(c.cloudBackupNotices(backup, [], 'web').join(' '), /Install KJV.*Announcement/s);
});
test('restores remap conflicting IDs, reuse identical content and leave local edits intact', async () => {
  const c = await cloud;
  const backup = c.makeCloudBackup('desktop', fixture(), songs);
  const changed = structuredClone(songs); changed[0].stanzas[0].text = 'Local edit';
  const restored = c.mergeCloudBackup('desktop', fixture(), changed, backup);
  assert.equal(changed[0].stanzas[0].text, 'Local edit');
  assert.notEqual(restored.additions[0].id, 'song');
  assert.equal(restored.workspace.sessions.at(-1).agendaItems[0].id, restored.additions[0].id);
  const sameDifferentId = structuredClone(songs); sameDifferentId[0].id = 'other';
  assert.equal(c.mergeCloudBackup('desktop', fixture(), sameDifferentId, backup).additions.length, 0);
  const untrusted=structuredClone(backup);untrusted.songs[0].id="song');alert('bad";untrusted.sessions[0].agenda[0].songId=untrusted.songs[0].id;
  const safe=c.mergeCloudBackup('desktop',fixture(),changed,untrusted);assert.match(safe.additions[0].id,/^[a-f0-9-]+$/);assert.equal(safe.workspace.sessions.at(-1).agendaItems[0].id,safe.additions[0].id);
});
test('rejects corrupt versions, missing lyrics, duplicate IDs, dependencies and oversized payloads', async () => {
  const c = await cloud, backup = c.makeCloudBackup('desktop', fixture(), songs);
  for (const mutate of [b => b.formatVersion = 2, b => b.songs = [], b => b.songs[0].lyrics = '', b => b.songs.push(b.songs[0]), b => b.sessions[0].agenda[1].end = -1]) {
    const bad = structuredClone(backup); mutate(bad); assert.throws(() => c.validateCloudBackup(bad));
  }
  const big = structuredClone(backup); big.sessions = Array.from({length: 120}, (_, i) => ({...big.sessions[0], id: `s${i}`, notes: 'x'.repeat(200000)}));
  assert.throws(() => c.validateCloudBackup(big), /20 MiB/);
});
test('recovery restores previous local values and removes staged songs after an interrupted commit', async () => {
  const map = new Map([['sf_saved_sessions', 'old services'], ['sf_custom_songs', 'old songs'], ['sf_system_formatted', 'true']]);
  const storage = {getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k)};
  const journal = createJournal(storage); journal.begin(['new-song']);
  storage.setItem('sf_saved_sessions', 'partial services'); storage.removeItem('sf_system_formatted');
  const deleted = [];
  const db = {transaction() {const tx = {objectStore: () => ({delete: value => deleted.push(value)})}; queueMicrotask(() => tx.oncomplete()); return tx;}};
  const restarted = createJournal(storage); restarted.recoverLocal(); await restarted.recoverSongs(db);
  assert.equal(storage.getItem('sf_saved_sessions'), 'old services'); assert.equal(storage.getItem('sf_custom_songs'), 'old songs');
  assert.equal(storage.getItem('sf_system_formatted'), 'true'); assert.deepEqual(deleted, ['new-song']); assert.equal(restarted.pending(), null);
});
test('failed recovery keeps the journal for retry and completed commits have no recovery work', async () => {
  const map = new Map(), storage = {getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k)};
  const journal = createJournal(storage); journal.begin(['new']);
  const db = {transaction() {const tx = {objectStore: () => ({delete() {}})}; queueMicrotask(() => tx.onabort()); return tx;}};
  await assert.rejects(journal.recoverSongs(db), /recovery failed/); assert.ok(journal.pending());
  journal.complete(); assert.equal(journal.pending(), null);
});
test('local library read failures reject cloud readiness rather than hanging indefinitely', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../js/import-engine.js'),'utf8');
  const method=source.slice(source.indexOf('  loadFromIndexedDB('),source.indexOf('  // Normalize any book name'));
  const tx={objectStore:()=>({getAll:()=>({})}),error:Error('Read failed')};
  const context=vm.createContext({window:{},localStorage:{getItem:()=>null},console});
  const engine=vm.runInContext('(new (class {'+method+'})())',context);engine.db={transaction:()=>tx};
  const ready=new Promise((resolve,reject)=>engine.loadFromIndexedDB(resolve,reject));tx.onabort();
  await assert.rejects(ready,/Read failed/);
});
