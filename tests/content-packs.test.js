'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { ContentPacks } = require('../lib/content-packs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function fixture(t, strongs = false) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ginomai-content-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'app');
  await fs.mkdir(root);
  const data = Buffer.from(JSON.stringify({ Genesis: { 1: [{ verse: 1, text: 'In the beginning' }] } }));
  const compressed = gzipSync(data);
  const code = strongs ? 'KJV_STRONGS' : 'NIV';
  const paths = strongs ? ['bibles/KJV_STRONGS.json', 'lexicon/strongs_unified.json'] : ['bibles/NIV.json'];
  const files = paths.map(relative => ({ path: relative, asset: path.basename(relative) + '.gz', bytes: data.length, downloadBytes: compressed.length, sha256: hash(data), compressedSha256: hash(compressed) }));
  const manifest = { schemaVersion: 1, baseUrl: 'https://example.test/content/v1', packs: [{ code, name: code, version: hash(data), files }] };
  const options = { root, directory: path.join(directory, 'persistent'), manifest };
  return { root, options, data, compressed, code, files };
}

test('verified downloads persist across a new app instance without a network', async t => {
  const f = await fixture(t);
  let requests = 0;
  const store = new ContentPacks({ ...f.options, fetcher: async url => { requests++; assert.equal(url.href, 'https://example.test/content/v1/NIV.json.gz'); return new Response(f.compressed); } });
  assert.equal((await store.status('NIV')).installed, false);
  await store.install('NIV');
  assert.deepEqual(await fs.readFile(await store.filePath('bibles/NIV.json')), f.data);
  const restarted = new ContentPacks({ ...f.options, fetcher: async () => { throw Error('offline'); } });
  assert.equal((await restarted.status('NIV')).installed, true);
  await restarted.install('NIV');
  assert.equal(requests, 1);
  await restarted.remove('NIV');
  assert.equal((await restarted.status('NIV')).installed, false);
});

test('bundled Bibles work with no cloud configuration and cannot be deleted', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'bibles'));
  await fs.writeFile(path.join(f.root, 'bibles', 'NIV.json'), f.data);
  const store = new ContentPacks({ ...f.options, baseUrl: '', fetcher: async () => { throw Error('Network should not be used'); } });
  assert.equal((await store.install('NIV')).bundled, true);
  await assert.rejects(store.remove('NIV'), /included with the app/);
});

test('corrupted and truncated downloads are rejected without installing partial content', async t => {
  const f = await fixture(t);
  for (const bytes of [Buffer.alloc(f.compressed.length), f.compressed.subarray(0, 8)]) {
    const store = new ContentPacks({ ...f.options, fetcher: async () => new Response(bytes) });
    await assert.rejects(store.install('NIV'), /verification/);
    assert.equal((await store.status('NIV')).installed, false);
    assert.equal(await store.filePath('bibles/NIV.json'), null);
    assert.deepEqual(await fs.readdir(path.join(f.options.directory, 'NIV')), []);
  }
});

test('Strong’s becomes available only after all files pass verification', async t => {
  const f = await fixture(t, true);
  let requests = 0;
  const store = new ContentPacks({ ...f.options, fetcher: async () => ++requests === 1 ? new Response(f.compressed) : new Response('missing', { status: 404 }) });
  await assert.rejects(store.install(f.code), /Could not download/);
  assert.equal(await store.filePath('bibles/KJV_STRONGS.json'), null);
  assert.equal(await store.filePath('lexicon/strongs_unified.json'), null);
  store.fetch = async () => new Response(f.compressed);
  await store.install(f.code);
  assert.equal((await store.status(f.code)).installed, true);
});

test('concurrent downloads share one request and permit retry after a connection failure', async t => {
  const f = await fixture(t);
  let requests = 0;
  const store = new ContentPacks({ ...f.options, fetcher: async () => { requests++; throw Error('offline'); } });
  const first = store.install('NIV');
  assert.equal(first, store.install('NIV'));
  await assert.rejects(first, /offline/);
  store.fetch = async () => { requests++; return new Response(f.compressed); };
  await store.install('NIV');
  assert.equal(requests, 2);
});

test('missing hosting, unknown codes and unsafe manifest paths fail before downloading', async t => {
  const f = await fixture(t);
  const store = new ContentPacks({ ...f.options, baseUrl: '' });
  await assert.rejects(store.install('NIV'), /not configured/);
  assert.throws(() => store.install('../outside'), /Unknown/);
  assert.throws(() => new ContentPacks({ ...f.options, baseUrl: 'http://example.test' }), /HTTPS/);
  f.options.manifest.packs[0].files[0].path = '../outside.json';
  assert.throws(() => new ContentPacks(f.options), /Invalid content file/);
});

test('a valid gzip hash cannot bypass the expected decompressed checksum', async t => {
  const f = await fixture(t);
  f.files[0].sha256 = '0'.repeat(64);
  const store = new ContentPacks({ ...f.options, fetcher: async () => new Response(f.compressed) });
  await assert.rejects(store.install('NIV'), /verification/);
  assert.equal((await store.status('NIV')).installed, false);
});

async function browserFixture(confirm) {
  const window = { showCustomConfirm: confirm };
  const notices = [];
  let installs = 0;
  const context = vm.createContext({ window, document: { addEventListener() {}, createElement() { return { style: {}, setAttribute() {} }; }, body: { appendChild(notice) { notices.push(notice); } } }, setInterval, clearInterval, fetch: async (url, options) => {
    if (options?.method === 'POST') installs++;
    return { ok: true, json: async () => ({ code: 'NIV', name: 'NIV', installed: false, cloudAvailable: true, downloadBytes: 1024 }) };
  } });
  vm.runInContext(await fs.readFile(path.join(__dirname, '../js/content-packs.js'), 'utf8'), context);
  return { window, notices, installs: () => installs };
}

test('cancelling the first-use prompt performs no download', async () => {
  const browser = await browserFixture(async () => false);
  assert.equal(await browser.window.ensureContentPack('NIV'), false);
  assert.equal(browser.installs(), 0);
  assert.equal(browser.notices.length, 0);
});

test('accepting first-use downloads once and updates one notice in place', async () => {
  let prompts = 0;
  const browser = await browserFixture(async () => { prompts++; return true; });
  const first = browser.window.ensureContentPack('NIV');
  assert.equal(first, browser.window.ensureContentPack('NIV'));
  assert.equal(await first, true);
  assert.equal(await browser.window.ensureContentPack('NIV'), true);
  assert.equal(prompts, 1);
  assert.equal(browser.installs(), 1);
  assert.equal(browser.notices.length, 1);
  assert.equal(browser.notices[0].hidden, true);
});

test('cancelling a translation download restores selection without projecting or rebuilding', async () => {
  const source = await fs.readFile(path.join(__dirname, '../js/app.js'), 'utf8');
  const start = source.indexOf('async function changeBibleVersion(ver)');
  const end = source.indexOf('async function setCompareVersion(ver)', start);
  const elements = new Map();
  const state = { bibleVersion: 'KJV' };
  let resolveLoad;
  const loading = new Promise(resolve => { resolveLoad = resolve; });
  const context = vm.createContext({ state, document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } }, ensureBibleLoaded: () => loading,
    renderDeck() { throw Error('Deck rebuilt during cancellation'); }, renderLibrary() { throw Error('Library rebuilt during cancellation'); }, reprojectCurrentLive() { throw Error('Projected during cancellation'); }
  });
  vm.runInContext(source.slice(start, end), context);
  const change = context.changeBibleVersion('NIV');
  assert.equal(state.bibleVersion, 'NIV');
  assert.equal(elements.get('bento-active-version-label').textContent, 'NIV');
  resolveLoad(false);
  await change;
  assert.equal(state.bibleVersion, 'KJV');
  assert.equal(elements.get('bento-active-version-label').textContent, 'KJV');
});
