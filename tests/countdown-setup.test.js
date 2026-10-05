'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../js/presentation-model');
const source=fs.readFileSync(require.resolve('../js/presentation-library'),'utf8');
function fixture() {
  let now=new Date('2026-10-05T07:51:00').getTime(),tick,deckRenders=0;
  class Clock extends Date {static now(){return now;}}
  const nodes=new Map(),broadcasts=[],projections=[];
  const field=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:id==='countdown-setup-shield',inert:false,value:'',textContent:'',disabled:false,
      style:{setProperty(key,value){this[key]=value;}},classList:{toggle(key,on){this[key]=on;},contains(){return false;}},setAttribute(key,value){this[key]=value;},focus(){},getClientRects(){return [1];}});
    return nodes.get(id);
  };
  const state={agendaItems:[],isHoldLive:false,activeDeckType:'song'};
  const window={state,PresentationModel:{...model,countdownView:(item,at=Clock.now())=>model.countdownView(item,at),countdownDeadline:(fields,at=Clock.now())=>model.countdownDeadline(fields,at)},dismissAllOverlays(){},renderDeck(){deckRenders++;},renderAgenda(){},syncPresentationControls(){},cancelPreparedSlide(){},broadcastState:flags=>broadcasts.push(flags),
    themeManager:{sanctuaryFont:'Outfit',getSanctuaryPayload:()=>({bgCss:'#10121c'})},showToast(){}};
  const document={activeElement:field('initial-focus'),getElementById:id=>id.startsWith('countdown-') || id==='bento-layout-root'?field(id):null,querySelectorAll:()=>[],addEventListener(){}};
  const context={window,document,REMOTE_MODE:false,Date:Clock,Intl,localStorage:{setItem(){}},clearTimeout(){},setTimeout(){},setInterval:fn=>tick=fn};
  vm.runInNewContext(source,context);
  window.projectSlide=(id,text,reference,extra)=>{projections.push(extra);window.projectPresentation(id,text,reference,extra);};
  return {window,state,field,broadcasts,projections,context,advance:ms=>{now+=ms;tick();},now:()=>now,deckRenders:()=>deckRenders};
}
test('start-time preview counts down from the chosen deadline and previews the custom completion message in place',()=>{
  const f=fixture();f.window.openCountdownSetup();
  f.field('countdown-date').value='2026-10-05';f.field('countdown-start').value='08:00';f.window.updateCountdownSetup();
  const clock=f.field('countdown-preview-clock');assert.equal(clock.textContent,'09:00');
  f.advance(60000);assert.equal(clock.textContent,'08:00');assert.equal(f.field('countdown-preview-clock'),clock);
  f.field('countdown-message').value='Service starts in';f.field('countdown-completion').value='Please rise to your feet';f.window.updateCountdownSetup();
  f.window.setCountdownPreviewFinished(true);assert.equal(clock.textContent,'Please rise to your feet');assert.equal(f.field('countdown-preview-message').hidden,true);
  f.window.setCountdownPreviewFinished(false);assert.equal(clock.textContent,'08:00');assert.equal(f.field('countdown-preview-message').hidden,false);
  assert.equal(f.broadcasts.length,0);f.window.closeCountdownSetup();assert.equal(f.field('bento-layout-root').inert,false);
});
test('Start projects immediately with a fixed target time; adding to agenda only prepares it',()=>{
  const f=fixture();f.window.openCountdownSetup();f.field('countdown-start').value='08:00';f.field('countdown-completion').value='Welcome to worship';
  f.field('countdown-font').value='Inter';f.field('countdown-size').value='1.2';f.window.saveCountdownSetup(true);
  assert.equal(f.state.agendaItems.length,1);assert.equal(f.projections[0].takeLive,true);assert.equal(f.broadcasts.length,1);
  assert.equal(f.state.activePresentation.countdown.startsAt,new Date('2026-10-05T08:00:00').getTime());
  assert.equal(f.state.activePresentation.countdown.completionMessage,'Welcome to worship');assert.equal(f.state.activePresentation.countdown.font,'Inter');assert.equal(f.state.activePresentation.countdown.timerScale,1.2);
  assert.equal(f.field('countdown-setup-shield').hidden,true);
  f.window.saveCountdownSetup(true);assert.equal(f.state.agendaItems.length,1);assert.equal(f.broadcasts.length,1);
  const agenda=fixture();agenda.window.openCountdownSetup();agenda.window.saveCountdownSetup();
  assert.equal(agenda.state.agendaItems.length,1);assert.equal(agenda.broadcasts.length,0);assert.equal(agenda.state.activePresentation,undefined);
});
test('minutes preview keeps a stable deadline, and Start begins the full selected duration at click time',()=>{
  const f=fixture();f.window.openCountdownSetup();f.window.setCountdownInputMode('minutes');
  f.field('countdown-minutes').value='10';f.window.updateCountdownSetup(true);assert.equal(f.field('countdown-preview-clock').textContent,'10:00');
  f.advance(30000);assert.equal(f.field('countdown-preview-clock').textContent,'09:30');
  f.field('countdown-message').value='Starting soon';f.window.updateCountdownSetup();assert.equal(f.field('countdown-preview-clock').textContent,'09:30');
  f.window.saveCountdownSetup(true);assert.equal(f.state.activePresentation.countdown.startsAt,f.now()+600000);
  assert.equal(f.state.activePresentation.countdown.inputMode,'minutes');assert.equal(f.state.activePresentation.countdown.minutes,10);
});
test('Hold, remote control, invalid time, and invalid minutes prevent Start from changing the output or agenda',()=>{
  const f=fixture();f.window.openCountdownSetup();f.state.isHoldLive=true;f.window.updateCountdownSetup();assert.equal(f.field('countdown-start-live').disabled,true);
  f.window.saveCountdownSetup(true);assert.match(f.field('countdown-setup-error').textContent,/Hold live/);assert.equal(f.state.agendaItems.length,0);
  f.state.isHoldLive=false;f.field('countdown-start').value='07:00';f.window.saveCountdownSetup(true);assert.match(f.field('countdown-setup-error').textContent,/future/);
  f.window.setCountdownInputMode('minutes');f.field('countdown-minutes').value='0';f.window.updateCountdownSetup(true);assert.equal(f.field('countdown-preview-clock').textContent,'--:--');f.window.saveCountdownSetup(true);
  assert.equal(f.state.agendaItems.length,0);f.context.REMOTE_MODE=true;f.field('countdown-minutes').value='10';f.window.saveCountdownSetup(true);assert.equal(f.state.agendaItems.length,0);assert.equal(f.broadcasts.length,0);
});
test('editing the heading or completion of a running duration does not reset its deadline',()=>{
  const f=fixture();f.window.openCountdownSetup();f.window.setCountdownInputMode('minutes');f.window.saveCountdownSetup(true);
  const item=f.state.agendaItems[0],deadline=item.countdown.startsAt,renders=f.deckRenders();f.advance(60000);f.window.openCountdownSetup(item);
  f.field('countdown-completion').value='Let us worship';f.window.updateCountdownSetup();f.window.saveCountdownSetup();
  assert.equal(f.state.activePresentation.countdown.startsAt,deadline);assert.equal(f.state.activePresentation.countdown.completionMessage,'Let us worship');assert.equal(f.state.agendaItems.length,1);assert.equal(f.deckRenders(),renders);
});
