// Package the main app first, then the branded installer with its offline payload.
'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { build, Platform, Arch } = require('electron-builder');
const { sha256, inventory, run } = require('../electron/installer/install-engine');
const { buildContentPacks, digest } = require('./build-content-packs');

const projectRoot = path.resolve(__dirname, '..');
const installerRoot = path.join(projectRoot, 'electron', 'installer');
const installersDir = path.join(projectRoot, 'installers');

function options(argv, host = process.platform, hostArch = process.arch) {
  const platform = argv.includes('--mac') ? 'darwin' : 'win32';
  if (platform === 'darwin' && host !== 'darwin') throw new Error('Build macOS installers on a Mac.');
  const archIndex = argv.indexOf('--arch');
  const arch = archIndex === -1 ? (platform === 'darwin' ? hostArch : 'x64') : argv[archIndex + 1];
  if (!['x64', 'arm64'].includes(arch) || (platform === 'win32' && arch !== 'x64')) throw new Error('Use x64 for Windows, or x64 / arm64 for macOS.');
  return { platform, arch, publish:argv.includes('--publish'), nativeOnly:argv.includes('--native-only'), cloudContent:argv.includes('--cloud-content') };
}

function payloadConfig(settings, output) {
  const mac = settings.platform === 'darwin';
  // Inherit the updater feed from package.json; the build's publish option controls uploads.
  return {
    directories:{ output },
    files:[...require('../package.json').build.files, '!electron/installer/**', '!output/**', '!docs/installer.md', ...(settings.cloudContent ? ['!bibles/!(KJV|manifest).json', '!lexicon/**'] : [])],
    ...(mac ? {
      mac:{ target:[{ target:'zip', arch:[settings.arch] }], artifactName:'Ginomai-${version}-mac-${arch}.${ext}' }
    } : {
      nsis:{ include:path.join(installerRoot, 'windows.nsh'), artifactName:'Ginomai-${version}-native-${arch}.${ext}', runAfterFinish:false }
    })
  };
}

function wrapperConfig(settings, output, payload, manifestFile, version) {
  const mac = settings.platform === 'darwin';
  return {
    appId:'com.ginomai.setup', productName:'Install Ginomai', asar:true,
    electronVersion:require('electron/package.json').version,
    directories:{ output }, extraMetadata:{ version },
    files:['main.js', 'preload.js', 'install-engine.js', 'renderer.js', 'index.html', 'installer.css', 'icon.svg', 'package.json'],
    extraResources:[
      { from:payload, to:mac ? 'payload/Ginomai.app' : 'payload/setup.exe' },
      { from:manifestFile, to:'installer-manifest.json' }
    ],
    publish:null,
    ...(mac ? {
      mac:{ category:'public.app-category.utilities', artifactName:'Ginomai-Setup-${version}-mac-${arch}.${ext}' },
      dmg:{ title:'Install Ginomai', window:{ width:440, height:300 }, contents:[{ x:220, y:145, type:'file' }] }
    } : {
      win:{ executableName:'Ginomai Setup', artifactName:'Ginomai-Setup-${version}-win-${arch}.${ext}' },
      portable:{ requestExecutionLevel:'user' }
    })
  };
}

async function main() {
  const settings = options(process.argv.slice(2));
  if (settings.cloudContent) {
    const baseUrl = process.env.GINOMAI_CONTENT_BASE_URL || process.env.GINOMIA_CONTENT_BASE_URL || require('../assets/content-packs/manifest.json').baseUrl;
    if (!baseUrl) throw Error('Set GINOMAI_CONTENT_BASE_URL to the published HTTPS content release before building --cloud-content.');
    const manifest = await buildContentPacks({ baseUrl });
    console.log('Verifying published content packs before excluding bundled translations and Strong’s…');
    await verifyPublishedContent(manifest);
  }
  const version = require('../package.json').version;
  const platform = settings.platform === 'darwin' ? Platform.MAC : Platform.WINDOWS;
  const arch = Arch[settings.arch];
  const stage = await fsp.mkdtemp(path.join(os.tmpdir(), 'ginomai-build-'));
  const payloadOutput = path.join(stage, 'application');
  await fsp.mkdir(installersDir, { recursive:true });
  console.log(`Building Ginomai ${version} for ${settings.platform} (${settings.arch})`);
  try {
    const nativeArtifacts = await build({
      projectDir:projectRoot,
      targets:platform.createTarget(settings.platform === 'darwin' ? ['zip'] : ['nsis', 'portable'], arch),
      config:payloadConfig(settings, payloadOutput), publish:settings.publish ? 'always' : 'never'
    });
    for (const artifact of nativeArtifacts) await fsp.copyFile(artifact, path.join(installersDir, path.basename(artifact)));
    // Updater metadata references native app artifacts, never the setup shell.
    for (const name of await fsp.readdir(payloadOutput)) {
      if (/\.(yml|blockmap)$/.test(name)) await fsp.copyFile(path.join(payloadOutput, name), path.join(installersDir, name));
    }
    if (settings.nativeOnly) return;
    const mac = settings.platform === 'darwin';
    const appDirectory = path.join(payloadOutput, mac ? (settings.arch === 'x64' ? 'mac' : 'mac-arm64') : 'win-unpacked', ...(mac ? ['Ginomai.app'] : []));
    const payload = mac ? appDirectory : nativeArtifacts.find(name => path.basename(name) === `Ginomai-${version}-native-${settings.arch}.exe`);
    if (!payload) throw new Error('The native application installer was not produced.');
    const files = await inventory(appDirectory);
    const manifest = {
      version, platform:settings.platform, arch:settings.arch, appId:require('../package.json').build.appId,
      installedBytes:files.reduce((sum, file) => sum + file.size, 0),
      appSha256:await sha256(path.join(appDirectory, ...(mac ? ['Contents', 'Resources'] : ['resources']), 'app.asar')),
      ...(mac ? { signed:false } : { payloadSha256:await sha256(payload) })
    };
    if (mac) {
      try { await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appDirectory]); manifest.signed = true; }
      catch { console.warn('This local application build is unsigned. Release builds need Apple signing credentials.'); }
    }
    const manifestFile = path.join(stage, 'installer-manifest.json');
    await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    console.log('Packaging the branded offline setup app…');
    await build({
      projectDir:installerRoot, targets:platform.createTarget(mac ? ['dir'] : ['portable'], arch),
      config:wrapperConfig(settings, installersDir, payload, manifestFile, version), publish:'never'
    });
    if (mac) {
      // Use macOS's own disk-image tool; no extra DMG tool download is needed.
      const imageSource = path.join(installersDir, settings.arch === 'x64' ? 'mac' : 'mac-arm64');
      const imageFile = path.join(installersDir, `Ginomai-Setup-${version}-mac-${settings.arch}.dmg`);
      await run('/usr/bin/hdiutil', ['create', '-ov', '-volname', 'Install Ginomai', '-srcfolder', imageSource, '-format', 'UDZO', imageFile]);
    }
    console.log(`Installers saved to ${installersDir}`);
    if (settings.publish) console.log('Native updater artifacts were published. Branded setup is saved locally for distribution.');
  } finally { await fsp.rm(stage, { recursive:true, force:true }); }
}

if (require.main === module) main().catch(error => { console.error('Desktop build failed:', error.stack || error); process.exitCode = 1; });
async function verifyPublishedContent(manifest, fetcher = fetch) {
  if (!manifest.baseUrl || new URL(manifest.baseUrl).protocol !== 'https:') throw Error('Published content requires an HTTPS URL.');
  for (const file of manifest.packs.filter(pack => pack.code !== 'KJV').flatMap(pack => pack.files)) {
    const response = await fetcher(new URL(file.asset, manifest.baseUrl.replace(/\/$/, '') + '/'), { signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw Error(`Publish ${file.asset} before building a cloud-content installer.`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > file.downloadBytes) throw Error(`Published content does not match: ${file.asset}`);
      chunks.push(Buffer.from(chunk));
    }
    if (size !== file.downloadBytes || digest(Buffer.concat(chunks)) !== file.compressedSha256) throw Error(`Published content does not match: ${file.asset}`);
  }
}
module.exports = { options, payloadConfig, wrapperConfig, verifyPublishedContent };
