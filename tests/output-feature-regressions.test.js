const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const display = fs.readFileSync(require.resolve('../display.html'), 'utf8');
function functionSource(source, name) {
  const start = source.indexOf('function ' + name + '(');
  const brace = source.indexOf('{', source.indexOf(')', start));
  // Functions under test end at their original indentation level.
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start).match(/^ */)[0];
  const end = source.indexOf('\n' + indent + '}', brace);
  return source.slice(start, end + indent.length + 2);
}
test('real broadcast permits alert dismissal during Hold and preserves transmitted slide', () => {
  const sent = [];
  const c = { REMOTE_MODE:false, state:{isHoldLive:true}, window:{},
    pendingLiveStorage:{text:'Held lyric',slideId:'song_1_0',clear:true,blackout:true},
    liveStorageTimer:null, liveStateHydrated:true, flushCommittedLiveStorage(){}, createDashboardSnapshot:()=>({}),getNextSlideAnticipation:()=>null,
    clearTimeout(){},setTimeout(){},syncChannel:{postMessage:p=>sent.push(p)},fetch:()=>Promise.resolve(),Date };
  vm.runInNewContext(functionSource(app,'broadcastState') + ';broadcastState({alert:{active:false,text:""}},true);',c);
  assert.equal(sent.length,1);
  assert.equal(sent[0].text,'Held lyric');
  assert.equal(sent[0].clear,true);
  assert.equal(sent[0].blackout,true);
  assert.equal(sent[0].alert.active,false);
});

test('announcement broadcast updates host previews directly and sends the actual remote alert', () => {
  const previews = [], commands = [], sent = [];
  const alert = { active: true, text: 'Welcome', position: 'fullscreen', background: { bgCss: '#123456' } };
  const c = { REMOTE_MODE: false, state: { isHoldLive: true }, window: { updateOutputPreviews: payload => previews.push(payload) },
    pendingLiveStorage: { clear: true, text: '', reference: '', alert: null }, liveStateHydrated: true,
    liveStorageTimer: null, flushCommittedLiveStorage() {}, createDashboardSnapshot: () => ({}), getNextSlideAnticipation: () => null,
    clearTimeout() {}, setTimeout() {}, syncChannel: { postMessage: payload => sent.push(payload) }, fetch: () => Promise.resolve(),
    sendRemoteCommand: command => commands.push(command), Date };
  vm.createContext(c);
  vm.runInContext(functionSource(app, 'updateLivePreview') + '\n' + functionSource(app, 'broadcastState'), c);
  c.broadcastState({ alert });
  assert.equal(previews[0].clear, true);
  assert.equal(previews[0].alert, alert);
  assert.equal(sent[0].alert, previews[0].alert);
  c.REMOTE_MODE = true; c.broadcastState({ alert });
  assert.equal(commands[0].type, 'ALERT_UPDATE');
  assert.equal(commands[0].alert, alert);
  assert.equal(previews.at(-1).alert, alert);
});

test('full-screen announcement backgrounds render on cleared output and stop videos on dismissal', () => {
  const elements = {};
  for (const id of ['live-alert-container', 'live-alert-content', 'live-alert-tag', 'live-alert-text-wrap', 'live-alert-background', 'live-alert-background-video', 'live-alert-background-dimmer']) {
    elements[id] = { className: '', style: {}, dataset: {}, attributes: {}, textContent: '',
      getAttribute(key) { return this.attributes[key]; }, setAttribute(key, value) { this.attributes[key] = value; } };
  }
  let plays = 0, pauses = 0;
  const video = elements['live-alert-background-video']; video.play = () => { plays++; return Promise.resolve(); }; video.pause = () => pauses++;
  const c = { liveAlertExpiryTimer: null, clearTimeout() {}, setTimeout() {}, Date,
    isSanctuary: true, isObs: false, isStage: false, isExplicitLt: false, targetType: 'sanctuary', stageServiceTimer: {},
    window: {}, document: { getElementById: id => elements[id], body: { classList: { add() {}, remove() {} } } },
    isLowerThirdLayout: () => false, applySanctuaryTheme() {}, ensureAlphaTransparent() {}, lastProcessedTimestamp: 0, lastRenderedKey: '',
    container: { classList: { contains: () => false, remove() {} } }, standbyEl: null, activeSlotIndex: 0,
    slots: [0, 1].map(() => ({ el: { getAttribute: () => null, removeAttribute() {} }, box: {} })) };
  vm.createContext(c); vm.runInContext(functionSource(display, 'applyLiveAlert') + '\n' + functionSource(display, 'applyState'), c);
  const alert = { active: true, text: 'Welcome', position: 'fullscreen', destinations: { sanctuary: true },
    background: { id: 'image', type: 'image', imageUrl: 'Themes/gold.webp', dimmer: 30, textColor: '#fff8e0', font: 'Outfit' } };
  c.applyState({ clear: true, text: '', alert });
  assert.equal(elements['live-alert-container'].className, 'active alert-fullscreen');
  assert.equal(elements['live-alert-background'].style.background, '#10131b', 'opaque fallback remains beneath the image');
  assert.equal(elements['live-alert-background'].style.backgroundImage, 'url("Themes/gold.webp")');
  assert.equal(elements['live-alert-background-dimmer'].style.opacity, '0.3');
  assert.equal(elements['live-alert-text-wrap'].style.color, '#fff8e0');
  c.applyState({ clear: true, text: '', alert, songScaleFull: 4.4 });
  assert.equal(elements['live-alert-text-wrap'].dataset.textScale, '2', 'announcement receives the song scale through the real output renderer');
  c.applyLiveAlert({ ...alert, background: { type: 'video', videoUrl: 'Themes/motion.webm' } });
  assert.equal(video.src, 'Themes/motion.webm'); assert.equal(plays, 1);
  c.applyLiveAlert({ ...alert, background: { type: 'video', videoUrl: 'Themes/motion.webm' } });
  assert.equal(plays, 1, 'repeated state must not restart a motion background');
  c.applyLiveAlert(null);
  assert.equal(elements['live-alert-container'].className, '');
  assert.equal(video.style.display, 'none'); assert.ok(pauses > 0);
});
test('real stage renderer treats imported markup as text', () => {
  const els={};
  vm.runInNewContext(functionSource(display,'applyStageState')+';applyStageState({text:"<b>Lyric</b>\\nNext line"});',{
    isStage:true,document:{getElementById:id=>els[id]||(els[id]={classList:{add(){},remove(){}}})}
  });
  assert.equal(els['stage-current-slide-text'].textContent,'<b>Lyric</b>\nNext line');
  assert.equal(els['stage-current-slide-text'].innerHTML,undefined);
});
test('real output handles theme-only and SSE theme updates without clearing or replaying slides', () => {
  const themes=[],alerts=[];
  const c={isStage:false,stageServiceTimer:{},applyLiveAlert:a=>alerts.push(a),applySanctuaryTheme:t=>themes.push(t),
    isLowerThirdLayout:()=>false,lastProcessedTimestamp:1,
    window:{LATEST_STATE:null,applyStreamAppearance(){}},document:{getElementById:()=>null},slots:[],ensureAlphaTransparent(){},
    lastRenderedKey:'s|text|ref||full|0|1|2.2|1.4|0|0|false|false|undefined|undefined',container:{classList:{contains:()=>true}}};
  vm.createContext(c);vm.runInContext(functionSource(display,'applyState'),c);
  c.applyState({type:'sanctuary_theme_sync',sanctuaryTheme:{id:'one'}});
  assert.equal(alerts.length,0);
  c.applyState({slideId:'s',text:'text',reference:'ref',mode:'full',_timestamp:2,sanctuaryTheme:{id:'two'}});
  assert.deepEqual(themes.map(t=>t.id),['one','two']);
  c.applyState({_timestamp:1,alert:{active:true}});
  assert.equal(alerts.length,1,'stale state cannot restore dismissed alerts');
});
test('microphone status preserves projected songs and Bible verses until an explicit clear', () => {
  for (const contentType of ['song', 'bible']) {
    const visible = new Set();
    const classes = { contains:key=>visible.has(key), add:key=>visible.add(key), remove:key=>visible.delete(key) };
    const slot = () => ({ el:{className:'slide-slot',getAttribute:()=>null,removeAttribute(){}},box:{} });
    const alerts = [];
    const c = { isStage:false,isSanctuary:true,isExplicitLt:false,targetType:'sanctuary',stageServiceTimer:{},
      applyLiveAlert:alert=>alerts.push(alert),applySanctuaryTheme(){},isLowerThirdLayout:()=>false,
      window:{},document:{getElementById:()=>null,documentElement:{style:{setProperty(){}}},
        body:{classList:{add(){},remove(){}}}},
      slots:[slot(),slot()],activeSlotIndex:0,standbyEl:null,container:{classList:classes},
      ensureAlphaTransparent(){},lastProcessedTimestamp:0,lastRenderedKey:'',transitionTimer:null,
      populateSlot:(slot,data)=>slot.text=data.text,applyTargetMode:()=>visible.add('visible'),
      clearTimeout(){},Date };
    vm.createContext(c);vm.runInContext(functionSource(display,'applyState'),c);
    const live = { slideId:contentType+'_live',contentType,text:'Projected text',reference:'Live reference',
      mode:'full',transitionType:'cut',transitionDuration:0,_timestamp:100,alert:{active:true,text:'Welcome'} };
    c.applyState(live);
    assert.equal(visible.has('visible'),true);
    const renderedKey = c.lastRenderedKey;
    for (const event of [
      {type:'SPEECH_AI_UPDATE',audioLevel:50},
      {type:'SPEECH_AI_UPDATE',transcript:'Spoken words',hostSpeechState:{isListening:true}},
      {type:'SPEECH_AI_UPDATE',status:'idle',isListening:false,_timestamp:200}
    ]) c.applyState(event);
    assert.equal(visible.has('visible'),true,'speech status must not hide the slide');
    assert.equal(c.window.LATEST_STATE,live);
    assert.equal(c.lastRenderedKey,renderedKey);
    assert.equal(c.lastProcessedTimestamp,100,'status timestamps must not supersede live state');
    assert.equal(alerts.length,1,'status updates must not dismiss the live announcement');
    assert.equal(c.slots[0].el.className,'slide-slot active');
    assert.equal(c.slots[0].text,'Projected text');
    c.applyState({...live,text:'',reference:'',clear:true,_timestamp:101});
    assert.equal(visible.has('visible'),false,'an explicit clear must still hide the slide');
  }
});
test('draft frames never poll committed state through the output watchdog', () => {
  const start=display.indexOf('    // High-Frequency Realtime Watchdog');
  const end=display.indexOf('    window.applyState = applyState;',start);
  let callback,requests=0,applied=0;
  const context={isDraftPreview:true,window:{location:{protocol:'http:',origin:'http://localhost'}},
    outputStreamConnected:false,setInterval:fn=>callback=fn,
    fetch:()=>{requests++;return Promise.resolve({json:()=>Promise.resolve({_timestamp:2})});},
    applyState:()=>applied++,lastProcessedTimestamp:1,lastRenderedKey:''};
  vm.runInNewContext(display.slice(start,end),context);
  callback();
  assert.equal(requests,0);assert.equal(applied,0);
  context.isDraftPreview=false;callback();assert.equal(requests,1);
});
test('monitor defaults are distinct and manual choices survive refresh', async () => {
  const select=()=>({value:'',replaceChildren(){this.value=''},appendChild(){}});
  const audience=select(),stage=select();
  const c={window:{desktopApi:{getDisplays:async()=>[1,2,3].map(id=>({id,isPrimary:id===1,bounds:{width:1920,height:1080}}))}},
    localStorage:{getItem:()=>null,setItem(){}},console,
    document:{getElementById:id=>id==='desktop-display-select'?audience:stage,createElement:()=>({})}};
  vm.createContext(c);vm.runInContext('async '+functionSource(app,'refreshDesktopDisplays'),c);
  await c.refreshDesktopDisplays();assert.equal(audience.value,'2');assert.equal(stage.value,'3');
  audience.value='3';stage.value='2';await c.refreshDesktopDisplays();
  assert.equal(audience.value,'3');assert.equal(stage.value,'2');
});
test('service timer supports start, pause, resume and reset through real controls', () => {
  let now=1000;const state={};const patches=[];
  const start=app.indexOf('window.controlServiceTimer = function');
  const end=app.indexOf('\n};',start)+3;
  const c={window:{},state,Date:{now:()=>now},broadcastState:p=>patches.push(p)};
  vm.runInNewContext(app.slice(start,end),c);
  c.window.controlServiceTimer('start');now=6000;c.window.controlServiceTimer('pause');
  assert.equal(state.serviceTimer.elapsed,5000);
  now=9000;c.window.controlServiceTimer('start');now=10000;c.window.controlServiceTimer('pause');
  assert.equal(state.serviceTimer.elapsed,6000);
  c.window.controlServiceTimer('reset');assert.equal(state.serviceTimer.elapsed,0);
  assert.equal(patches.length,5);
});
test('medley projection activates the matching song once and preserves overrides within it', () => {
  const applied=[];const state={};
  const c={state,window:{SONGS_DATABASE:[{id:'song_1'},{id:'custom_song_20'}]},applySongBoundTheme:(id,defer)=>{applied.push([id,defer]);state.boundThemeSongId=id}};
  vm.createContext(c);vm.runInContext(functionSource(app,'applyProjectedSongTheme'),c);
  c.applyProjectedSongTheme('medley_song_1_0');
  c.applyProjectedSongTheme('medley_song_1_1');
  c.applyProjectedSongTheme('medley_custom_song_20_0_c1');
  assert.deepEqual(applied,[['song_1',true],['custom_song_20',true]]);
  assert.match(functionSource(app,'projectSlide'),/applyProjectedSongTheme\(slideId\)/);
});
test('real announcement renderer loops edge tickers, applies speed and stops instantly', () => {
  const styles={};const elements={
    'live-alert-container':{className:'',style:{setProperty:(k,v)=>styles[k]=v}},
    'live-alert-content':{textContent:'',scrollWidth:1700},'live-alert-tag':{textContent:''}
  };
  const c={liveAlertExpiryTimer:null,clearTimeout(){},setTimeout(){},document:{getElementById:id=>elements[id]},isSanctuary:true,isObs:false,isStage:false};
  vm.createContext(c);vm.runInContext(functionSource(display,'applyLiveAlert'),c);
  c.applyLiveAlert({active:true,text:'Welcome',position:'upperthird',loop:false,speed:'normal'});
  assert.match(elements['live-alert-container'].className,/alert-upper-third alert-marquee/);
  assert.equal(styles['--ticker-duration'],'20s');
  c.applyLiveAlert({active:false});assert.equal(elements['live-alert-container'].className,'');
  assert.equal(elements['live-alert-content'].textContent,'');
});

test('full-screen announcement covers output without a ticker and releases it on expiry', () => {
  const elements = {
    'live-alert-container': { className: '', style: {} },
    'live-alert-content': { textContent: '' },
    'live-alert-tag': { textContent: '' },
    'live-alert-text-wrap': { style: {}, dataset: {} }
  };
  let expiry, fits = 0;
  const c = { liveAlertExpiryTimer: null, clearTimeout() {}, setTimeout(fn) { expiry = fn; },
    window: { scheduleOutputFit() { fits++; } },
    document: { getElementById: id => elements[id] }, isSanctuary: true, isObs: false, isStage: false };
  vm.createContext(c); vm.runInContext(functionSource(display, 'applyLiveAlert'), c);
  c.applyLiveAlert({ active: true, text: 'Welcome\nPlease be seated', position: 'fullscreen', expiresAt: Date.now() + 30000, destinations: { sanctuary: true } });
  assert.equal(elements['live-alert-container'].className, 'active alert-fullscreen');
  assert.equal(elements['live-alert-content'].textContent, 'Welcome\nPlease be seated');
  assert.equal(fits, 1);
  expiry();
  assert.equal(elements['live-alert-container'].className, '');
  assert.equal(elements['live-alert-content'].textContent, '');
  c.isSanctuary = false; c.isObs = true;
  c.applyLiveAlert({ active: true, text: 'Projector only', position: 'fullscreen', destinations: { sanctuary: true } });
  assert.equal(elements['live-alert-container'].className, '');
});

test('preview +/- uses the displayed song setting for custom IDs and respects Settings limits', () => {
  const state = { currentMode:'lt',currentTab:'songs',activeLiveSlideId:'custom-verse-1',activeLiveText:'Lyrics',songScaleFull:2.2,songScaleLt:1.4,textSize:1 };
  const c = { state,window:{previewTargetMode:'sanctuary'},
    updateSongScaleFullSetting:v=>state.songScaleFull=v,
    updateSongScaleLtSetting:v=>state.songScaleLt=v,
    updateTextScale:v=>state.textSize=v };
  vm.runInNewContext(functionSource(app,'getPreviewTextScaleControl')+'\n'+functionSource(app,'adjustTextScale'),c);
  c.adjustTextScale(-0.1);
  assert.equal(state.songScaleFull,2.1);
  assert.equal(c.getPreviewTextScaleControl().value,2.1);
  assert.equal(state.textSize,1);
  c.adjustTextScale(0.1);
  assert.equal(state.songScaleFull,2.2);
  c.window.previewTargetMode='livestream';
  c.adjustTextScale(-0.1);
  assert.equal(state.songScaleLt,1.3);
  assert.equal(c.getPreviewTextScaleControl().value,1.3);
  state.songScaleLt=2.5; c.adjustTextScale(0.1);
  assert.equal(state.songScaleLt,2.5);
  state.currentTab='bible'; state.activeLiveSlideId='bible_Genesis_1_1';
  c.adjustTextScale(-0.1);
  assert.equal(state.textSize,0.9);
});
test('full-screen announcement sizing takes priority over the underlying Bible and uses the full-screen scale on either output', () => {
  const state = {currentTab:'bible',activeLiveSlideId:'bible_Genesis_1_1',textSize:1,songScaleFull:2.2,songScaleLt:1.4};
  const alert = {active:true,position:'fullscreen',text:'Welcome',destinations:{sanctuary:true,livestream:true}};
  const c = {state,window:{previewTargetMode:'sanctuary',liveAlertEngine:{currentAlert:alert}},
    updateSongScaleFullSetting:value=>state.songScaleFull=value,
    updateSongScaleLtSetting:value=>state.songScaleLt=value,updateTextScale:value=>state.textSize=value};
  vm.runInNewContext(functionSource(app,'getPreviewTextScaleControl')+'\n'+functionSource(app,'adjustTextScale'),c);
  c.adjustTextScale(0.1);
  assert.equal(state.songScaleFull,2.3);
  assert.equal(state.textSize,1,'announcement sizing must not resize the underlying Bible');
  c.window.previewTargetMode='livestream'; c.adjustTextScale(-0.1);
  assert.equal(state.songScaleFull,2.2);
  assert.equal(state.songScaleLt,1.4,'full-screen announcements do not use the lower-third scale');
  state.songScaleFull=6; c.adjustTextScale(0.1); assert.equal(state.songScaleFull,6);
  alert.destinations.livestream=false;
  assert.equal(c.getPreviewTextScaleControl().key,'textSize');
  c.window.previewTargetMode='sanctuary'; alert.position='upperthird';
  assert.equal(c.getPreviewTextScaleControl().key,'textSize');
  alert.position='fullscreen'; alert.expiresAt=1;
  assert.equal(c.getPreviewTextScaleControl().key,'textSize');
  delete alert.expiresAt; alert.active=false;
  assert.equal(c.getPreviewTextScaleControl().key,'textSize');
});

test('quick sizing patches the readout and preserves clear without running the legacy preview layout', () => {
  const calls=[],label={},delivery=[];
  const context={document:{getElementById:id=>id==='bento-textscale-label'?label:{classList:{contains:()=>true}}},
    quickTextScaleQueued:false,queueMicrotask:fn=>delivery.push(fn),
    getPreviewTextScaleControl:()=>({value:1.7}),pendingLiveStorage:{clear:true,blackout:false},
    broadcastState:(payload,alreadyUpdated)=>calls.push({payload,alreadyUpdated})};
  vm.runInNewContext(functionSource(app,'publishQuickTextScale')+';publishQuickTextScale();',context);
  assert.equal(label.textContent,'1.7x');assert.equal(calls.length,0);
  context.pendingLiveStorage.blackout=true;delivery[0]();assert.equal(calls.length,1);
  assert.equal(calls[0].payload.blackout,true,'queued delivery retains newer output protection');
  assert.equal(calls[0].payload.clear,true);assert.equal(calls[0].payload.transitionType,'cut');assert.equal(calls[0].alreadyUpdated,true);
});
