'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');

test('transition testing delivers both slides only to an isolated preview, preserving live state',()=>{
  const messages=[],tabs=[];
  const frame={dataset:{},getAttribute:()=>null,contentWindow:{postMessage:(message,origin)=>messages.push({message,origin})}};
  const nodes={'transition-preview-frame':frame,'transition-preview':{hidden:true},'display-advanced-settings':{open:false},'settings-modal-backdrop':{classList:{contains:()=>true}}};
  const state={activeLiveSlideId:'song_live',activeLiveText:'Keep this live',transitionType:'slide-left',transitionDuration:800,textAutoScale:false};
  const before={...state};
  const context={state,document:{getElementById:id=>nodes[id]},location:{origin:'https://host.test'},
    window:{themeManager:{getSanctuaryPayload:()=>({font:'Inter'})}},openSettingsToTab:tab=>tabs.push(tab),
    requestAnimationFrame:fn=>fn(),broadcastState:()=>assert.fail('Preview must never broadcast'),projectSlide:()=>assert.fail('Preview must never project')};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let transitionPreviewTimestamp'),source.indexOf('function updateMaxLinesSetting')),context);
  context.testLiveTransitionEffect();
  assert.equal(frame.src,'display.html?target=sanctuary&embedded=1&draft=1');
  assert.equal(messages.length,0,'wait for the isolated renderer to load');
  frame.onload();
  assert.deepEqual(tabs,['display']);
  assert.equal(nodes['display-advanced-settings'].open,true);
  assert.equal(nodes['transition-preview'].hidden,false);
  assert.deepEqual(state,before);
  assert.equal(messages.length,2);
  assert.equal(messages[0].message.payload.transitionType,'cut');
  assert.equal(messages[1].message.payload.transitionType,'slide-left');
  assert.equal(messages[1].message.payload.transitionDuration,800);
  assert.equal(messages[1].message.payload.textAutoScale,false);
  assert.equal(messages[1].origin,'https://host.test');
  context.testLiveTransitionEffect();
  assert.equal(messages.length,4,'the resident renderer can replay the preview');
  assert.deepEqual(state,before);
});

test('display controls reflect actual settings rather than static HTML defaults',()=>{
  const ids=['setting-auto-shrink-toggle','setting-max-lines-select','setting-concordance-style','setting-concordance-mode','setting-concordance-position'];
  const fields=Object.fromEntries(ids.map(id=>[id,{id}])),synced=[];
  const state={textAutoScale:false,maxLinesPerSlide:0,concordanceStyle:'classic',concordanceDisplayMode:'auto',concordancePosition:'left'};
  const context={state,document:{getElementById:id=>fields[id]},window:{syncCustomSelect:field=>synced.push(field.id)}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function syncDisplaySettingsUI()'),source.indexOf('function syncSongSettingsUI()')),context);
  context.syncDisplaySettingsUI();
  assert.equal(fields[ids[0]].checked,false);
  assert.equal(fields[ids[1]].value,'0');
  assert.equal(fields[ids[2]].value,'classic');
  assert.equal(fields[ids[3]].value,'auto');
  assert.equal(fields[ids[4]].value,'left');
  assert.deepEqual(synced,ids.slice(1));
});
