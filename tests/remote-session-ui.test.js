'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const response = (data, status = 200) => ({ ok:status < 400, status, json:async () => data });
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(extra = '') {
  const nodes = {
    'remote-lock-overlay':{style:{display:'flex'}},
    'operator-join-modal-backdrop':{style:{display:'none'}},
    'operator-join-error':{style:{}},
    'operator-pairing-code':{value:'123456',focus(){},select(){}},
    'operator-join-submit-btn':{style:{}},
    'hub-toggle-session-btn':{style:{}},
    'session-start-stop-btn':{style:{}}
  };
  const messages = [];
  const counters = { joins:0, opens:0, controls:0, closes:0 };
  const context = vm.createContext({
    window:{sfOperatorPaired:false}, REMOTE_MODE:true,
    AbortController, AbortSignal, setTimeout, clearTimeout,
    operatorJoinController:null, remoteLiveEventSource:null, remoteSessionGeneration:0, remoteSessionRevision:-1, pairingRetryUntil:0,
    document:{getElementById:id => nodes[id]}, console:{error(){}},
    controlEventSource:{close:() => counters.closes++}, currentOperatorSse:null, operatorJoinRequest:null,
    showToast:(message, kind) => messages.push({message,kind}),
    openOperatorJoinModal:() => { counters.opens++; nodes['operator-join-modal-backdrop'].style.display = 'flex'; },
    closeOperatorJoinModal:() => { nodes['operator-join-modal-backdrop'].style.display = 'none'; },
    joinAndSyncOperatorSession:() => counters.joins++,
    initRemoteControl:() => counters.controls++, initRemoteLiveStream(){},
    getOrCreateDeviceId:() => 'device', getSavedOperatorName:() => 'Operator', updateOperatorHeaderUI(){},
    applyHostPushedCatalog(){}, applyHostSpeechAiUpdate(){},
    sessionPanelState:{enabled:false,operatorUrl:null}, isRemoteServerActive:false, customLanIp:'',
    getRemoteControlUrl:() => '/remote', syncRemoteCatalog(){}, updateRemoteSessionHeaderUI(){}, renderSessionPanel(){}
  });
  vm.runInContext(section('function setRemoteSessionLocked(', 'function applyHostSpeechAiUpdate(') + extra, context);
  return {context,nodes,messages,counters};
}

test('remote operator sees pairing instead of offline when the host starts', () => {
  const {context,nodes,counters} = harness();
  context.syncRemoteOperatorSession({enabled:false,paired:false});
  assert.equal(nodes['remote-lock-overlay'].style.display, 'flex');
  context.syncRemoteOperatorSession({enabled:true,paired:false});
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
  assert.equal(nodes['operator-join-modal-backdrop'].style.display, 'flex');
  context.syncRemoteOperatorSession({enabled:true,paired:false});
  assert.equal(counters.opens, 1);
  assert.equal(counters.joins, 0, 'Background polling must not attempt pairing without a code');
});

test('remote operator restores a paired device and requires a new pairing after host restart', () => {
  const {context,nodes,counters} = harness();
  context.syncRemoteOperatorSession({enabled:true,paired:true});
  assert.equal(counters.joins, 1);
  context.window.sfOperatorPaired = true;
  context.syncRemoteOperatorSession({enabled:false,paired:false});
  assert.equal(context.window.sfOperatorPaired, false);
  assert.equal(nodes['remote-lock-overlay'].style.display, 'flex');
  context.syncRemoteOperatorSession({enabled:true,paired:false});
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
  assert.equal(counters.joins, 1);
});

test('remote operator permission denial does not lock an active studio', async () => {
  const {context,nodes,messages,counters} = harness(section('function sendRemoteCommand(', '// Sidebar Search Filter'));
  nodes['remote-lock-overlay'].style.display = 'none';
  context.window.sfOperatorPaired = true;
  context.fetch = async () => response({error:'The host has not allowed projection'},403);
  context.sendRemoteCommand({type:'PROJECT'});
  await tick();
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
  assert.equal(context.window.sfOperatorPaired, true);
  assert.equal(counters.opens, 0);
  assert.equal(messages[0].message, 'The host has not allowed projection');
});

test('remote operator lost pairing opens the code form without falsely reporting offline', async () => {
  const {context,nodes,messages} = harness(section('function sendRemoteCommand(', '// Sidebar Search Filter'));
  context.fetch = async route => route === '/api/session'
    ? response({enabled:true,paired:false}) : response({pairingRequired:true},403);
  context.sendRemoteCommand({type:'PROJECT'});
  await tick();
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
  assert.equal(nodes['operator-join-modal-backdrop'].style.display, 'flex');
  assert(messages.every(item => !item.message.includes('not been started')));
});

test('remote operator joins only once during overlapping connection checks', async () => {
  const {context,nodes,counters} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  let finish;
  let requests = 0;
  context.fetch = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
  const first = context.joinAndSyncOperatorSession();
  assert.equal(context.joinAndSyncOperatorSession(), first);
  context.syncRemoteOperatorSession({enabled:true,paired:false});
  assert.equal(counters.opens, 0, 'An older poll must not interrupt pairing in progress');
  finish(response({operatorId:'operator',name:'Operator'}));
  await first;
  assert.equal(requests, 1);
  assert.equal(context.window.sfOperatorPaired, true);
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
  assert.equal(counters.controls, 1);
});

test('remote operator offline join stays locked and does not show a pairing error', async () => {
  const {context,nodes,counters} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  context.fetch = async () => response({sessionOffline:true,error:'Session not active'},403);
  await context.joinAndSyncOperatorSession();
  assert.equal(nodes['remote-lock-overlay'].style.display, 'flex');
  assert.equal(counters.opens, 0);
});

test('remote host failed start and stop preserve the actual session state', async () => {
  const {context,messages} = harness(section('async function toggleSession(', 'function updateRemoteSessionHeaderUI('));
  context.REMOTE_MODE = false;
  context.fetch = async () => response({error:'Access denied'},403);
  await context.toggleSession();
  assert.equal(context.sessionPanelState.enabled, false);
  assert.equal(context.isRemoteServerActive, false);
  context.sessionPanelState.enabled = true;
  await context.toggleSession();
  assert.equal(context.sessionPanelState.enabled, true);
  assert.equal(context.isRemoteServerActive, true);
  assert(messages.every(item => item.kind === 'warning'));
});


test('late join success cannot unlock a stopped session or clear a newer join', async () => {
  const {context,nodes,counters} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  let finish;
  context.fetch = () => new Promise(resolve => { finish = resolve; });
  const old = context.joinAndSyncOperatorSession();
  const oldFinish = finish;
  context.syncRemoteOperatorSession({enabled:false,paired:false,revision:2});
  assert.equal(context.operatorJoinRequest, null);
  context.syncRemoteOperatorSession({enabled:true,paired:false,revision:3});
  const current = context.joinAndSyncOperatorSession();
  oldFinish(response({operatorId:'old',revision:1}));
  await old;
  assert.equal(context.window.sfOperatorPaired, false);
  assert.equal(context.operatorJoinRequest, current);
  assert.equal(counters.controls, 0);
  finish(response({operatorId:'current',revision:3}));
  await current;
  assert.equal(context.window.sfOperatorPaired, true);
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
});

test('older session polls cannot undo the current pairing state', () => {
  const {context,nodes} = harness();
  context.remoteSessionRevision = 5;
  context.window.sfOperatorPaired = true;
  nodes['remote-lock-overlay'].style.display = 'none';
  context.syncRemoteOperatorSession({enabled:false,paired:false,revision:4});
  assert.equal(context.window.sfOperatorPaired, true);
  assert.equal(nodes['remote-lock-overlay'].style.display, 'none');
});

test('rapid host Start clicks make one request and immediately disable both controls', async () => {
  const {context,nodes} = harness(section('async function toggleSession(', 'function updateRemoteSessionHeaderUI('));
  context.REMOTE_MODE = false;
  let finish, requests = 0;
  context.fetch = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
  const first = context.toggleSession();
  await context.toggleSession();
  assert.equal(requests, 1);
  assert.equal(nodes['session-start-stop-btn'].disabled, true);
  assert.equal(nodes['hub-toggle-session-btn'].disabled, true);
  finish(response({success:true,enabled:true}));
  await first;
  assert.equal(context.sessionPanelState.enabled, true);
  assert.equal(nodes['session-start-stop-btn'].disabled, false);
  assert.equal(nodes['hub-toggle-session-btn'].disabled, false);
});

test('malformed pairing codes do not consume a server attempt', async () => {
  const {context,nodes} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  context.fetch = () => { throw new Error('Must not send malformed codes'); };
  for (const code of ['', '12345', 'abcdef', '1234567']) {
    nodes['operator-pairing-code'].value = code;
    await context.joinAndSyncOperatorSession('Operator');
    assert.match(nodes['operator-join-error'].textContent, /six-digit/);
    assert.equal(context.operatorJoinRequest, null);
  }
});

test('pairing lockout explains the retry delay and prevents another attempt', async () => {
  const {context,nodes} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  let requests = 0;
  context.fetch = async () => { requests++; return response({pairingRequired:true,error:'Too many incorrect codes.',retryAfter:60},429); };
  await context.joinAndSyncOperatorSession('Operator');
  assert.match(nodes['operator-join-error'].textContent, /60 seconds/);
  await context.joinAndSyncOperatorSession('Operator');
  assert.equal(requests, 1);
});

test('pairing timeout releases the pending join and offers a working retry', async () => {
  const {context,nodes} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  let expire;
  context.setTimeout = fn => { expire = fn; return 1; };
  context.clearTimeout = () => {};
  context.fetch = (_url, options) => new Promise((_resolve,reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  const first = context.joinAndSyncOperatorSession('Operator');
  assert.equal(nodes['operator-join-submit-btn'].disabled, true);
  expire();
  await first;
  assert.equal(context.operatorJoinRequest, null);
  assert.equal(nodes['operator-join-submit-btn'].disabled, false);
  assert.match(nodes['operator-join-error'].textContent, /timed out/);
  context.fetch = async () => response({operatorId:'retry'});
  await context.joinAndSyncOperatorSession('Operator');
  assert.equal(context.window.sfOperatorPaired, true);
});

test('late command success cannot remove a stopped-session lock', async () => {
  const {context,nodes} = harness(section('function sendRemoteCommand(', '// Sidebar Search Filter'));
  let finish;
  context.fetch = () => new Promise(resolve => { finish = resolve; });
  context.sendRemoteCommand({type:'PROJECT'});
  context.syncRemoteOperatorSession({enabled:false,revision:2});
  finish(response({success:true}));
  await tick();
  assert.equal(nodes['remote-lock-overlay'].style.display, 'flex');
});

test('remote live stream refreshes state after pairing and clears highlights without rebuilding', async () => {
  const {context,counters} = harness(section('function initRemoteLiveStream(', 'let currentOperatorSse'));
  const streams = [];
  context.window.EventSource = context.EventSource = class {
    constructor(url) { this.url = url; streams.push(this); }
    close() { this.closed = true; }
  };
  context.window.sfOperatorPaired = true;
  context.remoteSessionRevision = 7;
  context.state = {activeLiveSlideId:'old',activeLiveText:'old',activeLiveRef:'old'};
  context.updateActiveSlideVisuals = () => counters.visuals = (counters.visuals || 0) + 1;
  context.updateLivePreview = () => {};
  context.renderDeck = () => { throw new Error('Clear must not rebuild the deck'); };
  context.fetch = async () => response({clear:true});
  context.initRemoteLiveStream();
  assert.match(streams[0].url, /operatorSession=7/);
  streams[0].onopen();
  await tick();
  assert.equal(context.state.activeLiveSlideId, null);
  assert.equal(counters.visuals, 1);
  context.resetRemoteOperatorConnection();
  streams[0].onmessage({data:'{"clear":true}'});
  assert.equal(counters.visuals, 1, 'Closed streams must not apply queued events');
  assert.equal(streams[0].closed, true);
});

test('duplicate catalog snapshots render once and an empty host library clears stale songs', () => {
  const {context,counters} = harness(section('function applyHostPushedCatalog(', 'function renderAiHud('));
  context.SONGS_DATABASE = [];
  context.BIBLE_DATABASE = {};
  context.state = {agendaItems:[]};
  context.ensureActiveSong = context.renderAgenda = context.renderLibrary = context.syncDashboardWorkspace = () => {};
  context.renderDeck = () => counters.decks = (counters.decks || 0) + 1;
  const catalog = {songs:[{id:'one',title:'One'}],agendaItems:[],bible:{}};
  context.applyHostPushedCatalog(catalog);
  context.applyHostPushedCatalog(catalog);
  assert.equal(counters.decks, 1);
  context.applyHostPushedCatalog({songs:[],agendaItems:[]});
  assert.equal(context.SONGS_DATABASE.length, 0);
  assert.equal(counters.decks, 2);
});

test('real pairing opener is visible and closing immediately releases the inert dashboard', () => {
  let initialize, observer, context, modal;
  class Element {
    constructor(id, isModal=false) {
      this.id=id;this.isModal=isModal;this.style={display:isModal?'none':''};this.dataset={};this.attributes={};this.classes=new Set();
      this.classList={contains:key=>this.classes.has(key),add:key=>this.classes.add(key),remove:key=>this.classes.delete(key)};
    }
    matches(selector) { return this.isModal && selector.includes('.modal-backdrop'); }
    querySelectorAll(selector) { return this.id==='body' && selector.startsWith('.modal-backdrop') ? [modal] : []; }
    querySelector() { return null; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    setAttribute(key,value) { this.attributes[key]=value; }
    hasAttribute(key) { return key in this.attributes; }
    contains(element) { return element===this || (this.isModal && element.id==='operator-pairing-code'); }
    closest() { return null; }
    getClientRects() { return [{}]; }
    focus() { context.document.activeElement=this; }
    select() {}
  }
  modal = new Element('operator-join-modal-backdrop',true);
  const background = new Element('dashboard'), body = new Element('body');
  body.children=[background,modal];
  const input=new Element('operator-join-name-input'), code=new Element('operator-pairing-code');
  const nodes={'operator-join-modal-backdrop':modal,'operator-join-name-input':input,'operator-pairing-code':code};
  context=vm.createContext({Element,window:{addEventListener(){}},document:{body,activeElement:background,getElementById:id=>nodes[id],addEventListener(type,fn){if(type==='DOMContentLoaded')initialize=fn;}},getSavedOperatorName:()=> 'Operator',getComputedStyle:()=>({visibility:'visible'}),MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/accessibility.js'),'utf8'),context);
  initialize();
  vm.runInContext(section('function openOperatorJoinModal(', 'function openOperatorRenameModal('),context);
  context.openOperatorJoinModal();
  assert.equal(modal.classList.contains('open'),true);
  assert.equal(modal.style.display,'flex');
  assert.equal(background.inert,true);
  assert.equal(context.document.activeElement,code);
  context.closeOperatorJoinModal();
  assert.equal(modal.classList.contains('open'),false);
  assert.equal(modal.style.display,'none');
  assert.equal(background.inert,false, 'Release must happen before MutationObserver runs');
  observer([{type:'attributes',target:modal}]);
  assert.equal(background.inert,false);
});


test('poll started before pairing cannot reopen the pairing dialog after success', async () => {
  const {context,nodes} = harness(section('function showOperatorJoinError(', '// Clean up operator presence'));
  let finishPoll;
  context.remoteSessionRevision = 10;
  context.fetch = async url => url === '/api/session'
    ? new Promise(resolve => { finishPoll = resolve; })
    : response({operatorId:'current',revision:10});
  const poll = context.refreshRemoteOperatorSession();
  await context.joinAndSyncOperatorSession('Operator');
  assert.equal(context.window.sfOperatorPaired,true);
  finishPoll(response({enabled:true,paired:false,revision:10}));
  await poll;
  assert.equal(context.window.sfOperatorPaired,true);
  assert.equal(nodes['operator-join-modal-backdrop'].style.display,'none');
});
