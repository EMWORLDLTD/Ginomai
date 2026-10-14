(() => {
  'use strict';
  const api = window.desktopApi;
  const bar = document.getElementById('desktop-titlebar');
  if (!bar || !api?.isDesktop || typeof api.openMenu !== 'function' || typeof api.getWindowState !== 'function' || api.platform === 'darwin' || new URLSearchParams(location.search).get('remote') === '1') return;

  bar.hidden = false;
  const maximize = document.getElementById('desktop-maximize');
  const updateState = state => {
    if (!state) return;
    const expanded = state.maximized || state.fullscreen;
    bar.classList.toggle('is-maximized', expanded);
    maximize.title = expanded ? 'Restore' : 'Maximize';
    maximize.setAttribute('aria-label', maximize.title);
  };
  api.onWindowStateChange(updateState);
  api.getWindowState().then(updateState).catch(console.error);
  document.getElementById('desktop-minimize').addEventListener('click', () => api.minimize());
  maximize.addEventListener('click', () => api.maximize());
  document.getElementById('desktop-close').addEventListener('click', () => api.close());

  const menus = Array.from(bar.querySelectorAll('[data-desktop-menu]'));
  const openMenu = async button => {
    const rect = button.getBoundingClientRect();
    button.setAttribute('aria-expanded', 'true');
    try {
      await api.openMenu({ label: button.dataset.desktopMenu, x: rect.left, y: rect.bottom });
    } catch (error) {
      console.error('Could not open desktop menu:', error);
    } finally {
      button.setAttribute('aria-expanded', 'false');
    }
  };
  menus.forEach((button, index) => {
    button.addEventListener('click', () => openMenu(button));
    button.addEventListener('keydown', event => {
      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (offset || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        menus[event.key === 'Home' ? 0 : event.key === 'End' ? menus.length - 1 : (index + offset + menus.length) % menus.length].focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        openMenu(button);
      } else if (event.key === 'Escape') button.blur();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = event.altKey ? ['f', 'p', 'v', 'h'].indexOf(event.key.toLowerCase()) : -1;
    if (index >= 0 || event.key === 'F10') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const button = menus[Math.max(0, index)];
      button.focus();
      if (index >= 0) openMenu(button);
    }
  }, true);
})();
