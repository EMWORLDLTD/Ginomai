'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/presentation-output'),'utf8');
function fixture() {
  let now=5000,tick;const elements=[];
  const node=tag=>{const value={tag,hidden:false,style:{},children:[],textContent:'',readyState:1,duration:60,currentTime:0,paused:true,
    classList:{toggle(){}},append(...children){this.children.push(...children);},addEventListener(){},removeAttribute(key){delete this[key];},
    pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};elements.push(value);return value;};
  const window={PresentationModel:require('../js/presentation-model')};
  vm.runInNewContext(source,{window,document:{createElement:node,body:node('body'),getElementById:()=>null},setInterval:fn=>tick=fn,Date:{now:()=>now}});
  return {render:window.renderPresentationOutput,layer:elements.find(el=>el.id==='presentation-output'),video:elements.find(el=>el.tag==='video'),advance:value=>{now=value;tick();}};
}
const media={contentType:'media',slideId:'video',media:{kind:'video',url:'/presentation/files/media_abcd.webm'},destinations:['sanctuary','livestream'],playback:{position:5,updatedAt:1000,playing:true,soundTarget:'livestream'}};
test('resident video renderer mutes previews, selects one sound destination, and stops on replacement or clear',()=>{
 const f=fixture();f.render(media,{embedded:true});assert.equal(f.video.muted,true);assert.equal(f.video.paused,false);
 f.render(media,{embedded:false,isSanctuary:true});assert.equal(f.video.muted,true);
 f.render(media,{embedded:false});assert.equal(f.video.muted,false);
 f.render({...media,clear:true},{embedded:false});assert.equal(f.video.paused,true);assert.equal(f.video.muted,true);assert.equal(f.layer.hidden,true);
 f.render(media,{embedded:false});f.render({contentType:'song'},{embedded:false});assert.equal(f.video.paused,true);
});
test('media never appears on fixed overlay-only sources or excluded destinations',()=>{
 const f=fixture();assert.equal(f.render(media,{isExplicitLt:true}),true);assert.equal(f.layer.hidden,true);
 f.render({...media,destinations:['sanctuary']},{embedded:false});assert.equal(f.layer.hidden,true);
 f.render(media,{isSanctuary:true});assert.equal(f.layer.hidden,false);
});
test('server time corrects countdown and video timing across output clock differences',()=>{
 const f=fixture();f.render({...media,_serverTime:1000},{embedded:true});assert.equal(f.video.currentTime,5);
 f.advance(10000);assert.equal(f.video.currentTime,10);
 f.render({contentType:'countdown',slideId:'timer',countdown:{startsAt:7000,message:'Service starts in'},_serverTime:6000},{isSanctuary:true});
 const countdown=f.layer.children[2],clock=countdown.children[1];assert.equal(clock.textContent,'00:01');
 f.advance(12000);assert.equal(clock.textContent,'Service starting');assert.equal(countdown.children[0].hidden,true);
});
test('countdown shows its small heading above the large timer, then replaces the timer with the custom completion message at zero',()=>{
 const f=fixture(),data={contentType:'countdown',slideId:'timer',countdown:{startsAt:6500,message:'Service starts in',completionMessage:'Please rise to your feet',font:'Inter',timerScale:1.2}};
 f.render(data,{isSanctuary:true});const countdown=f.layer.children[2],message=countdown.children[0],clock=countdown.children[1];
 assert.equal(message.textContent,'Service starts in');assert.equal(clock.textContent,'00:02');assert.equal(message.hidden,false);
 assert.equal(countdown.style.fontSize,'12vw');assert.match(countdown.style.fontFamily,/Inter/);
 f.advance(6500);assert.equal(clock.textContent,'Please rise to your feet');assert.equal(message.hidden,true);
 f.advance(90000);assert.equal(clock.textContent,'Please rise to your feet');assert.equal(f.layer.children[2],countdown);
});
