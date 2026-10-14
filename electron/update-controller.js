'use strict';

const fs = require('node:fs');
const path = require('node:path');

function updateError(error, operation = 'check') {
  if (error?.code === 'ENOENT' && /app-update\.yml/i.test(error.message || '')) return 'This build has no update feed. Install the latest standard installer once to enable updates.';
  if (error?.statusCode === 404 || /no published versions|cannot find latest|404/i.test(error?.message || '')) return 'No published update is available yet. Try again after the release is published.';
  return operation === 'download' ? 'Could not download the update. Check your connection and retry.' : 'Could not reach the update service. Check your internet connection and try again.';
}

function releaseNotesText(info) {
  let notes = info.releaseNotes;
  if (Array.isArray(notes)) notes = notes.filter(item => item?.version === info.version).map(item => typeof item.note === 'string' ? item.note : '').join('\n\n');
  if (typeof notes !== 'string') return '';
  // GitHub's Atom feed supplies HTML. Keep readable text, never executable markup.
  return notes.slice(0, 50000)
    .replace(/<(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/?(?:h[1-6]|p|div|ul|ol|blockquote|pre|br)\b[^>]*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (value[0] !== '#') return named[value.toLowerCase()] || entity;
      const point = /^#x/i.test(value) ? parseInt(value.slice(2), 16) : Number(value.slice(1));
      return point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// One desktop-owned state machine. Downloading never grants permission to install.
module.exports = function createUpdateController({ app, updater, CancellationToken, notify = () => {}, getBlockers = () => [], prepareRestart, flushState, timers = globalThis, storage = fs }) {
  const filename = path.join(app.getPath('userData'), 'update-preferences.json');
  const notesFilename = path.join(app.getPath('userData'), 'update-release-notes.json');
  let preferences = { automaticDownloads: false };
  try {
    const saved = JSON.parse(storage.readFileSync(filename, 'utf8'));
    if (typeof saved?.automaticDownloads === 'boolean') preferences.automaticDownloads = saved.automaticDownloads;
  } catch (_) { /* Missing or invalid settings always opt out. */ }
  let cachedNotes = null;
  try {
    const saved = JSON.parse(storage.readFileSync(notesFilename, 'utf8'));
    if (typeof saved?.version === 'string' && saved.version && typeof saved.text === 'string') cachedNotes = { version: saved.version.slice(0, 128), text: saved.text.slice(0, 50000) };
  } catch (_) { /* Notes stay readable when offline; a missing cache is harmless. */ }
  let state = { phase: 'idle', currentVersion: app.getVersion(), latestVersion: null, releaseNotes: cachedNotes, percent: 0, error: null, errorPhase: null, blockers: [], isDev: !app.isPackaged, revision: 0 };
  let notesWrites = Promise.resolve();
  let checkRequest = null, downloadRequest = null, restartRequest = null, preferenceWrites = Promise.resolve();
  let token = null, automaticTransfer = false, cancellationReason = null, downloadTimer = null;
  let startupTimer = null, periodicTimer = null;
  // Explicit downloads allow cancellation and consistent snapshots for both policies.
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  const snapshot = () => ({ ...state, releaseNotes: state.releaseNotes ? { ...state.releaseNotes } : null, blockers: [...state.blockers], preferences: { ...preferences } });
  function rememberReleaseNotes(info) {
    const text = releaseNotesText(info);
    if (!text && state.releaseNotes?.version === info.version) return state.releaseNotes;
    const releaseNotes = { version: String(info.version).slice(0, 128), text };
    if (releaseNotes.version === state.releaseNotes?.version && text === state.releaseNotes.text) return state.releaseNotes;
    notesWrites = notesWrites.then(async () => {
      await storage.promises.mkdir(path.dirname(notesFilename), { recursive: true });
      await storage.promises.writeFile(notesFilename + '.tmp', JSON.stringify(releaseNotes), 'utf8');
      await storage.promises.rename(notesFilename + '.tmp', notesFilename);
    }).catch(() => { /* Cache failures must not interrupt a service or an update. */ });
    return releaseNotes;
  }
  function publish(patch = {}) {
    state = { ...state, ...patch, revision: state.revision + 1 };
    notify(snapshot());
    return snapshot();
  }
  function bounded(operation) {
    let timer;
    return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = timers.setTimeout(() => reject(new Error('Could not finish the restart safety check. Restart has been prevented.')), 10000);
    })]).finally(() => timers.clearTimeout(timer));
  }
  function resetDownloadTimeout() {
    timers.clearTimeout(downloadTimer);
    downloadTimer = timers.setTimeout(() => { cancellationReason = 'timeout'; token?.cancel(); }, 120000);
    downloadTimer?.unref?.();
  }
  function cancelDownload() {
    if (token && state.phase === 'downloading') {
      cancellationReason = 'cancelled';
      token.cancel();
    }
    return snapshot();
  }
  function download(automatic = false) {
    if (downloadRequest) return downloadRequest;
    if (!app.isPackaged || state.phase === 'ready' || state.phase === 'restarting') return Promise.resolve(snapshot());
    if (!state.latestVersion || !['available', 'error'].includes(state.phase) || (state.phase === 'error' && state.errorPhase !== 'download')) return Promise.resolve(snapshot());
    token = new CancellationToken();
    automaticTransfer = automatic;
    cancellationReason = null;
    publish({ phase: 'downloading', percent: 0, error: null, errorPhase: null, blockers: [] });
    resetDownloadTimeout();
    downloadRequest = Promise.resolve().then(() => updater.downloadUpdate(token)).then(() => {
      if (!token.cancelled) publish({ phase: 'ready', percent: 100 });
      else if (cancellationReason === 'timeout') publish({ phase: 'error', errorPhase: 'download', error: 'Download timed out. Check your connection and retry.' });
      else publish({ phase: 'available', percent: 0 });
      return snapshot();
    }).catch(error => {
      if (cancellationReason === 'cancelled') publish({ phase: 'available', percent: 0, error: null, errorPhase: null });
      else publish({ phase: 'error', errorPhase: 'download', error: cancellationReason === 'timeout' ? 'Download timed out. Check your connection and retry.' : updateError(error, 'download') });
      return snapshot();
    }).finally(() => {
      timers.clearTimeout(downloadTimer);
      token = null; automaticTransfer = false; downloadRequest = null;
    });
    return downloadRequest;
  }
  function check() {
    if (checkRequest) return checkRequest;
    if (downloadRequest || ['ready', 'restarting'].includes(state.phase)) return Promise.resolve(snapshot());
    if (!app.isPackaged) return Promise.resolve(publish({ phase: 'idle', error: null, errorPhase: null }));
    publish({ phase: 'checking', error: null, errorPhase: null, blockers: [] });
    let expired = false;
    let timeout;
    const work = Promise.resolve().then(() => updater.checkForUpdates()).then(result => {
      if (expired) return snapshot();
      if (!result?.updateInfo?.version) return publish({ phase: 'unavailable', latestVersion: null });
      const releaseNotes = rememberReleaseNotes(result.updateInfo);
      if (!result.isUpdateAvailable) return publish({ phase: 'up-to-date', latestVersion: null, releaseNotes });
      publish({ phase: 'available', latestVersion: result.updateInfo.version, releaseNotes, percent: 0 });
      // The updater verifies a cached file's hash before emitting update-downloaded.
      if (preferences.automaticDownloads) void download(true);
      return snapshot();
    }).catch(error => expired ? snapshot() : publish({ phase: 'error', errorPhase: 'check', error: updateError(error) }));
    checkRequest = Promise.race([work, new Promise(resolve => {
      timeout = timers.setTimeout(() => {
        expired = true;
        resolve(publish({ phase: 'error', errorPhase: 'check', error: 'Update check timed out. Check your connection and retry.' }));
      }, 20000);
      timeout?.unref?.();
    })]);
    // Keep the actual network request locked even after a UI timeout.
    void work.finally(() => { timers.clearTimeout(timeout); checkRequest = null; });
    return checkRequest;
  }
  function setPreferences(value) {
    if (typeof value?.automaticDownloads !== 'boolean') return Promise.resolve({ error: 'Invalid update preference.' });
    const next = { automaticDownloads: value.automaticDownloads };
    const write = preferenceWrites.then(async () => {
      try {
        await storage.promises.mkdir(path.dirname(filename), { recursive: true });
        await storage.promises.writeFile(filename + '.tmp', JSON.stringify(next), 'utf8');
        await storage.promises.rename(filename + '.tmp', filename);
        preferences = next;
        if (!next.automaticDownloads && automaticTransfer) cancelDownload();
        publish();
        if (next.automaticDownloads && state.phase === 'available') void download(true);
        return snapshot();
      } catch (_) { return { ...snapshot(), preferenceError: 'Could not save the update preference. Please retry.' }; }
    });
    preferenceWrites = write.then(() => {});
    return write;
  }
  function install() {
    if (restartRequest) return restartRequest;
    if (!app.isPackaged || state.phase !== 'ready') return Promise.resolve(snapshot());
    restartRequest = Promise.resolve().then(async () => {
      let blockers = getBlockers();
      const inspection = await bounded(() => prepareRestart(false));
      blockers = [...blockers, ...(inspection?.blockers || [])];
      if (blockers.length) return publish({ blockers: [...new Set(blockers)] });
      if (!inspection?.ok) throw new Error('Could not verify studio activity. Restart has been prevented.');
      const saved = await bounded(() => prepareRestart(true));
      if (saved?.blockers?.length) return publish({ blockers: saved.blockers });
      if (!saved?.ok) throw new Error(saved?.error || 'Could not save the workspace. Restart has been prevented.');
      await bounded(flushState);
      // Recheck after asynchronous saving, immediately before closing any windows.
      const final = await bounded(() => prepareRestart(false));
      blockers = [...getBlockers(), ...(final?.blockers || [])];
      if (blockers.length) return publish({ blockers: [...new Set(blockers)] });
      if (!final?.ok) throw new Error('Could not verify studio activity. Restart has been prevented.');
      publish({ phase: 'restarting', blockers: [], error: null, errorPhase: null });
      updater.quitAndInstall(false, true);
      return snapshot();
    }).catch(error => publish({ phase: 'ready', errorPhase: 'install', error: error.message || 'Could not restart to install the update.' })).finally(() => { restartRequest = null; });
    return restartRequest;
  }
  updater.on('download-progress', progress => {
    if (state.phase !== 'downloading' || token?.cancelled) return;
    resetDownloadTimeout();
    if (Number.isFinite(progress.percent)) publish({ percent: Math.min(100, Math.max(0, Math.round(progress.percent))) });
  });
  updater.on('update-downloaded', info => {
    if (state.phase === 'downloading' && !token?.cancelled) publish({ phase: 'ready', latestVersion: info.version, releaseNotes: rememberReleaseNotes(info), percent: 100 });
  });
  // electron-updater emits error as well as rejecting its request Promise.
  updater.on('error', error => {
    if (state.phase === 'restarting') publish({ phase: 'ready', errorPhase: 'install', error: 'Could not install the update. Please retry or use the latest installer.' });
  });
  return {
    snapshot, check, download, cancelDownload, setPreferences, install,
    start() {
      if (!app.isPackaged || startupTimer || periodicTimer) return;
      startupTimer = timers.setTimeout(() => { void check(); }, 4000);
      periodicTimer = timers.setInterval(() => { void check(); }, 6 * 60 * 60 * 1000);
      startupTimer?.unref?.(); periodicTimer?.unref?.();
    },
    stop() { timers.clearTimeout(startupTimer); timers.clearInterval(periodicTimer); }
  };
};
