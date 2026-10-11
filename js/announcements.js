// Ginomai - Live Alert & Announcement Hub Engine
'use strict';

(function() {
  const STORAGE_KEY = 'sf_saved_announcements';
  const LIVE_ALERT_STORAGE_KEY = 'sf_live_alert';
  const BACKGROUND_STORAGE_KEY = 'sf_announcement_background';
  const DEFAULT_BACKGROUND = { id: 'announcement_midnight', name: 'Midnight', type: 'gradient', bgCss: '#10131b', textColor: '#ffffff', font: 'Outfit', dimmer: 0 };
  let activeAnnouncementPopup = null;
  let deleteConfirmation = null;
  let backgroundPicker = null;
  let announcementBackground = DEFAULT_BACKGROUND;
  try {
    const saved = JSON.parse(localStorage.getItem(BACKGROUND_STORAGE_KEY));
    if (saved?.id && saved?.name) announcementBackground = saved;
  } catch (_) {}

  function getAnnouncementBackground() {
    const theme = window.SANCTUARY_THEMES?.[announcementBackground.id];
    return theme ? backgroundFromTheme(theme) : { ...announcementBackground };
  }

  function backgroundFromTheme(theme) {
    return { id: theme.id, name: theme.name, type: theme.type || 'gradient',
      imageUrl: theme.imageUrl || '', videoUrl: theme.videoUrl || '', bgCss: theme.bgCss || '',
      previewGradient: theme.previewGradient || '', custom: Boolean(theme.custom),
      fit: 'cover', dimmer: 30, font: theme.font || 'Outfit',
      textColor: theme.textColor || '#ffffff', textShadow: theme.textShadow || '0 2px 8px #000' };
  }

  function paintBackgroundThumbnail(node, background) {
    node.style.background = background.previewGradient || background.bgCss || '#10131b';
    if (background.imageUrl) node.style.backgroundImage = `url(${JSON.stringify(background.imageUrl)})`;
  }

  function syncAnnouncementBackground() {
    const field = document.getElementById('ann-background-field');
    if (field) field.hidden = document.getElementById('alert-position')?.value !== 'fullscreen';
    const background = getAnnouncementBackground();
    const name = document.getElementById('ann-background-name');
    if (name) name.textContent = background.name;
    const trigger = document.getElementById('ann-background-trigger');
    if (trigger) trigger.title = background.name;
    const thumb = document.getElementById('ann-background-thumb');
    if (thumb) paintBackgroundThumbnail(thumb, background);
  }

  const LEGACY_ANNOUNCEMENTS = [
    {
      id: 'ann_welcome',
      title: 'Welcome to Service',
      text: 'We are thrilled to worship with you today! First time guests, please visit the Welcome Lounge after service.',
      position: 'lowerthird',
      loop: false,
      urgency: 'normal',
      destinations: { sanctuary: true, livestream: true, stage: false },
      createdAt: Date.now() - 3600000
    },
    {
      id: 'ann_vehicle',
      title: 'Vehicle Notice',
      text: 'Vehicle owner of plate [ABC-123], kindly attend to your vehicle at the main exit.',
      position: 'lowerthird',
      loop: true,
      urgency: 'urgent',
      destinations: { sanctuary: true, livestream: false, stage: true },
      createdAt: Date.now() - 7200000
    },
    {
      id: 'ann_giving',
      title: 'Tithes & Offerings',
      text: 'Online giving is available at church.org/give, or via giving boxes at the auditorium exits.',
      position: 'lowerthird',
      loop: false,
      urgency: 'normal',
      destinations: { sanctuary: true, livestream: true, stage: false },
      createdAt: Date.now() - 10800000
    }
  ];

  class LiveAlertEngine {
    constructor() {
      this.currentAlert = null;
      this.savedAnnouncements = [];
      this.selectedPosition = 'upperthird';
      this.activeFilter = '';
      this.init();
    }

    init() {
      this.loadSavedAnnouncements();
      this.loadLiveAlert();
      this.scheduleExpiry();
      this.setupStorageListener();
      this.updateLiveStatusUI();
    }

    loadSavedAnnouncements() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.savedAnnouncements = Array.isArray(parsed) ? parsed.filter(item =>
            !LEGACY_ANNOUNCEMENTS.some(preset => preset.id === item.id && preset.title === item.title && preset.text === item.text && !item.updatedAt)
          ) : [];
          if (Array.isArray(parsed) && parsed.length !== this.savedAnnouncements.length) this.persistSavedAnnouncements();
        } else {
          this.savedAnnouncements = [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedAnnouncements));
        }
      } catch (e) {
        this.savedAnnouncements = [];
      }
    }

    persistSavedAnnouncements() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedAnnouncements));
      } catch (e) {}
    }

    loadLiveAlert() {
      try {
        const live = localStorage.getItem(LIVE_ALERT_STORAGE_KEY);
        if (live) {
          const parsed = JSON.parse(live);
          if (parsed && parsed.active) {
            this.currentAlert = parsed;
          }
        }
      } catch (e) {}
    }

    receiveLiveAlert(alert) {
      this.currentAlert = alert || null;
      try {
        if (alert?.active) localStorage.setItem(LIVE_ALERT_STORAGE_KEY, JSON.stringify(alert));
        else localStorage.removeItem(LIVE_ALERT_STORAGE_KEY);
      } catch (_) {}
      this.scheduleExpiry();
      this.updateLiveStatusUI();
    }

    setupStorageListener() {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener('storage', (e) => {
        if (e.key === LIVE_ALERT_STORAGE_KEY) {
          try {
            this.currentAlert = e.newValue ? JSON.parse(e.newValue) : null;
            this.scheduleExpiry();
            this.updateLiveStatusUI();
          } catch (_) {}
        }
        if (e.key === STORAGE_KEY) {
          this.loadSavedAnnouncements();
          this.renderSavedList();
        }
        if (e.key === BACKGROUND_STORAGE_KEY) {
          try {
            const saved = JSON.parse(e.newValue);
            announcementBackground = saved?.id && saved?.name ? saved : DEFAULT_BACKGROUND;
            syncAnnouncementBackground();
          } catch (_) {}
        }
      });
    }

    sendLiveAlert(options = {}) {
      const text = (options.text || '').trim();
      if (!text) {
        if (typeof window.showToast === 'function') {
          window.showToast('Please enter announcement text', 'warning');
        }
        return false;
      }

      const alertPayload = {
        active: true,
        text,
        position: options.position || this.selectedPosition || 'lowerthird',
        loop: true,
        speed: options.speed || 'normal',
        urgency: options.urgency || 'normal',
        tag: options.tag || (options.urgency === 'urgent' ? 'Urgent Notice' : 'Announcement'),
        destinations: options.destinations || {
          sanctuary: true,
          livestream: true,
          stage: false
        },
        expiresAt: Number(options.durationSeconds) > 0 ? Date.now() + Math.min(Number(options.durationSeconds), 86400) * 1000 : null,
        timestamp: Date.now()
      };
      if (alertPayload.position === 'fullscreen') alertPayload.background = getAnnouncementBackground();

      this.currentAlert = alertPayload;
      this.scheduleExpiry();

      try {
        localStorage.setItem(LIVE_ALERT_STORAGE_KEY, JSON.stringify(alertPayload));
      } catch (e) {}

      // Broadcast to all outputs
      if (typeof window.broadcastState === 'function') {
        window.broadcastState({ alert: alertPayload });
      }

      this.updateLiveStatusUI();

      if (typeof window.showToast === 'function') {
        const destDesc = this.getDestinationsLabel(alertPayload.destinations);
        window.showToast(`Alert live on ${destDesc}`, 'success');
      }

      return true;
    }

    scheduleExpiry() {
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      const alert = this.currentAlert;
      if (!alert?.active || !alert.expiresAt) return;
      if (alert.expiresAt <= Date.now()) { this.clearLiveAlert(); return; }
      this.expiryTimer = setTimeout(() => {
        if (this.currentAlert === alert) this.clearLiveAlert();
      }, alert.expiresAt - Date.now());
    }

    clearLiveAlert() {
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      this.currentAlert = {
        active: false,
        text: '',
        timestamp: Date.now()
      };

      try {
        localStorage.removeItem(LIVE_ALERT_STORAGE_KEY);
      } catch (e) {}

      if (typeof window.broadcastState === 'function') {
        window.broadcastState({ alert: { active: false, text: '' } });
      }

      this.updateLiveStatusUI();

      if (typeof window.showToast === 'function') {
        window.showToast('Live alert cleared', 'info');
      }
    }

    getDestinationsLabel(dest) {
      if (!dest) return 'All Displays';
      const parts = [];
      if (dest.sanctuary) parts.push('Projector');
      if (dest.livestream) parts.push('Stream');
      if (dest.stage) parts.push('Stage');
      return parts.length > 0 ? parts.join(' + ') : 'None';
    }

    filterSavedAnnouncements(query) {
      const q = (query || '').toLowerCase().trim();
      if (!q) return [...this.savedAnnouncements];
      return this.savedAnnouncements.filter(a =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.tag && a.tag.toLowerCase().includes(q)) ||
        (a.text && a.text.toLowerCase().includes(q))
      );
    }

    saveAnnouncement(item) {
      if (!item || !item.text) return null;
      const now = Date.now();
      const existingIdx = this.savedAnnouncements.findIndex(a => a.id === item.id);
      let result = null;
      if (existingIdx !== -1) {
        this.savedAnnouncements[existingIdx] = {
          ...this.savedAnnouncements[existingIdx],
          ...item,
          tag: item.tag || item.title || this.savedAnnouncements[existingIdx].tag || 'Announcement',
          title: item.title || item.tag || this.savedAnnouncements[existingIdx].title || 'Church Announcement',
          updatedAt: now
        };
        result = this.savedAnnouncements[existingIdx];
      } else {
        const newAnn = {
          id: item.id || ('ann_' + now),
          title: item.title || item.tag || 'Church Announcement',
          tag: item.tag || item.title || 'Announcement',
          text: item.text,
          position: item.position || 'lowerthird',
          loop: true,
          speed: item.speed || 'normal',
          urgency: item.urgency || 'normal',
          destinations: item.destinations || { sanctuary: true, livestream: true, stage: false },
          durationSeconds: item.durationSeconds ?? 60,
          createdAt: now
        };
        this.savedAnnouncements.unshift(newAnn);
        result = newAnn;
      }
      this.persistSavedAnnouncements();
      this.renderSavedList();
      if (typeof window.showToast === 'function') {
        window.showToast('Announcement saved to library', 'success');
      }
      return result;
    }

    deleteAnnouncement(id) {
      const before = this.savedAnnouncements.length;
      this.savedAnnouncements = this.savedAnnouncements.filter(a => a.id !== id);
      if (this.editingId === id) {
        this.editingId = null;
        const saveButton = document.getElementById('ann-save-draft');
        if (saveButton) saveButton.textContent = 'Save';
      }
      this.persistSavedAnnouncements();
      this.renderSavedList();
      if (typeof window.showToast === 'function') {
        window.showToast('Announcement removed', 'info');
      }
      return this.savedAnnouncements.length < before;
    }

    updateLiveStatusUI() {
      this.updatePreview();
      const sizeLabel = document.getElementById('bento-textscale-label');
      if (sizeLabel && window.getPreviewTextScaleControl) sizeLabel.textContent = window.getPreviewTextScaleControl().value.toFixed(1) + 'x';
      const isLive = Boolean(this.currentAlert && this.currentAlert.active && this.currentAlert.text);
      const strip = document.getElementById('bento-live-alert-strip');
      const stripDest = document.getElementById('bento-alert-strip-dest');
      const stripMsg = document.getElementById('bento-alert-strip-msg');
      const headerBtn = document.getElementById('bento-announcement-btn');
      const stageBtn = document.getElementById('bento-alert-action-btn');
      const preview = document.getElementById('ann-live-preview');
      const destinations = document.getElementById('ann-live-destinations');
      const stop = document.getElementById('ann-stop-live');
      if (preview) preview.textContent = isLive ? this.currentAlert.text : 'No message live';
      if (destinations) destinations.textContent = isLive ? this.getDestinationsLabel(this.currentAlert.destinations) : '';
      if (stop) stop.hidden = !isLive;




      if (strip) strip.style.display = 'none';

      if (headerBtn) {
        headerBtn.classList.toggle('active-live', isLive);
      }
      if (stageBtn) {
        stageBtn.classList.toggle('active-live', isLive);
      }
    }

    updatePreview() {
      const alert = this.currentAlert;
      const active = alert?.active && alert.text && (!alert.expiresAt || alert.expiresAt > Date.now());
      const target = window.previewTargetMode === 'sanctuary' || !window.previewTargetMode ? 'sanctuary' : 'livestream';
      for (const [name, destination] of [['single', target], ['sanctuary', 'sanctuary'], ['livestream', 'livestream']]) {
        const ticker = document.getElementById('ann-preview-' + name);
        if (!ticker) continue;
        ticker.hidden = !active || (alert.destinations && !alert.destinations[destination]);
        const text = ticker.querySelector('span');
        if (!text) continue;
        if (ticker.hidden) { text.textContent = ''; continue; }
        const position = alert.position || 'upperthird';
        ticker.dataset.position = position;
        ticker.classList.toggle('urgent', alert.urgency === 'urgent');
        if (text.textContent !== alert.text) text.textContent = alert.text;
        // Convert preview pixels to the equivalent 1080p output distance.
        const scale = ticker.clientWidth / 1920 || 1;
        const speed = { slow: 55, normal: 85, fast: 120 }[alert.speed] || 85;
        const distance = ticker.clientWidth + text.scrollWidth;
        const duration = Math.max(8, distance / Math.max(24, scale * speed));
        ticker.style.setProperty('--ann-preview-duration', duration + 's');
        // Begin with the message visible, rather than a blank lead-in.
        ticker.style.setProperty('--ann-preview-delay', -(duration * ticker.clientWidth / distance) + 's');
      }
    }

    renderSavedList() {
      closeAnnouncementPopup(false);
      const container = document.getElementById('saved-announcements-list');
      if (!container) return;

      const q = (this.activeFilter || '').toLowerCase().trim();
      const filtered = this.filterSavedAnnouncements(q);

      if (!filtered.length) {
        container.innerHTML = `
          <div class="ann-library-empty">
            <span class="ann-library-empty-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
            <strong>${q ? 'No matching messages' : 'No saved messages yet'}</strong>
            <p>${q ? 'Try another title or keyword.' : 'Write a message, then choose Save to use it again.'}</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(a => `
        <div class="ann-list-row">
          <button type="button" class="ann-message-select" title="Edit saved announcement"><span>${escapeHtml(a.title || a.tag || 'Message')}</span><small>${escapeHtml(a.text)}</small></button>
          <button type="button" class="ann-remove" aria-label="Delete saved message" title="Delete saved message">×</button>
        </div>`).join('');
      container.querySelectorAll('.ann-list-row').forEach((row, index) => {
        const item = filtered[index];
        row.querySelector('.ann-message-select').onclick = () => window.loadAnnouncementComposer(item);
        row.querySelector('.ann-remove').onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.confirmAnnouncementDelete(item.id, event.currentTarget);
        };
      });
    }

    projectSaved(id, overridePosition = null) {
      const item = this.savedAnnouncements.find(a => a.id === id);
      if (!item) return;

      this.sendLiveAlert({
        text: item.text,
        position: overridePosition || item.position || 'lowerthird',
        loop: true,
        speed: item.speed || 'normal',
        urgency: item.urgency || 'normal',
        tag: item.title,
        destinations: item.destinations
      });
    }

    openEditModal(id) {
      const item = this.savedAnnouncements.find(a => a.id === id);
      if (!item) return;
      window.openNewAnnouncementModal(item);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function closeAnnouncementPopup(restoreFocus = true) {
    const active = activeAnnouncementPopup;
    if (!active) return false;
    activeAnnouncementPopup = null;
    active.popup.hidden = true;
    active.wrapper?.classList.remove('open');
    active.anchor.setAttribute('aria-expanded', 'false');
    window.closeDismissShield?.();
    if (restoreFocus && active.anchor.isConnected !== false) active.anchor.focus?.();
    return true;
  }

  function openAnnouncementPopup(popup, anchor, wrapper = null) {
    closeAnnouncementPopup(false);
    popup.classList.add('ann-local-popover');
    document.body.appendChild(popup);
    popup.hidden = false;
    wrapper?.classList.add('open');
    anchor.setAttribute('aria-expanded', 'true');
    activeAnnouncementPopup = { popup, anchor, wrapper };
    window.openDismissShield?.(() => closeAnnouncementPopup(), 100043);
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(popup === backgroundPicker ? 420 : wrapper ? Math.max(160, rect.width) : 224, window.innerWidth - 16);
    popup.style.width = width + 'px';
    const height = popup.offsetHeight;
    const below = rect.bottom + 4;
    popup.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(below + height <= window.innerHeight - 8 ? below : rect.top - height - 4, window.innerHeight - height - 8)) + 'px';
  }

  // Reuse the app's custom select nodes, with a portal to avoid tray scroll clipping.
  window.configureAnnouncementSelect = function(select, wrapper, trigger, popup, buildOptions) {
    popup.id = select.id + '-options';
    popup.hidden = true;
    popup.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', popup.id);
    const label = select.closest('label')?.firstChild?.textContent || document.querySelector(`label[for="${select.id}"]`)?.textContent || 'Options';
    const sync = () => {
      const option = select.options[select.selectedIndex];
      trigger.setAttribute('aria-label', `${label.trim()}: ${option?.text || ''}`);
      window.syncCustomSelect?.(select);
    };
    const open = () => {
      buildOptions();
      popup.querySelectorAll('.custom-select-option').forEach(item => {
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(item.dataset.value === select.value));
        item.tabIndex = -1;
      });
      openAnnouncementPopup(popup, trigger, wrapper);
      (popup.querySelector('.selected') || popup.firstElementChild)?.focus();
    };
    trigger.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      if (activeAnnouncementPopup?.popup === popup) closeAnnouncementPopup();
      else open();
    };
    trigger.onkeydown = event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open();
      }
    };
    popup.onkeydown = event => {
      const items = Array.from(popup.querySelectorAll('.custom-select-option'));
      const index = items.indexOf(document.activeElement);
      let next = index;
      if (event.key === 'ArrowDown') next = (index + 1) % items.length;
      else if (event.key === 'ArrowUp') next = (index + items.length - 1) % items.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        items[index]?.click();
        return;
      } else return;
      event.preventDefault();
      items[next]?.focus();
    };
    select.addEventListener('change', () => { sync(); closeAnnouncementPopup(); });
    sync();
  };

  window.openAnnouncementBackgroundPicker = function(anchor) {
    if (activeAnnouncementPopup?.popup === backgroundPicker && backgroundPicker) { closeAnnouncementPopup(); return; }
    if (!backgroundPicker) {
      backgroundPicker = document.createElement('div');
      backgroundPicker.id = 'ann-background-picker';
      backgroundPicker.className = 'ann-background-picker';
      backgroundPicker.setAttribute('role', 'dialog');
      backgroundPicker.setAttribute('aria-modal', 'true');
      backgroundPicker.setAttribute('aria-labelledby', 'ann-background-picker-title');
      backgroundPicker.innerHTML = '<div class="ann-background-picker-heading"><strong id="ann-background-picker-title">Choose a background</strong><button type="button" class="ann-background-close" aria-label="Close backgrounds">×</button></div><input type="search" class="ann-search-input" placeholder="Search backgrounds…" aria-label="Search backgrounds"><div class="ann-background-filters" role="group" aria-label="Background type"></div><div class="ann-background-grid"></div><p class="ann-background-none" hidden>No matching backgrounds</p>';
      backgroundPicker.querySelector('.ann-background-close').onclick = () => closeAnnouncementPopup();
      backgroundPicker.onkeydown = event => {
        const cards = Array.from(backgroundPicker.querySelectorAll('.ann-background-option:not([hidden])'));
        const index = cards.indexOf(document.activeElement);
        if (index >= 0 && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[event.key] || 0;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + step));
          cards[next]?.focus();
        }
        if (event.key === 'Tab') {
          const focusable = Array.from(backgroundPicker.querySelectorAll('button:not([hidden]), input'));
          if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
          else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
        }
      };
    }
    anchor.setAttribute('aria-controls', backgroundPicker.id);
    const current = getAnnouncementBackground();
    const backgrounds = [DEFAULT_BACKGROUND, ...Object.values(window.SANCTUARY_THEMES || {}).map(backgroundFromTheme)];
    if (!backgrounds.some(item => item.id === current.id)) backgrounds.unshift(current);
    const grid = backgroundPicker.querySelector('.ann-background-grid');
    grid.replaceChildren();
    let filter = 'all';
    const search = backgroundPicker.querySelector('input');
    search.value = '';
    const applyFilter = () => {
      const query = search.value.trim().toLowerCase();
      let count = 0;
      for (const card of grid.children) {
        card.hidden = !card.dataset.name.includes(query) || (filter === 'motion' ? card.dataset.type !== 'video' : filter === 'still' ? card.dataset.type === 'video' : filter === 'uploads' ? card.dataset.custom !== 'true' : false);
        if (!card.hidden) count++;
      }
      backgroundPicker.querySelector('.ann-background-none').hidden = count > 0;
    };
    search.oninput = applyFilter;
    const filters = backgroundPicker.querySelector('.ann-background-filters');
    filters.replaceChildren();
    for (const [id, name] of [['all', 'All'], ['still', 'Still'], ['motion', 'Motion'], ['uploads', 'Uploads']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = name;
      button.setAttribute('aria-pressed', String(id === filter));
      button.onclick = () => {
        filter = id;
        for (const item of filters.children) item.setAttribute('aria-pressed', String(item === button));
        applyFilter();
      };
      filters.appendChild(button);
    }
    for (const background of backgrounds) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'ann-background-option';
      card.dataset.name = background.name.toLowerCase(); card.dataset.type = background.type; card.dataset.custom = String(Boolean(background.custom));
      card.setAttribute('aria-pressed', String(background.id === current.id));
      card.setAttribute('aria-label', `${background.name}${background.type === 'video' ? ', motion background' : ''}`);
      const thumb = document.createElement('span'); thumb.className = 'ann-background-swatch'; thumb.setAttribute('aria-hidden', 'true');
      paintBackgroundThumbnail(thumb, background);
      thumb.innerHTML = '<svg class="ann-background-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 12 4 4 10-10"/></svg>';
      const label = document.createElement('span'); label.className = 'ann-background-option-name'; label.textContent = background.name;
      card.appendChild(thumb); card.appendChild(label);
      if (background.type === 'video') { const badge = document.createElement('span'); badge.className = 'ann-background-motion'; badge.textContent = 'Motion'; thumb.appendChild(badge); }
      card.onclick = () => {
        announcementBackground = { ...background };
        try { localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(announcementBackground)); } catch (_) {}
        syncAnnouncementBackground();
        closeAnnouncementPopup();
      };
      grid.appendChild(card);
    }
    openAnnouncementPopup(backgroundPicker, anchor);
    search.focus();
  };

  window.confirmAnnouncementDelete = function(id, anchor) {
    if (!liveAlertEngine.savedAnnouncements.some(item => item.id === id)) return;
    if (!deleteConfirmation) {
      deleteConfirmation = document.createElement('div');
      deleteConfirmation.id = 'ann-delete-confirmation';
      deleteConfirmation.className = 'ann-delete-confirmation';
      deleteConfirmation.setAttribute('role', 'dialog');
      deleteConfirmation.setAttribute('aria-modal', 'true');
      deleteConfirmation.setAttribute('aria-label', 'Delete this announcement?');
      deleteConfirmation.innerHTML = '<p>Delete this announcement?</p><div class="ann-delete-actions"><button type="button" class="ann-action-btn ann-delete-no">No</button><button type="button" class="ann-action-btn ann-delete-yes">Yes</button></div>';
      deleteConfirmation.onkeydown = event => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const no = deleteConfirmation.querySelector('.ann-delete-no');
        const yes = deleteConfirmation.querySelector('.ann-delete-yes');
        (document.activeElement === no ? yes : no).focus();
      };
    }
    anchor.setAttribute('aria-haspopup', 'dialog');
    anchor.setAttribute('aria-controls', deleteConfirmation.id);
    deleteConfirmation.querySelector('.ann-delete-no').onclick = () => closeAnnouncementPopup();
    deleteConfirmation.querySelector('.ann-delete-yes').onclick = () => {
      closeAnnouncementPopup(false);
      liveAlertEngine.deleteAnnouncement(id);
      document.getElementById('ann-search-input')?.focus();
    };
    openAnnouncementPopup(deleteConfirmation, anchor);
    deleteConfirmation.querySelector('.ann-delete-no').focus();
  };

  const liveAlertEngine = new LiveAlertEngine();
  window.liveAlertEngine = liveAlertEngine;

  // UI Open / Close / Toggle Functions
  let announcementListRendered = false;
  window.toggleAnnouncementHub = function() {
    const tray = document.getElementById('announcement-hub-drawer');
    if (!tray) return;
    if (tray.hidden) window.openAnnouncementHub();
    else window.closeAnnouncementHub();
  };

  window.openAnnouncementHub = function() {
    const tray = document.getElementById('announcement-hub-drawer');
    if (!tray) return;
    tray.hidden = false;
    tray.inert = false;
    tray.classList.add('open');
    document.getElementById('bento-announcement-btn')?.setAttribute('aria-expanded', 'true');
    if (!announcementListRendered) {
      liveAlertEngine.renderSavedList();
      announcementListRendered = true;
    }
    liveAlertEngine.updateLiveStatusUI();
    syncAnnouncementBackground();
    document.getElementById('live-alert-input')?.focus();
  };

  window.closeAnnouncementHub = function() {
    closeAnnouncementPopup(false);
    const tray = document.getElementById('announcement-hub-drawer');
    if (!tray) return;
    tray.hidden = true;
    tray.inert = true;
    tray.classList.remove('open');
    const toggle = document.getElementById('bento-announcement-btn');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.focus?.();
    liveAlertEngine.updateLiveStatusUI();
  };

  window.selectAlertPosition = function(pos) {
    liveAlertEngine.selectedPosition = pos;
    document.querySelectorAll('.alert-pos-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pos === pos);
    });
  };

  window.sendQuickLiveAlert = function() {
    const input = document.getElementById('live-alert-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
      if (typeof window.showToast === 'function') window.showToast('Please type an alert message first', 'warning');
      return;
    }

    const sanctuary = Boolean(document.getElementById('alert-dest-sanctuary')?.checked);
    const livestream = Boolean(document.getElementById('alert-dest-livestream')?.checked);
    const stage = Boolean(document.getElementById('alert-dest-stage')?.checked);
    if (!sanctuary && !livestream && !stage) {
      window.showToast?.('Choose at least one destination', 'warning');
      return;
    }
    const options = {
      text,
      position: document.getElementById('alert-position')?.value || 'upperthird',
      durationSeconds: Number(document.getElementById('alert-duration')?.value ?? 60),
      destinations: { sanctuary, livestream, stage }
    };
    if (liveAlertEngine.sendLiveAlert(options)) {
      if (document.getElementById('alert-save-message')?.checked) {
        window.saveAnnouncementDraft();
        document.getElementById('alert-save-message').checked = false;
      }
    }
  };

  window.loadAnnouncementComposer = function(item) {
    liveAlertEngine.editingId = item.id;
    const saveButton = document.getElementById('ann-save-draft');
    if (saveButton) saveButton.textContent = item.id ? 'Save changes' : 'Save';
    const input = document.getElementById('live-alert-input');
    if (input) { input.value = item.text || ''; input.focus(); }
    // Every selection requires the operator to choose destinations before sending.
    ['sanctuary', 'livestream', 'stage'].forEach(name => {
      const field = document.getElementById('alert-dest-' + name);
      if (field) field.checked = false;
    });
    document.getElementById('alert-position').value = ['upperthird', 'lowerthird', 'fullscreen'].includes(item.position) ? item.position : 'upperthird';
    document.getElementById('alert-duration').value = String(item.durationSeconds ?? 60);
    window.syncCustomSelect?.(document.getElementById('alert-position'));
    window.syncCustomSelect?.(document.getElementById('alert-duration'));
    syncAnnouncementBackground();
    document.getElementById('alert-save-message').checked = false;
    input?.scrollIntoView?.({ block: 'nearest' });
  };
  window.saveAnnouncementDraft = function() {
    const text = document.getElementById('live-alert-input')?.value.trim();
    if (!text) { window.showToast?.('Type a message before saving', 'warning'); return; }
    const saved = liveAlertEngine.saveAnnouncement({
      id: liveAlertEngine.editingId || undefined,
      text, title: text.split('\n')[0].slice(0, 70),
      position: document.getElementById('alert-position')?.value || 'upperthird',
      durationSeconds: Number(document.getElementById('alert-duration')?.value ?? 60),
      destinations: Object.fromEntries(['sanctuary', 'livestream', 'stage'].map(name =>
        [name, Boolean(document.getElementById('alert-dest-' + name)?.checked)]))
    });
    if (saved) {
      liveAlertEngine.editingId = saved.id;
      const button = document.getElementById('ann-save-draft');
      if (button) button.textContent = 'Save changes';
    }
  };
  window.resetAnnouncementComposer = function() {
    window.loadAnnouncementComposer({ text: '', position: 'upperthird' });
  };

  window.clearLiveAlert = function() {
    liveAlertEngine.clearLiveAlert();
    const input = document.getElementById('live-alert-input');
    if (input) input.value = '';
  };

  window.filterSavedAnnouncements = function(query) {
    liveAlertEngine.activeFilter = query;
    liveAlertEngine.renderSavedList();
  };

  // Modal for creating/editing saved announcements
  window.openNewAnnouncementModal = function(editItem = null) {
    let modal = document.getElementById('announcement-edit-modal-backdrop');
    if (!modal) return;

    const titleInput = document.getElementById('ann-modal-title');
    const textInput = document.getElementById('ann-modal-text');
    const posSelect = document.getElementById('ann-modal-pos');
    const loopCheck = document.getElementById('ann-modal-loop');
    const urgentCheck = document.getElementById('ann-modal-urgent');
    const destSanctuary = document.getElementById('ann-modal-dest-sanctuary');
    const destStream = document.getElementById('ann-modal-dest-livestream');
    const destStage = document.getElementById('ann-modal-dest-stage');
    const editIdInput = document.getElementById('ann-modal-edit-id');
    const headingEl = document.getElementById('ann-modal-heading');
    const speedSelect = document.getElementById('ann-modal-speed');
    if (speedSelect) speedSelect.value = editItem?.speed || 'normal';

    if (editItem) {
      if (headingEl) headingEl.textContent = 'Edit Saved Announcement';
      if (editIdInput) editIdInput.value = editItem.id;
      if (titleInput) titleInput.value = editItem.title || '';
      if (textInput) textInput.value = editItem.text || '';
      if (posSelect) posSelect.value = editItem.position || 'lowerthird';
      if (loopCheck) loopCheck.checked = Boolean(editItem.loop);
      if (urgentCheck) urgentCheck.checked = editItem.urgency === 'urgent';
      if (destSanctuary) destSanctuary.checked = editItem.destinations ? Boolean(editItem.destinations.sanctuary) : true;
      if (destStream) destStream.checked = editItem.destinations ? Boolean(editItem.destinations.livestream) : true;
      if (destStage) destStage.checked = editItem.destinations ? Boolean(editItem.destinations.stage) : false;
    } else {
      if (headingEl) headingEl.textContent = 'New Saved Announcement';
      if (editIdInput) editIdInput.value = '';
      if (titleInput) titleInput.value = '';
      if (textInput) textInput.value = '';
      if (posSelect) posSelect.value = 'upperthird';
      if (loopCheck) loopCheck.checked = false;
      if (urgentCheck) urgentCheck.checked = false;
      if (destSanctuary) destSanctuary.checked = true;
      if (destStream) destStream.checked = true;
      if (destStage) destStage.checked = false;
    }

    const preview = document.getElementById('ann-editor-preview');
    window.syncCustomSelect?.(posSelect);
    window.syncCustomSelect?.(speedSelect);
    if (preview) preview.textContent = textInput?.value || '';
    modal.style.display = 'flex';
  };

  window.closeNewAnnouncementModal = function() {
    closeAnnouncementPopup(false);
    const modal = document.getElementById('announcement-edit-modal-backdrop');
    if (modal) modal.style.display = 'none';
  };

  window.saveAnnouncementFromModal = function() {
    const titleInput = document.getElementById('ann-modal-title');
    const textInput = document.getElementById('ann-modal-text');
    const posSelect = document.getElementById('ann-modal-pos');
    const loopCheck = document.getElementById('ann-modal-loop');
    const urgentCheck = document.getElementById('ann-modal-urgent');
    const destSanctuary = document.getElementById('ann-modal-dest-sanctuary');
    const destStream = document.getElementById('ann-modal-dest-livestream');
    const destStage = document.getElementById('ann-modal-dest-stage');
    const editIdInput = document.getElementById('ann-modal-edit-id');

    const text = (textInput?.value || '').trim();
    if (!text) {
      if (typeof window.showToast === 'function') window.showToast('Announcement content is required', 'warning');
      return;
    }

    const title = (titleInput?.value || '').trim() || 'Announcement';
    const id = editIdInput?.value || ('ann_' + Date.now());

    liveAlertEngine.saveAnnouncement({
      id,
      title,
      text,
      position: posSelect?.value || 'upperthird',
      speed: document.getElementById('ann-modal-speed')?.value || 'normal',
      loop: Boolean(loopCheck?.checked),
      urgency: urgentCheck?.checked ? 'urgent' : 'normal',
      destinations: {
        sanctuary: Boolean(destSanctuary?.checked),
        livestream: Boolean(destStream?.checked),
        stage: Boolean(destStage?.checked)
      }
    });

    window.closeNewAnnouncementModal();
  };

  // Keyboard shortcut: Escape closes announcement hub
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (closeAnnouncementPopup()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        const editor = document.getElementById('announcement-edit-modal-backdrop');
        if (editor && editor.style.display === 'flex') { window.closeNewAnnouncementModal(); e.stopImmediatePropagation(); return; }
        const drawer = document.getElementById('announcement-hub-drawer');
        if (drawer && drawer.classList.contains('open') && drawer.contains(document.activeElement)) {
          e.stopImmediatePropagation();
          window.closeAnnouncementHub();
        }
      }
      if (e.key === 'Tab' && activeAnnouncementPopup && activeAnnouncementPopup.popup !== deleteConfirmation && activeAnnouncementPopup.popup !== backgroundPicker) closeAnnouncementPopup();
    }, true);
    document.addEventListener('scroll', (e) => {
      if (activeAnnouncementPopup && !activeAnnouncementPopup.popup.contains(e.target)) closeAnnouncementPopup(false);
    }, true);
    window.addEventListener?.('resize', () => closeAnnouncementPopup(false));
    document.getElementById('alert-position')?.addEventListener('change', syncAnnouncementBackground);
    syncAnnouncementBackground();
  }

})();
