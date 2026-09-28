import {parentPort} from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline,env} from '@huggingface/transformers';
import search from './semantic-search.cjs';
const root=path.resolve(import.meta.dirname,'..');
const folder=path.join(root,'assets/semantic');
env.allowRemoteModels=false;
env.localModelPath=path.join(folder,'models')+path.sep;
env.backends.onnx.wasm.numThreads=2;
let ready;
async function load(){
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
 const bytes=fs.readFileSync(path.join(folder,'vectors.f32'));
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 if(manifest.schemaVersion!==1 || hash(bytes)!==manifest.vectorsSha256 || hash(fs.readFileSync(path.join(root,'bibles/KJV.json')))!==manifest.bibleSha256)throw Error('Index source or checksum mismatch');
 const rowBytes=fs.readFileSync(path.join(folder,'verses.json'));
 if(hash(rowBytes)!==manifest.rowsSha256)throw Error('Verse metadata checksum mismatch');
 for(const [file,checksum] of Object.entries(manifest.modelFiles || {})) {
  const modelFile=path.resolve(folder,'models',file);
  if(!modelFile.startsWith(path.resolve(folder,'models')+path.sep) || hash(fs.readFileSync(modelFile))!==checksum)throw Error('Model checksum mismatch');
 }
 const rows=JSON.parse(rowBytes);
 if(rows.length!==manifest.count || bytes.length!==manifest.count*manifest.dimensions*4)throw Error('Invalid index size');
 const vectors=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const extractor=await pipeline('feature-extraction',manifest.model.id,{dtype:manifest.dtype,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
 return {manifest,rows,vectors,extractor};
}
// Service allows only one request in flight; no unbounded inference queue.
parentPort.on('message',async({id,text})=>{
 try{
  const {manifest,rows,vectors,extractor}=await (ready ||= load());
  const tensor=await extractor(manifest.model.prefix+text,{pooling:manifest.pooling,normalize:true,truncation:true,max_length:256});
  const best=search.rank(tensor.data,vectors,rows,manifest.dimensions);
  parentPort.postMessage({id,result:search.select(best,manifest)});
 }catch(error){ready=null;parentPort.postMessage({id,error:'Semantic index unavailable: '+error.message});}
});
