'use strict';
// Optional integration check against an installed or copied EasyWorship profile.
// All Ginomai data and browser storage are isolated from the operator's library.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = process.env.EASYWORSHIP_PROFILE;
assert(profile && fs.existsSync(profile), 'Set EASYWORSHIP_PROFILE to a complete profile folder.');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ginomai-ew-browser-'));
process.env.SF_LIVE_STATE_FILE = path.join(temporary, 'live.json');
process.env.SF_MEDIA_DIR = path.join(temporary, 'backgrounds');
process.env.SF_PRESENTATION_DIR = path.join(temporary, 'presentations');
const { server } = require('../server');
(async () => {
  let browser;
  try {
    const expected = await require('../lib/software-migrator')().scan(profile);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.libraryImporter?.dbReady && window.themeManager);
    await page.evaluate(async () => { await window.libraryImporter.dbReady; openImportModal(); switchImportSubTab('migrate'); });
    assert(await page.locator('#import-migrate-execute-btn').isDisabled());
    await page.locator('#import-migrate-folder-path').fill(profile);
    await page.evaluate(() => handleMigrationScan());
    assert.match(await page.locator('#import-migrate-status').innerText(), new RegExp(`${expected.counts.songs} songs`));
    assert.match(await page.locator('#import-migrate-counts-row').innerText(), /Styles/);
    assert.equal(await page.locator('#import-migrate-execute-btn').isDisabled(), false);
    await page.locator('#import-migrate-duplicates').selectOption('replace');
    await page.evaluate(() => handleMigrationExecute());
    assert.match(await page.locator('#import-migrate-status').innerText(), new RegExp(`Imported ${expected.counts.songs} songs`));
    const imported = await page.evaluate(() => window.libraryImporter.customSongs.filter(s => s.sourceSoftware === 'easyworship'));
    assert.equal(imported.length, expected.counts.songs);
    assert(imported.every(song => song.stanzas.length && Object.hasOwn(song, 'copyright')));
    const mediaCount = fs.readdirSync(process.env.SF_MEDIA_DIR).filter(name => !name.endsWith('.json')).length;
    assert.equal(mediaCount, expected.counts.images + expected.counts.videos);
    // A second import keeps existing songs and reuses saved backgrounds/styles.
    await page.locator('#import-migrate-duplicates').selectOption('skip');
    await page.evaluate(() => handleMigrationExecute());
    assert.match(await page.locator('#import-migrate-status').innerText(), /Imported 0 songs/);
    assert.equal(fs.readdirSync(process.env.SF_MEDIA_DIR).filter(name => !name.endsWith('.json')).length, mediaCount);
    const screenshots = path.join(__dirname, '../scratch'); fs.mkdirSync(screenshots, { recursive: true });
    for (const mode of ['light', 'dark']) {
      await page.evaluate(mode => window.themeManager.setMode(mode), mode);
      await page.screenshot({ path: path.join(screenshots, `easyworship-migration-${mode}.png`) });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.libraryImporter?.dbReady && window.themeManager);
    await page.evaluate(async () => { await window.libraryImporter.dbReady; await window.loadSanctuaryUploads(false, true); });
    const restored = await page.evaluate(() => ({
      songs: window.libraryImporter.customSongs.filter(s => s.sourceSoftware === 'easyworship').length,
      styles: Object.values(window.SANCTUARY_THEMES).filter(t => t.importedStyle).length,
      brokenBindings: window.libraryImporter.customSongs.filter(s => s.themeId && !window.SANCTUARY_THEMES[s.themeId]).length
    }));
    assert.equal(restored.songs, expected.counts.songs);
    assert(restored.styles >= expected.counts.themes);
    assert.equal(restored.brokenBindings, 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ success: true, scanned: expected.counts, restored, repeatImport: 'existing songs kept; media reused', screenshots }));
  } finally {
    await browser?.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
