const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const themeManagerJs = fs.readFileSync(path.join(__dirname, '../js/theme-manager.js'), 'utf8');

function setupThemeBindingEnvironment() {
  const store = new Map();
  const localStorageMock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  const elements = new Map();
  function makeElement(id) {
    const el = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      attributes: {},
      classList: {
        add(c) { el.className = `${el.className} ${c}`.trim(); },
        remove(c) { el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
        toggle(c, on) {
          if (on === undefined) on = !this.contains(c);
          if (on) this.add(c); else this.remove(c);
        },
        contains(c) { return el.className.split(/\s+/).includes(c); }
      },
      setAttribute(k, v) { el.attributes[k] = v; },
      getAttribute(k) { return el.attributes[k]; },
      addEventListener() {},
      appendChild(c) { el._children = el._children || []; el._children.push(c); },
      querySelectorAll() { return []; },
      querySelector() { return null; }
    };
    elements.set(id, el);
    return el;
  }

  const ids = [
    'song-theme-picker-modal-backdrop', 'song-theme-modal-song-title',
    'song-theme-modal-current', 'song-theme-grid-container', 'song-theme-detach-btn'
  ];
  ids.forEach(makeElement);

  const toasts = [];
  const state = {
    sanctuaryTheme: {
      id: 'midnight_navy',
      name: 'Midnight Navy',
      mode: 'solid',
      bg: '#0F172A'
    }
  };

  const broadcasts = [];
  const broadcastFn = (patch) => broadcasts.push(patch);

  const sandbox = {
    localStorage: localStorageMock,
    document: {
      getElementById: (id) => elements.get(id) || makeElement(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag) => makeElement(`elem_${Math.random()}`)
    },
    window: {
      localStorage: localStorageMock,
      showToast: (msg, type) => toasts.push({ msg, type }),
      openDismissShield: () => {},
      closeDismissShield: () => {}
    },
    console
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(themeManagerJs, context);

  const themeManager = new context.window.ThemeManager(state, broadcastFn);
  context.window.themeManager = themeManager;

  return { context, themeManager, store, toasts, broadcasts, elements, state };
}

test('Song Theme Binding: Persistence and detachment in localStorage', () => {
  const { themeManager, store } = setupThemeBindingEnvironment();

  // Initially unbound
  assert.equal(themeManager.getSongBoundTheme('song_grace_101'), null);

  // Bind a theme
  themeManager.setSongBoundTheme('song_grace_101', 'royal_gold');
  assert.equal(themeManager.getSongBoundTheme('song_grace_101'), 'royal_gold');

  // Verify stored in localStorage JSON map
  const rawStorage = store.get('sf_song_theme_bindings');
  assert.ok(rawStorage);
  const parsed = JSON.parse(rawStorage);
  assert.equal(parsed['song_grace_101'], 'royal_gold');

  // Detach theme
  themeManager.detachSongTheme('song_grace_101');
  assert.equal(themeManager.getSongBoundTheme('song_grace_101'), null);
  const updatedStorage = JSON.parse(store.get('sf_song_theme_bindings'));
  assert.equal(updatedStorage['song_grace_101'], undefined);
});

test('Song Theme Binding: Auto-activation on song selection', () => {
  const { context, themeManager, state } = setupThemeBindingEnvironment();

  // Bind custom themes to different songs
  themeManager.setSongBoundTheme('song_hallelujah', 'emerald_deep');
  themeManager.setSongBoundTheme('song_glory', 'crimson_majesty');

  let appliedThemeId = null;
  themeManager.setSanctuaryTheme = (themeId, broadcast) => {
    appliedThemeId = themeId;
  };

  // Helper matching app.js applySongBoundTheme
  function applySongBoundTheme(songId) {
    if (!songId) return;
    if (context.window.themeManager && typeof context.window.themeManager.getSongBoundTheme === 'function') {
      const boundTheme = context.window.themeManager.getSongBoundTheme(songId);
      if (boundTheme) {
        context.window.themeManager.setSanctuaryTheme(boundTheme, false);
      }
    }
  }

  // 1. Select song with bound theme
  applySongBoundTheme('song_hallelujah');
  assert.equal(appliedThemeId, 'emerald_deep');

  // 2. Select another song with different bound theme
  applySongBoundTheme('song_glory');
  assert.equal(appliedThemeId, 'crimson_majesty');

  // 3. Select song WITHOUT bound theme -> applied theme should NOT change
  appliedThemeId = null;
  applySongBoundTheme('song_unbound_999');
  assert.equal(appliedThemeId, null, 'Unbound songs should not alter the active theme');
});

test('Song Theme Binding: Manual override does NOT overwrite bound default theme', () => {
  const { themeManager, store } = setupThemeBindingEnvironment();

  // Bind a theme to a song
  themeManager.setSongBoundTheme('song_holy_holy', 'golden_radiance');
  assert.equal(themeManager.getSongBoundTheme('song_holy_holy'), 'golden_radiance');

  // Operator manually changes sanctuary theme for this moment in service
  themeManager.setSanctuaryTheme('cyber_slate', true);

  // The stored default theme for the song must remain intact
  assert.equal(themeManager.getSongBoundTheme('song_holy_holy'), 'golden_radiance',
    'Manual theme change must not overwrite the song stored default binding');
  const storedBindings = JSON.parse(store.get('sf_song_theme_bindings'));
  assert.equal(storedBindings['song_holy_holy'], 'golden_radiance');
});

test('Song theme picker displays uploaded images and video previews over fallback colors', () => {
  const { context, elements } = setupThemeBindingEnvironment();
  context.window.SONGS_DATABASE = [{ id: 'preview-song', title: 'Preview Song' }];
  context.window.SANCTUARY_THEMES.preview_still = {
    name: 'Uploaded still', previewGradient: '#171722', imageUrl: '/media/uploads/still.jpg'
  };
  context.window.SANCTUARY_THEMES.preview_motion = {
    name: 'Uploaded motion', previewGradient: '#171722', videoUrl: '/media/uploads/motion.mp4'
  };
  context.window.openSongThemeBindingModal('preview-song');
  const html = elements.get('song-theme-picker-grid').innerHTML;
  assert.match(html, /<img[^>]+src="\/media\/uploads\/still.jpg"/);
  assert.match(html, /<video[^>]+src="\/media\/uploads\/motion.mp4"/);
  assert.match(html, /song-theme-thumb-badge/);
});
