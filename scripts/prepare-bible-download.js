'use strict';
// Prepare an optional Bible download. The Bible payload stays in ignored output/.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { DOMParser } = require('@xmldom/xmldom');
const repositoryRoot = path.resolve(__dirname, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function withSelectors(node) {
  node.querySelectorAll = selector => selector.split(',').flatMap(tag => Array.from(node.getElementsByTagName(tag.trim()), withSelectors));
  node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
  return node;
}

async function prepareBibleDownload({ sourcePath, code, name, language, projectRoot = repositoryRoot, output = path.join(projectRoot, 'output', 'content-packs') }) {
  if (!sourcePath || !/^[A-Z0-9_]{1,32}$/.test(code || '') || !name || !language) throw Error('Provide a Bible XML file, uppercase code, name and language.');
  const xml = await fs.readFile(sourcePath, 'utf8');
  class BrowserDOMParser { parseFromString(text, type) { return withSelectors(new DOMParser().parseFromString(text, type)); } }
  const context = vm.createContext({ window: {}, console, DOMParser: BrowserDOMParser });
  const importerSource = await fs.readFile(path.join(repositoryRoot, 'js', 'import-engine.js'), 'utf8');
  vm.runInContext(importerSource.replace('window.libraryImporter = new LibraryImportEngine();', 'window.libraryImporter = Object.create(LibraryImportEngine.prototype);'), context);
  const parsed = context.window.libraryImporter.parseBibleContent(xml, path.basename(sourcePath));
  const books = Object.values(parsed.data);
  if (!books.length) throw Error('The XML contains no recognised Bible books.');
  const chapters = books.flatMap(book => Object.values(book));
  const verses = chapters.flat();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const original = Array.from(doc.getElementsByTagName('verse'));
  if (original.length !== verses.length || original.some((verse, i) => verse.textContent.trim() !== verses[i].text)) {
    throw Error('The converted Bible does not preserve every source verse.');
  }
  const copyright = doc.documentElement.getAttribute('status') || '';
  const bytes = Buffer.from(JSON.stringify(parsed.data));
  const compressed = gzipSync(bytes, { level: 9 });
  const hash = digest(bytes), asset = `${code}--${code}--${hash.slice(0, 16)}.json.gz`;
  const file = { path: `bibles/${code}.json`, asset, bytes: bytes.length, downloadBytes: compressed.length, sha256: hash, compressedSha256: digest(compressed) };
  const pack = { code, name, version: digest(Buffer.from(hash)), copyright, files: [file] };
  const cataloguePath = path.join(projectRoot, 'bibles', 'manifest.json');
  const manifestPath = path.join(projectRoot, 'assets', 'content-packs', 'manifest.json');
  const catalogue = JSON.parse(await fs.readFile(cataloguePath, 'utf8'));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!manifest.baseUrl || new URL(manifest.baseUrl).protocol !== 'https:') throw Error('Configure HTTPS content hosting before preparing a download-only Bible.');
  const existing = catalogue.find(bible => bible.code === code);
  if (existing && !existing.cloudOnly) throw Error('Do not replace a bundled translation with a download-only pack.');
  const oldPack = manifest.packs.find(item => item.code === code);
  if (oldPack && oldPack.version !== pack.version) throw Error('This code already has a different immutable download. Use a distinct translation code.');
  const entry = { code, name, lang: language, size: `${(bytes.length / 1048576).toFixed(1)} MB`, booksCount: books.length, url: file.path, cloudOnly: true, copyright };
  if (existing) Object.assign(existing, entry); else catalogue.push(entry);
  if (oldPack) Object.assign(oldPack, pack); else manifest.packs.push(pack);
  await fs.mkdir(output, { recursive: true });
  const assetPath = path.join(output, asset);
  await fs.writeFile(assetPath, compressed);
  const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
  await fs.writeFile(cataloguePath, JSON.stringify(catalogue, null, 2) + '\n');
  await fs.writeFile(manifestPath, manifestJson);
  await fs.writeFile(path.join(output, 'manifest.json'), manifestJson);
  return { code, books: books.length, chapters: chapters.length, verses: verses.length, downloadBytes: compressed.length, installedBytes: bytes.length, assetPath };
}

if (require.main === module) {
  const [sourcePath, code, name, language] = process.argv.slice(2);
  prepareBibleDownload({ sourcePath, code, name, language }).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { prepareBibleDownload };
