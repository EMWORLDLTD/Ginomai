'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzip } = require('node:zlib');
const { promisify } = require('node:util');
const compress = promisify(gzip);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(__dirname, '..');

async function buildContentPacks({ baseUrl, output = path.join(root, 'output', 'content-packs') } = {}) {
  if (baseUrl === undefined) {
    try { baseUrl = JSON.parse(await fs.readFile(path.join(root, 'assets', 'content-packs', 'manifest.json'), 'utf8')).baseUrl || ''; }
    catch (error) { if (error.code !== 'ENOENT') throw error; baseUrl = ''; }
  }
  if (baseUrl && new URL(baseUrl).protocol !== 'https:') throw Error('Content downloads require an HTTPS URL.');
  const bibles = JSON.parse(await fs.readFile(path.join(root, 'bibles', 'manifest.json'), 'utf8'));
  const manifest = { schemaVersion: 1, baseUrl: baseUrl.replace(/\/$/, ''), packs: [] };
  await fs.mkdir(output, { recursive: true });
  for (const bible of bibles) {
    const paths = [`bibles/${bible.code}.json`];
    if (bible.code === 'KJV_STRONGS') paths.push('lexicon/strongs_unified.json', 'lexicon/strongs_lexicon.json');
    const files = [];
    for (const relative of paths) {
      const bytes = await fs.readFile(path.join(root, relative));
      const compressed = await compress(bytes, { level: 9 });
      const sha256 = digest(bytes);
      const asset = `${bible.code}--${path.basename(relative, '.json')}--${sha256.slice(0, 16)}.json.gz`;
      await fs.writeFile(path.join(output, asset), compressed);
      files.push({ path: relative, asset, bytes: bytes.length, downloadBytes: compressed.length, sha256, compressedSha256: digest(compressed) });
    }
    manifest.packs.push({ code: bible.code, name: bible.name, version: digest(Buffer.from(files.map(file => file.sha256).join(':'))), files });
  }
  const metadata = JSON.stringify(manifest, null, 2) + '\n';
  await fs.writeFile(path.join(output, 'manifest.json'), metadata);
  await fs.mkdir(path.join(root, 'assets', 'content-packs'), { recursive: true });
  await fs.writeFile(path.join(root, 'assets', 'content-packs', 'manifest.json'), metadata);
  return manifest;
}

if (require.main === module) {
  buildContentPacks({ baseUrl: process.env.GINOMAI_CONTENT_BASE_URL || undefined }).then(manifest => {
    const bytes = manifest.packs.flatMap(pack => pack.files).reduce((sum, file) => sum + file.downloadBytes, 0);
    console.log(`Prepared ${manifest.packs.length} verified content packs (${(bytes / 1048576).toFixed(2)} MiB compressed) in output/content-packs.`);
    if (!manifest.baseUrl) console.log('Hosting URL is not configured. Bundled content stays included in desktop builds.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildContentPacks, digest };
