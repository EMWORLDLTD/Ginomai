// Quiet update surfaces: existing elements are changed in place, never rebuilt.
(() => {
  const byId = id => document.getElementById(id);
  const api = () => window.desktopApi;
  let status = { phase: 'idle', currentVersion: null, latestVersion: null, percent: 0, revision: -1, preferences: { automaticDownloads: false }, blockers: [] };
  let metadataRequest = null, preferencesReady = false, savingPreference = false, origin = null;
  let notesVisible = false;
  const requests = new Map();
  const text = (id, value) => { const node = byId(id); if (node && node.textContent !== value) node.textContent = value; };
  const hidden = (id, value) => { const node = byId(id); if (node) node.hidden = value; };
  function bounded(promise, milliseconds, message) {
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
  }
  function applyVersion(version) {
    if (!version) return;
    window.ginomaiAppVersion = String(version);
    status.currentVersion = String(version);
    text('settings-build-version', `Build ${version}`);
  }
  function description() {
    if (!api()?.getUpdateStatus) return 'Check for updates in the host desktop app.';
    if (status.isDev) return 'Updates are available in installed desktop builds.';
    switch (status.phase) {
      case 'checking': return 'Checking for updates…';
      case 'up-to-date': return 'Ginomai is up to date.';
      case 'unavailable': return 'No published update information is available yet.';
      case 'available': return `Update ${status.latestVersion} is available. Download when you’re ready.`;
      case 'downloading': return `Downloading update ${status.latestVersion} · ${status.percent}%`;
      case 'ready': return `Update ${status.latestVersion} is ready. Restart when your service is finished.`;
      case 'restarting': return 'Restarting to install the update…';
      case 'error': return status.error || 'The update could not be completed. Please retry.';
      default: return 'Quiet checks are enabled. You choose when to download and restart.';
    }
  }
  function render() {
    const desktop = !!api()?.getUpdateStatus;
    const busy = ['checking', 'downloading', 'restarting'].includes(status.phase) || requests.has('installUpdate');
    const version = status.currentVersion ? `Version ${status.currentVersion}` : 'Installed version unavailable';
    const message = description();
    const actionable = ['available', 'downloading', 'ready', 'restarting'].includes(status.phase) || (status.phase === 'error' && status.errorPhase === 'download');
    const label = requests.has('installUpdate') && status.phase !== 'restarting' ? 'Checking studio…' : status.phase === 'ready' ? 'Restart to Update' : status.phase === 'available' ? 'Download Update' : status.phase === 'downloading' ? 'Downloading…' : status.phase === 'checking' ? 'Checking…' : status.phase === 'restarting' ? 'Restarting…' : status.phase === 'error' ? (status.errorPhase === 'download' ? 'Retry Download' : 'Retry Check') : 'Check for Updates';
    text('updates-installed-version', version);
    text('update-panel-installed', version);
    text('update-panel-latest', status.latestVersion ? `Available version ${status.latestVersion}` : '');
    hidden('update-panel-latest', !status.latestVersion);
    for (const id of ['update-panel-status', 'updates-settings-status']) text(id, message);
    for (const id of ['settings-update-status-text', 'settings-update-status-text-arch']) text(id, `${version} · ${message}`);
    const problem = status.blockers?.length ? `Stop these activities before restarting: ${status.blockers.join(', ')}. Close this panel to stop them, then retry.` : status.phase === 'ready' ? status.error || '' : '';
    for (const id of ['update-panel-error', 'updates-settings-error']) { text(id, problem); hidden(id, !problem); }
    for (const id of ['update-panel-action', 'updates-settings-action']) {
      text(id, label);
      const button = byId(id);
      if (button) button.disabled = busy || !desktop || !!status.isDev;
    }
    for (const id of ['update-panel-cancel', 'updates-settings-cancel']) hidden(id, status.phase !== 'downloading');
    const progress = byId('update-panel-progress');
    if (progress) { progress.hidden = status.phase !== 'downloading'; progress.value = status.percent || 0; }
    const checkbox = byId('automatic-update-downloads');
    if (checkbox) { checkbox.checked = status.preferences?.automaticDownloads === true; checkbox.disabled = !desktop || !!status.isDev || !preferencesReady || savingPreference; }
    hidden('desktop-update-indicator', !desktop || !actionable);
    hidden('desktop-update-footer', !desktop || !actionable);
    const indicator = byId('desktop-update-indicator');
    if (indicator) {
      indicator.title = status.phase === 'ready' ? 'Update ready — restart when your service is finished' : 'Update available';
      indicator.setAttribute('aria-label', indicator.title);
      const dot = indicator.querySelector('.sf-update-dot');
      if (dot) dot.hidden = !actionable;
    }
    text('desktop-update-footer', status.phase === 'ready' ? 'Restart to update' : status.phase === 'downloading' ? `Downloading · ${status.percent}%` : status.phase === 'restarting' ? 'Restarting…' : 'Update available');
    // Check always means check; it can never become an installation shortcut.
    for (const [id, textId, iconId, normal] of [
      ['check-update-btn', 'check-update-btn-text', 'check-update-icon', 'Check for Updates'],
      ['check-update-btn-arch', 'check-update-btn-text-arch', 'check-update-icon-arch', 'Check for Updates'],
      ['check-update-btn-sidebar', 'check-update-btn-sidebar', null, 'Check']
    ]) {
      const button = byId(id);
      if (button) button.disabled = busy;
      text(textId, status.phase === 'checking' ? 'Checking…' : normal);
      if (iconId) byId(iconId)?.classList.remove('sf-spinning');
    }
    renderReleaseNotes();
  }
  function renderReleaseNotes() {
    text('update-panel-title', notesVisible ? 'What’s new' : 'Software updates');
    const notes = status.releaseNotes;
    const version = notes?.version || status.latestVersion || status.currentVersion;
    text('update-notes-version', version ? `Version ${version}` : 'Release notes');
    text('update-notes-content', notes?.text || 'No release notes provided for this version.');
    hidden('update-panel-notes', !notesVisible);
    hidden('update-panel-versions', notesVisible);
    hidden('update-panel-status', notesVisible);
    text('update-panel-notes-toggle', notesVisible ? 'Back to updates' : 'What’s new');
    byId('update-panel-notes-toggle')?.setAttribute('aria-expanded', String(notesVisible));
  }
  function applySnapshot(next) {
    if (!next?.phase) throw new Error(next?.error || 'Could not read update status.');
    if (Number.isFinite(next.revision) && next.revision < status.revision) return;
    status = { ...status, ...next };
    applyVersion(next.currentVersion);
    preferencesReady = true;
    render();
  }
  window.getInstalledAppInfo = function getInstalledAppInfo() {
    if (!metadataRequest) {
      const request = Promise.resolve().then(async () => {
        if (api()?.getAppInfo) return api().getAppInfo();
        const response = await fetch('/api/version', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
        if (!response.ok) throw new Error('Could not read the installed version.');
        return response.json();
      });
      metadataRequest = bounded(request, 8000, 'Could not read the installed version.').then(info => {
        if (!info?.version) throw new Error('Installed version is unavailable.');
        applyVersion(info.version); render(); return info;
      }).catch(error => { metadataRequest = null; throw error; });
    }
    return metadataRequest;
  };
  function command(method) {
    if (requests.has(method)) return requests.get(method);
    if (!api()?.[method]) {
      window.showToast?.('Check for updates from the host desktop app.', 'info');
      return Promise.resolve();
    }
    if (method === 'checkForUpdates' && !['ready', 'downloading', 'restarting'].includes(status.phase) && !status.isDev) status = { ...status, phase: 'checking', error: null, blockers: [] };
    if (method === 'downloadUpdate') status = { ...status, phase: 'downloading', percent: 0, error: null, blockers: [] };
    const request = Promise.resolve().then(() => api()[method]());
    const operation = (method === 'checkForUpdates' ? bounded(request, 21000, 'Update check timed out. Check your connection and try again.') : request).then(next => {
      applySnapshot(next);
    }).catch(error => {
      // A renderer timeout must not overwrite a newer downloaded/ready snapshot.
      if (!['ready', 'downloading', 'restarting'].includes(status.phase)) status = { ...status, phase: 'error', errorPhase: method === 'downloadUpdate' ? 'download' : 'check', error: error.message };
      window.showToast?.(error.message, 'warning');
    }).finally(() => { requests.delete(method); render(); });
    requests.set(method, operation);
    render();
    return operation;
  }
  function positionUpdatePanel() {
    const panel = byId('update-panel-backdrop');
    if (!panel) return;
    const preview = byId('bento-preview-box');
    const bounds = preview?.getClientRects().length ? preview.getBoundingClientRect() : null;
    const available = bounds ? window.innerHeight - bounds.bottom - 32 : window.innerHeight - 40;
    // Use the notification corner; an expanded preview can leave room only beside it.
    const beside = bounds && available < 160;
    panel.style.setProperty('--update-panel-right', `${beside ? window.innerWidth - bounds.left + 12 : 20}px`);
    panel.style.setProperty('--update-panel-max-height', `${Math.max(0, Math.floor(beside ? window.innerHeight - 40 : available))}px`);
  }
  window.openUpdatePanel = function openUpdatePanel() {
    const panel = byId('update-panel-backdrop');
    if (!panel || panel.classList.contains('open')) return;
    if (byId('settings-modal-backdrop')?.classList.contains('open')) {
      window.closeSettingsModal?.(); window.sfSyncModal?.(byId('settings-modal-backdrop'));
    }
    origin = document.activeElement;
    positionUpdatePanel();
    panel.classList.add('open');
    panel.inert = false;
    panel.setAttribute('aria-hidden', 'false');
    for (const id of ['desktop-update-indicator', 'desktop-update-footer']) byId(id)?.setAttribute('aria-expanded', 'true');
    window.sfSyncModal?.(panel);
    panel.querySelector('button')?.focus({ preventScroll: true });
  };
  window.closeUpdatePanel = function closeUpdatePanel() {
    const panel = byId('update-panel-backdrop');
    if (!panel) return;
    panel.classList.remove('open');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    for (const id of ['desktop-update-indicator', 'desktop-update-footer']) byId(id)?.setAttribute('aria-expanded', 'false');
    window.sfSyncModal?.(panel);
    if (origin?.isConnected && !origin.closest('[inert],[hidden]')) origin.focus({ preventScroll: true });
    notesVisible = false;
    renderReleaseNotes();
  };
  window.openUpdateSettings = () => { window.closeUpdatePanel(); window.openSettingsToTab?.('updates'); };
  window.checkForUpdates = event => {
    event?.stopPropagation?.();
    window.openUpdatePanel();
    return command('checkForUpdates');
  };
  window.runUpdateAction = () => command(status.phase === 'ready' ? 'installUpdate' : status.phase === 'available' || (status.phase === 'error' && status.errorPhase === 'download') ? 'downloadUpdate' : 'checkForUpdates');
  window.cancelUpdateDownload = () => command('cancelUpdateDownload');
  window.setAutomaticUpdateDownloads = async value => {
    if (savingPreference || !preferencesReady || !api()?.setUpdatePreferences) return;
    savingPreference = true;
    // Immediate control feedback while desktop persistence completes.
    status.preferences = { automaticDownloads: value === true };
    render();
    try {
      const next = await api().setUpdatePreferences({ automaticDownloads: value === true });
      applySnapshot(next);
      if (next.preferenceError) window.showToast?.(next.preferenceError, 'warning');
    } catch (error) {
      try { applySnapshot(await api().getUpdateStatus()); } catch (_) { preferencesReady = false; }
      window.showToast?.('Could not save the update preference. Please retry.', 'warning');
    } finally { savingPreference = false; render(); }
  };
  window.openUpdateReleaseNotes = event => {
    event?.preventDefault();
    event?.stopPropagation();
    window.openUpdatePanel();
    notesVisible = true;
    renderReleaseNotes();
  };
  window.toggleUpdateReleaseNotes = event => {
    if (!notesVisible) { window.openUpdateReleaseNotes(event); return; }
    notesVisible = false;
    renderReleaseNotes();
  };
  function initialize() {
    render();
    void window.getInstalledAppInfo().catch(() => render());
    if (api()?.getUpdateStatus) {
      api().onUpdateStatus?.(next => { try { applySnapshot(next); } catch (_) {} });
      api().onOpenUpdates?.(() => { void window.checkForUpdates(); });
      void api().getUpdateStatus().then(applySnapshot).catch(() => { text('update-panel-status', 'Could not read update status. Please retry.'); });
    }
    const panel = byId('update-panel-backdrop');
    const reposition = () => { if (panel?.classList.contains('open')) positionUpdatePanel(); };
    window.addEventListener('resize', reposition);
    const preview = byId('bento-preview-box');
    if (preview && typeof ResizeObserver !== 'undefined') new ResizeObserver(reposition).observe(preview);
    panel?.addEventListener('pointerdown', event => {
      if (event.target === panel) event.preventDefault();
      event.stopPropagation();
    });
    panel?.addEventListener('click', event => {
      event.stopImmediatePropagation();
      if (event.target === panel) { event.preventDefault(); window.closeUpdatePanel(); }
    });
    // Absorb keyboard shortcuts too: arrows/space must not operate slides behind the panel.
    window.addEventListener('keydown', event => {
      if (!panel?.classList.contains('open')) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); window.closeUpdatePanel(); }
      if (event.key === 'Tab') {
        const controls = [...panel.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')].filter(node => !node.hidden && node.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
