'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('legacy UI preferences migrate to Bento and unsupported styles cannot be reactivated', () => {
  const saved = new Map([['sf_ui_style', 'classic'], ['sf_ui_mode', 'light']]);
  const attributes = new Map();
  const surface = { setAttribute: (key, value) => attributes.set(key, value), style: { setProperty() {} } };
  const context = vm.createContext({ window: { innerWidth: 1280, innerHeight: 720 },
    document: { documentElement: surface, body: surface, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) } });
  vm.runInContext(fs.readFileSync(require.resolve('../js/theme-manager.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.window.UI_STYLES), ['bento']);
  const manager = new context.window.ThemeManager({}, () => {});
  manager.setStyle('classic');
  assert.equal(manager.currentStyle, 'bento');
  assert.equal(saved.get('sf_ui_style'), 'bento');
  assert.equal(attributes.get('data-theme-mode'), 'light');
  manager.setMode('dark');
  assert.equal(attributes.get('data-theme-mode'), 'dark');
  assert.equal(context.window.ThemeResizerEngine.specs.classic, undefined);
});

test('EXE packaging recursively excludes the archived console', () => {
  const { payloadConfig } = require('../scripts/build-desktop');
  const config = payloadConfig({ platform: 'win32', arch: 'x64' }, 'unused');
  assert(config.files.includes('!archive/**'));
});
