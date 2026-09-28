'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluate}=require('../scripts/evaluate-detection.cjs');
const input=(events,labels)=>({schemaVersion:1,name:'test',cases:[{id:'test',provenance:'synthetic',durationMs:10000,events,labels}]});
const label={id:'john',reference:'John 3:17',evidenceAt:1500,until:5000};
test('evaluation scores corrected partials and latency using production detector',()=>{
 const r=evaluate(input([{at:1000,type:'partial',text:'John 3:16'},{at:2000,type:'final',text:'John 3:17'}],[label]));
 assert.equal(r.summary.hits,1);assert.equal(r.summary.falseCandidateEvents,0);assert.equal(r.summary.latencyP95Ms,500);assert.equal(r.summary.wrongProjections,0);assert.equal(r.summary.projections,1);
});
test('evaluation counts misses, false events and observed wrong projections',()=>{
 const r=evaluate(input([{at:2000,type:'final',text:'Romans 8:28'},{at:3000,type:'projection',reference:'John 3:16'}],[label]));
 assert.equal(r.summary.missed,1);assert.equal(r.summary.falseCandidateEvents,1);assert.equal(r.summary.wrongProjections,2);assert.equal(r.summary.latencyP50Ms,null);
});
test('projection evaluation uses real Bible validation and reconnect generations',()=>{
 const r=evaluate(input([{at:100,type:'disconnect'},{at:200,type:'final',text:'John 3:16'},{at:300,type:'reconnect'},{at:400,type:'final',text:'John 3:16',generation:0},{at:500,type:'final',text:'John 3:99',generation:1}],[]));
 assert.equal(r.cases[0].ignoredEvents,2);assert.equal(r.summary.projections,0);
});
test('invalid or unordered annotations fail rather than producing misleading scores',()=>{
 assert.throws(()=>evaluate(input([{at:500,type:'pause'},{at:100,type:'pause'}],[])),/Invalid event/);
 assert.throws(()=>evaluate(input([],[{...label,until:10001}])),/Invalid label/);
});

test('split chapters produce no intermediate candidate and chapter waits cancel queued auto projection', () => {
 const baseline = evaluate(require('../evaluation/regression.json'));
 assert.equal(baseline.summary.hits, 4);
 assert.equal(baseline.summary.falseCandidateEvents, 0);
 assert.equal(baseline.summary.wrongProjections, 0);
 const r = evaluate(input([{at:100,type:'final',text:'John 3:16'}, {at:200,type:'final',text:'Romans chapter eight'}], []));
 assert.equal(r.summary.projections, 0);
 assert.equal(r.cases[0].candidates.at(-1).reference, 'Romans 8');
 assert.equal(r.cases[0].candidates.at(-1).at, 2700);
});
