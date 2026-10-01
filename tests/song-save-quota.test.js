'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/import-engine.js'), 'utf8');

function setup() {
  const songs = [{ id: 'one', title: 'Original', stanzas: [] }, { id: 'two', title: 'Other', stanzas: [] }];
  let removed = false;
  const writes = [];
  const tx = { objectStore: () => ({ put: song => writes.push(song) }), abort() { this.onabort(); } };
  const context = vm.createContext({ SONGS_DATABASE: songs, window: {}, localStorage: {
    setItem() { const error = new Error('Full'); error.name = 'QuotaExceededError'; throw error; },
    removeItem(key) { assert.equal(key, 'sf_custom_songs'); removed = true; }
  } });
  const method = source.slice(source.indexOf('  updateSong('), source.indexOf('  // Delete song from library'));
  const engine = vm.runInContext('(new (class { ' + method + ' })())', context);
  engine.customSongs = songs.slice();
  engine.cleanSongTitle = text => text;
  engine.cleanMarkup = text => text;
  engine.db = { transaction: () => tx };
  return { engine, songs, tx, writes, removed: () => removed };
}

test('quota fallback commits the entire library before clearing the stale cache', async () => {
  const { engine, songs, tx, writes, removed } = setup();
  const result = engine.updateSong('one', { title: 'Updated' }, { notify: false, durableFallback: true });
  assert.equal(songs[0].title, 'Original');
  assert.equal(removed(), false);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].title, 'Other');
  tx.oncomplete();
  assert.equal(await result, true);
  assert.equal(songs[0].title, 'Updated');
  assert.equal(removed(), true);
});

test('aborted fallback preserves the cache and in-memory library', async () => {
  const { engine, songs, tx, removed } = setup();
  const result = engine.updateSong('one', { title: 'Updated' }, { durableFallback: true });
  tx.onabort();
  await assert.rejects(result, /aborted/);
  assert.equal(songs[0].title, 'Original');
  assert.equal(engine.customSongs[0].title, 'Original');
  assert.equal(removed(), false);
});

test('unavailable IndexedDB reports quota without mutating the library', () => {
  const { engine, songs } = setup();
  engine.db = null;
  assert.throws(() => engine.updateSong('one', { title: 'Updated' }, { durableFallback: true }), { name: 'QuotaExceededError' });
  assert.equal(songs[0].title, 'Original');
});
