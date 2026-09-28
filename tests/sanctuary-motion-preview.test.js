'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('index.html contains sticky preview header and scrollable controls container', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.includes('class="sanctuary-preview-sticky-wrap"'), 'Should have sticky preview container');
  assert.ok(html.includes('class="sanctuary-output-controls-scroll"'), 'Should have scrollable controls container');
  assert.ok(html.includes('id="sanctuary-framing-preview"'), 'Should contain sanctuary framing preview element');
  assert.ok(html.includes('id="sanctuary-framing-video"'), 'Should contain framing video element');
});

test('bento-theme.css styles sanctuary-theme-card-video and sticky preview correctly', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/bento-theme.css'), 'utf8');
  assert.ok(css.includes('.sanctuary-theme-card-video'), 'CSS should style .sanctuary-theme-card-video');
  assert.ok(css.includes('.sanctuary-preview-sticky-wrap'), 'CSS should style .sanctuary-preview-sticky-wrap');
  assert.ok(css.includes('.sanctuary-output-controls-scroll'), 'CSS should style .sanctuary-output-controls-scroll');
  // Prohibit GPU backdrop blur
  assert.ok(!css.includes('.sanctuary-preview-sticky-wrap { backdrop-filter: blur'), 'No GPU blur allowed on preview wrap');
});

test('motion themes render looping video tags in grid while still themes use static backgrounds', () => {
  const themeManagerCode = fs.readFileSync(path.join(__dirname, '../js/theme-manager.js'), 'utf8');
  assert.ok(themeManagerCode.includes('const SANCTUARY_THEMES = {'), 'Should have SANCTUARY_THEMES');
  
  // Verify celestial_motion has videoUrl
  assert.ok(themeManagerCode.includes("videoUrl: 'Themes/celestial_worship_loop.webm'"));
  assert.ok(themeManagerCode.includes("videoUrl: 'Themes/golden_sunrise_loop.webm'"));
  assert.ok(themeManagerCode.includes("videoUrl: 'Themes/atmospheric_ember_loop.webm'"));
  assert.ok(themeManagerCode.includes("videoUrl: 'Themes/emerald_ambient_loop.webm'"));

  // Check app.js rendering logic
  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(appJs.includes('sanctuary-theme-card-video'), 'app.js should render sanctuary-theme-card-video');
  assert.ok(appJs.includes('<video class="sanctuary-theme-card-video"'), 'app.js should render video tag for videoUrl themes');
  assert.ok(appJs.includes('modal.querySelectorAll(\'video\').forEach(v => v.pause())'), 'app.js should pause all videos on modal close');
});

test('custom background cards render delete button and trigger custom confirm dialog', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(appJs.includes('sanctuary-theme-card-delete'), 'app.js should render sanctuary-theme-card-delete on custom cards');
  assert.ok(appJs.includes('window.deleteSanctuaryBackground'), 'app.js should invoke window.deleteSanctuaryBackground');

  const css = fs.readFileSync(path.join(__dirname, '../css/bento-theme.css'), 'utf8');
  assert.ok(css.includes('.sanctuary-theme-card-delete'), 'CSS should style .sanctuary-theme-card-delete');
  assert.ok(css.includes('.sanctuary-delete-selected-btn'), 'CSS should style .sanctuary-delete-selected-btn');

  const mediaJs = fs.readFileSync(path.join(__dirname, '../js/sanctuary-media.js'), 'utf8');
  assert.ok(mediaJs.includes('window.deleteSanctuaryBackground = async function'), 'sanctuary-media.js should define deleteSanctuaryBackground');
  assert.ok(mediaJs.includes('window.showCustomConfirm'), 'deleteSanctuaryBackground should invoke window.showCustomConfirm');
  assert.ok(mediaJs.includes("method: 'DELETE'"), 'deleteSanctuaryBackground should send DELETE request');
});

test('lib/sanctuary-media remove deletes media and metadata files', async () => {
  const os = require('node:os');
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sanctuary-media-delete-test-'));
  try {
    const store = require('../lib/sanctuary-media')(tempDir);
    const fakeId = 'upload_11111111-2222-3333-4444-555555555555';
    const jsonPath = path.join(tempDir, fakeId + '.json');
    const mediaPath = path.join(tempDir, fakeId + '.png');
    await fs.promises.writeFile(jsonPath, JSON.stringify({ id: fakeId, name: 'test.png', imageUrl: `/media/uploads/${fakeId}.png` }));
    await fs.promises.writeFile(mediaPath, Buffer.from('fake-png-data'));

    assert.equal(fs.existsSync(jsonPath), true);
    assert.equal(fs.existsSync(mediaPath), true);

    const res = await store.remove(fakeId);
    assert.equal(res.success, true);
    assert.equal(res.id, fakeId);
    assert.equal(fs.existsSync(jsonPath), false);
    assert.equal(fs.existsSync(mediaPath), false);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('deleteSanctuaryBackground keeps sanctuary theme modal open and protects against escape closure', () => {
  const mediaJs = fs.readFileSync(path.join(__dirname, '../js/sanctuary-media.js'), 'utf8');
  assert.ok(mediaJs.includes("modal.style.display = 'flex'"), 'sanctuary-media.js should ensure modal remains display: flex');
  assert.ok(mediaJs.includes("modal.classList.add('open')"), 'sanctuary-media.js should ensure modal retains open class');
  assert.ok(mediaJs.includes("modal.inert = false"), 'sanctuary-media.js should ensure modal is interactive');

  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(appJs.includes("const customDialog = document.getElementById('sf-custom-dialog-backdrop');"), 'app.js should inspect customDialog before closing sanctuary modal on Escape');
  assert.ok(appJs.includes("if (customDialog && (customDialog.style.display === 'flex' || customDialog.classList.contains('open'))) return;"), 'app.js should not close sanctuary modal when custom dialog is active');

  const a11yJs = fs.readFileSync(path.join(__dirname, '../js/accessibility.js'), 'utf8');
  assert.ok(a11yJs.includes("!/close|cancel/i.test(el.className"), 'accessibility.js should avoid focusing close buttons on focus fallback');
});
