// Ginomia - High-Performance Custom Dialog System (Prompt & Confirm)
'use strict';

(function() {
  let activeResolve = null;

  const ICONS = {
    save: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    plus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    trash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
  };

  function getDialogElements() {
    return {
      backdrop: document.getElementById('sf-custom-dialog-backdrop'),
      iconBadge: document.getElementById('sf-dialog-icon-badge'),
      title: document.getElementById('sf-dialog-title'),
      subtitle: document.getElementById('sf-dialog-subtitle'),
      inputWrap: document.getElementById('sf-dialog-input-wrap'),
      input: document.getElementById('sf-dialog-input'),
      message: document.getElementById('sf-dialog-message'),
      confirmBtn: document.getElementById('sf-dialog-confirm-btn'),
      cancelBtn: document.getElementById('sf-dialog-cancel-btn')
    };
  }

  window.showCustomPrompt = function(options = {}) {
    return new Promise((resolve) => {
      activeResolve = resolve;
      const els = getDialogElements();
      if (!els.backdrop) return resolve(null);

      const title = options.title || 'Input Required';
      const subtitle = options.message || options.subtitle || '';
      const defaultValue = options.defaultValue !== undefined ? options.defaultValue : '';
      const placeholder = options.placeholder || '';
      const confirmText = options.confirmText || 'Confirm';
      const cancelText = options.cancelText || 'Cancel';
      const iconKey = options.icon || 'edit';

      els.title.textContent = title;
      els.subtitle.textContent = subtitle;
      els.subtitle.style.display = subtitle ? 'block' : 'none';

      els.iconBadge.className = 'sf-dialog-icon-badge';
      els.iconBadge.innerHTML = ICONS[iconKey] || ICONS.edit;

      els.inputWrap.style.display = 'block';
      els.input.value = defaultValue;
      els.input.placeholder = placeholder;

      els.message.style.display = 'none';

      els.confirmBtn.textContent = confirmText;
      els.confirmBtn.className = 'sf-dialog-btn primary';

      els.cancelBtn.textContent = cancelText;

      els.backdrop.style.display = 'flex';
      els.backdrop.classList.add('open');

      setTimeout(() => {
        if (els.input) {
          els.input.focus();
          els.input.select();
        }
      }, 15);
    });
  };

  window.showCustomConfirm = function(options = {}) {
    return new Promise((resolve) => {
      activeResolve = resolve;
      const els = getDialogElements();
      if (!els.backdrop) return resolve(false);

      const title = options.title || 'Confirmation';
      const message = options.message || '';
      const confirmText = options.confirmText || 'Confirm';
      const cancelText = options.cancelText || 'Cancel';
      const danger = !!options.danger;
      const iconKey = options.icon || (danger ? 'trash' : 'warning');

      els.title.textContent = title;
      els.subtitle.textContent = '';
      els.subtitle.style.display = 'none';

      els.iconBadge.className = `sf-dialog-icon-badge ${danger ? 'danger' : 'info'}`;
      els.iconBadge.innerHTML = ICONS[iconKey] || (danger ? ICONS.trash : ICONS.warning);

      els.inputWrap.style.display = 'none';

      els.message.style.display = 'block';
      els.message.textContent = message;

      els.confirmBtn.textContent = confirmText;
      els.confirmBtn.className = `sf-dialog-btn ${danger ? 'danger' : 'primary'}`;

      els.cancelBtn.textContent = cancelText;

      els.backdrop.style.display = 'flex';
      els.backdrop.classList.add('open');

      setTimeout(() => {
        const initial = danger ? els.cancelBtn : els.confirmBtn;
        if (initial && els.backdrop.classList.contains('open')) initial.focus();
      }, 15);
    });
  };

  window.sfCloseCustomDialog = function(result) {
    const els = getDialogElements();
    if (els.backdrop) {
      els.backdrop.classList.remove('open');
      els.backdrop.style.display = 'none';
    }
    if (activeResolve) {
      const fn = activeResolve;
      activeResolve = null;
      fn(result);
    }
  };

  window.sfSubmitCustomDialog = function() {
    const els = getDialogElements();
    if (!els.backdrop) return;
    if (els.inputWrap && els.inputWrap.style.display !== 'none') {
      const val = els.input ? els.input.value : '';
      window.sfCloseCustomDialog(val);
    } else {
      window.sfCloseCustomDialog(true);
    }
  };

  // Keyboard accessibility
  window.addEventListener('keydown', function(e) {
    const backdrop = document.getElementById('sf-custom-dialog-backdrop');
    if (!backdrop || backdrop.style.display === 'none' || !backdrop.classList.contains('open')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      window.sfCloseCustomDialog(null);
    } else if (e.key === 'Enter' && e.target.id === 'sf-dialog-input') {
      e.preventDefault();
      e.stopPropagation();
      window.sfSubmitCustomDialog();
    }
  }, true);
})();
