'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { prepareBibleDownload } = require('../scripts/prepare-bible-download');
const { ContentPacks } = require('../lib/content-packs');

test('Yoruba is a download-only translation and remains excluded even from bundled-content installers', () => {
  const root = path.resolve(__dirname, '..');
  const catalogue = require('../bibles/manifest.json');
  const entry = catalogue.find(bible => bible.code === 'YOR');
  assert.equal(entry.cloudOnly, true);
  assert.equal(entry.booksCount, 66);
  assert.match(entry.copyright, /Biblica/);
  const pack = require('../assets/content-packs/manifest.json').packs.find(pack => pack.code === 'YOR');
  assert(pack.files[0].downloadBytes > 0);
  assert.equal(syncFs.existsSync(path.join(root, 'bibles/YOR.json')), false);
  const { FileMatcher } = require('app-builder-lib/out/fileMatcher');
  const { payloadConfig } = require('../scripts/build-desktop');
  for (const platform of ['win32', 'darwin']) for (const cloudContent of [true, false]) {
    const filter = new FileMatcher(root, root, value => value, payloadConfig({ platform, arch: 'x64', cloudContent }, 'unused').files).createFilter();
    assert.equal(filter(path.join(root, 'bibles/YOR.json'), syncFs.statSync(path.join(root, 'index.html'))), false);
  }
});

test('prepared Bible downloads retain attribution and Unicode, verify integrity and persist offline without bundling source data', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ginomai-yoruba-download-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'app');
  await fs.mkdir(path.join(root, 'bibles'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets/content-packs'), { recursive: true });
  await fs.writeFile(path.join(root, 'bibles/manifest.json'), '[]');
  await fs.writeFile(path.join(root, 'assets/content-packs/manifest.json'), JSON.stringify({ schemaVersion: 1, baseUrl: 'https://example.test/content', packs: [] }));
  const sourcePath = path.join(directory, 'Yoruba.xml');
  await fs.writeFile(sourcePath, '<bible translation="Yoruba" status="Original attribution"><book number="1"><chapter number="1"><verse number="1">Ọlọ́run &amp; ìmọ́lẹ̀</verse><verse number="2">Ìbẹ̀rẹ̀</verse></chapter></book></bible>');
  const result = await prepareBibleDownload({ sourcePath, code: 'YOR', name: 'Yoruba', language: 'Yoruba', projectRoot: root });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'assets/content-packs/manifest.json'), 'utf8'));
  assert.equal(manifest.packs[0].copyright, 'Original attribution');
  let requests = 0;
  const options = { root, directory: path.join(directory, 'downloads'), manifest };
  const store = new ContentPacks({ ...options, fetcher: async url => {
    requests++;
    assert.equal(url.href, 'https://example.test/content/' + path.basename(result.assetPath));
    return new Response(await fs.readFile(result.assetPath));
  } });
  assert.equal((await store.status('YOR')).installed, false);
  assert.equal(requests, 0);
  await store.install('YOR');
  const file = await store.filePath('bibles/YOR.json');
  const bible = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(bible.Genesis[1][0].text, 'Ọlọ́run & ìmọ́lẹ̀');
  assert.equal(bible.Genesis[1][1].text, 'Ìbẹ̀rẹ̀');
  await assert.rejects(fs.stat(path.join(root, 'bibles/YOR.json')), { code: 'ENOENT' });
  const restarted = new ContentPacks({ ...options, fetcher: async () => { throw Error('Offline'); } });
  assert.equal((await restarted.status('YOR')).installed, true);
  await restarted.install('YOR');
  assert.equal(requests, 1);
  await restarted.remove('YOR');
  assert.equal((await restarted.status('YOR')).installed, false);
});
