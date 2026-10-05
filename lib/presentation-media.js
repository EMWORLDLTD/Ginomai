'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const MAX_BYTES=250*1024*1024;
const TYPES={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/mp4','.ogv':'video/ogg'};
const validId=id=>/^media_[a-f0-9-]+$/.test(id || '');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
module.exports=function createPresentationStore(initialDirectory=process.env.SF_PRESENTATION_DIR || path.join(os.homedir(),'.ginomia','presentations')) {
  let directory=initialDirectory;
  async function ready() {
    try {await fs.promises.mkdir(directory,{recursive:true});}
    catch(error) {if (!['EACCES','EPERM'].includes(error.code)) throw error; directory=path.join(process.cwd(),'output','presentations');await fs.promises.mkdir(directory,{recursive:true});}
  }
  async function get(id) {if (!validId(id)) throw fail('Invalid media ID.'); await ready(); try {return JSON.parse(await fs.promises.readFile(path.join(directory,id+'.json'),'utf8'));} catch(error) {if(error.code==='ENOENT') throw fail('Media is missing. Relink its file.',404); throw error;}}
  async function list() {await ready();const names=await fs.promises.readdir(directory);const items=await Promise.all(names.filter(name=>/^media_[a-f0-9-]+\.json$/.test(name)).map(name=>get(name.slice(0,-5)).catch(()=>null)));return items.filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt);}
  async function write(req,destination,limit=MAX_BYTES,validate) {
    if(Number(req.headers['content-length'])>limit) throw fail('Files must be 250 MB or smaller.',413);
    let size=0, signature=Buffer.alloc(0);const temporary=destination+'.'+randomUUID()+'.part';
    try {
      await pipeline(req,new Transform({transform(chunk,encoding,callback) {size+=chunk.length;if(signature.length<16) signature=Buffer.concat([signature,chunk]).subarray(0,16);callback(size>limit ? fail('File is too large.',413):null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx'}));
      if(!size) throw fail('The file is empty.');
      if(validate) validate(signature);
      await fs.promises.rename(temporary,destination);return {size,signature};
    } catch(error) {await fs.promises.unlink(temporary).catch(()=>{});throw error;}
  }
  async function upload(req,params) {
    await ready();const name=path.basename(params.get('name') || ''), ext=path.extname(name).toLowerCase(),mime=TYPES[ext];
    if(!mime) throw fail('Choose a PDF, image, or playable video.');
    const width=Number(params.get('width')),height=Number(params.get('height')),pageCount=ext==='.pdf' ? Number(params.get('pages')):1;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>32768||height>32768||!Number.isInteger(pageCount)||pageCount<1||pageCount>10000) throw fail('Invalid media dimensions or page count.');
    const id='media_'+randomUUID(),file=path.join(directory,id+ext);
    try {
      const {size,signature}=await write(req,file);
      if(ext==='.pdf' && !signature.toString('ascii').startsWith('%PDF-')) throw fail('This file is not a valid PDF.');
      const item={id,name:name.slice(0,160),kind:ext==='.pdf'?'pdf':mime.startsWith('video/')?'video':'image',url:'/presentation/files/'+id+ext,width,height,pageCount,pages:{},size,createdAt:Date.now()};
      await fs.promises.writeFile(path.join(directory,id+'.json'),JSON.stringify(item),{flag:'wx'});return item;
    } catch(error) {await fs.promises.unlink(file).catch(()=>{});throw error;}
  }
  const queues=new Map();
  async function page(req,params) {
    const id=params.get('id'),number=Number(params.get('page')),item=await get(id);
    const width=Number(params.get('width')),height=Number(params.get('height'));
    if(item.kind!=='pdf'||!Number.isInteger(number)||number<1||number>item.pageCount||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096) throw fail('Invalid PDF page.');
    const thumbnail=params.get('thumbnail')==='1';
    const filename=id+'-page-'+number+(thumbnail?'-thumb':'')+'.png',file=path.join(directory,filename);
    await write(req,file,32*1024*1024,signature=>{if(!signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw fail('Expected a rendered PNG page.');});
    const result=thumbnail?{thumbnailUrl:'/presentation/files/'+filename}:{url:'/presentation/files/'+filename,width,height};
    const previous=queues.get(id) || Promise.resolve();
    const update=previous.catch(()=>{}).then(async()=>{const latest=await get(id);latest.pages[number]={...latest.pages[number],...result};const temporary=path.join(directory,id+'.json.part');await fs.promises.writeFile(temporary,JSON.stringify(latest));await fs.promises.rename(temporary,path.join(directory,id+'.json'));});
    queues.set(id,update);try {await update;} finally {if(queues.get(id)===update) queues.delete(id);}
    return result;
  }
  async function serve(req,res,pathname) {
    await ready();const name=pathname.slice('/presentation/files/'.length),ext=path.extname(name).toLowerCase();
    if(!/^media_[a-f0-9-]+(?:-page-[1-9]\d*(?:-thumb)?)?\.[a-z0-9]+$/.test(name)||!TYPES[ext]) {res.writeHead(404);res.end();return;}
    const file=path.join(directory,name);let stat;try {stat=await fs.promises.stat(file);} catch {res.writeHead(404);res.end();return;}
    let start=0,end=stat.size-1,status=200;
    const headers={'Content-Type':TYPES[ext],'Accept-Ranges':'bytes','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'};
    if(req.headers.range) {
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(match&&(match[1]||match[2])) {start=match[1]?Number(match[1]):Math.max(0,stat.size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),end):end;}
      if(!match||(!match[1]&&!match[2])||start>end||start>=stat.size) {res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD') {res.end();return;}
    const stream=fs.createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
  }
  return {list,get,upload,page,serve};
};
