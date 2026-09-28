'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {AutoProjectionPolicy}=require('../js/auto-projection-policy');
function harness(){
 let time=10000,id=0;const timers=new Map(),shown=[],diagnostics=[],state={autoProject:true,isHoldLive:false,bibleVersion:'KJV'};
 const policy=new AutoProjectionPolicy({readState:()=>state,project:item=>shown.push(item.rawReference),diagnose:(type,data)=>diagnostics.push({type,...data}),now:()=>time,schedule:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},cancel:id=>timers.delete(id)});
 const tick=delta=>{const end=time+delta;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=end;};
 const verse=(ref='John 3:16',overrides={})=>({rawReference:ref,kind:'verse',validation:'verified',autoProjectEligible:true,detectionScore:98,recognitionConfidence:null,timestamp:time,...overrides});
 return {policy,tick,verse,shown,state,diagnostics,timers};
}
test('stability window chooses latest explicit reference and enforces minimum display time',()=>{
 const h=harness();h.policy.offer(h.verse());h.tick(200);h.policy.offer(h.verse('Romans 8:28'));h.tick(349);assert.deepEqual(h.shown,[]);h.tick(1);assert.deepEqual(h.shown,['Romans 8:28']);
 h.policy.offer(h.verse('John 3:17'));h.tick(3999);assert.equal(h.shown.length,1);h.tick(1);assert.equal(h.shown[1],'John 3:17');
});
test('manual authority and Hold cannot be bypassed by pending or fresh detections',()=>{
 const h=harness();h.policy.offer(h.verse());h.policy.manualSelection('manual');h.tick(10000);h.policy.offer(h.verse());h.tick(1000);assert.equal(h.shown.length,0);
 h.policy.arm();h.policy.offer(h.verse());h.state.isHoldLive=true;h.tick(350);assert.equal(h.shown.length,0);
 h.state.isHoldLive=false;h.tick(1000);assert.equal(h.shown.length,0);
});
test('stale, ambiguous, unverified, repeated and corrected results never auto-project',()=>{
 const h=harness();for(const options of [{timestamp:1},{autoProjectEligible:false},{kind:'semantic'},{validation:'unavailable'},{recognitionConfidence:.5}])h.policy.offer(h.verse('John 3:16',options));h.tick(1000);assert.equal(h.shown.length,0);
 h.policy.offer(h.verse());h.policy.offer(h.verse('Romans 8',{kind:'chapter',autoProjectEligible:false}));h.tick(1000);assert.equal(h.shown.length,0);
 h.policy.offer(h.verse());h.policy.offer(h.verse('John 3:17',{correction:true}));h.tick(1000);assert.equal(h.shown.length,0);
 h.policy.offer(h.verse());h.tick(350);h.policy.offer(h.verse());h.tick(8000);assert.equal(h.shown.length,1);
});
test('turning auto off, changing translation or ending a session invalidates queued projection',()=>{
 for(const change of [h=>h.state.autoProject=false,h=>h.state.bibleVersion='NIV',h=>h.policy.clear('session-ended')]){const h=harness();h.policy.offer(h.verse());change(h);h.tick(350);assert.equal(h.shown.length,0);}
});
