'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const createStore = require('../lib/live-state-store');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
function functionSource(name) {
  let start = app.indexOf('function ' + name + '(');
  if (app.slice(start - 6, start) === 'async ') start -= 6;
  const brace = app.indexOf('{', app.indexOf(')', start));
  return app.slice(start, app.indexOf('\n}', brace) + 2);
}

test('Escape and F1 clear live output, its preview mirror, and the staged cue together', () => {
  let keyboard, cancelled = 0;
  const previews = [], broadcasts = [];
  const context = { window: { addEventListener: (_, listener) => keyboard = listener,
    cancelPreparedSlide: () => cancelled++ }, document: { activeElement: null, getElementById: () => null },
    state: {activeLiveSlideId:'song_live',activeLiveText:'Live lyric',activeLiveRef:'Live title'},
    updateActiveSlideVisuals() {}, updateLivePreview: payload => previews.push(payload),
    broadcastState: payload => broadcasts.push(payload), closeCommandPalette() {}, closeSettingsModal() {},
    closeTranslationDropdown() {}, closeAudioMicPopover() {} };
  vm.runInNewContext(functionSource('clearAllOutputs') + functionSource('initKeyboardNav') + ';initKeyboardNav();', context);
  const event = key => ({ key, target: { closest: () => null }, preventDefault() {} });
  keyboard(event('Escape'));
  assert.equal(cancelled, 1); assert.equal(broadcasts[0].clear, true); assert.equal(previews[0].clear, true);
  assert.equal(context.state.activeLiveSlideId, null); assert.equal(context.state.activeLiveText, '');
  keyboard(event('Escape'));
  assert.equal(broadcasts[1].clear, true);
  keyboard(event('F1')); assert.equal(broadcasts[2].clear, true); assert.equal(cancelled, 3);
});

test('the shared output renderer contains no preview-only idle message', () => {
  const display = fs.readFileSync(require.resolve('../display.html'), 'utf8');
  assert.doesNotMatch(display, /This is your live preview/);
  assert.doesNotMatch(display, /<div[^>]+id="standby-container"/);
});

test('workspace restoration takes committed live content over an older workspace', () => {
  const saved = {
    workspace: JSON.stringify({ dashboard: { activeLiveSlideId: 'old', activeLiveText: 'Old lyric' } }),
    live: JSON.stringify({ slideId: 'new', text: 'Live lyric', reference: 'Live title', clear: false,
      projectorActive: false, livestreamActive: true, mode: 'lt', _timestamp: 10 })
  };
  const context = { REMOTE_MODE: false, WORKSPACE_STORAGE_KEY: 'workspace', LIVE_STATE_STORAGE_KEY: 'live',
    window: {}, state: { typography: {} }, localStorage: { getItem: key => saved[key] || null },
    pendingLiveStorage: null, syncMedleySettingsUI() {}, syncTypographySettingsUI() {},
    syncTransitionSettingsUI() {}, syncSongSettingsUI() {}, ensureActiveSong() {}, console };
  vm.runInNewContext(functionSource('restoreCommittedLiveState') + functionSource('restoreSavedWorkspaceState') + ';restoreSavedWorkspaceState();', context);
  assert.equal(context.state.activeLiveSlideId, 'new');
  assert.equal(context.state.activeLiveText, 'Live lyric');
  assert.equal(context.state.projectorActive, false);
  assert.equal(context.state.currentMode, 'lt');
});

test('preview refresh replies with the committed snapshot and makes no live write', async () => {
  const snapshot = { text: 'Actual live lyric', clear: true, blackout: false, _timestamp: 15 };
  const replies = [];
  const context = { liveHydrationPromise: Promise.resolve(), pendingLiveStorage: snapshot,
    syncChannel: { postMessage: payload => replies.push(payload) },
    broadcastState() { assert.fail('refresh must not publish a new live action'); },
    fetch() { assert.fail('refresh must not write to the server'); } };
  vm.runInNewContext(functionSource('replyToOutputStateRequest'), context);
  await context.replyToOutputStateRequest();
  assert.equal(replies[0], snapshot);
  assert.equal(replies[0]._timestamp, 15);
});

function broadcastContext(snapshot) {
  const sent = [];
  const context = { REMOTE_MODE: false, liveStateHydrated: true, liveHydrationPromise: null, state: {
    activeLiveSlideId: 'workspace', activeLiveText: 'Workspace lyric', currentMode: 'full', textSize: 1.5 },
    pendingLiveStorage: snapshot, liveStorageTimer: null, window: {}, createDashboardSnapshot: () => ({}),
    getNextSlideAnticipation: () => null, clearTimeout() {}, setTimeout() {}, flushCommittedLiveStorage() {},
    syncChannel: { postMessage: payload => sent.push(payload) }, fetch: () => Promise.resolve(), updateLivePreview() {}, Date };
  vm.runInNewContext(functionSource('broadcastState'), context);
  return { context, sent };
}

test('appearance changes retain committed text and clear/blackout until an explicit take', () => {
  for (const flags of [{ clear: true, blackout: false }, { clear: false, blackout: true }]) {
    const { context, sent } = broadcastContext({ slideId: 'live', text: 'Live lyric', reference: 'Live title',
      contentType: 'song', ...flags, clearBg: true, _timestamp: 5 });
    context.broadcastState();
    assert.equal(sent[0].text, 'Live lyric'); assert.equal(sent[0].slideId, 'live');
    assert.equal(sent[0].clear, flags.clear); assert.equal(sent[0].blackout, flags.blackout);
    assert.equal(sent[0].clearBg, true); assert.equal(sent[0].textSize, 1.5);
    context.broadcastState({ slideId: 'taken', text: 'Taken lyric', reference: 'Taken title' });
    assert.equal(sent[1].text, 'Taken lyric'); assert.equal(sent[1].clear, false);
    assert.equal(sent[1].blackout, false); assert.equal(sent[1].clearBg, false);
    assert.ok(sent[1]._timestamp > sent[0]._timestamp);
  }
});

test('startup defaults cannot publish while live hydration is pending', () => {
  const { context, sent } = broadcastContext(null);
  context.liveStateHydrated = false;
  context.broadcastState(); assert.equal(sent.length, 0);
  context.broadcastState({serviceTimer:{running:true}}); assert.equal(sent.length, 0);
  context.broadcastState({ slideId: 'manual', text: 'Manual take' });
  assert.equal(sent.length, 1);
});

test('appearance changes cannot replace committed media with workspace song state', () => {
  const media = { url: '/presentation/files/live.png', kind: 'image' };
  const { context, sent } = broadcastContext({ slideId: 'media_live', contentType: 'media',
    media, destinations: ['livestream'], clear: false, blackout: false });
  context.broadcastState();
  assert.equal(sent[0].contentType, 'media'); assert.equal(sent[0].media, media);
  assert.deepEqual(sent[0].destinations, ['livestream']);
});

test('fresh server state removes stale workspace live content when no committed snapshot exists', async () => {
  const context = { pendingLiveStorage: null, liveStateHydrated: false, window: { location: { protocol: 'http:' } },
    state: {activeLiveSlideId:'old_workspace',activeLiveText:'Old workspace lyric'},
    fetch: async () => ({ok:true,json:async()=>({text:'',reference:'',_outputRevision:0,_timestamp:1})}),
    updateActiveSlideVisuals() {}, updateLivePreview() {}, liveStorageTimer:null,
    clearTimeout() {}, setTimeout() {}, flushCommittedLiveStorage() {} };
  vm.runInNewContext(functionSource('restoreCommittedLiveState') + functionSource('hydrateCommittedLiveState'), context);
  await context.hydrateCommittedLiveState();
  assert.equal(context.state.activeLiveSlideId,null); assert.equal(context.state.activeLiveText,'');
});

test('a delayed hydration response cannot undo a manual projection', async () => {
  let resolveRead;
  const initial = { text: 'Cached lyric' }, manual = { text: 'Manual lyric', slideId: 'manual' };
  const context = { pendingLiveStorage: initial, liveStateHydrated: false, window: { location: { protocol: 'http:' } },
    fetch: () => new Promise(resolve => resolveRead = resolve),
    restoreCommittedLiveState() { assert.fail('delayed server read must not overwrite a manual take'); },
    state: { activeLiveSlideId: 'manual' }, updateActiveSlideVisuals() {}, updateLivePreview() {},
    liveStorageTimer: null, clearTimeout() {}, setTimeout() {}, flushCommittedLiveStorage() {} };
  vm.runInNewContext(functionSource('hydrateCommittedLiveState'), context);
  const hydration = context.hydrateCommittedLiveState();
  context.pendingLiveStorage = manual;
  resolveRead({ ok: true, json: async () => ({ text: 'Older server lyric', _outputRevision: 2 }) });
  await hydration;
  assert.equal(context.pendingLiveStorage, manual); assert.equal(context.liveStateHydrated, true);
});

test('workspace saves do not republish live output', () => {
  const requests = [];
  const context = { REMOTE_MODE: false, WORKSPACE_STORAGE_KEY: 'workspace', window: {},
    localStorage: { setItem() {} }, createDashboardSnapshot: () => ({ activeLiveText: 'Workspace lyric' }),
    fetch: (url, options) => { requests.push({ url, options }); return Promise.resolve(); },
    broadcastState() { assert.fail('workspace save must not broadcast a slide'); }, _syncWorkspaceTimer: null };
  vm.runInNewContext(functionSource('syncDashboardWorkspace') + ';syncDashboardWorkspace(true);', context);
  assert.equal(requests[0].url, '/api/workspace');
});

test('atomic live persistence restores the newest snapshot including clear and blackout', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ginomai-live-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'live.json'), store = createStore(filename);
  assert.equal(store.load(), null);
  store.save({ text: 'Old lyric', _outputRevision: 1 });
  store.save({ text: 'Newest lyric', contentType: 'countdown', countdown: { endsAt: 99 },
    clear: true, blackout: true, _outputRevision: 2, hostSpeechState: { transcript: 'Private' } });
  await store.flush();
  const restored = createStore(filename).load();
  assert.equal(restored.text, 'Newest lyric'); assert.equal(restored._outputRevision, 2);
  assert.equal(restored.clear, true); assert.equal(restored.blackout, true);
  assert.equal(restored.countdown.endsAt, 99); assert.equal(restored.hostSpeechState, undefined);
  fs.writeFileSync(filename, '{broken'); assert.equal(createStore(filename).load(), null);
});

test('OBS refresh and a full server restart retain live content; workspace navigation cannot replace it', { timeout: 25000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ginomai-live-server-'));
  const filename = path.join(directory, 'live.json'), children = [];
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function launch() {
    const child = spawn(process.execPath, ['-e', `
      const app = require(${JSON.stringify(require.resolve('../server'))});
      app.server.listen(0, '127.0.0.1', () => process.send({port:app.server.address().port}));
      process.on('message', async () => { await app.flushLiveState(); app.server.closeAllConnections(); app.server.close(() => process.exit(0)); });
    `], { env: { ...process.env, SF_LIVE_STATE_FILE: filename }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    let diagnostics = '';
    child.stderr.on('data', chunk => diagnostics += chunk);
    const ready = await Promise.race([once(child, 'message').then(([message]) => message),
      once(child, 'exit').then(([code]) => { throw new Error('Server exited: ' + code + ' ' + diagnostics); })]);
    const base = `http://127.0.0.1:${ready.port}`;
    const host = (await fetch(base + '/')).headers.get('set-cookie').split(';')[0];
    return { child, base, host };
  }
  let running = await launch();
  const post = (route, payload) => fetch(running.base + route, { method: 'POST',
    headers: { Cookie: running.host, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal((await post('/api/sync', { slideId: 'song_live', text: 'Live lyric', reference: 'Live title',
    contentType: 'song', mode: 'full', clear: false, blackout: false, _timestamp: 100 })).status, 200);
  const live = await (await fetch(running.base + '/api/state')).json();
  assert.equal((await post('/api/workspace', { dashboard: { activeLiveText: '', activeLiveSlideId: null } })).status, 200);
  assert.equal((await post('/api/sync', { text: '', _timestamp: 99 })).status, 409);
  const refresh = await (await fetch(running.base + '/api/state')).json();
  assert.equal(refresh.text, 'Live lyric'); assert.equal(refresh._outputRevision, live._outputRevision);
  const events = await fetch(running.base + '/api/events?target=livestream');
  const reader = events.body.getReader();
  const chunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(chunk, /Live lyric/);
  await reader.cancel();
  assert.equal((await fetch(running.base + '/api/workspace', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dashboard: {} }) })).status, 403);
  running.child.send('stop'); await once(running.child, 'exit');
  running = await launch();
  const restored = await (await fetch(running.base + '/api/state')).json();
  assert.equal(restored.text, 'Live lyric'); assert.equal(restored.slideId, 'song_live');
  assert.equal(restored._outputRevision, live._outputRevision);
  assert.equal((await post('/api/control', { type: 'BLACKOUT' })).status, 202);
  running.child.send('stop'); await once(running.child, 'exit');
  running = await launch();
  assert.equal((await (await fetch(running.base + '/api/state')).json()).blackout, true);
});
