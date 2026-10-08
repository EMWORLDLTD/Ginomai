'use strict';
(() => {
  const pending = new Map();
  const ready = new Set();
  let notice;
  const messages = new Map();
  let confirmationQueue = Promise.resolve();
  function progress(message) {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      Object.assign(notice.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647', padding: '14px 20px', maxWidth: '360px', background: '#131218', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', transition: 'none' });
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
  }
  async function request(code, options) {
    const response = await fetch(`/api/content-packs/${encodeURIComponent(code)}`, options);
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Content is unavailable.');
    return result;
  }
  window.ensureContentPack = function(code, { prompt = true } = {}) {
    if (ready.has(code)) return Promise.resolve(true);
    if (pending.has(code)) return pending.get(code);
    const operation = (async () => {
      const status = await request(code);
      if (status.installed) { ready.add(code); return true; }
      if (!status.cloudAvailable) throw Error('Cloud downloads are not configured yet. You can import a Bible file instead.');
      if (prompt) {
        const confirmation = confirmationQueue.then(() => window.showCustomConfirm({ title: `Download ${status.name}?`, message: `Download ${(status.downloadBytes / 1048576).toFixed(1)} MB now? This content will stay available offline after downloading.`, confirmText: 'Download', cancelText: 'Cancel' }));
        confirmationQueue = confirmation.catch(() => false);
        const confirmed = await confirmation;
        if (!confirmed) return false;
      }
      let active = true;
      const update = message => { if (active) { messages.set(code, message); progress([...messages.values()].join(' · ')); } };
      update(`Downloading ${status.name}…`);
      let polling = false;
      const timer = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const current = await request(code);
          if (current.downloading) update(`Downloading ${status.name}… ${Math.min(99, Math.floor(current.downloadedBytes / status.downloadBytes * 100))}%`);
        } catch {} finally { polling = false; }
      }, 500);
      try {
        await request(code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        ready.add(code);
        return true;
      } finally {
        active = false;
        clearInterval(timer);
        messages.delete(code);
        if (messages.size) progress([...messages.values()].join(' · '));
        else if (notice) notice.hidden = true;
      }
    })().finally(() => pending.delete(code));
    pending.set(code, operation);
    return operation;
  };
  window.forgetContentPack = code => ready.delete(code);
  window.refreshContentCatalogue = async function() {
    const response = await fetch('/api/bibles/catalog');
    if (!response.ok) return;
    const catalogue = await response.json();
    if (!Array.isArray(catalogue.bibles)) return;
    CLOUD_REPOSITORIES.bibles = catalogue.bibles;
    window.populateBibleVersionSelects?.();
    const container = document.getElementById('cloud-bibles-list');
    if (container && document.getElementById('import-modal-backdrop')?.classList.contains('open')) {
      window.renderCloudBibles?.(document.getElementById('cloud-bible-search-input')?.value || '');
    }
  };
  document.addEventListener('DOMContentLoaded', () => { window.refreshContentCatalogue().catch(() => {}); });
})();
