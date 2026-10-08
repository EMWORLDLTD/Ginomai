'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const writes = new Map();
  const context = vm.createContext({
    window: {}, document: { readyState: 'loading', addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem(key, value) { writes.set(key, String(value)); } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/theme-manager.js'), 'utf8'), context);
  const manager = Object.create(context.window.ThemeManager.prototype);
  Object.assign(manager, { activeSanctuaryTheme: 'celestial_motion', sanctuaryFits: {}, sanctuaryDimmer: 30, sanctuaryFont: 'Outfit', obsModeRule: 'follow' });
  let broadcasts = 0;
  manager.updateSanctuaryUi = () => {};
  manager.broadcastSanctuaryTheme = () => { broadcasts++; };
  return { manager, themes: context.window.SANCTUARY_THEMES, writes, broadcasts: () => broadcasts };
}

test('new and legacy follow layouts default to bottom overlay while an explicit full-screen preference is restored', () => {
  for (const [savedRule, expected] of [[null, 'always_lt'], ['follow', 'always_lt'], ['always_lt', 'always_lt'], ['always_full', 'always_full']]) {
    const context = vm.createContext({window:{},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:key=>key==='sf_obs_mode_rule'?savedRule:null,setItem(){}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/theme-manager.js'),'utf8'),context);
    vm.runInContext('ThemeManager.prototype.applyUiTheme = () => {}; ThemeResizerEngine.applySavedThemeDimensions = () => {}; window.manager = new ThemeManager();',context);
    assert.equal(context.window.manager.obsModeRule,expected);
  }
});

test('fallback colors are permanent media-free gradient themes, with separate flat solids', () => {
  const {manager, themes, writes, broadcasts} = fixture();
  manager.beginSanctuaryDraft();
  const sources={celestial_color:'celestial_motion',golden_color:'golden_motion',ember_color:'ember_motion',emerald_color:'emerald_motion'};
  for(const [id, source] of Object.entries(sources)) {
    manager.setSanctuaryTheme(id);
    const preview=manager.getSanctuaryPayload(manager.sanctuaryDraft);
    assert.equal(preview.bgCss,themes[source].previewGradient);
    assert.equal(preview.category,'colors');assert.equal(preview.type,'gradient');
    assert.equal(preview.imageUrl,'');assert.equal(preview.videoUrl,'');
  }
  for(const id of ['solid_blue','solid_amber','solid_purple','solid_emerald']) {
    manager.setSanctuaryTheme(id);
    const preview=manager.getSanctuaryPayload(manager.sanctuaryDraft);
    assert.match(preview.bgCss,/^#[a-f0-9]{6}$/i);assert.equal(preview.badge,'SOLID');
    assert.equal(preview.imageUrl,'');assert.equal(preview.videoUrl,'');
  }
  assert.equal(manager.activeSanctuaryTheme,'celestial_motion');assert.equal(writes.size,0);assert.equal(broadcasts(),0);
  manager.applySanctuaryDraft();assert.equal(manager.getSanctuaryPayload().id,'solid_emerald');
});

test('all theme edits remain draft-only until one atomic Apply', () => {
  const { manager, writes, broadcasts } = fixture();
  const original = JSON.stringify(manager.getSanctuaryPayload());
  manager.beginSanctuaryDraft();
  manager.setSanctuaryTheme('golden_still');
  manager.setSanctuaryFit('contain');
  manager.setSanctuaryDimmer(65);
  manager.setSanctuaryFont('Cinzel');
  manager.setObsModeRule('always_lt');
  assert.equal(JSON.stringify(manager.getSanctuaryPayload()), original);
  assert.equal(writes.size, 0);
  assert.equal(broadcasts(), 0);
  assert.equal(manager.hasSanctuaryDraftChanges(), true);
  const preview = manager.getSanctuaryPayload(manager.sanctuaryDraft);
  assert.equal(preview.id, 'golden_still');
  assert.equal(preview.fit, 'contain');
  assert.equal(preview.dimmer, 65);
  assert.equal(preview.font, 'Cinzel');
  assert.equal(preview.obsModeRule, 'always_lt');
  manager.applySanctuaryDraft();
  assert.equal(JSON.stringify(manager.getSanctuaryPayload()), JSON.stringify(preview));
  assert.equal(broadcasts(), 1);
  assert.equal(writes.get('sf_sanctuary_theme'), 'golden_still');
  assert.equal(writes.get('sf_sanctuary_dimmer'), '65');
  assert.equal(manager.hasSanctuaryDraftChanges(), false);
  manager.applySanctuaryDraft();
  assert.equal(broadcasts(), 1);
});

test('cancel discards theme and per-background sizing edits without persistence or projection', () => {
  const { manager, writes, broadcasts } = fixture();
  manager.beginSanctuaryDraft();
  manager.setSanctuaryFit('fill');
  manager.setSanctuaryTheme('obsidian_dark');
  manager.setSanctuaryDimmer(80);
  manager.cancelSanctuaryDraft();
  assert.equal(manager.activeSanctuaryTheme, 'celestial_motion');
  assert.equal(manager.getSanctuaryPayload().fit, 'cover');
  assert.equal(manager.sanctuaryDimmer, 30);
  assert.equal(writes.size, 0);
  assert.equal(broadcasts(), 0);
  manager.beginSanctuaryDraft();
  assert.equal(manager.hasSanctuaryDraftChanges(), false);
});

test('century gothic typography updates draft and applies to sanctuary payload', () => {
  const { manager, writes, broadcasts } = fixture();
  manager.beginSanctuaryDraft();
  manager.setSanctuaryFont('Century Gothic');
  assert.equal(manager.hasSanctuaryDraftChanges(), true);
  const preview = manager.getSanctuaryPayload(manager.sanctuaryDraft);
  assert.equal(preview.font, 'Century Gothic');
  manager.applySanctuaryDraft();
  assert.equal(manager.sanctuaryFont, 'Century Gothic');
  assert.equal(writes.get('sf_sanctuary_font'), 'Century Gothic');
  assert.equal(broadcasts(), 1);
});
