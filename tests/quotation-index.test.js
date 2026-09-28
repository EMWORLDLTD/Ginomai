'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {QuotationIndex}=require('../js/quotation-index');
const bible=require('../bibles/KJV.json');
const index=new QuotationIndex(bible,'KJV');
test('full Bible quotations include demo and previously unlisted verses',()=>{
 for(const [text,ref] of [
 ['From a child you have known the holy scriptures able to make you wise','2 Timothy 3:15'],
 ['Let this mind be in you which was also in Christ Jesus','Philippians 2:5'],
 ['Thy word is a lamp unto my feet and a light unto my path','Psalms 119:105'],
 ['A soft answer turneth away wrath but grievous words stir up anger','Proverbs 15:1'],
 ['The heavens declare the glory of God and the firmament sheweth his handywork','Psalms 19:1']]) {
   const match=index.match(text);assert.equal(match?.reference,ref,text);assert.equal(match.autoProjectEligible,false);assert.equal(match.version,'KJV');assert.equal(match.text,bible[match.book][match.chapter].find(v=>v.verse===match.verse).text);
 }
});
test('ordinary sermon language, repetition, short phrases and empty input support no match',()=>{
 for(const text of ['', 'Jesus Christ', 'God is good all the time','Let us pray for the people in our church today','The Lord has mercy for every person today','We need to make wise choices for our children','holy holy holy holy holy holy','God loves you and wants you to have a wonderful life']) assert.equal(index.match(text),null,text);
});
test('equal supporting evidence for multiple verses is ambiguous rather than arbitrarily chosen',()=>{
 const phrase='Distinctive amber lanterns illuminate distant ancient mountain pathways';
 const ambiguous=new QuotationIndex({Book:{1:[{verse:1,text:phrase},{verse:2,text:phrase}]}},'test');assert.equal(ambiguous.match(phrase),null);
});
test('worker delivery cannot survive context reset, source switch or stale results',()=>{
 const workers=[],found=[];let source={bible,version:'KJV'};
 class Worker {constructor(){this.sent=[];workers.push(this);}postMessage(x){this.sent.push(x);}terminate(){this.terminated=true;}}
 const ctx=vm.createContext({window:{},Worker,Date,console});vm.runInContext(fs.readFileSync(require.resolve('../js/speech-ai.js'),'utf8'),ctx);
 const engine=new ctx.window.SpeechAiEngine({getQuotationSource:()=>source,onParaphraseDetected:x=>found.push(x)});
 const deliver=(worker,query)=>worker.onmessage({data:{type:'result',generation:query.generation,id:query.id,match:{reference:'John 3:16',autoProjectEligible:false}}});
 engine.parseSemanticParaphrases('God so loved the world and gave his only begotten son');const first=workers[0],q=first.sent[1];
 engine.resetScriptureContext();deliver(first,q);assert.equal(found.length,0);
 engine.parseSemanticParaphrases('quotation');source={bible:{},version:'OTHER'};deliver(first,first.sent.at(-1));assert.equal(found.length,0);
 engine.parseSemanticParaphrases('quotation');assert.equal(first.terminated,true);const next=workers[1];deliver(next,next.sent[1]);assert.equal(found.length,1);
});

test('worker builds the selected local translation and returns actual indexed quotation results',()=>{
 const messages=[];const workerContext=vm.createContext({self:{postMessage:m=>messages.push(m)},console});
 workerContext.importScripts=()=>vm.runInContext(fs.readFileSync(require.resolve('../js/quotation-index.js'),'utf8'),workerContext);
 vm.runInContext(fs.readFileSync(require.resolve('../js/quotation-worker.js'),'utf8'),workerContext);
 workerContext.self.onmessage({data:{type:'build',generation:7,version:'KJV',bible}});
 assert.equal(messages[0].type,'ready');
 workerContext.self.onmessage({data:{type:'query',generation:7,id:2,text:'A soft answer turneth away wrath but grievous words stir up anger'}});
 assert.equal(messages[1].match.reference,'Proverbs 15:1');assert.equal(messages[1].generation,7);
});

test('missing worker support does not fall back to the old keyword guesses',()=>{
 const ctx=vm.createContext({window:{},console});vm.runInContext(fs.readFileSync(require.resolve('../js/speech-ai.js'),'utf8'),ctx);
 const found=[];const engine=new ctx.window.SpeechAiEngine({getQuotationSource:()=>({bible,version:'KJV'}),onParaphraseDetected:m=>found.push(m)});
 engine.simulateTranscript('God so loved the world and gave his only begotten son');assert.equal(found.length,0);
});
