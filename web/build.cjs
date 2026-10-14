'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const destination = path.join(__dirname, 'dist');
async function build() {
  // Never mutate or package the desktop sources; only copy their output renderer.
  // Remove only this build's generated directory, after verifying its exact workspace location.
  if (destination !== path.resolve(__dirname, 'dist') || !destination.startsWith(root + path.sep)) throw Error('Unsafe web output directory.');
  await fs.rm(destination, {recursive: true, force: true});
  await fs.mkdir(destination, {recursive: true});
  const files = ['index.html', 'app.css', 'app.mjs', 'model.mjs', 'store.mjs', 'output-runtime.js', 'manifest.webmanifest', 'icon.svg'];
  for (const file of files) await fs.copyFile(path.join(__dirname, file), path.join(destination, file));
  const cloudFiles = ['js/cloud-config.js', 'js/cloud-client.mjs', 'js/cloud-backup.mjs', 'js/cloud-account-panel.mjs', 'js/cloud-backups-service.mjs', 'js/cloud-analytics.mjs', 'js/cloud-admin.html', 'js/cloud-admin.mjs', 'css/cloud-account.css'];
  for (const file of cloudFiles) {
    await fs.mkdir(path.dirname(path.join(destination, file)), {recursive: true});
    await fs.copyFile(path.join(root, file), path.join(destination, file));
  }
  let display = await fs.readFile(path.join(root, 'display.html'), 'utf8');
  const marker = "const isDraftPreview = urlParams.has('draft') && urlParams.has('embedded');";
  if (!display.includes(marker) || !display.includes('window.applyState = applyState;')) throw Error('The projector renderer changed. Review the standalone output bridge before building.');
  display = display.replace(marker, 'const isDraftPreview = true; // Standalone web output uses the local bridge.');
  display = display.replace(/\s*<script src="js\/shared-events\.js"><\/script>/, '')
    .replace(/\s*<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g, '')
    .replace('</head>', '<meta name="viewport" content="width=device-width, initial-scale=1"></head>')
    .replace('</body>', '<script src="output-runtime.js"></script></body>');
  const dependencies = [...display.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)(?:\?[^"\s]*)?"/g)].map(match => match[1]);
  for (const file of new Set(dependencies)) {
    await fs.mkdir(path.dirname(path.join(destination, file)), {recursive: true});
    await fs.copyFile(path.join(root, file), path.join(destination, file));
  }
  await fs.writeFile(path.join(destination, 'display.html'), display);
  const imports = await fs.readFile(path.join(root, 'js', 'import-engine.js'), 'utf8');
  const metadata = imports.match(/const CANONICAL_BIBLE_BOOKS = (\[[\s\S]*?\]);/);
  if (!metadata) throw Error('Bible book metadata is missing.');
  const books = require('node:vm').runInNewContext(metadata[1], {}, {timeout: 1000});
  await fs.writeFile(path.join(destination, 'bible-books.json'), JSON.stringify(books));
  await fs.mkdir(path.join(destination, 'bibles'), {recursive: true});
  await fs.copyFile(path.join(root, 'bibles', 'KJV.json'), path.join(destination, 'bibles', 'KJV.json'));
  const core = [...new Set([...files, ...cloudFiles, 'display.html', 'bible-books.json', ...dependencies])];
  const hash = crypto.createHash('sha256');
  for (const file of core) hash.update(file).update(await fs.readFile(path.join(destination, file)));
  const template = await fs.readFile(path.join(__dirname, 'sw-template.js'), 'utf8');
  hash.update(template);
  const version = hash.digest('hex').slice(0, 16);
  await fs.writeFile(path.join(destination, 'sw.js'), template.replace('__VERSION__', JSON.stringify(version)).replace('__CORE__', JSON.stringify(core)));
  await fs.writeFile(path.join(destination, 'build-info.json'), JSON.stringify({version, core}, null, 2));
  console.log(`Ginomai Web built in web/dist (${core.length} offline application assets).`);
  return {destination, core, version};
}
if (require.main === module) build().catch(error => {console.error(error.message); process.exitCode = 1;});
module.exports = {build, destination};
