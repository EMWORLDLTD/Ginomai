const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('remote announcement send and stop use the existing projection and clear privileges', () => {
  const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const start = source.indexOf('function isCommandAllowed(');
  const end = source.indexOf('\n}', start) + 2;
  const c = { ALWAYS_BLOCKED_FROM_REMOTE: new Set() };
  vm.createContext(c); vm.runInContext(source.slice(start, end), c);
  assert.equal(c.isCommandAllowed({ type: 'ALERT_UPDATE', alert: { active: true } }, { projectSlide: true }), true);
  assert.equal(c.isCommandAllowed({ type: 'ALERT_UPDATE', alert: { active: true } }, { projectSlide: false, clearScreen: true }), false);
  assert.equal(c.isCommandAllowed({ type: 'ALERT_UPDATE', alert: { active: false } }, { clearScreen: true }), true);
  assert.equal(c.isCommandAllowed({ type: 'ALERT_UPDATE', alert: { active: false } }, { clearScreen: false, projectSlide: true }), false);
});

test('resident previews retain an announcement sent before frame load and reject older committed state', () => {
  const frames = [];
  const hosts = new Map(['bento-single-prev-wrap', 'bento-dual-sanctuary', 'bento-dual-livestream'].map(id => [id,
    { clientWidth: 300, clientHeight: 180, classList: { add() {} }, append(frame) { frames.push(frame); } }]));
  const c = { window: {}, document: { hidden: false, getElementById: id => hosts.get(id), createElement: () => ({ style: {}, events: {},
    addEventListener(type, handler) { this.events[type] = handler; }, contentWindow: {} }) },
    BroadcastChannel: class { postMessage() {} }, ResizeObserver: class { observe() {} },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ outputs: [] }) }), setInterval() {}, Date };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/output-preview.js'), 'utf8'), c);
  const alert = { active: true, position: 'fullscreen', text: 'Welcome', background: { type: 'gradient', bgCss: '#123456' } };
  c.window.updateOutputPreviews({ clear: true, alert, _timestamp: 20 });
  for (const frame of frames) {
    const calls = frame.calls = [];
    frame.contentWindow.applyState = payload => { calls.push(payload); frame.contentWindow.LATEST_STATE = payload; };
    frame.events.load();
    assert.equal(calls[0].alert, alert); assert.equal(calls[0].clear, true); assert.equal(calls[0]._timestamp, 20);
  }
  c.window.updateOutputPreviews({ alert: { active: false }, _timestamp: 21 });
  for (const frame of frames) {
    const calls = frame.calls;
    assert.equal(calls.at(-1).clear, true);
    assert.equal(calls.at(-1)._timestamp, 21, 'committed timestamps must reach the renderer to reject stale echoes');
  }
});
