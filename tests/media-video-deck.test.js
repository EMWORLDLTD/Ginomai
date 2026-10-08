'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../js/presentation-model');

test('saved decks restore exactly four slots with safe settings and no preview playback/audio state',()=>{
 const slots=model.videoDeckSlots([{assetId:'media_a',name:'Opening',cue:12.4,loop:true,volume:.4,destination:'livestream',liveMuted:true,playing:true,muted:false},null,{assetId:'media_b',cue:Infinity,volume:9,destination:'invalid'},null,{assetId:'extra'}]);
 assert.equal(slots.length,4);assert.equal(slots[0].cue,12.4);assert.equal(slots[0].volume,.4);assert.equal(slots[0].liveMuted,true);
 assert.equal(slots[0].playing,undefined);assert.equal(slots[0].muted,undefined);assert.equal(slots[2].cue,0);assert.equal(slots[2].volume,1);assert.equal(slots[2].destination,'both');
 assert.deepEqual(model.videoDeckSlots(undefined),[null,null,null,null]);
});

test('service sessions capture independent decks and older sessions clear the previous deck',()=>{
 const window={state:{mediaVideoSlots:model.videoDeckSlots([{assetId:'media_a',cue:5}]),mediaVideoDeckActive:true,activeVideoSlot:2},PresentationModel:model};
 const context={window,document:{readyState:'loading',addEventListener(){}},localStorage:{getItem(){return null;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/session-manager'),'utf8'),context);
 const session={},manager=window.sessionManager;manager.captureStateIntoSession(session);
 window.state.mediaVideoSlots[0].cue=22;assert.equal(session.mediaVideoSlots[0].cue,5);
 manager.applySessionToState(session);assert.equal(window.state.mediaVideoSlots[0].cue,5);assert.equal(window.state.activeVideoSlot,2);assert.equal(window.state.mediaVideoDeckActive,true);
 window.state.mediaVideoSlots[0].cue=99;assert.equal(session.mediaVideoSlots[0].cue,5);
 manager.applySessionToState({});assert.equal(window.state.mediaVideoSlots.length,0);assert.equal(window.state.mediaVideoDeckActive,false);
});
