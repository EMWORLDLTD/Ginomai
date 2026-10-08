// Ginomai - Service Session Management & Persistence Engine
'use strict';

(function(window) {
  const SESSIONS_STORAGE_KEY = 'sf_saved_sessions';
  const ACTIVE_SESSION_ID_KEY = 'sf_active_session_id';
  const DEFAULT_SESSION_NAME = 'Sunday Service';

  class SessionManagerEngine {
    constructor() {
      this.sessions = [];
      this.activeSessionId = null;
      this.isDirty = false;
      this.lastSavedTimestamp = null;
      this.autoSaveTimer = null;
      this.saveError = null;
    }

    init() {
      this.loadFromStorage();
      this.ensureActiveSession();
      this.setupKeyboardShortcuts();
      this.setupFileDragAndDrop();
      this.updateTopBarUi();
    }

    loadFromStorage() {
      try {
        const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
        if (stored) {
          this.sessions = JSON.parse(stored);
          if (!Array.isArray(this.sessions)) this.sessions = [];
        } else {
          this.sessions = [];
        }
      } catch (err) {
        console.error('[SessionManager] Error loading sessions from localStorage:', err);
        this.sessions = [];
      }

      this.activeSessionId = localStorage.getItem(ACTIVE_SESSION_ID_KEY) || null;
    }

    saveToStorage() {
      try {
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessions));
        if (this.activeSessionId) {
          localStorage.setItem(ACTIVE_SESSION_ID_KEY, this.activeSessionId);
        }
        this.saveError = null;
        this.isDirty = false;
        this.lastSavedTimestamp = new Date();
        this.updateTopBarUi();
        return true;
      } catch (err) {
        console.error('[SessionManager] Error saving sessions to localStorage:', err);
        this.saveError = 'Changes could not be saved on this device. Retry or export a copy before closing.';
        this.isDirty = true;
        this.updateTopBarUi();
        return false;
      }
    }

    ensureActiveSession() {
      if (this.sessions.length === 0) {
        const initialSession = this.createSessionObject(DEFAULT_SESSION_NAME);
        // If current state already has agenda items, capture them
        if (window.state && Array.isArray(window.state.agendaItems) && window.state.agendaItems.length > 0) {
          this.captureStateIntoSession(initialSession);
        }
        this.sessions.push(initialSession);
        this.activeSessionId = initialSession.id;
        this.saveToStorage();
      } else {
        const exists = this.sessions.some(s => s.id === this.activeSessionId);
        if (!exists) {
          this.activeSessionId = this.sessions[0].id;
          localStorage.setItem(ACTIVE_SESSION_ID_KEY, this.activeSessionId);
        }
      }
    }

    createSessionObject(name) {
      const now = new Date().toISOString();
      return {
        id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: name || DEFAULT_SESSION_NAME,
        createdAt: now,
        updatedAt: now,
        version: '1.0',
        app: 'Ginomai',
        agendaItems: [],
        activeSongId: null,
        activeBibleBook: '',
        activeBibleChapter: 1,
        medleySongIds: [],
        medleyBibleSlots: [],
        isMedleyMode: false,
        notes: ''
      };
    }

    captureStateIntoSession(session) {
      if (!session || !window.state) return;
      const s = window.state;
      session.agendaItems = Array.isArray(s.agendaItems) ? JSON.parse(JSON.stringify(s.agendaItems)) : [];
      session.activeMediaId=s.activeMediaId || null;
      session.activeCountdownId=s.activeCountdownId || null;
      session.presentationDeck=['media','countdown'].includes(s.activeDeckType) ? s.activeDeckType:null;
      session.mediaPageSelections={...s.mediaPageSelections};
      session.mediaVideoSlots=JSON.parse(JSON.stringify(s.mediaVideoSlots || []));
      session.activeVideoSlot=s.activeVideoSlot || 0;
      session.mediaVideoDeckActive=!!s.mediaVideoDeckActive;
      session.activeSongId = s.activeSongId || null;
      session.activeBibleBook = s.activeBibleBook || '';
      session.activeBibleChapter = s.activeBibleChapter || 1;
      session.medleySongIds = Array.isArray(s.medleySongIds) ? [...s.medleySongIds] : [];
      session.medleyBibleSlots = Array.isArray(s.medleyBibleSlots) ? [...s.medleyBibleSlots] : [];
      session.isMedleyMode = !!s.isMedleyMode;
      session.updatedAt = new Date().toISOString();
    }

    getActiveSession() {
      return this.sessions.find(s => s.id === this.activeSessionId) || this.sessions[0] || null;
    }

    getAllSessions() {
      return [...this.sessions].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }

    // Fast 0ms In-Place Snapshot of Current Workspace
    saveCurrentSessionSnapshot(customName = null, silent = false) {
      let active = this.getActiveSession();
      if (!active) {
        active = this.createSessionObject(customName || DEFAULT_SESSION_NAME);
        this.sessions.push(active);
        this.activeSessionId = active.id;
      }

      if (customName && typeof customName === 'string' && customName.trim()) {
        active.name = customName.trim();
      }

      this.captureStateIntoSession(active);
      if (!this.saveToStorage()) return null;
      this.updateTopBarUi();

      if (!silent && typeof window.showToast === 'function') {
        window.showToast(`Session "${active.name}" saved`, 'success');
      }

      return active;
    }

    // Auto-save hook whenever agenda changes
    notifyAgendaChanged() {
      this.isDirty = true;
      this.updateTopBarUi();

      // Debounced auto-save to active session record
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        this.saveCurrentSessionSnapshot(null, true);
      }, 500);
    }

    createNewSession(name = null, copyCurrentAgenda = false) {
      if (this.getActiveSession() && !this.saveCurrentSessionSnapshot(null, true)) return null;
      const sessionName = name && name.trim() ? name.trim() : `Service ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      const newSession = this.createSessionObject(sessionName);

      if (copyCurrentAgenda && window.state && Array.isArray(window.state.agendaItems)) {
        this.captureStateIntoSession(newSession);
      } else {
        newSession.agendaItems = [];
      }

      const previousId = this.activeSessionId;
      this.sessions.unshift(newSession);
      this.activeSessionId = newSession.id;
      if (!this.saveToStorage()) {
        this.sessions.shift(); this.activeSessionId = previousId; this.updateTopBarUi(); return null;
      }

      this.applySessionToState(newSession);

      if (typeof window.showToast === 'function') {
        window.showToast(`Created new session: "${newSession.name}"`, 'success');
      }

      this.updateTopBarUi();
      this.closeSessionDropdown();
      this.renderSessionManagerModal();
      return newSession;
    }

    loadSession(sessionId) {
      const target = this.sessions.find(s => s.id === sessionId);
      if (!target) {
        if (typeof window.showToast === 'function') window.showToast('Session not found', 'error');
        return false;
      }

      // Auto-save current session state first before switching
      if (!this.saveCurrentSessionSnapshot(null, true)) return false;

      const previousId = this.activeSessionId;
      this.activeSessionId = target.id;
      if (!this.saveToStorage()) { this.activeSessionId = previousId; this.updateTopBarUi(); return false; }

      this.applySessionToState(target);

      if (typeof window.showToast === 'function') {
        window.showToast(`Loaded session: "${target.name}"`, 'info');
      }

      this.updateTopBarUi();
      this.closeSessionDropdown();
      this.closeSessionManagerModal();
      return true;
    }

    applySessionToState(session) {
      if (!session || !window.state) return;
      const s = window.state;

      s.agendaItems = Array.isArray(session.agendaItems) ? JSON.parse(JSON.stringify(session.agendaItems)) : [];
      s.activeMediaId=session.activeMediaId || null;
      s.activeCountdownId=session.activeCountdownId || null;
      s.activeDeckType=session.presentationDeck || (s.activeDeckType==='media'||s.activeDeckType==='countdown' ? 'song':s.activeDeckType);
      s.mediaPageSelections={...session.mediaPageSelections};
      s.mediaVideoSlots=JSON.parse(JSON.stringify(session.mediaVideoSlots || []));
      s.activeVideoSlot=session.activeVideoSlot || 0;
      s.mediaVideoDeckActive=!!session.mediaVideoDeckActive;
      s.activeSongId = session.activeSongId || null;
      window.restorePresentationSelection?.();
      if (session.activeBibleBook) s.activeBibleBook = session.activeBibleBook;
      if (session.activeBibleChapter) s.activeBibleChapter = session.activeBibleChapter;
      if (Array.isArray(session.medleySongIds)) s.medleySongIds = [...session.medleySongIds];
      if (Array.isArray(session.medleyBibleSlots)) s.medleyBibleSlots = [...session.medleyBibleSlots];
      if (typeof session.isMedleyMode === 'boolean') s.isMedleyMode = session.isMedleyMode;

      // In-place tactile DOM refresh
      if (typeof window.renderAgenda === 'function') window.renderAgenda();
      if (typeof window.renderDeck === 'function') window.renderDeck();
      if (typeof window.renderLibrary === 'function') window.renderLibrary();
      if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace(true);
    }

    duplicateSession(sessionId, newName = null) {
      const source = this.sessions.find(s => s.id === sessionId);
      if (!source) return null;

      const cloneName = newName || `${source.name} (Copy)`;
      const clone = JSON.parse(JSON.stringify(source));
      clone.id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      clone.name = cloneName;
      clone.createdAt = new Date().toISOString();
      clone.updatedAt = new Date().toISOString();

      this.sessions.unshift(clone);
      if (!this.saveToStorage()) return null;
      this.renderSessionManagerModal();

      if (typeof window.showToast === 'function') {
        window.showToast(`Duplicated session as "${clone.name}"`, 'info');
      }
      return clone;
    }

    renameSession(sessionId, newName) {
      const target = this.sessions.find(s => s.id === sessionId);
      if (!target || !newName || !newName.trim()) return false;

      target.name = newName.trim();
      target.updatedAt = new Date().toISOString();
      if (!this.saveToStorage()) return false;
      this.updateTopBarUi();
      this.renderSessionManagerModal();

      if (typeof window.showToast === 'function') {
        window.showToast(`Renamed session to "${target.name}"`, 'info');
      }
      return true;
    }

    deleteSession(sessionId) {
      const previousSessions = JSON.parse(JSON.stringify(this.sessions));
      const previousId = this.activeSessionId;
      if (this.sessions.length <= 1) {
        // Do not allow deleting the only session; clear its agenda instead
        const only = this.sessions[0];
        only.name = DEFAULT_SESSION_NAME;
        only.agendaItems = [];
        only.updatedAt = new Date().toISOString();
        if (!this.saveToStorage()) { this.sessions = previousSessions; this.updateTopBarUi(); return false; }
        this.applySessionToState(only);
        this.renderSessionManagerModal();
        this.updateTopBarUi();
        if (typeof window.showToast === 'function') {
          window.showToast('Reset service session to blank', 'info');
        }
        return true;
      }

      const index = this.sessions.findIndex(s => s.id === sessionId);
      if (index === -1) return false;

      const [removed] = this.sessions.splice(index, 1);
      
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0].id;
      }

      if (!this.saveToStorage()) {
        this.sessions = previousSessions; this.activeSessionId = previousId; this.updateTopBarUi(); return false;
      }
      if (previousId === sessionId) this.applySessionToState(this.sessions[0]);
      this.updateTopBarUi();
      this.renderSessionManagerModal();

      if (typeof window.showToast === 'function') {
        window.showToast(`Deleted session "${removed.name}"`, 'info');
      }
      return true;
    }

    // ─── .sflow Export & Import Engine ──────────────────────────────────────────
    exportSessionToFile(sessionId = null) {
      const targetId = sessionId || this.activeSessionId;
      let session = this.sessions.find(s => s.id === targetId);
      if (!session) {
        session = this.createSessionObject(DEFAULT_SESSION_NAME);
        this.captureStateIntoSession(session);
      } else if (targetId === this.activeSessionId) {
        this.captureStateIntoSession(session);
      }

      // Prepare portable package
      const exportPackage = {
        app: 'Ginomai',
        type: 'session_package',
        formatVersion: '1.0',
        exportedAt: new Date().toISOString(),
        session: session
      };

      const jsonStr = JSON.stringify(exportPackage, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const safeFilename = (session.name || 'Ginomai_Session')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');

      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFilename}.sflow`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (typeof window.showToast === 'function') {
        window.showToast(`Exported "${session.name}" to ${safeFilename}.sflow`, 'success');
      }
    }

    importSessionFromFile(file) {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const parsed = JSON.parse(content);

          let importedSession = null;
          if (parsed.type === 'session_package' && parsed.session) {
            importedSession = parsed.session;
          } else if (parsed.agendaItems && Array.isArray(parsed.agendaItems)) {
            // Raw session object format
            importedSession = parsed;
          } else {
            throw new Error('Unrecognized Ginomai session file format');
          }

          // Generate fresh unique ID to avoid overwriting existing
          importedSession.id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          importedSession.updatedAt = new Date().toISOString();
          if (!importedSession.name) importedSession.name = file.name.replace(/\.(sflow|json)$/i, '');

          if (!Array.isArray(importedSession.agendaItems)) throw new Error('Session agenda must be a list');
          if (!this.saveCurrentSessionSnapshot(null, true)) return;
          const previousId = this.activeSessionId;
          this.sessions.unshift(importedSession);
          this.activeSessionId = importedSession.id;
          if (!this.saveToStorage()) { this.sessions.shift(); this.activeSessionId = previousId; this.updateTopBarUi(); return; }

          this.applySessionToState(importedSession);
          this.updateTopBarUi();
          this.renderSessionManagerModal();

          if (typeof window.showToast === 'function') {
            window.showToast(`Imported session: "${importedSession.name}" (${importedSession.agendaItems.length} items)`, 'success');
          }
        } catch (err) {
          console.error('[SessionManager] Failed to import session file:', err);
          if (typeof window.showToast === 'function') {
            window.showToast(`Import error: ${err.message || 'Invalid session file'}`, 'error');
          }
        }
      };

      reader.readAsText(file);
    }

    triggerFileInput() {
      let input = document.getElementById('sf-session-file-input');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'sf-session-file-input';
        input.accept = '.sflow,.json';
        input.style.display = 'none';
        input.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            this.importSessionFromFile(e.target.files[0]);
            e.target.value = '';
          }
        });
        document.body.appendChild(input);
      }
      input.click();
    }

    // ─── UI & DOM Handlers ──────────────────────────────────────────────────────
    updateTopBarUi() {
      const active = this.getActiveSession();
      const sessionNameEl = document.getElementById('bento-session-pill-name');
      const sessionCountEl = document.getElementById('bento-session-pill-count');
      const sessionSyncEl = document.getElementById('bento-session-sync-dot');

      if (sessionNameEl && active) {
        sessionNameEl.textContent = active.name || DEFAULT_SESSION_NAME;
        sessionNameEl.title = `Current Session: ${active.name} (${active.agendaItems ? active.agendaItems.length : 0} items)`;
      }

      if (sessionCountEl && active && Array.isArray(active.agendaItems)) {
        sessionCountEl.textContent = active.agendaItems.length;
      }

      if (sessionSyncEl) {
        sessionSyncEl.className = this.isDirty ? 'session-sync-dot dirty' : 'session-sync-dot clean';
        sessionSyncEl.title = this.saveError || (this.isDirty ? 'Unsaved changes (auto-saving)' : 'All changes saved locally');
      }
      const status = document.getElementById('session-save-status');
      if (status) status.textContent = this.saveError ? 'Not saved' : this.isDirty ? 'Saving…' : 'Saved';
      const warning = document.getElementById('session-save-warning');
      if (warning) warning.hidden = !this.saveError;
    }

    toggleSessionDropdown(event) {
      if (event) event.stopPropagation();
      const menu = document.getElementById('bento-session-dropdown');
      if (!menu) return;

      const isHidden = menu.style.display === 'none' || !menu.classList.contains('open');
      if (isHidden) {
        this.openSessionDropdown();
      } else {
        this.closeSessionDropdown();
      }
    }

    openSessionDropdown() {
      const menu = document.getElementById('bento-session-dropdown');
      if (!menu) return;

      this.populateDropdownRecentList();
      menu.classList.add('open');
      menu.style.display = 'flex';
      menu.style.zIndex = '100002';

      if (typeof window.openDismissShield === 'function') {
        window.openDismissShield(() => this.closeSessionDropdown(), 100001);
      }

      // Auto close on document click as backup
      const closeHandler = (e) => {
        if (!menu.contains(e.target) && !e.target.closest('#bento-session-pill')) {
          this.closeSessionDropdown();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }

    closeSessionDropdown() {
      const menu = document.getElementById('bento-session-dropdown');
      if (menu) {
        menu.classList.remove('open');
        menu.style.display = 'none';
      }
      if (typeof window.closeDismissShield === 'function') {
        window.closeDismissShield();
      }
    }

    populateDropdownRecentList() {
      const container = document.getElementById('bento-session-recent-list');
      if (!container) return;

      const all = this.getAllSessions();
      if (all.length === 0) {
        container.innerHTML = '<div class="session-menu-empty">No saved sessions</div>';
        return;
      }

      const active = this.getActiveSession();
      container.innerHTML = all.slice(0, 5).map(s => {
        const isActive = active && s.id === active.id;
        const itemCount = Array.isArray(s.agendaItems) ? s.agendaItems.length : 0;
        const dateStr = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        return `
          <div class="session-menu-item ${isActive ? 'active' : ''}" onclick="window.sessionManager.loadSession('${s.id}')">
            <div class="s-info">
              <span class="s-name">${this.escapeHtml(s.name)}</span>
              <span class="s-meta">${itemCount} items · ${dateStr}</span>
            </div>
            ${isActive ? '<span class="s-active-badge">Active</span>' : ''}
          </div>
        `;
      }).join('');
    }

    openSessionManagerModal() {
      this.closeSessionDropdown();
      const modal = document.getElementById('session-manager-modal');
      if (!modal) return;

      this.renderSessionManagerModal();
      modal.style.display = 'flex';
      modal.classList.add('open');
    }

    closeSessionManagerModal() {
      const modal = document.getElementById('session-manager-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
      }
    }

    renderSessionManagerModal() {
      const listContainer = document.getElementById('session-modal-list');
      if (!listContainer) return;

      const all = this.getAllSessions();
      const active = this.getActiveSession();

      if (all.length === 0) {
        listContainer.innerHTML = `
          <div class="session-empty-state">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div class="t">No sessions found</div>
            <div class="d">Click "New Session" or import a .sflow file to get started.</div>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = all.map(s => {
        const isActive = active && s.id === active.id;
        const itemCount = Array.isArray(s.agendaItems) ? s.agendaItems.length : 0;
        const dateStr = s.updatedAt ? new Date(s.updatedAt).toLocaleString(undefined, { 
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
        }) : 'Recent';

        return `
          <div class="session-row-item ${isActive ? 'active-session' : ''}" data-id="${s.id}">
            <div class="session-row-left">
              <span class="session-row-dot"></span>
              <div class="session-row-info">
                <span class="session-row-title" id="session-title-${s.id}">${this.escapeHtml(s.name)}</span>
                <span class="session-row-date">${dateStr}</span>
              </div>
            </div>

            <div class="session-row-middle">
              <span class="meta-tag">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                <span>${itemCount} Items</span>
              </span>
              ${s.isMedleyMode ? '<span class="meta-tag medley">Medley Mode</span>' : ''}
              ${isActive ? '<span class="session-badge active">Active Now</span>' : ''}
            </div>

            <div class="session-row-actions">
              ${!isActive ? `
                <button type="button" class="sf-btn sf-btn-secondary sf-btn-sm" onclick="window.sessionManager.loadSession('${s.id}')" title="Switch to this Session">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                  <span>Switch</span>
                </button>
              ` : `
                <button type="button" class="sf-btn sf-btn-primary sf-btn-sm" onclick="window.sessionManager.saveCurrentSessionSnapshot()" title="Save Snapshot of Current Agenda">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  <span>Snapshot</span>
                </button>
              `}
              <button type="button" class="sf-btn sf-btn-ghost sf-btn-sm" title="Rename Session" onclick="window.sessionManager.promptRenameSession('${s.id}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button type="button" class="sf-btn sf-btn-ghost sf-btn-sm" title="Duplicate Session" onclick="window.sessionManager.duplicateSession('${s.id}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              <button type="button" class="sf-btn sf-btn-ghost sf-btn-sm" title="Export .sflow file to disk" onclick="window.sessionManager.exportSessionToFile('${s.id}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button type="button" class="sf-btn sf-btn-danger sf-btn-sm" title="Delete Session" onclick="window.sessionManager.confirmDeleteSession('${s.id}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    async promptRenameSession(sessionId) {
      const target = this.sessions.find(s => s.id === sessionId);
      if (!target) return;

      let newName = null;
      if (typeof window.showCustomPrompt === 'function') {
        newName = await window.showCustomPrompt({
          title: 'Rename Service Session',
          message: 'Enter a new title for this agenda session:',
          defaultValue: target.name,
          placeholder: 'Session title...',
          confirmText: 'Rename',
          icon: 'edit'
        });
      } else {
        newName = prompt('Enter new session title:', target.name);
      }

      if (newName && newName.trim() && newName.trim() !== target.name) {
        this.renameSession(sessionId, newName.trim());
      }
    }

    async promptNewSession() {
      const defaultTitle = `Service ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      let name = null;
      if (typeof window.showCustomPrompt === 'function') {
        name = await window.showCustomPrompt({
          title: 'Create New Session',
          message: 'Enter service session title:',
          defaultValue: defaultTitle,
          placeholder: 'e.g. Sunday 2nd Service, Midweek Service',
          confirmText: 'Create Session',
          icon: 'plus'
        });
      } else {
        name = prompt('Enter service session title (e.g. Sunday 2nd Service):', defaultTitle);
      }

      if (name !== null && name.trim()) {
        this.createNewSession(name.trim());
      }
    }

    async promptSaveAs() {
      const active = this.getActiveSession();
      const currentName = active ? active.name : DEFAULT_SESSION_NAME;
      const defaultName = `${currentName} (New)`;
      
      let newName = null;
      if (typeof window.showCustomPrompt === 'function') {
        newName = await window.showCustomPrompt({
          title: 'Save Session Snapshot',
          message: 'Save current agenda snapshot as a new session:',
          defaultValue: defaultName,
          placeholder: 'New session name...',
          confirmText: 'Save Snapshot',
          icon: 'save'
        });
      } else {
        newName = prompt('Save current agenda snapshot as a new session:', defaultName);
      }

      if (newName && newName.trim()) {
        const newSession = this.createNewSession(newName.trim(), true);
        if (newSession && typeof window.showToast === 'function') {
          window.showToast(`Saved as "${newSession.name}"`, 'success');
        }
      }
    }

    async confirmDeleteSession(sessionId) {
      const target = this.sessions.find(s => s.id === sessionId);
      if (!target) return;

      let confirmed = false;
      if (typeof window.showCustomConfirm === 'function') {
        confirmed = await window.showCustomConfirm({
          title: 'Delete Service Session',
          message: `Are you sure you want to delete session "${target.name}"? This action cannot be undone.`,
          confirmText: 'Delete Session',
          danger: true,
          icon: 'trash'
        });
      } else {
        confirmed = confirm(`Are you sure you want to delete session "${target.name}"? This cannot be undone.`);
      }

      if (confirmed) {
        this.deleteSession(sessionId);
      }
    }

    setupKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || window.sfActiveModal?.()) return;
        // Prevent hotkeys inside inputs/textareas unless specific combo
        const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);

        // Ctrl+S / Cmd+S: Quick Save Session Snapshot
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          this.saveCurrentSessionSnapshot();
          return;
        }

        // Ctrl+Shift+S: Save As New Session
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          this.promptSaveAs();
          return;
        }

        // Ctrl+O / Cmd+O: Open Session Manager
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O')) {
          if (!isInput) {
            e.preventDefault();
            this.openSessionManagerModal();
            return;
          }
        }

        // Ctrl+Alt+N: Create New Clean Session
        if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'n' || e.key === 'N')) {
          e.preventDefault();
          this.promptNewSession();
          return;
        }
      });
    }

    setupFileDragAndDrop() {
      let dragCounter = 0;
      const overlay = document.getElementById('session-dropzone-overlay');

      // Track internal item drags (songs, scriptures, agenda items) with capture listeners
      // so in-app dragging never triggers the full-screen session file dropzone overlay
      window.addEventListener('dragstart', (e) => {
        window.sfIsInternalDrag = true;
      }, true);

      window.addEventListener('dragend', (e) => {
        window.sfIsInternalDrag = false;
        if (overlay) overlay.style.display = 'none';
        dragCounter = 0;
      }, true);

      const isRealFileDrag = (e) => {
        if (window.sfIsInternalDrag) return false;
        if (!e.dataTransfer || !e.dataTransfer.types) return false;
        const types = Array.from(e.dataTransfer.types);
        if (!types.includes('Files')) return false;
        if (types.includes('application/song-id') ||
            types.includes('application/bible-book') ||
            types.includes('application/agenda-index') ||
            types.includes('application/item-type')) {
          return false;
        }
        return true;
      };

      window.addEventListener('dragenter', (e) => {
        if (!isRealFileDrag(e)) return;
        e.preventDefault();
        dragCounter++;
        if (overlay) overlay.style.display = 'flex';
      });

      window.addEventListener('dragleave', (e) => {
        if (!isRealFileDrag(e)) return;
        e.preventDefault();
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
          dragCounter = 0;
          if (overlay) overlay.style.display = 'none';
        } else {
          dragCounter--;
          if (dragCounter <= 0 && overlay) {
            overlay.style.display = 'none';
            dragCounter = 0;
          }
        }
      });

      window.addEventListener('dragover', (e) => {
        if (!isRealFileDrag(e)) return;
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      });

      window.addEventListener('drop', (e) => {
        if (!isRealFileDrag(e)) return;
        e.preventDefault();
        dragCounter = 0;
        if (overlay) overlay.style.display = 'none';

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.name.endsWith('.sflow') || file.name.endsWith('.json')) {
            this.importSessionFromFile(file);
          }
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') {
          overlay.style.display = 'none';
          dragCounter = 0;
        }
      });
    }

    escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  // Expose singleton instance
  window.SessionManagerEngine = SessionManagerEngine;
  window.sessionManager = new SessionManagerEngine();

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.sessionManager.init());
  } else {
    window.sessionManager.init();
  }

})(window);
