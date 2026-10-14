/* Saved local media uses host-served URLs, never browser-only blob URLs. */
(() => {
  let loading, deleting = false;
  window.loadSanctuaryUploads = function (publish = true, refresh = false) {
    if(refresh) loading=null;
    if (loading) return loading;
    loading = (async () => {
      try {
        const response = await fetch('/api/sanctuary-media');
        if (!response.ok) throw new Error(response.status === 404 || response.status === 403
          ? 'Uploads are unavailable on this connection. Restart the updated app/server and open the host console on localhost.'
          : 'Could not load custom backgrounds. Check the host connection, then reopen settings to retry.');
        const { items } = await response.json();
        items.forEach(item => { window.SANCTUARY_THEMES[item.id] = item; });
        const manager = window.themeManager;
        if (publish && /^(upload_|media_)/.test(manager.activeSanctuaryTheme)) {
          if (!window.SANCTUARY_THEMES[manager.activeSanctuaryTheme]) manager.activeSanctuaryTheme = 'celestial_motion';
          if (publish) manager.broadcastSanctuaryTheme();
          if (manager.sanctuaryDraft && !manager.hasSanctuaryDraftChanges()) manager.beginSanctuaryDraft();
        }
        manager.updateSanctuaryUi();
      } catch (error) {
        loading = null;
        const status = document.getElementById('style-upload-status');
        if (status) status.textContent = error.message;
      }
    })();
    return loading;
  };

  function inspectFile(file) {
    return new Promise((resolve, reject) => {
      const video = /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
      if (!/\.(jpg|jpeg|png|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/i.test(file.name)) return reject(new Error('Unsupported file type. Choose an image, GIF, MP4 or WebM video.'));
      if (!file.size || file.size > 250 * 1024 * 1024) return reject(new Error('Choose a non-empty file up to 250 MB.'));
      const url = URL.createObjectURL(file);
      const media = video ? document.createElement('video') : new Image();
      let timer;
      const finish = error => {
        clearTimeout(timer);
        const width = video ? media.videoWidth : media.naturalWidth;
        const height = video ? media.videoHeight : media.naturalHeight;
        media.onload = media.onloadeddata = media.onerror = null;
        media.removeAttribute('src');
        if (video) media.load();
        URL.revokeObjectURL(url);
        if (error || !width || !height) reject(error || new Error('This file could not be decoded. Try PNG, JPG, GIF, MP4 (H.264) or WebM.'));
        else resolve({ width, height });
      };
      timer = setTimeout(() => finish(new Error('This file took too long to read. Try a smaller file or another format.')), 30000);
      media.onerror = () => finish(new Error('This file cannot be played here. Try PNG, JPG, GIF, MP4 (H.264) or WebM.'));
      if (video) { media.muted = true; media.preload = 'auto'; media.onloadeddata = () => finish(); }
      else media.onload = () => finish();
      media.src = url;
    });
  }

  window.uploadSanctuaryBackgrounds = async function (input, options = {}) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    const button = document.getElementById(options.buttonId || 'style-upload-trigger');
    const status = document.getElementById(options.statusId || 'style-upload-status');
    button.disabled = true;
    const failures = [];
    let saved = 0;
    try {
      await window.loadSanctuaryUploads(options.publish !== false);
      for (const file of files) {
        status.textContent = `Reading ${file.name}…`;
        try {
          const dimensions = await inspectFile(file);
          const params = new URLSearchParams({ name: file.name, ...dimensions });
          const item = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `/api/sanctuary-media?${params}`);
            xhr.timeout = 10 * 60 * 1000;
            xhr.upload.onprogress = event => { status.textContent = `Uploading ${file.name}${event.lengthComputable ? ` · ${Math.round(event.loaded / event.total * 100)}%` : '…'}`; };
            xhr.onerror = xhr.ontimeout = () => reject(new Error('Upload interrupted. Check the host connection and try again.'));
            xhr.onload = () => {
              let data;
              try { data = JSON.parse(xhr.responseText); } catch (_) { return reject(new Error('The server could not save this file.')); }
              if (xhr.status !== 201) return reject(new Error(data.error || 'Upload failed.'));
              resolve(data.item);
            };
            xhr.send(file);
          });
          window.SANCTUARY_THEMES[item.id] = item;
          options.onSaved?.(item);
          saved++;
        } catch (error) { failures.push(`${file.name}: ${error.message}`); }
      }
      if (saved) { window.refreshStyleGallery?.(); await window.refreshMediaLibrary?.(); }
      status.textContent = [saved ? `${saved} background${saved === 1 ? '' : 's'} saved in Custom. Select one to preview it.` : '', ...failures].filter(Boolean).join(' ');
    } finally { button.disabled = false; }
  };

  window.deleteSanctuaryBackground = async function (themeId, options = {}) {
    const theme = window.SANCTUARY_THEMES?.[themeId];
    if (!theme || !theme.custom || deleting) return;
    deleting = true;

    try {
      const confirmed = typeof window.showCustomConfirm === 'function'
        ? await window.showCustomConfirm({
            title: theme.importedStyle ? 'Delete Style' : 'Delete Background',
            message: theme.importedStyle ? `Delete "${theme.name}"? Its background media will be kept.` : `Do you want to delete "${theme.name}"? This file will be permanently removed.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true
          })
        : window.confirm(theme.importedStyle ? `Delete "${theme.name}"? Its background media will be kept.` : `Do you want to delete "${theme.name}"? This file will be permanently removed.`);

      if (!confirmed) {
        const uploadBtn = document.getElementById(options.focusId || 'style-upload-trigger');
        if (uploadBtn) uploadBtn.focus({ preventScroll: true });
        return;
      }

      const response = await fetch(`/api/sanctuary-media?id=${encodeURIComponent(themeId)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not delete this background.');
      }

      delete window.SANCTUARY_THEMES[themeId];
      window.onPresentationMediaDeleted?.(themeId);

      const remainingCustomThemes = Object.values(window.SANCTUARY_THEMES || {}).filter(t => t.custom);
      const fallbackThemeId = remainingCustomThemes.length > 0 ? remainingCustomThemes[0].id : 'celestial_motion';

      // Clear references in both Output style libraries before publishing a fallback.
      window.onStyleBackgroundDeleted?.(themeId, theme, fallbackThemeId);

      const manager = window.themeManager;
      if (manager) {
        if (manager.activeSanctuaryTheme === themeId) {
          manager.activeSanctuaryTheme = fallbackThemeId;
          try { localStorage.setItem('sf_sanctuary_theme', fallbackThemeId); } catch (_) {}
          manager.broadcastSanctuaryTheme();
        }
        if (manager.sanctuaryDraft && manager.sanctuaryDraft.activeSanctuaryTheme === themeId) {
          manager.sanctuaryDraft.activeSanctuaryTheme = fallbackThemeId;
        }
        manager.updateSanctuaryUi();
      }

      // Restore focus to the active background library control.
      const uploadBtn = document.getElementById(options.focusId || 'style-upload-trigger');
      if (uploadBtn) uploadBtn.focus({ preventScroll: true });

      if (typeof window.showToast === 'function') {
        window.showToast(`Deleted "${theme.name}"`, 'success');
      }
    } catch (error) {
      if (typeof window.showToast === 'function') {
        window.showToast(error.message || 'Could not delete background', 'error');
      }
    } finally {
      deleting = false;
    }
  };

})();
