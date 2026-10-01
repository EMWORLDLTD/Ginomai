// Ginomia - Live Alert & Announcement Hub Engine
'use strict';

(function() {
  const STORAGE_KEY = 'sf_saved_announcements';
  const LIVE_ALERT_STORAGE_KEY = 'sf_live_alert';

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

      this.currentAlert = alertPayload;
      this.scheduleExpiry();

      try {
        localStorage.setItem(LIVE_ALERT_STORAGE_KEY, JSON.stringify(alertPayload));
      } catch (e) {}

      // Broadcast to all outputs
      if (typeof window.broadcastState === 'function') {
        window.broadcastState({ alert: alertPayload }, true);
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
        window.broadcastState({ alert: { active: false, text: '' } }, true);
      }

      this.updateLiveStatusUI();

      if (typeof window.showToast === 'function') {
        window.showToast('Live alert cleared', 'info');
      }
    }

    getDestinationsLabel(dest) {
      if (!dest) return 'All Displays';
      const parts = [];
      if (dest.sanctuary) parts.push('In-House');
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
      this.persistSavedAnnouncements();
      this.renderSavedList();
      if (typeof window.showToast === 'function') {
        window.showToast('Announcement removed', 'info');
      }
      return this.savedAnnouncements.length < before;
    }

    updateLiveStatusUI() {
      this.updatePreview();
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
      const container = document.getElementById('saved-announcements-list');
      if (!container) return;

      const q = (this.activeFilter || '').toLowerCase().trim();
      const filtered = this.filterSavedAnnouncements(q);

      if (!filtered.length) {
        container.innerHTML = `
          <div style="padding:24px 12px; text-align:center; color:var(--text-muted); font-size:11px;">
            ${q ? 'No matching saved announcements' : 'Write a message and choose Save to keep it here without going live. Select a saved message to edit it.'}
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
        row.querySelector('.ann-remove').onclick = () => this.deleteAnnouncement(item.id);
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
    document.getElementById('live-alert-input')?.focus();
  };

  window.closeAnnouncementHub = function() {
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
    document.getElementById('alert-position').value = item.position === 'lowerthird' ? 'lowerthird' : 'upperthird';
    document.getElementById('alert-duration').value = String(item.durationSeconds ?? 60);
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
    if (preview) preview.textContent = textInput?.value || '';
    modal.style.display = 'flex';
  };

  window.closeNewAnnouncementModal = function() {
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
        const editor = document.getElementById('announcement-edit-modal-backdrop');
        if (editor && editor.style.display === 'flex') { window.closeNewAnnouncementModal(); e.stopImmediatePropagation(); return; }
        const drawer = document.getElementById('announcement-hub-drawer');
        if (drawer && drawer.classList.contains('open') && drawer.contains(document.activeElement)) {
          e.stopImmediatePropagation();
          window.closeAnnouncementHub();
        }
      }
    });
  }

})();
