'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const bento = fs.readFileSync(require.resolve('../js/bento-integration.js'), 'utf8');
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

function versePicker() {
  const counters = {decks:0, libraries:0, clicks:0, scrolls:0};
  const card = {classList:{add(){},remove(){}},click(){counters.clicks++;}};
  const cards = new Map([['bento_card_bible_Genesis_1_29',card]]);
  const state = {activeDeckType:'bible',activeBibleBook:'Genesis',activeBibleChapter:'1',liveEngagedDeck:{type:'bible',book:'Genesis',chapter:1}};
  const context = vm.createContext({window:{state,
    renderLibrary(){counters.libraries++;},
    renderDeck(){counters.decks++;cards.set('bento_card_bible_Genesis_2_29',card);},
    cancelPreparedSlide(){},syncDashboardWorkspace(){},scrollToActiveSlide(){counters.scrolls++;}},
    document:{getElementById:id=>cards.get(id)},closeBentoVersePopover(){},setTimeout(){},
    requestAnimationFrame(){throw new Error('Verse selection must not wait for a frame');}});
  vm.runInContext(section(bento,'window.selectBentoBibleVerse =','window.toggleBentoVersePopover ='),context);
  return {context,counters,card,cards,state};
}

test('operator verse picker reuses chapter cards and preserves live engagement', () => {
  const {context,counters,card,cards,state} = versePicker();
  const engagement = state.liveEngagedDeck;
  context.window.selectBentoBibleVerse(29);
  assert.equal(cards.get('bento_card_bible_Genesis_1_29'),card);
  assert.equal(state.liveEngagedDeck,engagement);
  assert.equal(state.activeBibleVerse,29);
  assert.deepEqual(counters,{decks:0,libraries:0,clicks:1,scrolls:1});
});

test('verse picker still builds a different chapter before selecting its card', () => {
  const {context,counters,state} = versePicker();
  context.window.selectBentoBibleVerse(29,'Genesis',2);
  assert.equal(state.activeBibleChapter,2);
  assert.equal(state.liveEngagedDeck,null);
  assert.deepEqual(counters,{decks:1,libraries:1,clicks:1,scrolls:1});
});

test('operator scrolling is synchronous and instant for Bento decks', () => {
  const calls = [], deferred = [];
  const bento = {closest:()=>null};
  const context = vm.createContext({state:{},window:{},REMOTE_MODE:true,
    document:{getElementById:id=>id,querySelector:selector=>{
      assert(!selector.includes('bento-card-pulse'),'The live card must take priority over an older pulse');
      return bento;
    }},
    scrollElementIntoContainerView:(card,container,options)=>calls.push({card,container,options}),
    requestAnimationFrame:fn=>deferred.push(fn)});
  vm.runInContext(section(app,'function scrollToActiveSlide(','// Available Bible Translations'),context);
  context.scrollToActiveSlide({behavior:'smooth'});
  assert.equal(deferred.length,0);
  assert.equal(calls.length,1);
  for (const call of calls) assert.equal(call.options.behavior,'instant');
  context.REMOTE_MODE=false;
  context.scrollToActiveSlide();
  assert.equal(deferred.length,1,'Host scrolling keeps its existing frame scheduling');
  assert.equal(calls.length,1);
});

test('remote verse and song slide selections do not rebuild the current deck', () => {
  const previews = [], commands = [];
  const context = vm.createContext({REMOTE_MODE:true,state:{activeDeckType:'bible',activeBibleBook:'Genesis',activeBibleChapter:1,activeSongId:'test_song',bibleVersion:'KJV'},
    window:{},SONGS_DATABASE:[{id:'test_song'}],document:{getElementById:()=>null},
    updateActiveSlideVisuals(){},updateLivePreview:payload=>previews.push(payload),sendRemoteCommand:command=>commands.push(command),
    renderDeck(){throw new Error('Same chapter/song selections must not rebuild the deck');}});
  vm.runInContext(section(app,'function syncStateFromSlideId(','function applyProjectedSongTheme(')+section(app,'function projectSlide(','function sendRemoteCommand('),context);
  for (const verse of [28,29,30,31]) context.projectSlide(`bible_Genesis_1_${verse}`,`Verse ${verse}`,`Genesis 1:${verse}`);
  context.state.activeDeckType='song';
  for (const slide of [28,29,30,31]) context.projectSlide(`test_song_${slide}`,`Slide ${slide}`,'Test song');
  assert.equal(previews.length,8);
  assert.equal(commands.length,8);
  assert.equal(previews.at(-1).text,'Slide 31');
});

test('operator preview forwarding happens immediately without a host response', () => {
  const calls = [];
  const context = vm.createContext({REMOTE_MODE:true,window:{updateOutputPreviews:payload=>calls.push(payload)},document:{getElementById:()=>null}});
  vm.runInContext(section(app,'function updateLivePreview(','function clearAllOutputs('),context);
  const payload = {slideId:'bible_Genesis_1_29',text:'Verse 29'};
  context.updateLivePreview(payload);
  assert.equal(calls[0],payload);
  context.REMOTE_MODE=false;
  context.updateLivePreview(payload);
  assert.equal(calls.length,1,'Host preview delivery is unchanged');
});

test('echoed remote commands never send workspace patches or rebuild operator decks', () => {
  const context = vm.createContext({REMOTE_MODE:true,window:{},state:{},
    broadcastState(){throw new Error('An echoed projection must not broadcast a patch');},
    renderDeck(){throw new Error('An echoed projection must not rebuild');},
    projectSlide(){throw new Error('The live feed, not the echo, confirms projection');}});
  vm.runInContext(section(app,'function applyRemoteCommand(','async function pushHostLibraryToRemote('),context);
  for (const type of ['PROJECT','CLEAR','BLACKOUT','NAVIGATE','SET_SPEECH_AI','SET_SERMON_RECORDING']) {
    context.applyRemoteCommand({type,_fromRemote:true,slideId:'bible_Genesis_1_29',text:'Verse 29',enabled:true});
  }
});

test('host applies operator projections through the same selection function', () => {
  const calls = [];
  const context = vm.createContext({REMOTE_MODE:false,window:{},state:{},projectSlide:(...args)=>calls.push(args)});
  vm.runInContext(section(app,'function applyRemoteCommand(','async function pushHostLibraryToRemote('),context);
  context.applyRemoteCommand({type:'PROJECT',_fromRemote:true,slideId:'test_song_29',text:'Lyrics',contentType:'song'});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'test_song_29');
  assert.equal(calls[0][3].takeLive,true);
  assert.equal(calls[0][3].contentType,'song');
});

test('unchanged remote workspace patches keep cards mounted; changed chapters build once', () => {
  let decks = 0, libraries = 0;
  const context = vm.createContext({state:{activeDeckType:'bible',activeBibleBook:'Genesis',activeBibleChapter:1,currentTab:'bible',activeLiveSlideId:'bible_Genesis_1_29'},window:{},
    document:{getElementById:()=>null,querySelectorAll:()=>[]},syncTransparentBtnUI(){},syncMedleySettingsUI(){},
    renderAgenda(){},renderLibrary(){libraries++;},renderDeck(){decks++;},updateActiveSlideVisuals(){}});
  vm.runInContext(section(app,'function applyDashboardPatch(','function syncDashboardWorkspace('),context);
  context.applyDashboardPatch({...context.state,activeLiveSlideId:'bible_Genesis_1_30'});
  assert.equal(decks,0);
  assert.equal(libraries,0);
  context.applyDashboardPatch({activeBibleChapter:2});
  assert.equal(decks,1);
  assert.equal(libraries,1);
});

test('remote AI start and stop control the host without initializing local capture', () => {
  const commands = [];
  const context = vm.createContext({REMOTE_MODE:true,state:{},window:{},syncSpeechAiStatusControls(){},sendRemoteCommand:command=>commands.push(command),
    initSpeechAi(){throw new Error('Remote AI must never initialize local microphone capture');}});
  vm.runInContext(section(app,'function toggleSpeechAi(','function handleDetectedVerse('),context);
  context.toggleSpeechAi();
  assert.equal(context.state.aiSpeechRequested,true);
  context.toggleSpeechAi();
  assert.equal(context.state.aiSpeechRequested,false);
  assert.deepEqual(commands.map(command=>[command.type,command.enabled]),[['SET_SPEECH_AI',true],['SET_SPEECH_AI',false]]);
});

test('remote recording start and halt send host commands, not local recording moments', () => {
  const transcript = fs.readFileSync(require.resolve('../js/sermon-transcript.js'),'utf8');
  const commands = [];
  const context = vm.createContext({window:{isRemoteOperator:true,sendRemoteCommand:command=>commands.push(command)}});
  vm.runInContext('class Recorder {'+section(transcript,'  toggleSermonRecording() {','  flushPendingUtterance() {')+'}; window.Recorder=Recorder;',context);
  const recorder = new context.window.Recorder();
  recorder.isRecordingSermon=false;
  recorder.syncTopBarRecordBtn=()=>{};
  recorder.toggleSermonRecording();
  recorder.toggleSermonRecording();
  assert.deepEqual(commands.map(command=>[command.type,command.enabled]),[['SET_SERMON_RECORDING',true],['SET_SERMON_RECORDING',false]]);
});

test('paired operators can control AI and recording but cannot select microphone hardware', () => {
  const server = fs.readFileSync(require.resolve('../server.js'),'utf8');
  const context = vm.createContext({});
  vm.runInContext(section(server,'const ALWAYS_BLOCKED_FROM_REMOTE','// \u2500\u2500\u2500 MIME Types'),context);
  for (const type of ['SET_SPEECH_AI','SET_SERMON_RECORDING']) {
    assert.equal(context.isCommandAllowed({type,enabled:true},{}),true);
    assert.equal(context.isCommandAllowed({type,enabled:'yes'},{}),false);
  }
  assert.equal(context.isCommandAllowed({type:'SET_AUDIO_DEVICE'},{}),false);
});
