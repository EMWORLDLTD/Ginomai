'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DOMParser } = require('@xmldom/xmldom');
const source = fs.readFileSync(require.resolve('../js/import-engine.js'), 'utf8');

// Supply the browser's tag selectors on the installed XML DOM implementation.
function withSelectors(node) {
  node.querySelectorAll = selector => selector.split(',').flatMap(tag =>
    Array.from(node.getElementsByTagName(tag.trim()), withSelectors));
  node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
  return node;
}
class BrowserDOMParser {
  parseFromString(xml, type) { return withSelectors(new DOMParser().parseFromString(xml, type)); }
}
function importer() {
  const context = vm.createContext({ window:{},console,DOMParser:BrowserDOMParser });
  vm.runInContext(source.replace('window.libraryImporter = new LibraryImportEngine();',
    'window.libraryImporter = Object.create(LibraryImportEngine.prototype);'), context);
  return context.window.libraryImporter;
}

test('numbered XML imports canonical books, sparse verse numbers and Unicode metadata', () => {
  const engine = importer();
  let installed;
  engine.importBibleData = (code, data, name) => { installed = { code, data, name }; };
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <bible translation="Bíbélì Mímọ́">
      <testament name="Old"><book number="1"><chapter number="2">
        <verse number="3">Ọlọ́run &amp; <em>ìmọ́lẹ̀</em></verse>
      </chapter></book></testament>
      <testament name="New"><book number="40"><chapter number="1">
        <verse number="1">Matthew text</verse>
      </chapter></book><book number="66"><chapter number="22">
        <verse number="21">Final verse</verse>
      </chapter></book></testament>
    </bible>`;
  const result = engine.importRawFile(xml, 'Yoruba2014Bible.xml');
  assert.equal(result.success, true);
  assert.equal(result.bookCount, 3);
  assert.equal(installed.code, 'YORUBA2014');
  assert.equal(installed.name, 'Bíbélì Mímọ́');
  assert.deepEqual(Object.keys(installed.data), ['Genesis', 'Matthew', 'Revelation']);
  assert.equal(installed.data.Genesis[2][0].verse, 3);
  assert.equal(installed.data.Genesis[2][0].text, 'Ọlọ́run & ìmọ́lẹ̀');
  assert.equal(installed.data.Revelation[22][0].verse, 21);
});

test('numbered XML rejects unidentified books and invalid chapter or verse numbers', () => {
  const engine = importer();
  const parsed = engine.parseBibleContent(`<bible>
    <book number="999"><chapter number="1"><verse number="1">Unknown</verse></chapter></book>
    <book number="1"><chapter number="0"><verse number="1">Invalid chapter</verse></chapter>
      <chapter number="1"><verse number="0">Invalid verse</verse><verse number="2">Valid</verse></chapter>
    </book></bible>`, 'Numbered.xml');
  assert.deepEqual(Object.keys(parsed.data), ['Genesis']);
  assert.equal(parsed.name, 'NUMBERED');
  assert.equal(parsed.data.Genesis[1].length, 1);
  assert.equal(parsed.data.Genesis[1][0].verse, 2);
});

test('OpenSong, Zefania and OSIS XML still import', () => {
  const formats = [
    '<bible><b n="Genesis"><c n="1"><v n="1">Existing text</v></c></b></bible>',
    '<XMLBIBLE biblename="KJV"><BIBLEBOOK bname="Genesis"><CHAPTER cnumber="1"><VERS vnumber="1">Existing text</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>',
    '<osis><osisText osisIDWork="KJV"><verse osisID="Gen.1.1">Existing text</verse></osisText></osis>'
  ];
  for (const xml of formats) {
    const parsed = importer().parseBibleContent(xml, 'Existing.xml');
    assert.deepEqual(Object.keys(parsed.data), ['Genesis']);
    assert.equal(parsed.data.Genesis[1][0].verse, 1);
    assert.equal(parsed.data.Genesis[1][0].text, 'Existing text');
  }
});

test('supplied Yoruba Bible imports all books, chapters and verse text intact',
  { skip:!process.env.GINOMAI_BIBLE_XML_FIXTURE }, () => {
    const xml = fs.readFileSync(process.env.GINOMAI_BIBLE_XML_FIXTURE, 'utf8');
    const parsed = importer().parseBibleContent(xml, 'Yoruba2014Bible.xml');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const chapters = Object.values(parsed.data).flatMap(book => Object.values(book));
    const verses = chapters.flat();
    const original = Array.from(doc.getElementsByTagName('verse'));
    assert.equal(Object.keys(parsed.data).length, 66);
    assert.equal(chapters.length, 1189);
    assert.equal(verses.length, 31102);
    assert.equal(parsed.name, doc.documentElement.getAttribute('translation'));
    assert.ok(parsed.data.Genesis[1]);
    assert.ok(parsed.data.Matthew[1]);
    assert.ok(parsed.data.Revelation[22]);
    for (let i = 0; i < original.length; i++) {
      assert.equal(verses[i].verse, Number(original[i].getAttribute('number')));
      assert.equal(verses[i].text, original[i].textContent.trim());
    }
  });
