const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const themeManagerJs = fs.readFileSync(path.join(__dirname, '../js/theme-manager.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function appFunction(name) {
  const start = appJs.indexOf(`function ${name}(`);
  return appJs.slice(start, appJs.indexOf('\n}', start) + 2);
}

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
  context.state = state;
  context.window.state = state;
  vm.runInContext(appFunction('applySongBoundTheme') + '\n' + appFunction('applyProjectedSongTheme'), context);

  const themeManager = new context.window.ThemeManager(state, broadcastFn);
  context.window.themeManager = themeManager;
  context.window.broadcastState = () => broadcasts.push(themeManager.getSanctuaryPayload());

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

test('Song Theme Binding: song defaults never change the global theme or unrelated output', () => {
  const { context, themeManager, store, broadcasts } = setupThemeBindingEnvironment();
  themeManager.setSanctuaryTheme('solid_blue');
  context.applySongBoundTheme('song_unbound');
  broadcasts.length = 0;

  themeManager.setSongBoundTheme('song_hallelujah', 'emerald_motion');
  themeManager.setSongBoundTheme('song_glory', 'golden_still');

  assert.equal(themeManager.activeSanctuaryTheme, 'solid_blue');
  assert.equal(store.get('sf_sanctuary_theme'), 'solid_blue');
  assert.equal(themeManager.getSanctuaryPayload().id, 'solid_blue');
  assert.equal(broadcasts.length, 0);

  for (const [songId, expectedTheme] of [
    ['song_hallelujah', 'emerald_motion'],
    ['song_glory', 'golden_still'],
    ['song_unbound', 'solid_blue'],
    ['song_hallelujah', 'emerald_motion']
  ]) {
    context.applySongBoundTheme(songId);
    assert.equal(themeManager.getSanctuaryPayload().id, expectedTheme);
    assert.equal(broadcasts.at(-1).id, expectedTheme);
    assert.equal(store.get('sf_sanctuary_theme'), 'solid_blue');
  }
});

test('Song Theme Binding: direct and draft global changes preserve the selected song default', () => {
  const { context, themeManager, store } = setupThemeBindingEnvironment();
  themeManager.setSongBoundTheme('song_holy_holy', 'golden_motion');
  context.applySongBoundTheme('song_holy_holy');
  themeManager.setSanctuaryTheme('solid_purple');
  assert.equal(themeManager.getSanctuaryPayload().id, 'golden_motion');
  assert.equal(store.get('sf_sanctuary_theme'), 'solid_purple');

  themeManager.beginSanctuaryDraft();
  themeManager.setSanctuaryTheme('obsidian_dark');
  assert.equal(themeManager.getSanctuaryPayload(themeManager.sanctuaryDraft).id, 'obsidian_dark');
  themeManager.applySanctuaryDraft();
  assert.equal(themeManager.getSanctuaryPayload().id, 'golden_motion');
  assert.equal(themeManager.getSongBoundTheme('song_holy_holy'), 'golden_motion');
  assert.equal(JSON.parse(store.get('sf_song_theme_bindings')).song_holy_holy, 'golden_motion');
  assert.equal(store.get('sf_sanctuary_theme'), 'obsidian_dark');
  context.applySongBoundTheme('song_unbound');
  assert.equal(themeManager.getSanctuaryPayload().id, 'obsidian_dark');
  context.applySongBoundTheme('song_holy_holy');
  assert.equal(themeManager.getSanctuaryPayload().id, 'golden_motion');
});

test('Song Theme Binding: editing and detaching the selected song update output immediately', () => {
  const { context, themeManager, broadcasts } = setupThemeBindingEnvironment();
  context.window.SONGS_DATABASE = [{ id: 'selected', title: 'Selected' }];
  themeManager.setSanctuaryTheme('solid_blue');
  context.applySongBoundTheme('selected');
  themeManager.beginSanctuaryDraft();
  themeManager.setSanctuaryTheme('solid_purple');

  themeManager.setSongBoundTheme('selected', 'emerald_motion');
  assert.equal(themeManager.getSanctuaryPayload().id, 'emerald_motion');
  assert.equal(broadcasts.at(-1).id, 'emerald_motion');
  assert.equal(context.window.SONGS_DATABASE[0].themeId, 'emerald_motion');
  assert.equal(themeManager.activeSanctuaryTheme, 'solid_blue');
  assert.equal(themeManager.sanctuaryDraft.activeSanctuaryTheme, 'solid_purple');

  themeManager.detachSongTheme('selected');
  assert.equal(themeManager.getSanctuaryPayload().id, 'solid_blue');
  assert.equal(broadcasts.at(-1).id, 'solid_blue');
  assert.equal(themeManager.getSongBoundTheme('selected'), null);
  assert.equal(context.window.SONGS_DATABASE[0].themeId, null);
});

test('Song Theme Binding: medley transitions restore global output and defer broadcasts', () => {
  const { context, themeManager, broadcasts, state } = setupThemeBindingEnvironment();
  context.window.SONGS_DATABASE = [{ id: 'song_bound' }, { id: 'song_unbound' }];
  themeManager.setSanctuaryTheme('solid_blue');
  themeManager.setSongBoundTheme('song_bound', 'golden_still');
  broadcasts.length = 0;
  context.applyProjectedSongTheme('medley_song_bound_0');
  assert.equal(themeManager.getSanctuaryPayload().id, 'golden_still');
  assert.equal(state.boundThemeSongId, 'song_bound');
  context.applyProjectedSongTheme('medley_song_unbound_0');
  assert.equal(themeManager.getSanctuaryPayload().id, 'solid_blue');
  context.applyProjectedSongTheme('medley_song_bound_1');
  assert.equal(themeManager.getSanctuaryPayload().id, 'golden_still');
  context.applyProjectedSongTheme('medley_bible_Genesis_1_1');
  assert.equal(themeManager.getSanctuaryPayload().id, 'solid_blue');
  assert.equal(state.boundThemeSongId, null);
  assert.equal(broadcasts.length, 0);
});

test('Song Theme Binding: missing themes fall back to global with the global framing', () => {
  const { context, themeManager } = setupThemeBindingEnvironment();
  themeManager.setSanctuaryTheme('solid_blue');
  themeManager.setSanctuaryFit('contain');
  themeManager.setSongBoundTheme('song_missing', 'missing_background');
  context.applySongBoundTheme('song_missing');
  assert.equal(themeManager.getSanctuaryPayload().id, 'solid_blue');
  assert.equal(themeManager.getSanctuaryPayload().fit, 'contain');
  themeManager.setSongBoundTheme('song_framed', 'golden_still');
  themeManager.sanctuaryFits.golden_still = 'fill';
  context.applySongBoundTheme('song_framed');
  assert.equal(themeManager.getSanctuaryPayload().fit, 'fill');
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
