'use strict';
// Optional live-release check. Downloads into temporary storage, never the user's library.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ginomai-yoruba-live-'));
  process.env.GINOMAI_CONTENT_DIR = path.join(directory, 'content');
  process.env.SF_LIVE_STATE_FILE = path.join(directory, 'live.json');
  process.env.SF_MEDIA_DIR = path.join(directory, 'media');
  process.env.SF_PRESENTATION_DIR = path.join(directory, 'presentations');
  const { server } = require('../server');
  const { ContentPacks } = require('../lib/content-packs');
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const cookie = (await fetch(base)).headers.get('set-cookie').split(';')[0];
    const request = (route, options = {}) => fetch(base + route, { ...options, headers: { Cookie: cookie, ...(options.headers || {}) } });
    const catalogue = await (await request('/api/bibles/catalog')).json();
    const entry = catalogue.bibles.find(bible => bible.code === 'YOR');
    assert.equal(entry.cloudOnly, true);
    assert.equal(entry.installed, false);
    assert.equal(entry.bundled, false);
    assert.equal((await request('/api/bibles/download/YOR')).status, 404);
    const install = await request('/api/content-packs/YOR', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(install.status, 200, await install.text());
    const response = await request('/api/bibles/download/YOR');
    assert.equal(response.status, 200);
    const bible = await response.json();
    const books = Object.values(bible), chapters = books.flatMap(book => Object.values(book)), verses = chapters.flat();
    assert.equal(books.length, 66); assert.equal(chapters.length, 1189); assert.equal(verses.length, 31102);
    const offline = new ContentPacks({ directory: process.env.GINOMAI_CONTENT_DIR, fetcher: async () => { throw Error('Offline'); } });
    assert.equal((await offline.status('YOR')).installed, true);
    assert.equal((await offline.status('YOR')).bundled, false);
    await offline.install('YOR');
    assert.equal(JSON.parse(await fs.readFile(await offline.filePath('bibles/YOR.json'), 'utf8')).Genesis[1][0].text, bible.Genesis[1][0].text);
    await offline.remove('YOR');
    assert.equal((await offline.status('YOR')).installed, false);
    console.log(JSON.stringify({ success: true, code: 'YOR', books: books.length, chapters: chapters.length, verses: verses.length, downloadBytes: entry.downloadBytes, bundled: false, offlineRestart: true, removal: true }));
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
