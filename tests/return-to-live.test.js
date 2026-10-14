'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const bento=fs.readFileSync(require.resolve('../js/bento-integration.js'),'utf8');
function setup(slideId='song_1_0') {
  const state={activeSongId:'song_1',activeDeckType:'song',currentTab:'songs',activeLiveSlideId:slideId,activeLiveText:'Keep this live',liveEngagedDeck:{type:'song',songId:'song_1'},isMedleyMode:false};
  const button={style:{}},calls={render:0,visuals:[],themes:[]};
  const songs=['song_1','song_1_long','song_2'].map(id=>({id,title:id,stanzas:[{text:id}]}));
  const context={state,SONGS_DATABASE:songs,document:{getElementById:()=>button},
    window:{SONGS_DATABASE:songs,cancelPreparedSlide(){},syncDashboardWorkspace(){},updateActiveSlideVisuals:id=>calls.visuals.push(id)},
    renderLibrary(){},scrollActiveLibraryItemIntoView(){},syncDashboardWorkspace(){},applySongBoundTheme:id=>calls.themes.push(id),
    broadcastState(){assert.fail('Browsing or returning must not broadcast');},projectSlide(){assert.fail('Browsing or returning must not project');}};
  vm.createContext(context);
  const start=app.indexOf('function selectSingleViewSong('),end=app.indexOf('\n}',start)+2;
  vm.runInContext(app.slice(start,end),context);
  const control=bento.slice(bento.indexOf('    // Return to Live tally button'),bento.indexOf('    // Single view columns segmented buttons'));
  vm.runInContext("function syncReturnControl(){const isBibleDeck=state.activeDeckType==='bible';"+control+'}',context);
  context.renderDeck=context.window.renderDeck=()=>{calls.render++;context.syncReturnControl();};
  context.syncReturnControl();
  return {context,state,button,calls};
}
test('browsing a different song exposes Return to Live; returning restores the live deck without projecting',()=>{
  const {context,state,button,calls}=setup();
  assert.equal(button.style.display,'none');
  context.selectSingleViewSong('song_2');
  assert.equal(state.liveEngagedDeck,null,'browsing still disengages follow-suit');
  assert.equal(button.style.display,'inline-flex');
  assert.equal(state.activeSongId,'song_2');
  assert.equal(state.activeLiveSlideId,'song_1_0');
  button.onclick({stopPropagation(){}});
  assert.equal(state.activeSongId,'song_1');
  assert.equal(state.activeLiveSlideId,'song_1_0');
  assert.equal(state.activeLiveText,'Keep this live');
  assert.deepEqual(calls.themes,[],'browsing must preserve the live song theme');
  assert.equal(button.style.display,'none');
  assert.deepEqual(calls.visuals,['song_1_0']);
});
test('live-song identification handles split slides, medleys, AI and overlapping song IDs',()=>{
  for(const slideId of ['song_1_long_2_c1','medley_song_1_long_2','ai_song_song_1_long_2','song_song_1_long_2']){
    const {context,state,button}=setup(slideId);
    state.activeSongId='song_2';state.liveEngagedDeck=null;context.syncReturnControl();
    assert.equal(button.style.display,'inline-flex');
    button.onclick({stopPropagation(){}});
    assert.equal(state.activeSongId,'song_1_long');
    assert.equal(state.activeLiveSlideId,slideId);
  }
});
test('Bible browsing still offers return to the live song, and clearing output hides the control',()=>{
  const {context,state,button}=setup();
  state.activeDeckType='bible';state.activeSongId='song_2';state.liveEngagedDeck=null;
  context.syncReturnControl();assert.equal(button.style.display,'inline-flex');
  button.onclick({stopPropagation(){}});assert.equal(state.activeDeckType,'song');assert.equal(state.activeSongId,'song_1');
  state.activeSongId='song_2';state.activeLiveSlideId=null;context.syncReturnControl();assert.equal(button.style.display,'none');
});
