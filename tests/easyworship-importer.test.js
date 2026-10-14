'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ew = require('../lib/easyworship-importer');
const createMigrator = require('../lib/software-migrator');
const createMedia = require('../lib/sanctuary-media');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ginomai-ew-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const profile = path.join(dir, 'Copied Custom Profile');
  const data = path.join(profile, 'v6.1', 'Databases', 'Data');
  await fs.mkdir(data, { recursive: true });
  await fs.mkdir(path.join(profile, 'Resources', 'Images', 'Set A'), { recursive: true });
  await fs.mkdir(path.join(profile, 'Resources', 'Images', 'Set B'), { recursive: true });
  await fs.writeFile(path.join(profile, 'Resources', 'Images', 'Set A', 'Backdrop.png'), 'AAAA');
  await fs.writeFile(path.join(profile, 'Resources', 'Images', 'Set B', 'Backdrop.png'), 'BBBB');
  function database(name, sql) {
    const db = new DatabaseSync(path.join(data, name));
    try { db.exec(sql); } finally { db.close(); }
  }
  database('Songs.db', `CREATE TABLE song(rowid INTEGER PRIMARY KEY, song_item_uid TEXT, title TEXT, author TEXT, copyright TEXT, administrator TEXT, reference_number TEXT, presentation_id INTEGER);
    INSERT INTO song VALUES(1,'song-one','Test Song','Test Author','Copyright retained','Publisher','12345',10);
    INSERT INTO song VALUES(2,'song-empty','Missing Words','Author','','','',NULL);`);
  const words = new DatabaseSync(path.join(data, 'SongWords.db'));
  words.exec('CREATE TABLE word(rowid INTEGER PRIMARY KEY,song_id INTEGER,words TEXT)');
  words.prepare('INSERT INTO word VALUES(1,1,?)').run(String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}\f0 Verse 1\par First line\line Second line\par\par Chorus\par Sing \u7884?l\u7885?run\par}`);
  words.close();
  database('Themes.db', `CREATE TABLE file_item(rowid INTEGER PRIMARY KEY,file_item_uid TEXT,title TEXT,presentation_id INTEGER);
    INSERT INTO file_item VALUES(1,'theme-one','Test Style',10);`);
  database('PresentationLayouts.db', `
    CREATE TABLE slide(rowid INTEGER PRIMARY KEY,presentation_id INTEGER,slide_uid TEXT,title TEXT,theme_id INTEGER,modified_theme_id INTEGER);
    INSERT INTO slide VALUES(1,10,'MASTER','Master',NULL,NULL);
    CREATE TABLE element(rowid INTEGER PRIMARY KEY,slide_id INTEGER,element_uid TEXT,background_resource_id INTEGER,foreground_resource_id INTEGER);
    INSERT INTO element VALUES(1,1,'BACKGROUND',NULL,20);
    INSERT INTO element VALUES(2,1,'CONTENT_SONG',NULL,NULL);
    CREATE TABLE resource_image(resource_id INTEGER,original_filename TEXT,width INTEGER,height INTEGER);
    INSERT INTO resource_image VALUES(20,'<images>Set A\\Backdrop.png',1280,720);
    CREATE TABLE element_property_group(rowid INTEGER PRIMARY KEY,link_id INTEGER,group_name TEXT);
    INSERT INTO element_property_group VALUES(1,2,'Text_Format');
    CREATE TABLE element_property(group_id INTEGER,key TEXT,value TEXT);
    INSERT INTO element_property VALUES(1,'FontName','Verdana');
    INSERT INTO element_property VALUES(1,'Color','255');
  `);
  return { dir, profile, data, database };
}

test('RTF reader keeps Unicode, escaped characters and sections without leaking formatting or hidden text', () => {
  const text = ew.rtfToText(String.raw`{\rtf1\ansi{\fonttbl{\f0 FakeFont;}}{\*\private secret}\uc1 Verse 1\par Caf\'e9 \u7884?l\u7885?run \{yes\} \\ word\line {\v hidden}visible\par}`);
  assert.equal(text, 'Verse 1\nCafé Ọlọrun {yes} \\ word\nvisible');
  const song = ew.convertSong({ title: 'Title' }, String.raw`{\rtf1 Verse 1\par One\line Two\par Chorus 2\par Three}`);
  assert.deepEqual(song.stanzas, [{ type: 'Verse 1', text: 'One\nTwo' }, { type: 'Chorus 2', text: 'Three' }]);
});

test('copied custom profiles and their database subfolders scan read only with accurate counts', async t => {
  const f = await fixture(t), migrator = createMigrator();
  const before = await fs.readFile(path.join(f.data, 'Songs.db'));
  for (const folder of [f.dir, f.profile, path.join(f.profile, 'v6.1'), path.dirname(f.data), f.data]) {
    const scan = await migrator.scan(folder);
    assert.equal(scan.softwareType, 'easyworship');
    assert.equal(scan.counts.songs, 1);
    assert.equal(scan.counts.images, 2);
    assert.equal(scan.counts.themes, 1);
    assert.match(scan.detected.warnings.join(' '), /Missing Words/);
  }
  assert.deepEqual(await fs.readFile(path.join(f.data, 'Songs.db')), before);
  assert.equal((await fs.readdir(f.data)).some(n => /-(wal|shm|journal)$/.test(n)), false);
});

test('incomplete and ambiguous profiles require an explicit complete profile', async t => {
  const f = await fixture(t);
  await fs.rename(path.join(f.data, 'SongWords.db'), path.join(f.data, 'Words.backup'));
  await assert.rejects(createMigrator().scan(f.profile), /SongWords.db is missing/);
  await fs.rename(path.join(f.data, 'Words.backup'), path.join(f.data, 'SongWords.db'));
  const other = path.join(f.dir, 'Other Profile');
  await fs.cp(f.profile, other, { recursive: true });
  await assert.rejects(createMigrator().scan(f.dir), /More than one EasyWorship profile/);
});

test('migration preserves credits, resolves nested backgrounds and persists styles without duplicate media copies', async t => {
  const f = await fixture(t), store = createMedia(path.join(f.dir, 'Imported Media'));
  const migrator = createMigrator(store);
  const result = await migrator.execute({ folderPath: f.profile });
  assert.equal(result.importedCounts.songs, 1);
  assert.equal(result.importedCounts.images, 2);
  assert.equal(result.songs[0].copyright, 'Copyright retained');
  assert.equal(result.songs[0].ccli, '12345');
  assert.equal(result.songs[0].stanzas[1].text, 'Sing Ọlọrun');
  const style = result.themes.find(t => t.name === 'Test Style');
  assert.equal(style.font, 'Verdana');
  assert.equal(style.textColor, '#ff0000');
  assert.equal(style.type, 'image');
  const assetPath = path.join(f.dir, 'Imported Media', path.basename(style.imageUrl));
  assert.equal(await fs.readFile(assetPath, 'utf8'), 'AAAA');
  assert.ok(result.songs[0].themeId);
  await migrator.execute({ folderPath: f.profile });
  const reloaded = await createMedia(path.join(f.dir, 'Imported Media')).list();
  assert.equal(reloaded.length, 4); // Two assets and two metadata-only styles.
  assert.equal((await fs.readdir(path.join(f.dir, 'Imported Media'))).filter(n => n.endsWith('.png')).length, 2);
  await assert.rejects(store.remove(style.sourceMediaId), /used by imported styles/);
  for (const item of reloaded.filter(t => t.importedStyle)) await store.remove(item.id);
  assert.equal(await fs.readFile(assetPath, 'utf8'), 'AAAA');
  await store.remove(style.sourceMediaId);
  await assert.rejects(fs.stat(assetPath), { code: 'ENOENT' });
});

test('unchecked categories stay excluded and missing media produces a visible fallback notice', async t => {
  const f = await fixture(t), store = createMedia(path.join(f.dir, 'Imported Media'));
  const migrator = createMigrator(store);
  const none = await migrator.execute({ folderPath: f.profile, importSongs: false, importMedia: false, importThemes: false });
  assert.equal(none.songs.length + none.mediaItems.length + none.themes.length, 0);
  const styles = await migrator.execute({ folderPath: f.profile, importSongs: false, importMedia: false });
  assert.equal(styles.themes[0].type, 'gradient');
  assert.match(styles.warnings.join(' '), /media was not imported/);
  await fs.rm(path.join(f.profile, 'Resources'), { recursive: true });
  const missing = await migrator.scan(f.profile);
  assert.equal(missing.counts.songs, 1);
  assert.match(missing.detected.warnings.join(' '), /Resources folder is missing/);
});

test('gradient stops use percentage positions and unsupported schedules are not counted as imports', async t => {
  const f = await fixture(t);
  f.database('PresentationLayouts.db', `UPDATE element SET foreground_resource_id=21 WHERE element_uid='BACKGROUND';
    CREATE TABLE resource_gradient(resource_id INTEGER,angle INTEGER);
    INSERT INTO resource_gradient VALUES(21,90);
    CREATE TABLE resource_gradient_color(resource_id INTEGER,color_from INTEGER,color_to INTEGER,percent_from REAL,percent_to REAL);
    INSERT INTO resource_gradient_color VALUES(21,255,16711680,0,1);`);
  const parsed = ew.readProfile(await ew.findProfile(f.profile));
  assert.equal(parsed.themes[0].bgCss, 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  await fs.writeFile(path.join(f.profile, 'Service.ewsx'), 'not supported');
  const scan = await createMigrator().scan(f.profile);
  assert.equal(scan.counts.agendas, 0);
  assert.match(scan.detected.warnings.join(' '), /schedules.*cannot be imported/);
});

function client(result) {
  const values = new Map(), database = [], writes = [];
  const context = vm.createContext({ window: { SANCTUARY_THEMES: {} }, console,
    SONGS_DATABASE: database, localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) },
    fetch: async () => ({ ok: true, json: async () => structuredClone(result) }) });
  vm.runInContext(syncFs.readFileSync(require.resolve('../js/import-engine.js'), 'utf8').replace(
    'window.libraryImporter = new LibraryImportEngine();', 'window.libraryImporter = Object.create(LibraryImportEngine.prototype);'), context);
  const engine = context.window.libraryImporter;
  engine.customSongs = []; engine.db = null;
  engine.cleanMarkup = text => String(text || '');
  return { engine, database, values, context, writes };
}

test('client keeps existing songs by default, allows replacement and retains credits and style bindings on reload', async () => {
  const song = { id: 'new', title: 'Test Song', author: 'Author', stanzas: [{ type: 'Verse 1', text: 'New lyrics' }], copyright: 'Copyright', themeId: 'upload_style' };
  const c = client({ songs: [song], themes: [{ id: 'upload_style' }], importedCounts: { songs: 1 }, bibles: [], agendas: [] });
  c.engine.customSongs.push({ ...song, id: 'existing', stanzas: [{ type: 'Verse 1', text: 'Existing lyrics' }] });
  c.database.push(c.engine.customSongs[0]);
  const kept = await c.engine.executeMigration({});
  assert.equal(kept.importedCounts.songs, 0);
  assert.equal(kept.skippedCounts.songs, 1);
  assert.equal(c.engine.customSongs[0].stanzas[0].text, 'Existing lyrics');
  const replaced = await c.engine.executeMigration({ duplicatePolicy: 'replace' });
  assert.equal(replaced.importedCounts.songs, 1);
  const saved = JSON.parse(c.values.get('sf_custom_songs'))[0];
  assert.equal(saved.id, 'existing');
  assert.equal(saved.copyright, 'Copyright');
  assert.equal(saved.themeId, 'upload_style');
  assert.equal(saved.stanzas[0].text, 'New lyrics');
  assert.ok(c.context.window.SANCTUARY_THEMES.upload_style);
});

test('different EasyWorship songs sharing one title remain separate and repeat imports recognise both source IDs', async () => {
  const songs = ['first', 'second'].map(sourceId => ({ id: 'song_' + sourceId, sourceSoftware: 'easyworship', sourceId, title: 'Same Title', stanzas: [{ type: 'Verse 1', text: sourceId }] }));
  const c = client({ songs, importedCounts: { songs: 2 } });
  const first = await c.engine.executeMigration({ duplicatePolicy: 'replace' });
  assert.equal(first.importedCounts.songs, 2);
  assert.equal(c.engine.customSongs.length, 2);
  const repeat = await c.engine.executeMigration({});
  assert.equal(repeat.importedCounts.songs, 0);
  assert.equal(repeat.skippedCounts.songs, 2);
});

test('an aborted song batch restores the previous library and reports failure', async () => {
  const c = client({ songs: [{ id: 'new', title: 'New Song', stanzas: [{ text: 'Lyrics' }] }], importedCounts: { songs: 1 } });
  let transactions = 0;
  c.engine.db = { transaction() {
    transactions++;
    const tx = { objectStore: () => ({ put() {} }) };
    queueMicrotask(() => tx.onabort());
    return tx;
  } };
  await assert.rejects(c.engine.executeMigration({}), /Could not save the imported songs/);
  assert.equal(transactions, 1);
  assert.equal(c.engine.customSongs.length, 0);
  assert.equal(c.database.length, 0);
});
