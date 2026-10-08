'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { InstallEngine, sha256, inventory, copiedBytes, validateDirectory, run } = require('../electron/installer/install-engine');
const { options, payloadConfig, wrapperConfig, verifyPublishedContent } = require('../scripts/build-desktop');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ginomai-installer-test-'));
  t.after(() => fs.rm(root, { recursive:true, force:true }));
  const source = path.join(root, 'resources', 'payload', 'Ginomai.app');
  const directory = path.join(root, 'Applications', 'Ginomai.app');
  await fs.mkdir(path.join(source, 'Contents', 'Resources'), { recursive:true });
  await fs.mkdir(path.join(source, 'Contents', 'MacOS'), { recursive:true });
  await fs.writeFile(path.join(source, 'Contents', 'Resources', 'app.asar'), 'new-ginomai-app');
  await fs.writeFile(path.join(source, 'Contents', 'MacOS', 'Ginomai'), '#!/bin/sh\nexit 0\n', { mode:0o755 });
  await fs.writeFile(path.join(source, 'Contents', 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.ginomai.pro</string></dict></plist>');
  const manifest = { platform:'darwin', appId:'com.ginomai.pro', installedBytes:1024, signed:false, appSha256:await sha256(path.join(source, 'Contents', 'Resources', 'app.asar')) };
  return { root, source, directory, resources:path.join(root, 'resources'), manifest };
}

function fakeMacRunner(f, action) {
  return async (command, args) => {
    if (command.endsWith('plutil')) return (await fs.readFile(args.at(-1), 'utf8')).includes('com.ginomai.pro') ? 'com.ginomai.pro' : 'other.app';
    if (command.endsWith('/ps')) return '';
    if (command.endsWith('/ditto')) {
      if (action) return action(args.at(-2), args.at(-1));
      return fs.cp(args.at(-2), args.at(-1), { recursive:true });
    }
    if (command.endsWith('/codesign')) return '';
    throw new Error(`Unexpected command ${command}`);
  };
}

test('platform build options and updater configuration stay separate from setup', async () => {
  assert.equal(options([], 'darwin', 'arm64').platform, 'win32');
  assert.equal(options(['--mac'], 'darwin', 'arm64').arch, 'arm64');
  assert.equal(options(['--mac', '--arch', 'x64'], 'darwin').arch, 'x64');
  assert.throws(() => options(['--mac'], 'win32'), /on a Mac/);
  assert.throws(() => options(['--arch', 'anything']), /Use x64/);
  const windows = options([], 'win32');
  const native = payloadConfig(windows, '/tmp/native');
  assert.ok(native.nsis.include.endsWith('windows.nsh'));
  assert.equal(native.publish, undefined);
  const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config');
  const effective = await getConfig(path.resolve(__dirname, '..'), null, native);
  await validateConfiguration(effective, new (require('builder-util').DebugLogger)(false));
  assert.deepEqual(effective.publish, [{provider:'github', owner:'EMWORLDLTD', repo:'Ginomai'}]);
  assert.equal(options(['--native-only'], 'win32').nativeOnly, true);
  const setup = wrapperConfig(windows, '/tmp/output', '/tmp/setup.exe', '/tmp/manifest', '3.0.0');
  assert.equal(setup.publish, null);
  assert.equal(setup.extraMetadata.version, '3.0.0');
  assert.equal(setup.extraResources[0].to, 'payload/setup.exe');
  assert.ok(setup.files.every(name => !name.includes('server')));
});

test('cloud builds retain KJV and remove optional Bibles only in the cloud configuration', () => {
  const normal = payloadConfig(options([]), '/tmp/native');
  const cloud = payloadConfig(options(['--cloud-content']), '/tmp/native');
  assert.ok(!normal.files.includes('!lexicon/**'));
  assert.ok(cloud.files.includes('!lexicon/**'));
  assert.ok(cloud.files.includes('!bibles/!(KJV|manifest).json'));
  assert.equal(require('../package.json').build.publish[0].repo, 'Ginomai');
});

test('cloud build verification rejects missing or incorrect published files', async () => {
  const bytes = Buffer.from('verified-pack');
  const crypto = require('node:crypto');
  const file = { asset: 'NIV.json.gz', downloadBytes: bytes.length, compressedSha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  const manifest = { baseUrl: 'https://example.test/content', packs: [{ code: 'NIV', files: [file] }] };
  await verifyPublishedContent(manifest, async () => new Response(bytes));
  await assert.rejects(verifyPublishedContent(manifest, async () => new Response('missing', { status: 404 })), /Publish/);
  await assert.rejects(verifyPublishedContent(manifest, async () => new Response('wrong')), /does not match/);
});

test('installation paths reject roots, relative paths and command-line injection', () => {
  for (const name of ['relative', '/', '/tmp/Other.app', '/tmp/Ginomai.app\n']) assert.throws(() => validateDirectory(name, 'darwin'));
  for (const name of ['relative', 'C:\\', 'C:\\Apps\\bad" /S', 'C:\\Apps\n']) assert.throws(() => validateDirectory(name, 'win32'));
  assert.equal(validateDirectory('C:\\Users\\Test Name\\Ginomai', 'win32'), 'C:\\Users\\Test Name\\Ginomai');
});

test('byte progress measures copied files without following source symlinks', async t => {
  const f = await fixture(t);
  try {
    await fs.symlink('/not-a-real-file', path.join(f.source, 'external-link'));
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.skip('Windows requires developer mode or elevation to create file symlinks');
    return;
  }
  const files = await inventory(f.source);
  assert.ok(!files.some(file => file.path === 'external-link'));
  assert.equal(await copiedBytes(f.directory, files), 0);
  await fs.cp(f.source, f.directory, { recursive:true });
  assert.equal(await copiedBytes(f.directory, files), files.reduce((sum, file) => sum + file.size, 0));
});

test('Mac install verifies staged data before replacing the existing app', async t => {
  const f = await fixture(t);
  await fs.cp(f.source, f.directory, { recursive:true });
  await fs.writeFile(path.join(f.directory, 'Contents', 'Resources', 'app.asar'), 'previous-version');
  const updates = [];
  const engine = new InstallEngine({ ...f, platform:'darwin', runner:fakeMacRunner(f), onProgress:value => updates.push(value) });
  await engine.install();
  assert.equal(await fs.readFile(path.join(f.directory, 'Contents', 'Resources', 'app.asar'), 'utf8'), 'new-ginomai-app');
  assert.equal(engine.complete, true);
  assert.equal(engine.busy, false);
  assert.equal(updates.at(-1).percent, 100);
  assert.ok(updates.slice(0, -1).every(value => value.percent !== 100));
  assert.deepEqual(await fs.readdir(path.dirname(f.directory)), ['Ginomai.app']);
});

test('failed copy leaves the previous Mac app intact and permits retry', async t => {
  const f = await fixture(t);
  await fs.cp(f.source, f.directory, { recursive:true });
  await fs.writeFile(path.join(f.directory, 'Contents', 'Resources', 'app.asar'), 'previous-version');
  const engine = new InstallEngine({ ...f, platform:'darwin', runner:fakeMacRunner(f, async () => { throw new Error('copy failed'); }) });
  await assert.rejects(engine.install(), /copy failed/);
  assert.equal(engine.complete, false);
  assert.equal(engine.busy, false);
  assert.equal(await fs.readFile(path.join(f.directory, 'Contents', 'Resources', 'app.asar'), 'utf8'), 'previous-version');
  engine.run = fakeMacRunner(f);
  await engine.install();
  assert.equal(engine.complete, true);
});

test('unrelated application and corrupt copied archive are never committed', async t => {
  const f = await fixture(t);
  await fs.cp(f.source, f.directory, { recursive:true });
  const plist = path.join(f.directory, 'Contents', 'Info.plist');
  await fs.writeFile(plist, 'other.app');
  const engine = new InstallEngine({ ...f, platform:'darwin', runner:fakeMacRunner(f) });
  await assert.rejects(engine.install(), /another application/);
  assert.equal(await fs.readFile(plist, 'utf8'), 'other.app');
  await fs.rm(f.directory, { recursive:true });
  engine.run = fakeMacRunner(f, async (source, target) => {
    await fs.cp(source, target, { recursive:true });
    await fs.writeFile(path.join(target, 'Contents', 'Resources', 'app.asar'), 'corrupt');
  });
  await assert.rejects(engine.install(), /could not be verified/);
  await assert.rejects(fs.access(f.directory));
});

test('an install cannot be started twice and its location cannot change mid-copy', async t => {
  const f = await fixture(t);
  let release;
  let entered;
  const copying = new Promise(resolve => { entered = resolve; });
  const engine = new InstallEngine({ ...f, platform:'darwin', runner:fakeMacRunner(f, async (source, target) => {
    entered();
    await new Promise(resolve => { release = resolve; });
    await fs.cp(source, target, { recursive:true });
  }) });
  const first = engine.install();
  await copying;
  await assert.rejects(engine.install(), /already running/);
  assert.throws(() => engine.setDirectory(f.directory), /already in use/);
  release();
  await first;
});

test('Windows verifies its native payload, passes literal path arguments, and honors shortcut choice', async t => {
  const f = await fixture(t);
  const setup = path.join(f.resources, 'payload', 'setup.exe');
  await fs.writeFile(setup, 'test-native-installer');
  f.manifest.platform = 'win32';
  f.manifest.payloadSha256 = await sha256(setup);
  let invocation;
  const updates = [];
  // Use a temporary host-native path for filesystem checks; path validation is covered above.
  const engine = new InstallEngine({ ...f, platform:'darwin', onProgress:value => updates.push(value), runner:async (command, args) => {
    invocation = { command, args };
    await fs.mkdir(path.join(f.directory, 'resources'), { recursive:true });
    await fs.writeFile(path.join(f.directory, 'resources', 'app.asar'), 'new-ginomai-app');
    await fs.writeFile(path.join(f.directory, 'Ginomai.exe'), 'test-executable');
  } });
  engine.platform = 'win32';
  await engine.install({ desktopShortcut:false });
  assert.equal(invocation.command, setup);
  assert.deepEqual(invocation.args, ['/S', '/currentuser', '/no-desktop-shortcut', `/D=${f.directory}`]);
  assert.equal(updates.at(-1).percent, 100);
  assert.ok(updates.slice(0, -1).every(value => value.percent === null));
  await fs.writeFile(setup, 'tampered');
  engine.complete = false;
  invocation = null;
  await assert.rejects(engine.install(), /damaged/);
  assert.equal(invocation, null);
});

test('native ditto copies a test bundle and preserves its executable mode and symlink', { skip:process.platform !== 'darwin' }, async t => {
  const f = await fixture(t);
  await fs.symlink('Resources', path.join(f.source, 'Contents', 'Resources-link'));
  const engine = new InstallEngine({ ...f, platform:'darwin', runner:async (command, args) => command.endsWith('/ps') ? '' : run(command, args) });
  await engine.install();
  assert.equal(engine.complete, true);
  assert.equal(await fs.readlink(path.join(f.directory, 'Contents', 'Resources-link')), 'Resources');
  assert.ok((await fs.stat(path.join(f.directory, 'Contents', 'MacOS', 'Ginomai'))).mode & 0o111);
});
