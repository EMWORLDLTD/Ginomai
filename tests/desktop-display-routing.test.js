'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const createRouting = require('../electron/display-routing');
const display = (id, isPrimary = false) => ({ id, isPrimary, bounds: { x: (id - 1) * 1920, y: 0, width: 1920, height: 1080 } });
const primary = display(1, true), first = display(2), second = display(3);

test('sanctuary reserves the sole external display; stale laptop preferences cannot override it', () => {
  const resolve = createRouting();
  for (const preference of [null, 1, '1', 99]) {
    const routing = resolve([primary, first], 1, preference, 2);
    assert.equal(routing.audience.id, 2);
    assert.equal(routing.stage.id, 1);
  }
  const routing = resolve([primary], 1, 2, 3);
  assert.equal(routing.audience, undefined);
  assert.equal(routing.stage.id, 1);
});

test('two external displays keep separate roles and support explicit external selection', () => {
  const resolve = createRouting();
  const defaults = resolve([primary, first, second], 1);
  assert.equal(defaults.audience.id, 2);
  assert.equal(defaults.stage.id, 3);
  const custom = resolve([primary, first, second], 1, '3', '2');
  assert.equal(custom.audience.id, 3);
  assert.equal(custom.stage.id, 2);
});

test('connection order survives OS enumeration changes, unplugging and reconnecting', () => {
  const resolve = createRouting();
  resolve([primary, first], 1);
  assert.equal(resolve([second, primary, first], 1).audience.id, 2);
  assert.equal(resolve([primary, second], 1).audience.id, 3);
  assert.equal(resolve([first, primary, second], 1).audience.id, 3);
});

function desktop(displays) {
  const windows = [], events = [];
  const context = {
    displays, projectorWindow: null, projectorDisplayId: null, stageWindow: null, stageDisplayId: null,
    currentStageMode: 'stage', serverPort: 8500, __dirname: '/electron', path,
    resolveDisplayRouting: createRouting(),
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, status) => events.push({channel, status}) } }
  };
  context.screen = {
    getAllDisplays: () => context.displays,
    getPrimaryDisplay: () => primary,
    getDisplayMatching: bounds => context.displays.find(d => d.bounds.x === bounds.x) || primary
  };
  context.BrowserWindow = class {
    constructor(options) { this.bounds = {...options}; this.handlers = {}; windows.push(this); }
    getBounds() { return this.bounds; }
    setPosition(x, y) { Object.assign(this.bounds, {x, y}); }
    setSize(width, height) { Object.assign(this.bounds, {width, height}); }
    setFullScreen() {} show() {} focus() {} isDestroyed() { return !!this.destroyed; }
    loadURL(url) { this.url = url; return Promise.resolve(); }
    loadFile() { return Promise.resolve(); }
    on(event, handler) { this.handlers[event] = handler; }
    close() { this.destroyed = true; this.handlers.closed?.(); }
  };
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function launchProjectorWindow('), source.indexOf('// ─── Network Info Helper')), context);
  return {context, windows, events};
}

test('real desktop launch targets sanctuary on the sole external screen and stage on the laptop', () => {
  const {context: c} = desktop([primary, first]);
  assert.equal(c.launchStageWindow().displayId, 1);
  assert.equal(c.launchProjectorWindow('1').displayId, 2);
  assert.match(c.projectorWindow.url, /target=sanctuary$/);
  assert.match(c.stageWindow.url, /target=stage$/);
  assert.equal(c.getProjectorStatus().isExternal, true);
  c.displays = [primary];
  assert.equal(c.getProjectorStatus().isExternal, false);
  assert.equal(c.getProjectorStatus().hasExternalDisplay, false);
});

test('sanctuary reclaims a screen already used by stage without changing stage content mode', () => {
  const {context: c} = desktop([primary, first, second]);
  c.launchStageWindow(3, 'choir');
  assert.equal(c.stageDisplayId, 3);
  c.launchProjectorWindow(3);
  assert.equal(c.projectorDisplayId, 3);
  assert.equal(c.stageDisplayId, 2);
  assert.match(c.stageWindow.url, /target=choir$/);
  // An old stage assignment to the sole external display is moved back to primary.
  c.closeProjectorWindow();
  c.displays = [primary, second];
  c.stageDisplayId = 3;
  c.stageWindow.setPosition(second.bounds.x, 0);
  c.launchProjectorWindow();
  assert.equal(c.stageDisplayId, 1);
});

test('desktop launch with no external display returns a failure instead of projecting on the laptop', () => {
  const {context: c, windows} = desktop([primary]);
  assert.equal(c.launchProjectorWindow(1).success, false);
  assert.equal(windows.length, 0);
  assert.equal(c.getProjectorStatus().isExternal, false);
});

function renderer(displays, saved = {}) {
  const nodes = {};
  for (const id of ['desktop-display-select', 'desktop-stage-display-select', 'desktop-projector-btn', 'desktop-projector-modal-status']) {
    nodes[id] = {value: '', options: [], attributes: {}, style: {removeProperty(key) { delete this[key]; }},
      classList: {toggle(name, active) { this[name] = active; }},
      setAttribute(name, value) { this.attributes[name] = value; },
      replaceChildren() { this.options = []; this.value = ''; }, appendChild(option) { this.options.push(option); }};
  }
  const launches = [], toasts = [];
  const context = {console, displays, window: {desktopApi: {
    isDesktop: true, getDisplays: async () => context.displays,
    launchProjector: async options => { launches.push(options); return {success: context.displays.some(d => !d.isPrimary)}; }
  }}, localStorage: {getItem: key => saved[key], setItem() {}},
    document: {getElementById: id => nodes[id], createElement: () => ({})},
    showToast: (...args) => toasts.push(args)};
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let desktopProjectorStatus ='), source.indexOf('// ── Workspace Scalability')), context);
  return {context, nodes, launches, toasts};
}

test('renderer refresh corrects saved primary/same-screen choices and handles hotplug before clicking', async () => {
  const {context: c, nodes, launches} = renderer([primary], {sf_projector_display: '1', sf_stage_display: '2'});
  await c.refreshDesktopDisplays();
  assert.equal(nodes['desktop-display-select'].value, '');
  c.displays = [primary, first];
  await c.window.toggleDesktopProjector();
  assert.equal(launches[0].displayId, '2');
  assert.equal(launches[0].targetMode, 'sanctuary');
  assert.equal(nodes['desktop-stage-display-select'].value, '1');
});

test('renderer green state requires active external projection and removes stale inline colors', () => {
  const {context: c, nodes} = renderer([primary]);
  const button = nodes['desktop-projector-btn'];
  button.style.background = 'green'; button.style['border-color'] = 'green';
  for (const status of [{isOpen: false}, {isOpen: true, isExternal: false}]) {
    c.updateDesktopProjectorUI(status);
    assert.equal(button.classList.active, false);
    assert.equal(button.attributes['aria-pressed'], 'false');
    assert.equal(button.style.background, undefined);
    assert.equal(button.style['border-color'], undefined);
  }
  assert.match(button.title, /disconnected/);
  c.updateDesktopProjectorUI({isOpen: true, isExternal: true, hasExternalDisplay: true});
  assert.equal(button.classList.active, true);
  assert.equal(button.attributes['aria-pressed'], 'true');
  c.updateDesktopProjectorUI({isOpen: false, hasExternalDisplay: false});
  assert.equal(button.title, 'No external display connected');
});
