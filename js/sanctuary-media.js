/* Saved local media uses host-served URLs, never browser-only blob URLs. */
(() => {
  let loading, deleting = false;
  const uploadHelp = 'Images, GIFs and videos · Up to 250 MB each · Videos loop without sound';
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
        const status = document.getElementById('sanctuary-upload-status');
        if (status) status.textContent = uploadHelp;
        items.forEach(item => { window.SANCTUARY_THEMES[item.id] = item; });
        const manager = window.themeManager;
        if (publish && /^(upload_|media_)/.test(manager.activeSanctuaryTheme)) {
          if (!window.SANCTUARY_THEMES[manager.activeSanctuaryTheme]) manager.activeSanctuaryTheme = 'celestial_motion';
          if (publish) manager.broadcastSanctuaryTheme();
          if (manager.sanctuaryDraft && !manager.hasSanctuaryDraftChanges()) manager.beginSanctuaryDraft();
        }
        manager.updateSanctuaryUi();
        if (document.getElementById('sanctuary-theme-modal-backdrop')?.style.display === 'flex') window.renderSanctuaryThemesGrid();
      } catch (error) {
        loading = null;
        const status = document.getElementById('sanctuary-upload-status');
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
    const button = document.getElementById(options.buttonId || 'sanctuary-upload-button');
    const status = document.getElementById(options.statusId || 'sanctuary-upload-status');
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
      if (saved) { if (!options.buttonId) window.filterSanctuaryThemes('uploads'); window.refreshStyleGallery?.(); await window.refreshMediaLibrary?.(); }
      status.textContent = [saved ? `${saved} background${saved === 1 ? '' : 's'} saved in Custom. Select one to preview it.` : '', ...failures].filter(Boolean).join(' ');
    } finally { button.disabled = false; }
  };

  window.updateSanctuaryFramingPreview = function () {
    const manager = window.themeManager;
    const preview = document.getElementById('sanctuary-framing-preview');
    if (!manager || !preview) return;
    const theme = manager.getSanctuaryPayload(manager.sanctuaryDraft || manager);
    const fit = theme.fit || 'cover';
    const image = document.getElementById('sanctuary-framing-image');
    const video = document.getElementById('sanctuary-framing-video');
    preview.style.aspectRatio = document.getElementById('sanctuary-preview-ratio').value;
    preview.style.background = theme.bgCss || '#000';
    image.hidden = theme.type !== 'image';
    video.hidden = theme.type !== 'video';
    image.style.objectFit = video.style.objectFit = fit;
    if (theme.type === 'image' && theme.imageUrl && image.getAttribute('src') !== theme.imageUrl) image.src = theme.imageUrl;
    if (theme.type === 'video' && theme.videoUrl) {
      if (video.getAttribute('src') !== theme.videoUrl) video.src = theme.videoUrl;
      if (document.getElementById('sanctuary-theme-modal-backdrop').style.display === 'flex') video.play().catch(() => {});
    } else video.pause();
    const dimmer = document.getElementById('sanctuary-framing-dimmer');
    dimmer.style.opacity = String((theme.dimmer || 0) / 100);
    const text = document.getElementById('sanctuary-framing-text');
    text.style.fontFamily = `'${theme.font}', sans-serif`;
    text.style.color = theme.textColor || '#fff';
    text.style.textShadow = theme.textShadow || 'none';
    text.textContent = window.state?.activeLiveText || 'Amazing grace\nHow sweet the sound';
    text.classList.toggle('is-lower-third', theme.obsModeRule === 'always_lt');
    const pending = manager.hasSanctuaryDraftChanges();
    document.getElementById('sanctuary-apply-button').disabled = !pending;
    document.getElementById('sanctuary-draft-status').textContent = pending ? 'Preview only — Apply to update your live display.' : 'Preview changes here. Apply when ready.';
    document.getElementById('sanctuary-media-fit').value = fit;
    document.getElementById('sanctuary-source-dimensions').textContent = (theme.width ? `Source: ${theme.width} × ${theme.height}. ` : '') + 'Output follows the actual screen.';
    document.getElementById('sanctuary-fit-hint').textContent = { cover: 'Fills any screen. Edges may be cropped.', contain: 'Shows the entire file. Unused space stays black.', fill: 'Fills the screen, but may distort the image.' }[fit];
    const deleteBtn = document.getElementById('sanctuary-delete-selected-btn');
    if (deleteBtn) {
      deleteBtn.style.display = theme.custom ? 'inline-flex' : 'none';
    }
  };

  window.deleteSanctuaryBackground = async function (themeId, options = {}) {
    const theme = window.SANCTUARY_THEMES?.[themeId];
    if (!theme || !theme.custom || deleting) return;
    deleting = true;

    window._sfSuppressSanctuaryClose = true;
    const modal = options.source === 'style' ? null : document.getElementById('sanctuary-theme-modal-backdrop');

    try {
      const confirmed = typeof window.showCustomConfirm === 'function'
        ? await window.showCustomConfirm({
            title: 'Delete Background',
            message: `Do you want to delete "${theme.name}"? This file will be permanently removed.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true
          })
        : window.confirm(`Do you want to delete "${theme.name}"? This file will be permanently removed.`);

      // Keep the Sanctuary Theme page active and open on cancellation or completion
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open');
        modal.inert = false;
      }

      if (!confirmed) {
        const uploadBtn = document.getElementById(options.source === 'style' ? options.focusId || 'style-upload-trigger' : 'sanctuary-upload-button');
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
      if (modal && typeof window.updateSanctuaryFramingPreview === 'function') {
        window.updateSanctuaryFramingPreview();
      }

      // Safely move focus to safe control inside theme modal before card removal
      const uploadBtn = document.getElementById(options.source === 'style' ? options.focusId || 'style-upload-trigger' : 'sanctuary-upload-button');
      if (uploadBtn) uploadBtn.focus({ preventScroll: true });

      const card = document.querySelector(`.sanctuary-theme-card[data-theme-id="${themeId}"]`);
      if (card) card.remove();

      const grid = document.getElementById('sanctuary-themes-grid');
      if (grid) {
        const emptyEl = grid.querySelector('.sanctuary-empty-uploads');
        if (emptyEl && activeSanctuaryCategory === 'uploads') {
          emptyEl.hidden = remainingCustomThemes.length > 0;
        }
      }

      // Strongly verify Sanctuary Theme modal remains open and operable
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open');
        modal.inert = false;
      }

      if (typeof window.showToast === 'function') {
        window.showToast(`Deleted "${theme.name}"`, 'success');
      }
    } catch (error) {
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open');
        modal.inert = false;
      }
      if (typeof window.showToast === 'function') {
        window.showToast(error.message || 'Could not delete background', 'error');
      }
    } finally {
      deleting = false;
      setTimeout(() => {
        window._sfSuppressSanctuaryClose = false;
      }, 350);
    }
  };

  window.deleteSelectedSanctuaryBackground = function () {
    const manager = window.themeManager;
    const curThemeId = (manager?.sanctuaryDraft || manager)?.activeSanctuaryTheme;
    if (curThemeId && window.SANCTUARY_THEMES?.[curThemeId]?.custom) {
      window.deleteSanctuaryBackground(curThemeId);
    }
  };
  let tabAnimation;
  window.updateSanctuaryTabIndicator = function (animate = false) {
    const tabs = document.querySelector('.sanctuary-cat-tabs');
    const active = tabs?.querySelector('.sanctuary-cat-tab.active');
    const indicator = tabs?.querySelector('.sanctuary-tab-indicator');
    if (!active || !indicator || !tabs.getClientRects().length) return;
    const old = indicator.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    const parent = tabs.getBoundingClientRect();
    tabAnimation?.cancel();
    Object.assign(indicator.style, { left: `${target.left - parent.left - tabs.clientLeft}px`, top: `${target.top - parent.top - tabs.clientTop}px`, width: `${target.width}px`, height: `${target.height}px` });
    if (animate && old.width && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const dx = old.left - target.left, dy = old.top - target.top;
      const stretch = Math.min(1.65, 1 + Math.abs(dx) / target.width * .15);
      tabAnimation = indicator.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${old.width / target.width}, ${old.height / target.height})`, borderRadius: '6px' },
        { transform: `translate(${dx * .35}px, ${dy * .35}px) scale(${stretch}, .82)`, borderRadius: '12px', offset: .55 },
        { transform: 'translate(0, 0) scale(1)', borderRadius: '6px' }
      ], { duration: 40, easing: 'ease-out' });
    }
  };
  window.addEventListener('resize', () => window.updateSanctuaryTabIndicator(false));
})();
