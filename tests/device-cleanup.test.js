'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { ContentPacks } = require('../lib/content-packs');
const createBackgrounds = require('../lib/sanctuary-media');
const createPresentations = require('../lib/presentation-media');
const importSource = syncFs.readFileSync(require.resolve('../js/import-engine.js'), 'utf8');
const cleanupSource = syncFs.readFileSync(require.resolve('../js/device-cleanup.js'), 'utf8');
function storage(values = {}) {
  const map = new Map(Object.entries(values));
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), clear: () => map.clear() };
}
async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ginomai-cleanup-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
function importer() {
  const localStorage = storage({ sf_custom_bibles: 'saved', sf_custom_songs: 'saved', sf_custom_songbooks: 'saved' });
  const context = vm.createContext({ window: {}, console, localStorage, BIBLE_DATABASE: { KJV: { bundled: true }, NIV: { imported: true } }, SONGS_DATABASE: [{ id: 'song' }], SONGBOOKS_DATABASE: [{ id: 'book' }] });
  vm.runInContext(importSource.replace('window.libraryImporter = new LibraryImportEngine();', 'window.libraryImporter = Object.create(LibraryImportEngine.prototype);'), context);
  const engine = context.window.libraryImporter;
  Object.assign(engine, { customBibles: { NIV: {} }, customSongs: [{}], customSongbooks: [{}] });
  let transaction;
  engine.db = { transaction(stores) {
    transaction = { stores, cleared: [], objectStore: name => ({ clear: () => transaction.cleared.push(name), delete: key => transaction.cleared.push(name + ':' + key) }) };
    return transaction;
  } };
  return { engine, context, localStorage, transaction: () => transaction };
}
test('Bible cleanup waits for commit, removes imports and keeps bundled KJV and songs', async () => {
  const f = importer();
  const operation = f.engine.clearBiblesOnly();
  await Promise.resolve();
  assert.equal(f.localStorage.getItem('sf_custom_bibles'), 'saved');
  assert.ok(f.context.BIBLE_DATABASE.NIV);
  f.transaction().oncomplete();
  await operation;
  assert.equal(f.localStorage.getItem('sf_custom_bibles'), null);
  assert.deepEqual(Object.keys(f.context.BIBLE_DATABASE), ['KJV']);
  assert.equal(f.context.BIBLE_DATABASE.KJV.bundled, true);
  assert.equal(f.context.SONGS_DATABASE.length, 1);
});
test('an aborted library deletion fails without reporting or clearing successful state', async () => {
  const f = importer();
  const operation = f.engine.clearSongsOnly();
  await Promise.resolve();
  f.transaction().onabort();
  await assert.rejects(operation, /Could not clear/);
  assert.equal(f.localStorage.getItem('sf_custom_songs'), 'saved');
  assert.equal(f.context.SONGS_DATABASE.length, 1);
});
test('Strong’s removal deletes its persisted Bible copy after commit and keeps other imports', async () => {
  const f = importer();
  f.engine.customBibles.KJV_STRONGS = { saved: true };
  f.context.BIBLE_DATABASE.KJV_STRONGS = { saved: true };
  f.localStorage.setItem('sf_installed_bibles', '["NIV","KJV_STRONGS"]');
  const removal = f.engine.removeStoredBible('KJV_STRONGS');
  await Promise.resolve();
  assert.ok(f.engine.customBibles.KJV_STRONGS);
  f.transaction().oncomplete();
  await removal;
  assert.equal(f.engine.customBibles.KJV_STRONGS, undefined);
  assert.equal(f.context.BIBLE_DATABASE.KJV_STRONGS, undefined);
  assert.equal(f.localStorage.getItem('sf_installed_bibles'), '["NIV"]');
  assert.ok(f.context.BIBLE_DATABASE.NIV);
});
test('song cleanup removes songs and songbooks only after the database commits', async () => {
  const f = importer();
  const operation = f.engine.clearSongsOnly();
  await Promise.resolve();
  f.transaction().oncomplete();
  await operation;
  assert.equal(f.context.SONGS_DATABASE.length, 0);
  assert.equal(f.context.SONGBOOKS_DATABASE.length, 0);
  assert.equal(f.localStorage.getItem('sf_custom_songbooks'), null);
  assert.ok(f.context.BIBLE_DATABASE.NIV);
});
test('download cleanup includes incomplete and old versions but never deletes bundled source files', async t => {
  const dir = await directory(t), root = path.join(dir, 'app'), persistent = path.join(dir, 'downloads');
  const packs = ['KJV', 'NIV', 'KJV_STRONGS', 'AI_SEMANTIC'].map(code => ({ code, name: code, version: 'a'.repeat(64), files: [{ path: code === 'AI_SEMANTIC' ? 'assets/semantic/verses.json' : 'bibles/' + code + '.json', asset: code + '.gz', bytes: 2, downloadBytes: 2, sha256: 'b'.repeat(64), compressedSha256: 'c'.repeat(64) }] }));
  await fs.mkdir(path.join(root, 'bibles'), { recursive: true });
  await fs.writeFile(path.join(root, 'bibles', 'KJV.json'), '{}');
  for (const pack of packs) {
    await fs.mkdir(path.join(persistent, pack.code, '.download-abandoned'), { recursive: true });
    await fs.writeFile(path.join(persistent, pack.code, '.download-abandoned', 'partial'), 'bytes');
  }
  const store = new ContentPacks({ root, directory: persistent, manifest: { packs } });
  await store.clearDownloads('bibles');
  assert.deepEqual(await fs.readdir(persistent), ['AI_SEMANTIC']);
  assert.equal(await fs.readFile(path.join(root, 'bibles', 'KJV.json'), 'utf8'), '{}');
  await store.clearDownloads('all');
  assert.deepEqual(await fs.readdir(persistent), []);
  assert.equal((await store.status('KJV')).installed, true);
});
test('media cleanup removes orphaned thumbnails, metadata and partial copies while keeping unrelated originals', async t => {
  for (const [createStore, names] of [
    [createBackgrounds, ['upload_abc.png', 'upload_abc.json', 'upload_def.png.part']],
    [createPresentations, ['media_abc.pdf', 'media_abc.json', 'media_abc-page-1.png', 'media_abc-page-1-thumb.png', 'media_def.pdf.abc.part']]
  ]) {
    const dir = await directory(t);
    for (const name of [...names, 'original.png']) await fs.writeFile(path.join(dir, name), 'data');
    await createStore(dir).clear();
    assert.deepEqual(await fs.readdir(dir), ['original.png']);
  }
});
test('cleanup waits for an upload to finish so it cannot restore deleted media afterwards', async t => {
  const dir = await directory(t), store = createBackgrounds(dir);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const req = Readable.from((async function* () { yield Buffer.from('first'); await gate; yield Buffer.from('last'); })());
  req.headers = {};
  const upload = store.upload(req, new URLSearchParams({ name: 'test.png', width: '1', height: '1' }));
  const cleanup = store.clear();
  release();
  await upload;
  await cleanup;
  assert.deepEqual(await fs.readdir(dir), []);
});
test('a filesystem deletion error rejects cleanup instead of silently succeeding', async t => {
  const dir = await directory(t);
  await fs.mkdir(path.join(dir, 'media_abc.json'));
  await assert.rejects(createPresentations(dir).clear());
});
function cleanupContext(confirmed = true, failure = false) {
  const localStorage = storage({ sf_ui_mode: 'light', sf_sanctuary_font: 'Outfit', sf_saved_sessions: 'old agenda', sf_sermon_sessions_history: 'old transcript', sf_deepgram_api_key: 'test-token', sf_system_formatted: 'true' });
  const sessionStorage = storage({ workspace: 'old' });
  const calls = [], buttons = [{ disabled: false }], toasts = [], requests = [], confirmations = [], listeners = {};
  const window = { showCustomConfirm: async options => { confirmations.push(options); return confirmed; }, showToast: message => toasts.push(message), libraryImporter: {
    clearAllData: async () => { calls.push('database'); if (failure) throw Error('aborted'); },
    clearBiblesOnly: async () => calls.push('bibles'), clearSongsOnly: async () => calls.push('songs')
  }, prepareDeviceDataReset: () => calls.push('stop-autosave'), clearContentDownloadState: () => calls.push('stop-download-ui') };
  const context = vm.createContext({ window, localStorage, sessionStorage, document: { querySelectorAll: () => buttons, addEventListener: (event, callback) => { listeners[event] = callback; } }, fetch: async (url, options) => { const body = JSON.parse(options.body); requests.push(body); calls.push(body.scope); return { ok: true }; } });
  vm.runInContext(cleanupSource, context);
  return { window, calls, buttons, toasts, localStorage, sessionStorage, requests, confirmations, listeners };
}
test('declining cleanup performs no deletion', async () => {
  const f = cleanupContext(false);
  assert.equal(await f.window.runDeviceCleanup('all'), false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.localStorage.getItem('sf_saved_sessions'), 'old agenda');
});
test('full cleanup stops persistence and deletes histories and credentials while retaining appearance', async () => {
  const f = cleanupContext();
  assert.equal(await f.window.runDeviceCleanup('all'), true);
  assert.deepEqual(f.calls, ['stop-autosave', 'stop-download-ui', 'database', 'all']);
  assert.equal(f.window.sfResettingDevice, true);
  assert.deepEqual([...f.localStorage.map.keys()], ['sf_ui_mode', 'sf_sanctuary_font']);
  assert.equal(f.sessionStorage.getItem('workspace'), null);
  assert.equal(f.sessionStorage.getItem('sf_reset_result'), 'kept');
  assert.equal(f.confirmations[0].checkbox.checked, false);
  assert.equal(f.requests[0].deleteMedia, false);
});

test('uploaded media deletion requires selecting the option in the reset confirmation', async () => {
  const f = cleanupContext({ confirmed: true, checked: true });
  assert.equal(await f.window.runDeviceCleanup('all'), true);
  assert.equal(f.requests[0].deleteMedia, true);
  assert.equal(f.sessionStorage.getItem('sf_reset_result'), 'deleted');
});

test('reset success is shown once after reload with the selected media result', async () => {
  for (const checked of [false, true]) {
    const f = cleanupContext({ confirmed: true, checked });
    await f.window.runDeviceCleanup('all');
    assert.deepEqual(f.toasts, []);
    f.listeners.DOMContentLoaded();
    assert.deepEqual(f.toasts, [`Device reset complete. Uploaded media ${checked ? 'deleted' : 'kept'}.`]);
    assert.equal(f.sessionStorage.getItem('sf_reset_result'), null);
    f.listeners.DOMContentLoaded();
    assert.equal(f.toasts.length, 1);
  }
});
test('failure prevents a success result, preserves history and enables retry', async () => {
  const f = cleanupContext(true, true);
  assert.equal(await f.window.runDeviceCleanup('all'), false);
  assert.equal(f.window.sfResettingDevice, false);
  assert.equal(f.buttons[0].disabled, false);
  assert.equal(f.localStorage.getItem('sf_saved_sessions'), 'old agenda');
  assert.equal(f.calls.includes('all'), false);
  assert.match(f.toasts[0], /could not finish/);
  assert.equal(f.sessionStorage.getItem('sf_reset_result'), null);
});
test('an earlier update network error does not prevent resetting successfully saved update preferences', async () => {
  const f = cleanupContext();
  f.window.desktopApi = { setUpdatePreferences: async () => ({ error: 'Earlier check failed', preferences: { automaticDownloads: false } }) };
  assert.equal(await f.window.runDeviceCleanup('all'), true);
  assert.equal(f.localStorage.getItem('sf_saved_sessions'), null);
});
test('a failed desktop preference write prevents deletion and keeps saved data', async () => {
  const f = cleanupContext();
  f.window.desktopApi = { setUpdatePreferences: async () => ({ preferenceError: 'Write failed', preferences: { automaticDownloads: true } }) };
  assert.equal(await f.window.runDeviceCleanup('all'), false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.localStorage.getItem('sf_saved_sessions'), 'old agenda');
});
