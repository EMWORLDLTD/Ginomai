'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const createController = require('../electron/update-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const available = { updateInfo: { version: '2.4.2' }, isUpdateAvailable: true };
function backend(options = {}) {
  const updater = new EventEmitter();
  let checks = 0, downloads = 0, installs = 0, flushes = 0;
  const notifications = [], timeouts = new Map(), intervals = new Map();
  let saved = options.saved, cachedNotes = options.cachedNotes, nextId = 0;
  const storage = {
    readFileSync(filename) { const value = filename.endsWith('update-release-notes.json') ? cachedNotes : saved; if (value === undefined) throw Error('missing'); return value; },
    promises: { mkdir: async () => {}, writeFile: async (filename, value) => { if (options.writeError) throw Error('disk full'); if (filename.includes('update-release-notes.json')) cachedNotes = value; else saved = value; }, rename: async () => {} }
  };
  class CancellationToken {
    cancelled = false;
    cancel() { this.cancelled = true; this.onCancel?.(); }
  }
  updater.checkForUpdates = () => { checks++; return options.check ? options.check() : Promise.resolve(available); };
  updater.downloadUpdate = token => {
    downloads++;
    return options.download ? options.download(token, updater) : Promise.resolve(['verified.exe']);
  };
  updater.quitAndInstall = () => { installs++; options.install?.(); };
  const controller = createController({
    app: { isPackaged: options.packaged !== false, getVersion: () => '2.4.1', getPath: () => '/virtual/user-data' },
    updater, CancellationToken, storage,
    notify: value => notifications.push(value),
    getBlockers: options.blockers || (() => []),
    prepareRestart: options.prepare || (async () => ({ ok: true, blockers: [] })),
    flushState: async () => { flushes++; if (options.flushError) throw Error('Could not save live state.'); },
    timers: { setTimeout(fn, ms) { const id = ++nextId; timeouts.set(id, {fn, ms}); return id; }, clearTimeout: id => timeouts.delete(id), setInterval(fn, ms) { const id = ++nextId; intervals.set(id, {fn, ms}); return id; }, clearInterval: id => intervals.delete(id) }
  });
  return { controller, updater, notifications, timeouts, intervals, counts: () => ({ checks, downloads, installs, flushes }), saved: () => saved, cachedNotes: () => cachedNotes };
}

test('release notes are normalized, cached by version and remain readable after an offline relaunch', async () => {
  const h = backend({check:async () => ({...available,updateInfo:{version:'2.4.2',releaseNotes:'<h2>New features</h2><ul><li>Quiet updates &amp; better controls</li></ul><script>throw Error("unsafe")</script><img src="https://example.com/tracker.png"><a href="https://example.com">Details</a>'}})});
  const result = await h.controller.check(); await tick();
  assert.equal(result.releaseNotes.version,'2.4.2');
  assert.match(result.releaseNotes.text,/New features\n+• Quiet updates & better controls/);
  assert.doesNotMatch(result.releaseNotes.text,/<|unsafe|tracker|https:/);
  assert.deepEqual(JSON.parse(h.cachedNotes()),result.releaseNotes);
  const offline = backend({cachedNotes:h.cachedNotes(),check:async () => {throw Error('offline');}});
  assert.deepEqual(offline.controller.snapshot().releaseNotes,result.releaseNotes);
  assert.equal((await offline.controller.check()).releaseNotes.text,result.releaseNotes.text);
  assert.equal(offline.counts().downloads,0);
});

test('changelog arrays select the exact version and missing notes never reuse another version', async () => {
  const h = backend({check:async () => ({...available,updateInfo:{version:'2.4.2',releaseNotes:[{version:'2.4.1',note:'Old changes'},{version:'2.4.2',note:'## Improvements\n- **Quiet updates**\n[More details](https://example.com)'}]}})});
  assert.equal((await h.controller.check()).releaseNotes.text,'Improvements\n- Quiet updates\nMore details');
  const missing = backend({cachedNotes:JSON.stringify({version:'2.4.1',text:'Old changes'})});
  assert.deepEqual((await missing.controller.check()).releaseNotes,{version:'2.4.2',text:''});
  assert.equal(backend({cachedNotes:'broken'}).controller.snapshot().releaseNotes,null);
});

test('a cached version keeps its notes when downloaded metadata omits them', async () => {
  const h = backend({cachedNotes:JSON.stringify({version:'2.4.2',text:'Quiet update controls'})});
  await h.controller.check();
  const request = h.controller.download(); await tick();
  h.updater.emit('update-downloaded',{version:'2.4.2'});
  await request;
  assert.equal(h.controller.snapshot().releaseNotes.text,'Quiet update controls');
});

test('missing/invalid preferences opt out; discovery does not download or install', async () => {
  for (const saved of [undefined, 'broken', '{}', '{"automaticDownloads":"true"}']) {
    const h = backend({ saved });
    assert.equal(h.controller.snapshot().preferences.automaticDownloads, false);
    assert.equal(h.updater.autoDownload, false);
    assert.equal(h.updater.autoInstallOnAppQuit, false);
    const result = await h.controller.check();
    assert.equal(result.phase, 'available');
    assert.deepEqual(h.counts(), {checks:1, downloads:0, installs:0, flushes:0});
    assert.doesNotThrow(() => structuredClone(result));
  }
});

test('explicit download reports progress and waits for a separate restart request', async () => {
  let done;
  const h = backend({ download: () => new Promise(resolve => { done = resolve; }) });
  await h.controller.check();
  const request = h.controller.download();
  assert.equal(h.controller.download(), request);
  await tick();
  h.updater.emit('download-progress', {percent:52.4});
  assert.equal(h.controller.snapshot().percent, 52);
  h.updater.emit('update-downloaded', {version:'2.4.2'});
  done(['verified.exe']);
  await request;
  assert.equal(h.controller.snapshot().phase, 'ready');
  await h.controller.check();
  assert.equal(h.counts().checks, 1);
  assert.equal(h.counts().installs, 0);
  await h.controller.install();
  assert.deepEqual(h.counts(), {checks:1, downloads:1, installs:1, flushes:1});
});

test('opt-in persists atomically and enables downloads, including across launches', async () => {
  const h = backend();
  await h.controller.check();
  await h.controller.setPreferences({automaticDownloads:true});
  await tick();
  assert.deepEqual(JSON.parse(h.saved()), {automaticDownloads:true});
  assert.equal(h.counts().downloads, 1);
  assert.equal(h.counts().installs, 0);
  const relaunched = backend({saved:h.saved()});
  assert.equal(relaunched.controller.snapshot().phase, 'idle');
  await relaunched.controller.check();
  await tick();
  assert.equal(relaunched.controller.snapshot().phase, 'ready');
  assert.equal(relaunched.counts().installs, 0);
});

test('disabling opt-in cancels an automatic transfer; completed downloads stay ready', async () => {
  let activeToken;
  const h = backend({saved:'{"automaticDownloads":true}', download: token => new Promise((resolve,reject) => { activeToken = token; token.onCancel = () => reject(Error('cancelled')); })});
  await h.controller.check(); await tick();
  await h.controller.setPreferences({automaticDownloads:false}); await tick();
  assert.equal(activeToken.cancelled, true);
  assert.equal(h.controller.snapshot().phase, 'available');
  assert.equal(h.controller.snapshot().preferences.automaticDownloads, false);
  const ready = backend();
  await ready.controller.check(); await ready.controller.download();
  await ready.controller.setPreferences({automaticDownloads:false});
  assert.equal(ready.controller.snapshot().phase, 'ready');
});

test('turning opt-in off does not cancel a user-requested download; explicit Cancel does', async () => {
  let token;
  const h = backend({download: value => new Promise((resolve,reject) => { token = value; token.onCancel = () => reject(Error('cancelled')); })});
  await h.controller.check(); const request = h.controller.download(); await tick();
  await h.controller.setPreferences({automaticDownloads:false});
  assert.equal(token.cancelled, false);
  h.controller.cancelDownload(); await request;
  assert.equal(h.controller.snapshot().phase, 'available');
});

test('failed preference writes preserve the default and do not start a transfer', async () => {
  const h = backend({writeError:true});
  await h.controller.check();
  const result = await h.controller.setPreferences({automaticDownloads:true});
  assert.match(result.preferenceError, /Could not save/);
  assert.equal(result.preferences.automaticDownloads, false);
  assert.equal(h.counts().downloads, 0);
});

test('quiet startup and six-hour checks never notify the OS or open dialogs', async () => {
  const h = backend(); h.controller.start(); h.controller.start();
  assert.equal(h.intervals.size, 1);
  assert.equal([...h.intervals.values()][0].ms, 21600000);
  [...h.timeouts.values()].find(timer => timer.ms === 4000).fn(); await tick();
  assert.equal(h.counts().checks, 1);
  [...h.intervals.values()][0].fn(); await tick();
  assert.equal(h.counts().checks, 2);
  assert.equal(h.counts().downloads, 0);
  h.controller.stop(); assert.equal(h.intervals.size, 0);
});

test('checks deduplicate, time out, and ignore late network results', async () => {
  let done;
  const h = backend({check:() => new Promise(resolve => { done = resolve; })});
  const request = h.controller.check();
  assert.equal(h.controller.check(), request); await tick();
  [...h.timeouts.values()].find(timer => timer.ms === 20000).fn();
  assert.match((await request).error, /timed out/);
  assert.equal(h.controller.check(), request);
  done(available); await tick();
  assert.equal(h.controller.snapshot().phase, 'error');
  assert.equal(h.counts().downloads, 0);
});

test('check errors distinguish feed, unpublished release, network, and development', async () => {
  for (const [error, expected] of [[{code:'ENOENT',message:'app-update.yml missing'},/no update feed/],[{statusCode:404},/No published update/],[Error('offline'),/internet connection/]]) {
    const h = backend({check:async () => { throw error; }});
    assert.match((await h.controller.check()).error, expected);
  }
  const dev = backend({packaged:false}); dev.controller.start();
  assert.equal((await dev.controller.check()).isDev, true);
  assert.equal(dev.counts().checks, 0);
  for (const [result, phase] of [[null, 'unavailable'], [{updateInfo:{version:'2.4.1'},isUpdateAvailable:false}, 'up-to-date']]) {
    assert.equal((await backend({check:async () => result}).controller.check()).phase, phase);
  }
});

test('download failures retry and inactivity timeout cancels rather than installing', async () => {
  let attempt = 0;
  const h = backend({download:async () => { if (++attempt === 1) throw Error('offline'); return ['verified.exe']; }});
  await h.controller.check(); await h.controller.download();
  assert.equal(h.controller.snapshot().errorPhase, 'download');
  await h.controller.download(); assert.equal(h.controller.snapshot().phase, 'ready');
  const slow = backend({download:token => new Promise((resolve,reject) => { token.onCancel = () => reject(Error('cancelled')); })});
  await slow.controller.check(); const request = slow.controller.download(); await tick();
  [...slow.timeouts.values()].find(timer => timer.ms === 120000).fn(); await request;
  assert.match(slow.controller.snapshot().error, /timed out/);
  assert.equal(slow.counts().installs, 0);
});

test('every main-process and renderer activity blocker prevents installation', async () => {
  for (const blocker of ['Projector output','Stage output','Connected projector output','Connected livestream output','Connected audience output','Sermon recording','AI microphone']) {
    for (const source of ['main','renderer']) {
      const h = backend({blockers:() => source === 'main' ? [blocker] : [], prepare:async () => ({ok:true,blockers:source === 'renderer' ? [blocker] : []})});
      await h.controller.check(); await h.controller.download(); await h.controller.install();
      assert.deepEqual(h.controller.snapshot().blockers, [blocker]);
      assert.equal(h.counts().installs, 0);
      assert.equal(h.counts().flushes, 0);
    }
  }
});

test('restart rechecks after saving, deduplicates, and rejects failed saves/verification', async () => {
  let finish;
  const h = backend({prepare:save => save ? new Promise(resolve => {finish = resolve;}) : Promise.resolve({ok:true,blockers:[]})});
  await h.controller.check(); await h.controller.download();
  const request = h.controller.install(); assert.equal(h.controller.install(), request); await tick();
  finish({ok:false,error:'Could not save the workspace.'}); await request;
  assert.equal(h.counts().installs, 0); assert.match(h.controller.snapshot().error,/save/);
  const changed = backend({blockers:() => changed.counts().flushes ? ['Projector output'] : []});
  await changed.controller.check(); await changed.controller.download(); await changed.controller.install();
  assert.equal(changed.counts().installs, 0);
  assert.deepEqual(changed.controller.snapshot().blockers,['Projector output']);
  for (const options of [{flushError:true},{prepare:async () => ({ok:false})}]) {
    const failed = backend(options); await failed.controller.check(); await failed.controller.download(); await failed.controller.install();
    assert.equal(failed.counts().installs, 0);
    assert(failed.controller.snapshot().error);
  }
});

function renderer(desktop = true) {
  const nodes = {};
  const ids = ['settings-build-version','settings-update-status-text','check-update-btn','check-update-btn-text','check-update-icon','check-update-btn-sidebar','updates-settings-status','automatic-update-downloads','updates-settings-action','update-notes-content','update-notes-version','desktop-update-indicator','desktop-update-footer'];
  for (const id of ids) nodes[id] = {textContent:'',hidden:false,disabled:false,classList:{remove(){}},setAttribute(){},querySelector(){return null;}};
  let state = {phase:'idle',currentVersion:'2.4.1',revision:0,preferences:{automaticDownloads:false},blockers:[]};
  let onStatus, checks = 0, installs = 0;
  const window = { addEventListener(){}, desktopApi: desktop ? {
    getAppInfo:async () => ({version:'2.4.1'}), getUpdateStatus:async () => state,
    checkForUpdates:async () => { checks++; return state; },
    installUpdate:async () => { installs++; return state; },
    onUpdateStatus:fn => {onStatus=fn;}
  } : undefined };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/app-updates.js'),'utf8'), {
    window, document:{readyState:'complete',getElementById:id=>nodes[id] || null}, fetch:async () => ({ok:true,json:async () => ({version:'2.4.1'})}), AbortSignal, setTimeout, clearTimeout
  });
  return {window,nodes,counts:()=>({checks,installs}),emit(next) {state={...state,...next};onStatus(state);}};
}

test('update controls only appear while an update is pending', async () => {
  const h = renderer(); await tick();
  const indicator = h.nodes['desktop-update-indicator'];
  const footer = h.nodes['desktop-update-footer'];
  for (const phase of ['idle','checking','up-to-date','unavailable','error']) {
    h.emit({phase,errorPhase:'check'});
    assert.equal(indicator.hidden,true,phase);
    assert.equal(footer.hidden,true,phase);
  }
  for (const phase of ['available','downloading','ready','restarting','error']) {
    h.emit({phase,latestVersion:'2.4.2',errorPhase:'download'});
    assert.equal(indicator.hidden,false,phase);
    assert.equal(footer.hidden,false,phase);
  }
  h.emit({phase:'available'});
  assert.equal(indicator.title,'Update available');
  assert.equal(footer.textContent,'Update available');
  h.emit({phase:'up-to-date',latestVersion:null});
  assert.equal(indicator.hidden,true);
  assert.equal(footer.hidden,true);
  const browser = renderer(false); await tick();
  assert.equal(browser.nodes['desktop-update-indicator'].hidden,true);
});

test('renderer hydrates canonical metadata and Check never becomes an installer shortcut', async () => {
  const h = renderer(); await tick();
  assert.equal(h.nodes['settings-build-version'].textContent,'Build 2.4.1');
  h.emit({phase:'ready',latestVersion:'2.4.2',revision:3});
  assert.equal(h.nodes['updates-settings-action'].textContent,'Restart to Update');
  await h.window.checkForUpdates();
  assert.deepEqual(h.counts(),{checks:1,installs:0});
  await h.window.runUpdateAction(); assert.equal(h.counts().installs,1);
  h.emit({phase:'available',revision:1});
  assert.equal(h.nodes['updates-settings-action'].textContent,'Restart to Update');
});

test('browser guidance never claims desktop verification', async () => {
  const h = renderer(false); await tick(); await h.window.checkForUpdates();
  assert.match(h.nodes['settings-update-status-text'].textContent,/host desktop/);
  assert.equal(h.nodes['automatic-update-downloads'].disabled,true);
  assert.deepEqual(h.counts(),{checks:0,installs:0});
});

test('notes render safely in place, with a clear missing-notes message', async () => {
  const h = renderer(); await tick();
  assert.equal(h.nodes['update-notes-content'].textContent,'No release notes provided for this version.');
  h.emit({revision:1,releaseNotes:{version:'2.4.2',text:'<img src=x onerror=alert(1)>\nQuiet updates'}});
  assert.equal(h.nodes['update-notes-content'].textContent,'<img src=x onerror=alert(1)>\nQuiet updates');
  assert.equal(h.nodes['update-notes-content'].innerHTML,undefined);
  assert.equal(h.nodes['update-notes-version'].textContent,'Version 2.4.2');
});

test('only host IPC can install; no OS update dialog, notifications, or install-on-exit', () => {
  const main = fs.readFileSync(path.join(__dirname,'../electron/main.js'),'utf8');
  assert.match(main,/event\.sender !== mainWindow\.webContents/);
  assert.match(main,/event\.senderFrame !== mainWindow\.webContents\.mainFrame/);
  assert.match(main,/if \(!isUpdateHost\(event\)\)/);
  assert.doesNotMatch(main,/Update Ready|checkForUpdatesAndNotify|quitAndInstall\(/);
  assert.match(main,/'desktop:install-update', \(\) => desktopUpdates\.install\(\)/);
});

test('renderer restart preparation reads recording/mic state and rejects failed workspace saves', async () => {
  const source = fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  const start = source.indexOf('window.prepareDesktopUpdateRestart = async function');
  const code = source.slice(start, source.indexOf('\n};', start) + 3);
  let calls = 0;
  const context = vm.createContext({
    window:{sermonManager:{isRecordingSermon:false},sessionManager:{saveCurrentSessionSnapshot:()=>({id:'saved'})}},
    state:{}, speechAi:{isListening:false}, _syncWorkspaceTimer:null, liveStorageTimer:null,
    pendingLiveStorage:{activeLiveText:'Live'}, WORKSPACE_STORAGE_KEY:'workspace', LIVE_STATE_STORAGE_KEY:'live',
    createDashboardSnapshot:()=>({agenda:['slide']}), localStorage:{setItem(){}}, clearTimeout,
    fetch:async () => {calls++;return {ok:true};}, AbortSignal
  });
  vm.runInContext(code, context);
  for (const property of ['aiSpeechRequested','aiListening']) {
    context.state[property]=true;
    assert.deepEqual(Array.from((await context.window.prepareDesktopUpdateRestart(true)).blockers),['AI microphone']);
    context.state[property]=false;
  }
  context.window.sermonManager.isRecordingSermon=true;
  assert.deepEqual(Array.from((await context.window.prepareDesktopUpdateRestart(true)).blockers),['Sermon recording']);
  assert.equal(calls,0);
  context.window.sermonManager.isRecordingSermon=false;
  assert.equal((await context.window.prepareDesktopUpdateRestart(true)).ok,true);
  context.localStorage.setItem=()=>{throw Error('disk full');};
  assert.equal((await context.window.prepareDesktopUpdateRestart(true)).ok,false);
});

test('audience connection lifetime blocks restart, including stage, choir and pastor', () => {
  const outputs = require('../lib/output-status')();
  for (const target of ['sanctuary','livestream','dynamic','stage','choir','pastor']) {
    const id=outputs.connect(target,{write(){}});
    assert.equal(outputs.connected().find(output=>output.target===target).connected,1);
    // A display with no recent acknowledgements is still an open connection.
    outputs.snapshot(1,Date.now()+60000);
    assert.equal(outputs.connected().find(output=>output.target===target).connected,1);
    outputs.disconnect(id);
    assert.equal(outputs.connected().find(output=>output.target===target).connected,0);
  }
});

test('strict flush propagates persistence failures to the restart guard', async () => {
  const os = require('node:os');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'ginomai-update-save-'));
  try {
    const obstruction = path.join(directory,'file');
    fs.writeFileSync(obstruction,'not a directory');
    const store = require('../lib/live-state-store')(path.join(obstruction,'live.json'));
    await store.save({_outputRevision:1});
    await assert.rejects(store.flush({strict:true}),/Restart has been prevented/);
    await store.flush(); // Ordinary callers retain best-effort persistence.
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
