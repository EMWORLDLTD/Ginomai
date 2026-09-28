/* Shared interaction behavior. Only changed nodes are inspected; decks stay in place. */
'use strict';
(() => {
  const modalSelector = '.modal-backdrop, .sf-modal-backdrop, #session-manager-modal, #sermon-transcript-modal-backdrop';
  const focusable = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]';
  const stack = [];
  const origins = new WeakMap();
  const hiddenByManager = new Set();
  const dialogNames = { 'settings-modal-backdrop': 'Studio Preferences', 'links-modal-backdrop': 'Broadcast and remote hub', 'import-modal-backdrop': 'Library Manager', 'system-reset-modal-backdrop': 'Reset local data', 'operator-join-modal-backdrop': 'Pair operator device' };
  const top = () => stack[stack.length - 1];
  const visible = element => !element.closest('[inert],[hidden]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const controls = modal => [...modal.querySelectorAll(focusable)].filter(visible);

  function syncBackground() {
    for (const element of hiddenByManager) element.inert = false;
    hiddenByManager.clear();
    const modal = top();
    if (!modal) return;
    // Keep notifications operable above the dialog.
    for (const element of document.body.children) {
      if (element === modal || element.contains(modal) || element.matches('script,style,.app-toast-container,#session-save-warning')) continue;
      if (!element.inert) { element.inert = true; hiddenByManager.add(element); }
    }
  }

  function syncModal(modal) {
    const open = modal.style.display !== 'none' && (modal.classList.contains('open') || ['flex', 'block', 'grid'].includes(modal.style.display));
    const wasOpen = stack.includes(modal);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (!modal.hasAttribute('aria-label') && !modal.hasAttribute('aria-labelledby')) {
      const heading = modal.querySelector('h1,h2,h3,.modal-title,.settings-title,.sf-dialog-title,#sf-dialog-title');
      if (heading?.id) modal.setAttribute('aria-labelledby', heading.id);
      else modal.setAttribute('aria-label', dialogNames[modal.id] || heading?.textContent.trim() || modal.id.replace(/[-_]/g, ' ').replace(/backdrop/g, '').trim() || 'Dialog');
    }
    modal.dataset.modalVisible = String(open);
    modal.setAttribute('aria-hidden', String(!open));
    modal.inert = !open;
    if (open && !wasOpen) {
      origins.set(modal, document.activeElement);
      stack.push(modal);
      syncBackground();
      modal.tabIndex = -1;
      if (!modal.contains(document.activeElement)) (controls(modal)[0] || modal).focus({ preventScroll: true });
    } else if (!open && wasOpen) {
      stack.splice(stack.indexOf(modal), 1);
      syncBackground();
      const origin = origins.get(modal);
      if (origin?.isConnected && !origin.closest('[inert]')) origin.focus({ preventScroll: true });
      else if (top()) {
        const topControls = controls(top());
        const safeTarget = topControls.find(el => !/close|cancel/i.test(el.className + ' ' + (el.getAttribute('aria-label') || ''))) || topControls[0] || top();
        safeTarget.focus({ preventScroll: true });
      }
    }
  }

  function enhance(root) {
    if (!(root instanceof Element)) return;
    const candidates = [root, ...root.querySelectorAll('[onclick],[role="button"],input,textarea,select,button')];
    for (const element of candidates) {
      const handler = element.getAttribute('onclick') || '';
      if ((handler || element.getAttribute('role') === 'button') && !element.matches('button,input,select,textarea,a') && !element.matches(modalSelector) && !/^event\.stopPropagation\(\);?$/.test(handler.trim())) {
        element.setAttribute('role', 'button');
        if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
      }
      if (element.matches('button,[role="button"]') && !element.hasAttribute('aria-label') && element.title) element.setAttribute('aria-label', element.title);
      if (element.matches('input:not([type="hidden"]),textarea,select') && !element.labels?.length && !element.hasAttribute('aria-label')) {
        element.setAttribute('aria-label', element.placeholder || element.title || element.id.replace(/[-_]/g, ' ') || 'Value');
      }
    }
    if (root.matches(modalSelector)) syncModal(root);
    root.querySelectorAll(modalSelector).forEach(syncModal);
  }

  window.addEventListener('keydown', event => {
    const modal = top();
    if (modal && event.key === 'Tab') {
      const items = controls(modal);
      const first = items[0] || modal, last = items[items.length - 1] || modal;
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
      event.stopImmediatePropagation();
      return;
    }
    if (modal && event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (modal.id === 'sf-custom-dialog-backdrop') { window.sfCloseCustomDialog(null); return; }
      const close = [...modal.querySelectorAll('button,[role="button"]')].find(element => /close|cancel/i.test(element.getAttribute('aria-label') || element.title || element.textContent) && visible(element));
      if (close) close.click();
      else { modal.style.display = 'none'; modal.classList.remove('open'); }
      return;
    }
    const control = event.target.closest?.('[role="button"]');
    if (control && !control.matches('button,input,textarea,select,a') && event.target === control && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (control.getAttribute('aria-disabled') !== 'true') control.click();
    }
  }, true);

  const clearKeyboardNav = () => document.body.classList.remove('sf-keyboard-nav');
  window.addEventListener('pointerdown', clearKeyboardNav, true);
  window.addEventListener('mousedown', clearKeyboardNav, true);
  window.addEventListener('touchstart', clearKeyboardNav, { capture: true, passive: true });
  window.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
      document.body.classList.add('sf-keyboard-nav');
    }
  }, true);

  document.addEventListener('focusin', event => {
    const modal = top();
    if (modal && !modal.contains(event.target) && !event.target.closest('#session-save-warning,.app-toast-container')) {
      const topControls = controls(modal);
      const safeTarget = topControls.find(el => !/close|cancel/i.test(el.className + ' ' + (el.getAttribute('aria-label') || ''))) || topControls[0] || modal;
      safeTarget.focus({ preventScroll: true });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    enhance(document.body);
    const observer = new MutationObserver(records => {
      const modals = new Set();
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(enhance);
        else if (record.target.matches(modalSelector)) modals.add(record.target);
      }
      modals.forEach(syncModal);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.sfActiveModal = top;
  });
})();
