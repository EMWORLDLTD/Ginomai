'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Readable,Writable}=require('node:stream');
const createStore=require('../lib/presentation-media');
const model=require('../js/presentation-model');
function request(buffer,range) {const req=Readable.from([buffer]);req.headers={'content-length':buffer.length,...(range?{range}:{})};return req;}
async function fixture(t) {const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ginomia-media-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return createStore(dir);}
test('countdown derives time from its deadline, including sleep and expiry',()=>{
 assert.equal(model.formatCountdown(61000,1000),'01:00');
 assert.equal(model.formatCountdown(3662000,1000),'01:01:01');
 assert.equal(model.formatCountdown(61000,60999),'00:01');
 assert.equal(model.formatCountdown(61000,62000),'Service starting');
 assert.equal(model.formatCountdown(NaN,0),'Service starting');
});
test('video synchronization handles pause, loop, and end without accumulated ticks',()=>{
 assert.equal(model.playbackPosition({position:5,playing:true,updatedAt:1000},11000,60),15);
 assert.equal(model.playbackPosition({position:5,playing:false,updatedAt:1000},11000,60),5);
 assert.equal(model.playbackPosition({position:55,playing:true,loop:true,updatedAt:1000},11000,60),5);
 assert.equal(model.playbackPosition({position:55,playing:true,updatedAt:1000},11000,60),60);
 assert.equal(model.safeMediaUrl('/presentation/files/media_1234-abcd-page-1.png'),true);
 assert.equal(model.safeMediaUrl('https://example.com/video.mp4'),false);
 assert.equal(model.safeMediaUrl('/presentation/files/../../secret'),false);
});
test('PDF upload persists metadata and rejects malformed documents',async t=>{
 const store=await fixture(t),params=new URLSearchParams({name:'slides.pdf',width:800,height:600,pages:2});
 const item=await store.upload(request(Buffer.from('%PDF-1.7\nexample')),params);
 assert.equal(item.kind,'pdf');assert.equal(item.pageCount,2);assert.equal((await store.list())[0].id,item.id);
 await assert.rejects(store.upload(request(Buffer.from('not PDF')),params),/valid PDF/);
 assert.equal((await store.list()).length,1);
 await assert.rejects(store.get('../../secret'),/Invalid/);
});
test('concurrent derived pages retain both entries, reject wrong page ranges and bad PNGs',async t=>{
 const store=await fixture(t),item=await store.upload(request(Buffer.from('%PDF-1.7\nexample')),new URLSearchParams({name:'slides.pdf',width:800,height:600,pages:2}));
 const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
 const params=page=>new URLSearchParams({id:item.id,page,width:100,height:80});
 await Promise.all([1,2].map(page=>store.page(request(png),params(page))));
 const saved=await store.get(item.id);assert.equal(Object.keys(saved.pages).length,2);
 await assert.rejects(store.page(request(png),params(3)),/Invalid/);
 await assert.rejects(store.page(request(Buffer.from('not PNG')),params(1)),/PNG/);
});
test('video range serving is bounded and rejects traversal',async t=>{
 const store=await fixture(t),item=await store.upload(request(Buffer.from('0123456789')),new URLSearchParams({name:'video.mp4',width:100,height:80}));
 async function serve(url,range) {
   let status,headers,chunks=[];const response=new Writable({write(chunk,encoding,callback){chunks.push(chunk);callback();}});
   response.writeHead=(s,h)=>{status=s;headers=h;};const finished=new Promise(resolve=>response.on('finish',resolve));
   await store.serve({...request(Buffer.alloc(0),range),method:'GET'},response,url);await finished;return {status,headers,body:Buffer.concat(chunks).toString()};
 }
 const partial=await serve(item.url,'bytes=2-5');assert.equal(partial.status,206);assert.equal(partial.body,'2345');
 assert.equal((await serve(item.url,'bytes=90-100')).status,416);
 assert.equal((await serve('/presentation/files/../../secret')).status,404);
});

test('presentation endpoints require host authorization while file reads are public',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ginomia-presentation-api-'));
 process.env.SF_PRESENTATION_DIR=directory;
 const {server}=require('../server');server.listen(0,'127.0.0.1');await require('node:events').once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bytes=Buffer.from('%PDF-1.4\nexample'),route='/api/presentation-media?name=slides.pdf&width=800&height=600&pages=2';
 assert.equal((await fetch(base+route,{method:'POST',body:bytes})).status,403);
 assert.equal((await fetch(base+'/api/presentation-media')).status,403);
 const cookie=(await fetch(base)).headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+route,{method:'POST',headers:{Cookie:cookie,Origin:'https://example.com'},body:bytes})).status,403);
 const upload=await fetch(base+route,{method:'POST',headers:{Cookie:cookie},body:bytes});assert.equal(upload.status,201);
 const {item}=await upload.json();const output=await fetch(base+item.url);assert.equal(output.status,200);assert.deepEqual(Buffer.from(await output.arrayBuffer()),bytes);
 assert.equal((await fetch(base+'/api/presentation-media/page?id='+item.id+'&page=1&width=20&height=20',{method:'POST',body:bytes})).status,403);
});
