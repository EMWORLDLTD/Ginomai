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
    liveStorageTimer:null, createDashboardSnapshot:()=>({}),getNextSlideAnticipation:()=>null,
    clearTimeout(){},setTimeout(){},syncChannel:{postMessage:p=>sent.push(p)},fetch:()=>Promise.resolve(),Date };
  vm.runInNewContext(functionSource(app,'broadcastState') + ';broadcastState({alert:{active:false,text:""}},true);',c);
  assert.equal(sent.length,1);
  assert.equal(sent[0].text,'Held lyric');
  assert.equal(sent[0].clear,true);
  assert.equal(sent[0].blackout,true);
  assert.equal(sent[0].alert.active,false);
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
    lastRenderedKey:'s|text|ref||full|0|1|2.2|1.4|0|0',container:{classList:{contains:()=>true}}};
  vm.createContext(c);vm.runInContext(functionSource(display,'applyState'),c);
  c.applyState({type:'sanctuary_theme_sync',sanctuaryTheme:{id:'one'}});
  assert.equal(alerts.length,0);
  c.applyState({slideId:'s',text:'text',reference:'ref',mode:'full',_timestamp:2,sanctuaryTheme:{id:'two'}});
  assert.deepEqual(themes.map(t=>t.id),['one','two']);
  c.applyState({_timestamp:1,alert:{active:true}});
  assert.equal(alerts.length,1,'stale state cannot restore dismissed alerts');
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

test('preview +/- uses the displayed song setting for custom IDs and respects Settings limits', () => {
  const state = { currentTab:'songs',activeLiveSlideId:'custom-verse-1',activeLiveText:'Lyrics',songScaleFull:2.2,songScaleLt:1.4,textSize:1 };
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
