'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rank,select}=require('../lib/semantic-search.cjs');
test('semantic ranking checks dimensions and abstains on weak or ambiguous evidence',()=>{
 const rows=[{reference:'A'},{reference:'B'}],manifest={minScore:.65,minMargin:.06,version:'KJV'};
 const best=rank([1,0],new Float32Array([1,0,0,1]),rows,2);
 assert.equal(select(best,manifest).reference,'A');assert.equal(select(best,manifest).autoProjectEligible,false);
 assert.equal(select([{row:rows[0],score:.64}],manifest),null);
 assert.equal(select([{row:rows[0],score:.8},{row:rows[1],score:.77}],manifest),null);
 assert.throws(()=>rank([1],new Float32Array(4),rows,2),/dimensions/);
 assert.throws(()=>rank([NaN,0],new Float32Array(4),rows,2),/Invalid/);
});
test('local service rejects concurrent inference and closes pending requests safely',async()=>{
 const Service=require('../lib/semantic-service.cjs'),s=new Service();
 assert.equal(await s.query('short input'),null);
 const pending=s.query('God loved the world and gave his only son');
 await assert.rejects(s.query('The next query must not build an unbounded queue'),/busy/);
 s.close();await assert.rejects(pending,/stopped/);assert.equal(s.worker,null);
});
test('late semantic matches cannot survive a service reset or translation change',async()=>{
 const source=fs.readFileSync(require.resolve('../js/speech-ai.js'),'utf8');let resolve,current={version:'KJV',bible:{}};
 const found=[],ctx=vm.createContext({window:{},console});vm.runInContext(source,ctx);
 const engine=new ctx.window.SpeechAiEngine({getQuotationSource:()=>current,semanticSearch:()=>new Promise(r=>resolve=r),onParaphraseDetected:r=>found.push(r)});
 let pending=engine.retrieveSemantic('God loves everyone in the whole world');engine.resetScriptureContext();resolve({reference:'John 3:16'});await pending;assert.equal(found.length,0);
 pending=engine.retrieveSemantic('God loves everyone in the whole world');current={version:'NIV',bible:{}};resolve({reference:'John 3:16'});await pending;assert.equal(found.length,0);
});
test('generated index metadata and full-corpus benchmark retain conservative no-match behavior',()=>{
 const manifest=require('../assets/semantic/manifest.json');const results=require('../evaluation/semantic-full-results.json');
 assert.equal(manifest.count,31102);assert.equal(manifest.dimensions,384);
 let accepted=0;
 for(const r of results.results){const match=select(r.top.map(t=>({row:{reference:t.reference},score:t.score})),manifest);
 if(!r.reference)assert.equal(match,null,r.text);
 if(match){assert.equal(match.reference,r.reference,r.text);accepted++;}}
 assert.ok(accepted>=4);
});
