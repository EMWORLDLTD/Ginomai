'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function run(command, args, { windowsVerbatimArguments = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell:false, windowsHide:true, windowsVerbatimArguments,
      ...(windowsVerbatimArguments ? { argv0:`"${command}"` } : {}), stdio:['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-8192); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-8192); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(command)} failed (${code}): ${stderr.trim() || stdout.trim()}`)));
  });
}

async function sha256(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function inventory(directory, relative = '') {
  const files = [];
  for (const entry of await fsp.readdir(path.join(directory, relative), { withFileTypes:true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(directory, name));
    else if (entry.isFile()) files.push({ path:name, size:(await fsp.stat(path.join(directory, name))).size });
  }
  return files;
}

// Only count real bytes present on disk; never estimate progress from elapsed time.
async function copiedBytes(directory, files) {
  let bytes = 0;
  for (let offset = 0; offset < files.length; offset += 32) {
    await Promise.all(files.slice(offset, offset + 32).map(async file => {
      try {
        const copied = Math.min(file.size, (await fsp.stat(path.join(directory, file.path))).size);
        bytes += copied;
      }
      catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    }));
  }
  return bytes;
}

function validateDirectory(directory, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path;
  if (typeof directory !== 'string' || !paths.isAbsolute(directory) || /[\r\n\0"]/.test(directory)) {
    throw new Error('Choose an absolute installation folder.');
  }
  const normalized = paths.normalize(directory);
  if (normalized === paths.parse(normalized).root) throw new Error('Choose an application folder, rather than a drive root.');
  if (platform === 'darwin' && paths.basename(normalized) !== 'Ginomai.app') throw new Error('The application must be installed as Ginomai.app.');
  return normalized;
}

async function ensureSpace(directory, requiredBytes) {
  if (!fsp.statfs) return;
  const stats = await fsp.statfs(directory);
  if (stats.bavail * stats.bsize < requiredBytes) throw new Error('There is not enough free space in the selected location. Choose another folder.');
}

class InstallEngine {
  constructor({ platform, resources, manifest, directory, onProgress = () => {}, runner = run }) {
    this.platform = platform;
    this.resources = resources;
    this.manifest = manifest;
    this.directory = validateDirectory(directory, platform);
    this.onProgress = onProgress;
    this.run = runner;
    this.busy = false;
    this.complete = false;
  }

  setDirectory(directory) {
    if (this.busy || this.complete) throw new Error('The installation location is already in use.');
    this.directory = validateDirectory(directory, this.platform);
  }

  report(message, percent = null, heading = 'Installing Ginomai') {
    this.onProgress({ state:'installing', heading, message, percent });
  }

  async install({ desktopShortcut = true } = {}) {
    if (this.busy) throw new Error('Installation is already running.');
    if (this.complete) return;
    this.busy = true;
    try {
      if (this.manifest.platform !== this.platform) throw new Error('This installer is for a different operating system.');
      this.report('Checking the installation package…', null, 'Preparing Ginomai');
      if (this.platform === 'win32') await this.installWindows(desktopShortcut);
      else if (this.platform === 'darwin') await this.installMac();
      else throw new Error('Ginomai Setup supports Windows and macOS.');
      this.complete = true;
      this.onProgress({ state:'complete', heading:'Ginomai is ready', message:'Your next service starts here.', percent:100 });
    } catch (error) {
      this.onProgress({ state:'error', heading:'Installation needs attention', message:error.message, percent:null });
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async installWindows(desktopShortcut) {
    const setup = path.join(this.resources, 'payload', 'setup.exe');
    if (await sha256(setup) !== this.manifest.payloadSha256) throw new Error('The installation package is damaged. Download Ginomai Setup again.');
    await fsp.mkdir(path.dirname(this.directory), { recursive:true });
    await ensureSpace(path.dirname(this.directory), this.manifest.installedBytes * 2);
    this.report('Copying application files and creating shortcuts…');
    // /D must be last and unquoted. Spawn passes one literal argument; no shell interpolation.
    // NSIS owns registry entries, upgrades, shortcuts and the uninstaller.
    const args = ['/S', '/currentuser', desktopShortcut ? '/desktop-shortcut' : '/no-desktop-shortcut', `/D=${this.directory}`];
    await this.run(setup, args, { windowsVerbatimArguments:true });
    this.report('Verifying the installed application…');
    const archive = path.join(this.directory, 'resources', 'app.asar');
    if (await sha256(archive) !== this.manifest.appSha256) throw new Error('The installed files could not be verified. Close Ginomai and try again.');
    await fsp.access(path.join(this.directory, 'Ginomai.exe'));
  }

  async macBundleId(bundle) {
    return this.run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')]);
  }

  async installMac() {
    const source = path.join(this.resources, 'payload', 'Ginomai.app');
    if (await this.macBundleId(source) !== this.manifest.appId) throw new Error('The installation package is not a Ginomai application.');
    const processes = await this.run('/bin/ps', ['-axo', 'command=']);
    if (processes.split('\n').some(line => line.startsWith(`${this.directory}/Contents/MacOS/`))) {
      throw new Error('Close Ginomai before installing this version.');
    }
    const parent = path.dirname(this.directory);
    await fsp.mkdir(parent, { recursive:true });
    await fsp.access(parent, fs.constants.W_OK);
    await ensureSpace(parent, this.manifest.installedBytes + 64 * 1024 * 1024);
    let existing = false;
    try {
      const stat = await fsp.lstat(this.directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await this.macBundleId(this.directory) !== this.manifest.appId) {
        throw new Error('The selected location contains another application. Choose a different folder.');
      }
      existing = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }

    const stagingRoot = await fsp.mkdtemp(path.join(parent, '.ginomai-setup-'));
    const staging = path.join(stagingRoot, 'Ginomai.app');
    const backup = path.join(stagingRoot, 'previous.app');
    let backedUp = false;
    let committed = false;
    let rollbackFailed = false;
    let timer;
    let polling = Promise.resolve();
    let stopped = false;
    try {
      const files = await inventory(source);
      const total = files.reduce((sum, file) => sum + file.size, 0);
      this.report('Copying Ginomai to Applications…', 0);
      const poll = () => {
        polling = copiedBytes(staging, files).then(bytes => {
          if (!stopped) this.report('Copying Ginomai to Applications…', total ? Math.min(99, Math.floor(bytes / total * 100)) : 0);
        }).catch(() => {}).finally(() => { if (!stopped) timer = setTimeout(poll, 600); });
      };
      timer = setTimeout(poll, 100);
      // ditto preserves modes, symlinks, resource forks and signing-related metadata.
      await this.run('/usr/bin/ditto', ['--rsrc', '--extattr', source, staging]);
      stopped = true;
      clearTimeout(timer);
      await polling;
      this.report('Verifying the installed application…', 99);
      if (await this.macBundleId(staging) !== this.manifest.appId ||
          await sha256(path.join(staging, 'Contents', 'Resources', 'app.asar')) !== this.manifest.appSha256) {
        throw new Error('The copied application could not be verified.');
      }
      await fsp.access(path.join(staging, 'Contents', 'MacOS', 'Ginomai'), fs.constants.X_OK);
      if (this.manifest.signed) await this.run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staging]);
      if (existing) { await fsp.rename(this.directory, backup); backedUp = true; }
      await fsp.rename(staging, this.directory);
      committed = true;
    } catch (error) {
      if (backedUp && !committed) {
        try { await fsp.rename(backup, this.directory); }
        catch { rollbackFailed = true; throw new Error(`Installation could not finish. Your previous app is preserved at ${backup}.`); }
      }
      throw error;
    } finally {
      stopped = true;
      clearTimeout(timer);
      await polling;
      if (!rollbackFailed) await fsp.rm(stagingRoot, { recursive:true, force:true }).catch(() => {});
    }
  }
}

module.exports = { InstallEngine, validateDirectory, sha256, inventory, copiedBytes, run };
