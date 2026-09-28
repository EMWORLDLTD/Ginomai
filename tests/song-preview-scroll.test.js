'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function setup() {
  const editor = { scrollHeight:1000, clientHeight:200, scrollTop:0 };
  const preview = { scrollHeight:2000, clientHeight:400, scrollTop:0 };
  const frames = new Map();
  let id = 0;
  const context = vm.createContext({
    document: { getElementById: key => ({ editor, preview })[key] },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); }
  });
  vm.runInContext(source.slice(source.indexOf('function syncSongPreviewScroll('), source.indexOf('function updateImportLivePreview()')), context);
  return { editor, preview, frames, context };
}
test('preview follows editor scrolling in both directions, including boundaries', () => {
  const { editor, preview, context } = setup();
  for (const [scroll, expected] of [[400,800],[800,1600],[200,400],[0,0],[-10,0],[900,1600]]) {
    editor.scrollTop = scroll;
    context.syncSongPreviewScroll(editor, 'preview');
    assert.equal(preview.scrollTop, expected);
  }
  editor.scrollHeight = editor.clientHeight;
  context.syncSongPreviewScroll(editor, 'preview');
  assert.equal(preview.scrollTop, 0);
});
test('typing synchronization waits for caret scrolling and coalesces repeated updates', () => {
  const { editor, preview, context, frames } = setup();
  context.scheduleSongPreviewScroll('editor', 'preview');
  context.scheduleSongPreviewScroll('editor', 'preview');
  assert.equal(frames.size, 1);
  editor.scrollTop = 800;
  [...frames.values()][0]();
  assert.equal(preview.scrollTop, 1600);
});
