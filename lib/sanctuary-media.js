'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const MAX_BYTES = 250 * 1024 * 1024;
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.ogv': 'video/ogg' };

module.exports = function createMediaStore(initialDirectory = process.env.SF_MEDIA_DIR || (fs.existsSync(path.join(os.homedir(), '.ginomai-pro', 'backgrounds')) ? path.join(os.homedir(), '.ginomai-pro', 'backgrounds') : path.join(os.homedir(), '.ginomai', 'backgrounds'))) {
  let directory = initialDirectory;

  async function ensureDirectory() {
    try {
      await fs.promises.mkdir(directory, { recursive: true });
      return directory;
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        const fallback = path.join(process.cwd(), 'output', 'backgrounds');
        await fs.promises.mkdir(fallback, { recursive: true });
        directory = fallback;
        return directory;
      }
      throw err;
    }
  }

  async function list() {
    await ensureDirectory().catch(() => {});
    const files = await fs.promises.readdir(directory).catch(async err => {
      if (err.code === 'ENOENT') return [];
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        directory = path.join(process.cwd(), 'output', 'backgrounds');
        await fs.promises.mkdir(directory, { recursive: true }).catch(() => {});
        return fs.promises.readdir(directory).catch(() => []);
      }
      throw err;
    });
    const entries = await Promise.all(files.filter(f => /^upload_[a-f0-9-]+\.json$/.test(f)).map(async file => {
      try { return JSON.parse(await fs.promises.readFile(path.join(directory, file), 'utf8')); } catch { return null; }
    }));
    return entries.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  }

  async function upload(req, params) {
    const name = path.basename(params.get('name') || '');
    const ext = path.extname(name).toLowerCase();
    const mime = TYPES[ext];
    const width = Number(params.get('width')), height = Number(params.get('height'));
    if (!mime || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 32768 || height > 32768) {
      throw Object.assign(new Error('Choose a supported image or playable video.'), { status: 400 });
    }
    if (Number(req.headers['content-length']) > MAX_BYTES) throw Object.assign(new Error('Files must be 250 MB or smaller.'), { status: 413 });
    await ensureDirectory();
    const id = `upload_${randomUUID()}`;
    const destination = path.join(directory, id + ext);
    const temporary = destination + '.part';
    let size = 0;
    try {
      const limiter = new Transform({ transform(chunk, encoding, callback) {
        size += chunk.length;
        callback(size > MAX_BYTES ? Object.assign(new Error('Files must be 250 MB or smaller.'), { status: 413 }) : null, chunk);
      }});
      await pipeline(req, limiter, fs.createWriteStream(temporary, { flags: 'wx' }));
      if (!size) throw Object.assign(new Error('The file is empty.'), { status: 400 });
      await fs.promises.rename(temporary, destination);
      const video = mime.startsWith('video/');
      const media = { id, name: name.slice(0, 160), type: video ? 'video' : 'image', category: video || ext === '.gif' ? 'motion' : 'still', custom: true, width, height, size, createdAt: Date.now(), textColor: '#FFFFFF', headerColor: '#FFFFFF', textShadow: '0 2px 12px #000', font: 'Outfit', previewGradient: '#171722', [video ? 'videoUrl' : 'imageUrl']: `/media/uploads/${id}${ext}` };
      await fs.promises.writeFile(path.join(directory, id + '.json'), JSON.stringify(media), { flag: 'wx' });
      return media;
    } catch (error) {
      await Promise.all([temporary, destination].map(file => fs.promises.unlink(file).catch(() => {})));
      throw error;
    }
  }

  async function serve(req, res, pathname) {
    const filename = pathname.slice('/media/uploads/'.length);
    if (!/^upload_[a-f0-9-]+\.[a-z0-9]+$/.test(filename) || !TYPES[path.extname(filename)]) { res.writeHead(404); res.end(); return; }
    const file = path.join(directory, filename);
    let stat;
    try { stat = await fs.promises.stat(file); } catch { res.writeHead(404); res.end(); return; }
    const headers = { 'Content-Type': TYPES[path.extname(filename)], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' };
    let start = 0, end = stat.size - 1, status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (!match || (!match[1] && !match[2]) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }

  async function ingestLocalFile(sourcePath, originalName, buffer = null, width = 1920, height = 1080) {
    const name = path.basename(originalName || sourcePath || '');
    const ext = path.extname(name).toLowerCase();
    const mime = TYPES[ext];
    if (!mime) return null;
    await ensureDirectory();

    let size = 0;
    if (buffer) {
      size = buffer.length;
    } else if (sourcePath) {
      const st = await fs.promises.stat(sourcePath);
      size = st.size;
    }
    const existing = await list();
    const candidates = existing.filter(e => !e.importedStyle && e.name === name && e.size === size);
    if (candidates.length) {
      const digestFile = async file => {
        const hash = require('node:crypto').createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        return hash.digest('hex');
      };
      const digest = buffer ? require('node:crypto').createHash('sha256').update(buffer).digest('hex') : await digestFile(sourcePath);
      for (const candidate of candidates) {
        const url = candidate.imageUrl || candidate.videoUrl || '';
        if (!/^\/media\/uploads\/upload_[a-f0-9-]+\.[a-z0-9]+$/.test(url)) continue;
        const savedDigest = await digestFile(path.join(directory, path.basename(url))).catch(() => null);
        if (digest === savedDigest) return candidate;
      }
    }

    const id = `upload_${randomUUID()}`;
    const destination = path.join(directory, id + ext);

    if (buffer) {
      await fs.promises.writeFile(destination, buffer);
    } else if (sourcePath) {
      await fs.promises.copyFile(sourcePath, destination);
    }

    const video = mime.startsWith('video/');
    const media = {
      id,
      name: name.slice(0, 160),
      type: video ? 'video' : 'image',
      category: video || ext === '.gif' ? 'motion' : 'still',
      custom: true,
      width,
      height,
      size,
      createdAt: Date.now(),
      textColor: '#FFFFFF',
      headerColor: '#FFFFFF',
      textShadow: '0 2px 12px #000',
      font: 'Outfit',
      previewGradient: '#171722',
      [video ? 'videoUrl' : 'imageUrl']: `/media/uploads/${id}${ext}`
    };
    await fs.promises.writeFile(path.join(directory, id + '.json'), JSON.stringify(media), { flag: 'wx' });
    return media;
  }

  async function remove(id) {
    if (!id || !/^upload_[a-f0-9-]+$/.test(id)) {
      throw Object.assign(new Error('Invalid background ID.'), { status: 400 });
    }
    await ensureDirectory();
    const dependentStyles = (await list()).filter(item => item.sourceMediaId === id);
    if (dependentStyles.length) {
      throw Object.assign(new Error('This background is used by imported styles. Delete those styles before deleting the background.'), { status: 409 });
    }
    const jsonFile = path.join(directory, id + '.json');
    let media = null;
    try {
      media = JSON.parse(await fs.promises.readFile(jsonFile, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw Object.assign(new Error('Background file not found.'), { status: 404 });
      }
      throw err;
    }

    const mediaUrl = media ? (media.imageUrl || media.videoUrl || '') : '';
    const ext = path.extname(mediaUrl);

    await Promise.all([
      fs.promises.unlink(jsonFile).catch(() => {}),
      ext ? fs.promises.unlink(path.join(directory, id + ext)).catch(() => {}) : Promise.resolve()
    ]);

    return { success: true, id };
  }

  async function saveImportedStyle(style, media = null) {
    await ensureDirectory();
    // Stable IDs make repeat migrations update a style without copying its media again.
    const key = require('node:crypto').createHash('sha256').update('easyworship:' + style.sourceId).digest('hex');
    const id = 'upload_' + `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
    const saved = {
      id, name: String(style.name || 'Imported Style').slice(0, 160), custom: true, importedStyle: true,
      type: media?.type || 'gradient', category: media?.category || 'colors', badge: 'IMPORTED',
      bgCss: style.bgCss || '#000000', previewGradient: style.previewGradient || '#000000',
      font: style.font || 'Outfit', textColor: style.textColor || '#FFFFFF', headerColor: style.headerColor || '#FFFFFF', textShadow: style.textShadow || 'none',
      sourceSoftware: 'easyworship', sourceId: style.sourceId, approximate: !!style.approximate, createdAt: Date.now(),
      ...(media ? { sourceMediaId: media.id, imageUrl: media.imageUrl || '', videoUrl: media.videoUrl || '', width: media.width, height: media.height } : {})
    };
    const destination = path.join(directory, id + '.json');
    const temporary = destination + '.' + randomUUID() + '.part';
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(saved), { flag: 'wx' });
      await fs.promises.rename(temporary, destination);
    } finally { await fs.promises.unlink(temporary).catch(() => {}); }
    return saved;
  }

  const pending = new Set();
  const track = operation => (...args) => {
    const promise = operation(...args);
    pending.add(promise);
    promise.finally(() => pending.delete(promise)).catch(() => {});
    return promise;
  };
  async function clear() {
    await Promise.allSettled([...pending]);
    await require('./clear-owned-files')(directory, /^upload_[a-f0-9-]+\.[a-z0-9.]+$/);
  }
  return { list, upload: track(upload), serve, ingestLocalFile: track(ingestLocalFile), saveImportedStyle: track(saveImportedStyle), remove: track(remove), clear };
};

