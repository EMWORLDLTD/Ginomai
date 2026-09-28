const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
test('song previews preserve lyric lines and apostrophes while escaping HTML', () => {
  const c = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function escapeSongPreviewHtml('), source.indexOf('function updateImportLivePreview()')), c);
  assert.equal(c.escapeSongPreviewHtml("Ko'rin iyin\nGod's own Son"), 'Ko&#39;rin iyin\nGod&#39;s own Son');
  assert.equal(c.escapeSongPreviewHtml('<img src=x onerror="alert(1)"> &'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp;');
  assert.equal(c.escapeSongPreviewHtml('a\\b'), 'a\\b');
});
test('both preview renderers use HTML escaping rather than JavaScript escaping', () => {
  for (const [start, end] of [['function updateImportLivePreview()', '// -------------------------------------------------------------'], ['function updateSongEditorLivePreview(', '// Preserve wording']]) {
    const a = source.indexOf(start);
    const body = source.slice(a, source.indexOf(end, a));
    assert.ok(body.includes('escapeSongPreviewHtml(s.text)'));
    assert.ok(body.includes('escapeSongPreviewHtml(parsed.title)'));
    assert.ok(!body.includes('escapeHtml('));
  }
});
