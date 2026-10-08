'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('original-language suggestions need local study context or recognized Strong IDs',()=>{
 const ctx=vm.createContext({window:{},console,setTimeout:()=>0});vm.runInContext(fs.readFileSync(require.resolve('../js/strongs-detector.js'),'utf8'),ctx);
 for(const text of ['hallelujah amen shalom','The word for today is love','H99999 G99999'])assert.equal(ctx.window.detectConcordanceTerms(text).length,0,text);
 assert.ok(ctx.window.detectConcordanceTerms('The Greek word agape means love').some(v=>v.id==='G26'));
 assert.ok(ctx.window.detectConcordanceTerms("Strong's G26").some(v=>v.id==='G26'));
});
test('ambiguous identical song evidence cannot be rescued by agenda membership',()=>{
 const songs=['a','b'].map(id=>({id,title:'Amazing Grace',stanzas:[{text:'Amazing grace how sweet the sound'}]}));const found=[];
 const ctx=vm.createContext({window:{},console,SONGS_DATABASE:songs,state:{agendaItems:[{songId:'a'}]}});vm.runInContext(fs.readFileSync(require.resolve('../js/speech-ai.js'),'utf8'),ctx);
 const engine=new ctx.window.SpeechAiEngine({onSongDetected:x=>found.push(x)});engine.simulateTranscript('Amazing grace how sweet the sound');assert.equal(found.length,0);
});
