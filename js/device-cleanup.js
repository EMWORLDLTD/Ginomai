'use strict';
(() => {
  let running = false;
  const prompts = {
    all: ['Reset this device?', 'This permanently deletes downloaded AI and Bible content, saved songs, service sessions, agendas and transcript history. Workspace settings and saved API keys reset. Uploaded media is kept unless you choose to delete it below. Theme appearance, bundled KJV and original or exported files outside the app are kept.'],
    bibles: ['Clear downloaded Bibles?', 'This deletes imported translations and downloaded Bible content, including Strong’s. Bundled KJV, AI Bible detection, songs and saved sessions are kept.'],
    songs: ['Clear saved songs?', 'This permanently deletes saved songs and songbooks from this device. Bibles, transcripts and saved service sessions are kept.']
  };
  window.runDeviceCleanup = async scope => {
    if (running || !prompts[scope]) return false;
    running = true;
    const buttons = Array.from(document.querySelectorAll('#system-reset-modal-backdrop button'));
    const status = document.getElementById?.('reset-cleanup-status');
    try {
      const confirmation = await window.showCustomConfirm({ title: prompts[scope][0], message: prompts[scope][1], confirmText: scope === 'all' ? 'Reset' : 'Clear', cancelText: 'Cancel', danger: true,
        ...(scope === 'all' ? { checkbox: { label: 'Also delete uploaded media', checked: false } } : {}) });
      if (confirmation !== true && !confirmation?.confirmed) return false;
      const deleteMedia = scope === 'all' && confirmation.checked === true;
      buttons.forEach(button => { button.disabled = true; });
      if (status) status.hidden = false;
      if (scope === 'all') {
        if (window.desktopApi?.setUpdatePreferences) {
          const result = await window.desktopApi.setUpdatePreferences({ automaticDownloads: false });
          if (result?.preferenceError || result?.preferences?.automaticDownloads !== false) throw Error('Could not reset update preferences.');
        }
        window.sfResettingDevice = true;
        window.prepareDeviceDataReset?.();
        window.clearContentDownloadState?.();
      }
      const importer = window.libraryImporter;
      if (!importer) throw Error('The local library is not ready. Please retry.');
      await importer[scope === 'all' ? 'clearAllData' : scope === 'bibles' ? 'clearBiblesOnly' : 'clearSongsOnly']();
      if (scope !== 'songs') {
        const response = await fetch('/api/storage/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, deleteMedia }) });
        if (!response.ok) throw Error('File cleanup could not finish. Please retry.');
        if (scope === 'bibles') {
          for (const bible of window.CLOUD_REPOSITORIES?.bibles || []) window.forgetContentPack?.(bible.code);
          window.forgetContentPack?.('KJV_STRONGS');
        }
      }
      if (scope === 'all') {
        const keep = ['sf_ui_style', 'sf_ui_mode', 'sf_sanctuary_theme', 'sf_sanctuary_dimmer', 'sf_sanctuary_font', 'sf_sanctuary_fits', 'sf_obs_mode_rule'];
        const appearance = keep.map(key => [key, localStorage.getItem(key)]);
        localStorage.clear();
        for (const [key, value] of appearance) if (value !== null) localStorage.setItem(key, value);
        sessionStorage.clear();
        if (window.caches) for (const name of await caches.keys()) await caches.delete(name);
        sessionStorage.setItem('sf_reset_result', deleteMedia ? 'deleted' : 'kept');
      }
      return true;
    } catch (error) {
      window.sfResettingDevice = false;
      window.showToast?.('Cleanup could not finish. Some data may already have been cleared. Please retry.', 'error');
      return false;
    } finally {
      running = false;
      buttons.forEach(button => { button.disabled = false; });
      if (status) status.hidden = true;
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const result = sessionStorage.getItem('sf_reset_result');
    sessionStorage.removeItem('sf_reset_result');
    if (result === 'kept' || result === 'deleted') window.showToast?.(`Device reset complete. Uploaded media ${result}.`, 'success');
  }, { once: true });
})();
