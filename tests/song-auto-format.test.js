'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const formatter = source.slice(source.indexOf('function formatSongEditorLyrics('), source.indexOf('function insertTagIntoEditor('));
function setup() {
  const textarea = { value: '', focus() {}, setSelectionRange() {} };
  let updates = 0;
  const notices = [];
  const context = vm.createContext({
    window: {}, console,
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return textarea; } },
    localStorage: { getItem() { return null; }, setItem() {} }, SONGS_DATABASE: [],
    updateSongEditorLivePreview() { updates++; }, showToast(message) { notices.push(message); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/import-engine.js'), 'utf8'), context);
  vm.runInContext(formatter, context);
  return { context, textarea, notices, updates: () => updates };
}
test('formatting preserves order, section labels and balanced slide sizes through the real parser', () => {
  const { context } = setup();
  const input = '[Verse 1]\r\nOne\r\nTwo\r\nThree\r\nFour\r\n[Chorus]\r\nFive\r\nSix\r\nSeven\r\nEight\r\nNine';
  const formatted = context.formatSongEditorLyrics(input);
  const slides = context.window.libraryImporter.parseSongText(formatted).stanzas;
  assert.deepEqual(Array.from(slides, s => s.text.split('\n').length), [2, 2, 3, 2]);
  assert.deepEqual(Array.from(slides, s => s.type), ['Verse 1', 'Verse 1', 'Chorus', 'Chorus']);
  assert.equal(slides.map(s => s.text).join('\n'), 'One\nTwo\nThree\nFour\nFive\nSix\nSeven\nEight\nNine');
  assert.equal(context.formatSongEditorLyrics(formatted), formatted);
});
test('long paragraphs wrap without losing words and existing short sections stay separate', () => {
  const { context } = setup();
  const paragraph = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
  const formatted = context.formatSongEditorLyrics(paragraph);
  assert.equal(formatted.replace(/\s+/g, ' '), paragraph);
  for (const block of formatted.split('\n\n')) {
    assert.ok(block.split('\n').length <= 3);
    assert.ok(block.split('\n').every(line => line.length <= 60));
  }
  assert.equal(context.formatSongEditorLyrics('One\nTwo\n\nThree\nFour'), 'One\nTwo\n\nThree\nFour');
  assert.equal(context.formatSongEditorLyrics(formatted), formatted);
});
test('button updates the editor and preview, while empty input remains unchanged', () => {
  const instance = setup();
  instance.context.autoFormatSongEditor();
  assert.equal(instance.updates(), 0);
  assert.equal(instance.notices.length, 1);
  instance.textarea.value = 'One\nTwo\nThree\nFour';
  instance.context.autoFormatSongEditor();
  assert.equal(instance.textarea.value, 'One\nTwo\n\nThree\nFour');
  assert.equal(instance.updates(), 1);
});
