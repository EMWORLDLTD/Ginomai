'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const model = import(pathToFileURL(path.resolve(__dirname, '../model.mjs')));
const bible = {code: 'KJV', name: 'King James Version', data: {John: {'3': [{verse: 16, text: 'For God so loved the world.'}, {verse: 17, text: 'For God sent not his Son.'}]}}};
async function fixture() {
  const m = await model; const workspace = m.newWorkspace();
  workspace.songs.push({id: 'song-a', title: 'Test song', lyrics: 'First line\nSecond line\n\nA chorus'});
  workspace.sessions[0].agenda.push({id: 'a', type: 'song', title: 'Test song', songId: 'song-a'}, {id: 'b', type: 'bible', title: 'John 3:16-17', code: 'KJV', book: 'John', chapter: 3, start: 16, end: 17});
  return {m, workspace};
}
test('a fresh browser can restore every song and verse needed by an exported service', async () => {
  const {m, workspace} = await fixture(); const backup = m.makeBackup(workspace, [bible]);
  const fresh = m.newWorkspace(); const restored = m.mergeBackup(fresh, JSON.parse(JSON.stringify(backup)));
  const service = restored.workspace.sessions.find(item => item.id === restored.workspace.activeSessionId);
  assert.equal(restored.workspace.songs[0].lyrics, workspace.songs[0].lyrics);
  assert.equal(m.verseSlides(restored.bibles[0].data, 'KJV', service.agenda[1]).length, 2);
  assert.equal(fresh.sessions.length, 1, 'restore must not mutate the current library before its transaction commits');
});
test('incomplete scripture and missing song references reject the entire restore', async () => {
  const {m, workspace} = await fixture(); const backup = m.makeBackup(workspace, [bible]);
  backup.bibles[0].data.John[3].pop();
  assert.throws(() => m.mergeBackup(m.newWorkspace(), backup), /Missing scripture/);
  backup.workspace.songs = [];
  assert.throws(() => m.mergeBackup(m.newWorkspace(), backup), /Missing song/);
  assert.throws(() => m.makeBackup(workspace, []), /Install KJV/);
});
test('restore preserves existing songs and differing Bible content with remapped dependencies', async () => {
  const {m, workspace} = await fixture(); const backup = m.makeBackup(workspace, [bible]);
  const current = m.clone(workspace); current.songs[0].lyrics = 'An existing edit';
  const existingBible = m.clone(bible); existingBible.data.John[3][0].text = 'Existing imported translation';
  const restored = m.mergeBackup(current, backup, [existingBible]);
  assert.equal(restored.workspace.songs[0].lyrics, 'An existing edit');
  const service = restored.workspace.sessions.at(-1);
  assert.notEqual(service.agenda[0].songId, 'song-a');
  assert.notEqual(service.agenda[1].code, 'KJV');
  assert.equal(service.agenda[1].code, restored.bibles[0].code);
  assert.equal(current.sessions.length, 1);
});
test('scripture shorthand resolves against the existing canonical book aliases', async () => {
  const m = await model; const books = [{name: 'Psalms', aliases: ['ps']}, {name: 'John', aliases: ['jn']}];
  assert.deepEqual(m.parseReference('Ps2,5', books), {book: 'Psalms', chapter: 2, start: 5, end: 5});
  assert.deepEqual(m.parseReference('John 3:16-17', books), {book: 'John', chapter: 3, start: 16, end: 17});
  assert.equal(m.parseReference('John 3:17-16', books), null);
});
test('song sections split at four lines without losing or duplicating lyrics', async () => {
  const m = await model; const slides = m.songSlides({id: 's', title: 'Song', lyrics: '1\n2\n3\n4\n5\n\nchorus'});
  assert.deepEqual(slides.map(slide => slide.text), ['1\n2\n3\n4', '5', 'chorus']);
  assert.equal(new Set(slides.map(slide => slide.id)).size, slides.length);
});
test('malformed backups cannot introduce unsafe display settings or duplicate verses', async () => {
  const {m, workspace} = await fixture(); workspace.settings.background = 'url(https://example.test/tracker)';
  assert.throws(() => m.validateWorkspace(workspace), /display settings/);
  assert.throws(() => m.validateBible({John: {3: [{verse: 16, text: 'a'}, {verse: 16, text: 'b'}]}}), /duplicate/);
});
test('the web build preserves desktop sources and caches every projector dependency', async () => {
  const root = path.resolve(__dirname, '../..');
  const original = fs.readFileSync(path.join(root, 'display.html'));
  const {build} = require('../build.cjs'); const result = await build();
  assert.deepEqual(fs.readFileSync(path.join(root, 'display.html')), original);
  const display = fs.readFileSync(path.join(result.destination, 'display.html'), 'utf8');
  assert.match(display, /const isDraftPreview = true/);
  assert.doesNotMatch(display, /fonts\.googleapis\.com|shared-events\.js/);
  assert.ok(result.core.includes('display.html') && result.core.includes('output-runtime.js') && result.core.includes('js/output-fit.js'));
  for (const name of result.core) assert.ok(fs.existsSync(path.join(result.destination, name)), name);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.destination, 'bible-books.json'))).length, 66);
  const sw = fs.readFileSync(path.join(result.destination, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /skipWaiting\s*\(/, 'updates must not interrupt a running service');
});
test('electron-builder excludes the entire web source and generated payload for every desktop build', () => {
  const root = path.resolve(__dirname, '../..');
  const {payloadConfig} = require('../../scripts/build-desktop');
  const {FileMatcher} = require('app-builder-lib/out/fileMatcher');
  for (const platform of ['win32', 'darwin']) for (const cloudContent of [false, true]) {
    const config = payloadConfig({platform, arch: 'x64', cloudContent}, path.join(root, 'output', 'web-package-check'));
    const filter = new FileMatcher(root, root, value => value, config.files).createFilter();
    const walk = directory => {
      for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file); else assert.equal(filter(file, fs.statSync(file)), false, path.relative(root, file));
      }
    }; walk(path.join(root, 'web'));
    assert.equal(filter(path.join(root, 'js', 'app.js'), fs.statSync(path.join(root, 'js', 'app.js'))), true);
  }
});
