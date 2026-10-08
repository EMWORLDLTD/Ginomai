'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
test('Media and Custom share uploads, PDF first pages and deletion',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ginomai-shared-media-'));
  process.env.SF_PRESENTATION_DIR=path.join(directory,'presentations');process.env.SF_MEDIA_DIR=path.join(directory,'backgrounds');
  const {server}=require('../server');server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port,headers={Cookie:(await fetch(base)).headers.get('set-cookie').split(';')[0]};
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const list=async route=>(await (await fetch(base+route,{headers})).json()).items;
  const upload=async(route,body)=>(await (await fetch(base+route,{method:'POST',headers,body})).json()).item;
  const image=await upload('/api/presentation-media?name=Welcome.png&width=1&height=1&pages=1',png);
  const motion=await upload('/api/presentation-media?name=Motion.webm&width=1920&height=1080&pages=1',Buffer.from('test video'));
  const custom=await list('/api/sanctuary-media');
  assert.equal(custom.find(item=>item.id===image.id).imageUrl,image.url);assert.equal(custom.find(item=>item.id===motion.id).videoUrl,motion.url);
  const background=await upload('/api/sanctuary-media?name=Custom.png&width=1&height=1',png);
  assert.equal((await list('/api/presentation-media')).find(item=>item.id===background.id).url,background.imageUrl);
  const pdf=await upload('/api/presentation-media?name=Slides.pdf&width=800&height=600&pages=2',Buffer.from('%PDF-1.4\nexample'));
  assert.equal((await list('/api/sanctuary-media')).some(item=>item.id===pdf.id),false);
  const first=await upload('/api/presentation-media/page?id='+pdf.id+'&page=1&width=800&height=600',png);
  await upload('/api/presentation-media/page?id='+pdf.id+'&page=1&width=320&height=180&thumbnail=1',png);
  const second=await upload('/api/presentation-media/page?id='+pdf.id+'&page=2&width=800&height=600',png);
  assert.equal((await list('/api/sanctuary-media')).find(item=>item.id===pdf.id).imageUrl,first.url);
  assert.equal((await fetch(base+'/api/sanctuary-media?id='+pdf.id,{method:'DELETE'})).status,403);
  for(const item of [image,motion,pdf,background]) {
    assert.equal((await fetch(base+'/api/sanctuary-media?id='+item.id,{method:'DELETE',headers})).status,200);
    assert.equal((await list('/api/presentation-media')).some(asset=>asset.id===item.id),false);
    assert.equal((await list('/api/sanctuary-media')).some(theme=>theme.id===item.id),false);
    assert.equal((await fetch(base+(item.url || item.imageUrl))).status,404);
  }
  assert.equal((await fetch(base+first.url)).status,404);assert.equal((await fetch(base+second.url)).status,404);
  assert.equal((await fs.readdir(process.env.SF_PRESENTATION_DIR)).length,0);
  assert.equal((await fetch(base+'/api/sanctuary-media?id=../../secret',{method:'DELETE',headers})).status,400);
});
