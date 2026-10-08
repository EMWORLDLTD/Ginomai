'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../display.html'), 'utf8');
const start = html.indexOf('function ensureAlphaTransparent()');
const source = html.slice(start, html.indexOf('\n    }', start) + 6);
function render({ embedded, lowerThird, transparent }) {
  const root = {}, body = {};
  const c = { urlParams: new URLSearchParams(embedded ? 'embedded=1' : ''),
    window: { LATEST_STATE: { transparentBg: transparent, bg: '#172033' } },
    isLowerThirdLayout: () => lowerThird,
    document: { documentElement: { style: { setProperty: (key, value) => root[key] = value } },
      body: { style: { setProperty: (key, value) => body[key] = value } } } };
  vm.runInNewContext(source + ';ensureAlphaTransparent();', c);
  return { root, body };
}

test('livestream defaults to bottom overlay independently of the projector layout', () => {
  const start = html.indexOf('function isLowerThirdLayout(data)');
  const source = html.slice(start, html.indexOf('\n    const viewportChannel', start));
  const c = {window:{},isStage:false,isExplicitLt:false,isExplicitFull:false,isSanctuary:false,targetType:'obs',localStorage:{getItem:()=>null}};
  vm.createContext(c);vm.runInContext(source,c);
  assert.equal(c.isLowerThirdLayout({mode:'full'}),true);
  assert.equal(c.isLowerThirdLayout({mode:'full',sanctuaryTheme:{obsModeRule:'always_full'}}),false);
  assert.equal(c.isLowerThirdLayout({contentType:'media'}),false);
  assert.equal(c.isLowerThirdLayout({contentType:'countdown'}),false);
  c.isSanctuary=true;assert.equal(c.isLowerThirdLayout({mode:'full'}),false);
  c.isSanctuary=false;c.isStage=true;assert.equal(c.isLowerThirdLayout({mode:'lt'}),false);
});
test('embedded transparent lower thirds show an alpha checkerboard', () => {
  const result = render({ embedded: true, lowerThird: true, transparent: true });
  assert.match(result.root.background, /repeating-conic-gradient/);
  assert.equal(result.body.background, result.root.background);
});
test('actual OBS/vMix outputs retain transparent backgrounds without a checkerboard', () => {
  const result = render({ embedded: false, lowerThird: true, transparent: true });
  assert.equal(result.root.background, 'transparent');
  assert.equal(result.body.background, 'transparent');
});
test('opaque stream and full-screen previews preserve the output background', () => {
  for (const options of [{ lowerThird: true, transparent: false }, { lowerThird: false, transparent: true }]) {
    const result = render({ embedded: true, ...options });
    assert.equal(result.root.background, '#172033');
    assert.equal(result.body.background, '#172033');
  }
});
test('preview targets never mutate the live layout', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const start = app.indexOf('function setPreviewTargetMode(');
  const source = app.slice(start, app.indexOf('\n}', start) + 2);
  const state = { currentMode: 'full', isHoldLive: false };
  const modes = [];
  const c = { state, REMOTE_MODE: false, window: {setStreamLayout(mode) {state.currentMode = mode; modes.push(mode);}},
    localStorage: { setItem() {} }, document: { getElementById: () => null } };
  vm.createContext(c);
  vm.runInContext(source, c);
  c.setPreviewTargetMode('livestream');
  assert.equal(state.currentMode, 'full');
  assert.deepEqual(modes, []);
  c.setPreviewTargetMode('sanctuary');
  assert.equal(state.currentMode, 'full');
  assert.equal(modes.length, 0);
  for (const blocked of ['isHoldLive','REMOTE_MODE']) {
    state.currentMode = 'full';
    if (blocked === 'isHoldLive') state.isHoldLive = true;
    else {state.isHoldLive = false; c.REMOTE_MODE = true;}
    c.setPreviewTargetMode('livestream');
    assert.equal(c.window.previewTargetMode, 'livestream');
    assert.equal(state.currentMode, 'full');
    assert.equal(modes.length, 0);
  }
});
test('output tab switching uses resident frames without navigating or recreating them', () => {
  const source = fs.readFileSync(require.resolve('../js/output-preview.js'), 'utf8');
  const frames = [], navigations = [];
  const hosts = new Map(['bento-single-prev-wrap','bento-dual-sanctuary','bento-dual-livestream'].map(id => [id,
    {clientWidth:320,clientHeight:180,classList:{add(){}},append(frame){frames.push(frame);}}]));
  const window = {previewTargetMode:'sanctuary'};
  const c = {window, document:{hidden:true,getElementById:id=>hosts.get(id),createElement() {
    const frame = {style:{},contentWindow:{LATEST_STATE:{_timestamp:123,streamAppearance:{bottomFade:true},isLexicon:true,lexiconData:{id:'G1'}},applyState(payload){this.LATEST_STATE=payload;}}};
    Object.defineProperty(frame,'src',{get(){return this.url;},set(value){this.url=value;navigations.push(value);}});
    return frame;
  }}, BroadcastChannel:class {postMessage(){}}, ResizeObserver:class {observe(){}},setInterval(){}};
  vm.runInNewContext(source,c);
  assert.equal(frames.length,4);
  assert.equal(navigations.length,4);
  for (const target of ['livestream','sanctuary','dual','sanctuary','livestream']) {
    window.previewTargetMode=target;
    window.syncOutputPreviews();
    assert.equal(frames[0].hidden,target!=='sanctuary');
    assert.equal(frames[1].hidden,target==='sanctuary');
    assert.equal(navigations.length,4);
    assert.equal(frames.length,4);
  }
  window.updateOutputPreviews({slideId:'bible_Genesis_1_29',text:'Verse 29',contentType:'bible',_operatorRequestId:'request29'});
  for (const frame of frames) {
    assert.equal(frame.contentWindow.LATEST_STATE.text,'Verse 29');
    assert.equal(frame.contentWindow.LATEST_STATE.streamAppearance.bottomFade,true);
    assert.equal(frame.contentWindow.LATEST_STATE._timestamp,undefined);
    assert.equal(frame.contentWindow.LATEST_STATE.isLexicon,false);
    assert.equal(frame.contentWindow.LATEST_STATE.lexiconData,null);
    assert.equal(frame.contentWindow.pendingOperatorPreview.id,'request29');
  }
  window.updateOutputPreviews({clear:true});
  assert(frames.every(frame=>frame.contentWindow.LATEST_STATE.clear));
  assert.equal(navigations.length,4,'Local slide updates never reload preview frames');
});

test('late server preview snapshots cannot replace a pending operator selection', () => {
  const start=html.indexOf('function applyState(raw)');
  const source=html.slice(start,html.indexOf("if (raw.type === 'sanctuary_theme_sync')",start))+'return true; }';
  const c={window:{pendingOperatorPreview:{id:'request30',startedAt:Date.now()}},lastProcessedTimestamp:0};
  vm.createContext(c);vm.runInContext(source,c);
  assert.equal(c.applyState({_timestamp:10,_operatorRequestId:'request29'}),undefined);
  assert.equal(c.window.pendingOperatorPreview.id,'request30');
  assert.equal(c.applyState({_timestamp:11,_operatorRequestId:'request30'}),true);
  assert.equal(c.window.pendingOperatorPreview,null);
});
