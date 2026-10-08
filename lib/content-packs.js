'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { gunzip } = require('node:zlib');
const { promisify } = require('node:util');
const decompress = promisify(gunzip);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

class ContentPacks {
  constructor({ root = path.resolve(__dirname, '..'), directory = process.env.GINOMAI_CONTENT_DIR || path.join(os.homedir(), '.ginomai', 'content-packs'), manifest, baseUrl, fetcher = fetch } = {}) {
    this.root = root;
    this.directory = path.resolve(directory);
    this.manifest = manifest || JSON.parse(fs.readFileSync(path.join(root, 'assets', 'content-packs', 'manifest.json'), 'utf8'));
    this.baseUrl = baseUrl ?? process.env.GINOMAI_CONTENT_BASE_URL ?? this.manifest.baseUrl;
    if (this.baseUrl && new URL(this.baseUrl).protocol !== 'https:') throw Error('Content downloads require HTTPS.');
    this.fetch = fetcher;
    this.pending = new Map();
    this.progress = new Map();
    this.files = new Map();
    for (const pack of this.manifest.packs) {
      if (!/^[A-Z0-9_]+$/.test(pack.code) || !/^[a-f0-9]{64}$/.test(pack.version)) throw Error('Invalid content pack.');
      for (const file of pack.files) {
        if (!/^(bibles|lexicon)\/[A-Za-z0-9_]+\.json$/.test(file.path) || !/^[A-Za-z0-9_-]+\.json\.gz$/.test(file.asset) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 32 * 1048576 || !Number.isSafeInteger(file.downloadBytes) || file.downloadBytes < 1 || file.downloadBytes > 32 * 1048576 || !/^[a-f0-9]{64}$/.test(file.sha256) || !/^[a-f0-9]{64}$/.test(file.compressedSha256)) throw Error('Invalid content file.');
        this.files.set(file.path, pack);
      }
    }
  }

  pack(code) {
    const pack = this.manifest.packs.find(pack => pack.code === code);
    if (!pack) throw Object.assign(Error('Unknown content pack.'), { status: 404 });
    return pack;
  }

  location(pack) { return path.join(this.directory, pack.code, pack.version); }

  async filePath(relative) {
    const pack = this.files.get(relative);
    if (pack) {
      const directory = this.location(pack);
      try {
        const marker = JSON.parse(await fsp.readFile(path.join(directory, 'installed.json'), 'utf8'));
        if (marker.version === pack.version) {
          const filename = path.join(directory, relative);
          const expected = pack.files.find(file => file.path === relative);
          if ((await fsp.stat(filename)).size === expected.bytes) return filename;
        }
      } catch {}
    }
    const bundled = path.join(this.root, relative);
    try { if ((await fsp.stat(bundled)).isFile()) return bundled; } catch {}
    return null;
  }

  async status(code) {
    const pack = this.pack(code);
    const paths = await Promise.all(pack.files.map(file => this.filePath(file.path)));
    const bundled = (await Promise.all(pack.files.map(async file => { try { return (await fsp.stat(path.join(this.root, file.path))).isFile(); } catch { return false; } }))).every(Boolean);
    return { code, name: pack.name, installed: paths.every(Boolean), bundled, cloudAvailable: Boolean(this.baseUrl), downloadBytes: pack.files.reduce((sum, file) => sum + file.downloadBytes, 0), ...(this.progress.get(code) || {}) };
  }

  install(code) {
    this.pack(code);
    if (this.pending.has(code)) return this.pending.get(code);
    const pending = this.download(code).finally(() => { this.pending.delete(code); this.progress.delete(code); });
    this.pending.set(code, pending);
    return pending;
  }

  async remove(code) {
    this.pack(code);
    if (this.pending.has(code)) throw Object.assign(Error('Wait for this download to finish.'), { status: 409 });
    if ((await this.status(code)).bundled) throw Object.assign(Error('This content is included with the app and cannot be removed.'), { status: 409 });
    // The validated code is one direct child of the dedicated content directory.
    await fsp.rm(path.join(this.directory, code), { recursive: true, force: true });
    return this.status(code);
  }

  async download(code) {
    const pack = this.pack(code);
    if ((await this.status(code)).installed) return this.status(code);
    if (!this.baseUrl) throw Object.assign(Error('Cloud downloads are not configured yet. You can import a Bible file instead.'), { status: 503 });
    const parent = path.join(this.directory, code);
    await fsp.mkdir(parent, { recursive: true });
    const staging = await fsp.mkdtemp(path.join(parent, '.download-'));
    const progress = { downloading: true, downloadedBytes: 0 };
    this.progress.set(code, progress);
    try {
      for (const file of pack.files) {
        const url = new URL(file.asset, this.baseUrl.replace(/\/$/, '') + '/');
        const response = await this.fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok || !response.body) throw Error(`Could not download ${pack.name}. Try again when your connection is available.`);
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > file.downloadBytes) throw Error('Downloaded content has an unexpected size.');
          chunks.push(Buffer.from(chunk));
          progress.downloadedBytes += chunk.length;
        }
        const compressed = Buffer.concat(chunks);
        if (size !== file.downloadBytes || digest(compressed) !== file.compressedSha256) throw Error('Downloaded content failed verification. Please retry.');
        const bytes = await decompress(compressed, { maxOutputLength: file.bytes });
        if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw Error('Downloaded content failed verification. Please retry.');
        const data = JSON.parse(bytes.toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length) throw Error('Downloaded content is invalid.');
        const filename = path.join(staging, file.path);
        await fsp.mkdir(path.dirname(filename), { recursive: true });
        await fsp.writeFile(filename, bytes);
      }
      await fsp.writeFile(path.join(staging, 'installed.json'), JSON.stringify({ version: pack.version }));
      const destination = this.location(pack);
      // A previous incomplete copy is never served without its completion marker.
      await fsp.rm(destination, { recursive: true, force: true });
      await fsp.rename(staging, destination);
      return this.status(code);
    } finally { await fsp.rm(staging, { recursive: true, force: true }); }
  }
}
module.exports = { ContentPacks };
