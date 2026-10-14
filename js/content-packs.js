'use strict';
(() => {
  const pending = new Map();
  const ready = new Set();
  let queue = Promise.resolve();
  let activeDownload = null;
  let semanticPrompted = false;
  let semanticBusy = false;
  let previousFocus;
  let generation = 0;
  const element = id => document.getElementById?.(id);
  const size = bytes => `${(bytes / 1000000).toFixed(1)} MB`;
  const description = code => code === 'AI_SEMANTIC' ? 'Find KJV verses from spoken phrases and paraphrases.' : code === 'KJV_STRONGS' ? 'Hebrew and Greek word meanings for the KJV Bible.' : 'Bible translation for offline reading.';
  const downloadError = message => /ENOSPC|no space|disk full/i.test(message || '') ? 'Not enough disk space. Free some space and try again.' : 'Download could not finish. Please try again.';

  async function request(code, options, suffix = '') {
    const response = await fetch(`/api/content-packs/${encodeURIComponent(code)}${suffix}`, options).catch(error => { throw Error(downloadError(error.message)); });
    const result = await response.json().catch(error => { throw Error(downloadError(error.message)); });
    if (!response.ok) throw Error(downloadError(result.error));
    return result;
  }
  const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };

  function closeDialog() {
    const backdrop = element('content-download-backdrop');
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.style.display = 'none';
      backdrop.classList.remove('open');
      window.sfSyncModal?.(backdrop);
    }
    previousFocus?.focus?.();
    previousFocus = null;
  }

  function updateDialog(status, message, state = 'downloading') {
    const dialog = element('content-download-dialog');
    if (!dialog) return;
    element('content-download-title').textContent = status.name;
    element('content-download-detail').textContent = message;
    element('content-download-progress').value = state === 'complete' ? 100 : Math.min(99, Math.floor((status.downloadedBytes || 0) / status.downloadBytes * 100));
    element('content-download-progress').hidden = state === 'error';
    element('content-download-dismiss').textContent = state === 'downloading' ? 'Cancel download' : 'Close';
    const retry = element('content-download-retry');
    retry.hidden = state !== 'error';
    retry.onclick = () => { closeDialog(); window.downloadOptionalPack(status.code); };
    const backdrop = element('content-download-backdrop');
    if (backdrop?.hidden) {
      previousFocus ||= document.activeElement;
      backdrop.hidden = false;
      backdrop.style.display = 'flex';
      backdrop.classList.add('open');
      window.sfSyncModal?.(backdrop);
      element('content-download-dismiss').focus?.();
    }
  }
  async function dismissDownload() {
    closeDialog();
    if (activeDownload) {
      const download = activeDownload;
      download.cancelled = true;
      element('content-download-detail').textContent = 'Cancelling download…';
      try { await request(download.code, post, '/cancel'); }
      catch (error) { download.cancelled = false; updateDialog(download.status, `Could not cancel: ${error.message}`); return; }
    }
  }

  // One queue owns confirmation and progress, preventing overlapping dialogs.
  // Every missing pack requires consent, including calls from Download buttons.
  window.ensureContentPack = function(code) {
    if (ready.has(code)) return Promise.resolve(true);
    if (pending.has(code)) return pending.get(code);
    const currentGeneration = generation;
    const operation = queue.then(async () => {
      if (currentGeneration !== generation) return false;
      const status = await request(code);
      if (status.installed) { ready.add(code); return true; }
      if (!status.cloudAvailable) throw Error('Downloads are currently unavailable. Please try again later.');
      closeDialog();
      const trigger = document.activeElement;
      const confirmed = await window.showCustomConfirm({
        title: `Download ${status.name}?`,
        message: `${size(status.downloadBytes)} · ${description(code)} Available offline after download.`,
        confirmText: 'Download', cancelText: 'Not now'
      });
      if (!confirmed || currentGeneration !== generation) return false;
      previousFocus = trigger;
      const download = activeDownload = { code, status, cancelled: false };
      updateDialog(status, `Downloading… 0 of ${size(status.downloadBytes)}`);
      let polling = false;
      const timer = setInterval(async () => {
        if (polling || activeDownload !== download || download.cancelled) return;
        polling = true;
        try {
          const current = await request(code);
          if (activeDownload === download && !download.cancelled && current.downloading) updateDialog(current,
            current.verifying ? 'Verifying downloaded files…' : `Downloading… ${size(current.downloadedBytes)} of ${size(status.downloadBytes)}`);
        } catch {} finally { polling = false; }
      }, 500);
      try {
        const installed = await request(code, post);
        if (currentGeneration !== generation) return false;
        if (code === 'KJV_STRONGS') window.resetStrongsContent?.({ keepMode: true });
        ready.add(code);
        window.refreshContentCatalogue().catch(() => {});
        if (!download.cancelled) updateDialog(installed, 'Installed and ready to use offline.', 'complete');
        return true;
      } catch (error) {
        if (download.cancelled) return false;
        updateDialog(status, error.message, 'error');
        throw error;
      } finally {
        clearInterval(timer);
        if (activeDownload === download) activeDownload = null;
        window.refreshAiContentSettings().catch(() => {});
      }
    }).finally(() => pending.delete(code));
    queue = operation.catch(() => {});
    pending.set(code, operation);
    return operation;
  };
  window.forgetContentPack = code => {
    ready.delete(code);
    if (code === 'KJV_STRONGS') window.resetStrongsContent?.();
  };
  window.isContentPackReady = code => ready.has(code);
  window.clearContentDownloadState = () => {
    generation++;
    ready.clear();
    if (activeDownload) activeDownload.cancelled = true;
    closeDialog();
    window.resetStrongsContent?.();
  };
  window.downloadOptionalPack = async code => {
    try { await window.ensureContentPack(code); }
    catch (error) { window.showToast?.(error.message, 'error'); }
    await window.refreshAiContentSettings();
    if (ready.has(code)) window.onContentPackInstalled?.(code);
  };
  window.removeOptionalPack = async code => {
    const strongs = code === 'KJV_STRONGS';
    if (!['AI_SEMANTIC', 'KJV_STRONGS'].includes(code)) return;
    if (!await window.showCustomConfirm({ title: strongs ? 'Remove Strong’s Concordance?' : 'Remove offline AI Bible detection?', message: strongs ? 'Word meanings and concordance search will be unavailable until you download this pack again. Your KJV Bible and transcripts are kept.' : 'AI Bible suggestions will be unavailable until you download this pack again. Your transcripts and Bible library are kept.', confirmText: 'Remove', cancelText: 'Keep', danger: true })) return;
    try {
      if (strongs) await window.libraryImporter?.removeStoredBible?.('KJV_STRONGS');
      await request(code, { method: 'DELETE' });
      window.forgetContentPack(code);
      window.showToast?.(strongs ? 'Strong’s Concordance removed.' : 'Offline AI Bible detection removed.', 'success');
      if (strongs) window.onLibraryDataUpdated?.();
      await window.refreshAiContentSettings();
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };
  window.refreshAiContentSettings = async () => {
    const rows = document.querySelectorAll?.('#ai-content-settings [data-pack]') || [];
    await Promise.all(Array.from(rows, async row => {
      const label = row.querySelector('[data-pack-status]');
      const button = row.querySelector('[data-pack-download]');
      try {
        const status = await request(row.dataset.pack);
        if (status.installed) ready.add(status.code); else ready.delete(status.code);
        label.textContent = status.installed ? 'Ready offline' : `${size(status.downloadBytes)} download`;
        button.hidden = status.installed;
        button.disabled = !!status.downloading;
        const remove = row.querySelector('[data-pack-remove]');
        if (remove) remove.hidden = !status.installed || status.bundled;
      } catch (error) { label.textContent = 'Could not check availability. Please try again.'; button.hidden = false; button.disabled = false; }
    }));
  };
  // Prompt once per app visit. Transcript processing never downloads.
  window.offerSemanticDownload = async () => {
    if (semanticPrompted) return;
    semanticPrompted = true;
    try { await window.ensureContentPack('AI_SEMANTIC'); }
    catch (error) { window.showToast?.(`Offline AI Bible detection: ${error.message}`, 'warning'); }
  };
  window.querySemanticContent = async (text, version) => {
    if (version !== 'KJV' || semanticBusy || !ready.has('AI_SEMANTIC')) return null;
    semanticBusy = true;
    try {
      const response = await fetch('/api/semantic/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, version }) });
      if (response.status === 409) { ready.delete('AI_SEMANTIC'); return null; }
      if (!response.ok) return null;
      return (await response.json()).result;
    } finally { semanticBusy = false; }
  };
  window.refreshContentCatalogue = async function() {
    const response = await fetch('/api/bibles/catalog');
    if (!response.ok) return;
    const catalogue = await response.json();
    if (!Array.isArray(catalogue.bibles)) return;
    CLOUD_REPOSITORIES.bibles = catalogue.bibles;
    window.populateBibleVersionSelects?.();
    const container = element('cloud-bibles-list');
    if (container && element('import-modal-backdrop')?.classList.contains('open')) window.renderCloudBibles?.(element('cloud-bible-search-input')?.value || '');
  };
  document.addEventListener('DOMContentLoaded', () => {
    const backdrop = element('content-download-backdrop');
    if (backdrop) {
      element('content-download-dismiss').onclick = dismissDownload;
      backdrop.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dismissDownload(); }
        if (event.key === 'Tab') {
          const buttons = Array.from(backdrop.querySelectorAll('button')).filter(button => !button.hidden && !button.disabled);
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      });
      backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) { event.preventDefault(); event.stopImmediatePropagation(); } });
      backdrop.addEventListener('click', event => { if (event.target === backdrop) { event.preventDefault(); event.stopImmediatePropagation(); dismissDownload(); } });
    }
    window.refreshContentCatalogue().catch(() => {});
    window.refreshAiContentSettings().catch(() => {});
  });
})();
