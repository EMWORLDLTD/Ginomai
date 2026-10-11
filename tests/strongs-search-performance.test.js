'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const detector = fs.readFileSync(require.resolve('../js/strongs-detector.js'), 'utf8');
const worker = fs.readFileSync(require.resolve('../js/strongs-search-worker.js'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
function appFunction(name) {
  let start = app.indexOf('function ' + name + '(');
  if (app.slice(start - 6, start) === 'async ') start -= 6;
  return app.slice(start, app.indexOf('\n}', start) + 2);
}
const entry = (id, lang, word) => ({id,lang,lemma:word,transliteration:word,short_definition:word,kjv_definition:word});
const lexicon = {G1577:entry('G1577','Greek','church'),G26:entry('G26','Greek','love'),H2617:entry('H2617','Hebrew','love')};
function ui() {
  const requests = [];
  const box = {innerHTML:'',style:{},setAttribute(){},contains:()=>false};
  const c = vm.createContext({window:{searchStrongsConcordanceAsync:(query,options)=>new Promise(resolve=>requests.push({query,options,resolve})),
      getStrongsBibleOccurrences(){assert.fail('typing must never scan the Bible');}},
    omniStrongsSearchGeneration:0,omniSearchCurrentMode:'strongs',omniStrongsLangFilter:'all',
    escapeHtml:text=>String(text || ''),document:{getElementById:()=>box}});
  vm.runInContext(['renderOmniStrongsCardHtml','renderOmniStrongsResults','closeOmniSearchPalette'].map(appFunction).join('\n'),c);
  return {c,box,requests};
}

test('missing Strong’s content displays a download action without starting a search worker', async () => {
  const {c,box,requests} = ui();
  c.window.isContentPackReady = () => false;
  await c.renderOmniStrongsResults('church',box);
  assert.equal(requests.length,0);
  assert.match(box.innerHTML,/Download Hebrew and Greek/);
  c.window.isContentPackReady = () => true;
  const query = c.renderOmniStrongsResults('church',box);
  requests[0].resolve([{...lexicon.G1577,_occurrenceCount:2}]);
  await query;
  assert.match(box.innerHTML,/G1577/);
});

test('removing Strong’s rejects pending work, drops cached counts and permits a fresh worker', async () => {
  const workers=[];
  class Worker { constructor(){workers.push(this);} postMessage(){} terminate(){this.terminated=true;} }
  const c = vm.createContext({document:{addEventListener(){}},Worker,setTimeout,clearTimeout,console,BIBLE_DATABASE:{KJV_STRONGS:{old:true}}});
  c.window=c;
  vm.runInContext(detector,c);
  const pending=c.searchStrongsConcordanceAsync('church');
  workers[0].onmessage({data:{type:'ready',counts:{G1577:2}}});
  c.resetStrongsContent();
  await assert.rejects(pending,/removed/);
  assert.equal(workers[0].terminated,true);
  assert.equal(c.getStrongsBibleOccurrenceCount('G1577'),undefined);
  assert.equal(c.BIBLE_DATABASE.KJV_STRONGS,undefined);
  const fresh=c.searchStrongsConcordanceAsync('love');
  workers[0].onerror();
  workers[0].onmessage({data:{type:'ready',counts:{G1577:999}}});
  workers[1].onmessage({data:{type:'result',id:2,results:[lexicon.G26]}});
  assert.equal((await fresh)[0].id,'G26');
  assert.equal(c.getStrongsBibleOccurrenceCount('G1577'),undefined);
});

test('typing submits asynchronous searches and only the newest query renders', async () => {
  const {c,box,requests} = ui();
  const old = c.renderOmniStrongsResults('ch',box);
  const latest = c.renderOmniStrongsResults('church',box);
  assert.equal(box.innerHTML,'','input handling must not wait for or synchronously render search results');
  requests[1].resolve([{...lexicon.G1577,_occurrenceCount:2}]);await latest;
  assert.match(box.innerHTML,/G1577/);assert.match(box.innerHTML,/2 verses in KJV/);
  const html = box.innerHTML;
  requests[0].resolve([lexicon.G26]);await old;
  assert.equal(box.innerHTML,html,'a delayed old query must not overwrite the newest results');
});

test('clearing, closing and leaving Concordance invalidate pending results', async () => {
  for (const action of ['clear','close','mode']) {
    const {c,box,requests} = ui();
    const pending = c.renderOmniStrongsResults('church',box);
    if (action === 'clear') await c.renderOmniStrongsResults('',box);
    else if (action === 'close') c.closeOmniSearchPalette();
    else c.omniSearchCurrentMode = 'songs';
    const html = box.innerHTML;
    requests[0].resolve([lexicon.G1577]);await pending;
    assert.equal(box.innerHTML,html,action+' must prevent stale search rendering');
  }
});

test('language changes discard earlier results and request the selected language', async () => {
  const {c,box,requests} = ui();
  const all = c.renderOmniStrongsResults('love',box);
  c.omniStrongsLangFilter = 'hebrew';
  const hebrew = c.renderOmniStrongsResults('love',box);
  assert.equal(requests[1].options.lang,'hebrew');
  requests[1].resolve([lexicon.H2617]);await hebrew;
  requests[0].resolve([lexicon.G26]);await all;
  assert.match(box.innerHTML,/H2617/);assert.doesNotMatch(box.innerHTML,/G26/);
});

test('worker builds per-verse counts once and preserves ranking and filters', async () => {
  const messages = [];
  const bible = {Matthew:{16:[{verse:18,text:'church<G1577> church<G1577> love<G26>'}]},
    Acts:{2:[{verse:47,text:'church<G01577> love<H02617>'}]}};
  const c = vm.createContext({console,setTimeout(){},postMessage:message=>messages.push(message),
    fetch:async url=>({ok:true,json:async()=>url.includes('lexicon') ? lexicon : bible})});
  c.self = c;c.importScripts=()=>vm.runInContext(detector,c);
  vm.runInContext(worker,c);
  await c.onmessage({data:{type:'query',id:1,query:'church',options:{limit:30}}});
  const ready = messages.find(message=>message.type==='ready');
  assert.equal(ready.counts.G1577,2,'multiple tags in one verse count once and padded IDs normalize');
  assert.equal(ready.counts.G26,1);assert.equal(ready.counts.H2617,1);
  const result = messages.find(message=>message.id===1);
  assert.equal(result.results[0].id,'G1577');assert.equal(result.results[0]._occurrenceCount,2);
  c.BIBLE_DATABASE.KJV_STRONGS = new Proxy({}, {ownKeys(){assert.fail('later queries must reuse occurrence counts');}});
  await c.onmessage({data:{type:'query',id:2,query:'love',options:{lang:'hebrew'}}});
  const filtered = messages.find(message=>message.id===2);
  assert.equal(filtered.results.length,1);assert.equal(filtered.results[0].id,'H2617');
});

test('client reuses one worker, resolves out-of-order replies and reads cached counts', async () => {
  const workers = [];
  class FakeWorker {
    constructor() {this.requests=[];workers.push(this);}
    postMessage(message) {this.requests.push(message);}
    terminate() {}
  }
  const c = vm.createContext({console,document:{},Worker:FakeWorker,setTimeout(){}});c.window=c;
  vm.runInContext(detector,c);
  const first = c.searchStrongsConcordanceAsync('church');
  const second = c.searchStrongsConcordanceAsync('love',{lang:'greek'});
  assert.equal(workers.length,1);
  workers[0].onmessage({data:{type:'ready',counts:{G1577:2}}});
  assert.equal(c.getStrongsBibleOccurrenceCount('G01577'),2);
  workers[0].onmessage({data:{type:'result',id:2,results:[lexicon.G26]}});
  workers[0].onmessage({data:{type:'result',id:1,results:[lexicon.G1577]}});
  assert.equal((await first)[0].id,'G1577');assert.equal((await second)[0].id,'G26');
  const failed = c.searchStrongsConcordanceAsync('peace');
  workers[0].onerror();
  await assert.rejects(failed,/could not start/);
});
