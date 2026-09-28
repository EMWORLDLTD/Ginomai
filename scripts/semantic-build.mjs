import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline,env} from '@huggingface/transformers';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'assets/semantic');
env.cacheDir=path.join(output,'models');
env.backends.onnx.wasm.numThreads=2;
const bibleBytes=fs.readFileSync(path.join(root,'bibles/KJV.json'));
const bible=JSON.parse(bibleBytes);
const rows=Object.entries(bible).flatMap(([book,chapters])=>Object.entries(chapters).flatMap(([chapter,verses])=>verses.map(v=>({reference:`${book} ${chapter}:${v.verse}`,book,chapter:+chapter,verse:v.verse,text:v.text}))));
const cases=JSON.parse(fs.readFileSync(path.join(root,'evaluation/semantic-cases.json')));
const models=[{id:'Xenova/all-MiniLM-L6-v2',prefix:'',pooling:'mean'},{id:'Xenova/bge-small-en-v1.5',prefix:'Represent this sentence for searching relevant passages: ',pooling:'mean'}];
function rank(query,vectors,records) {
 return records.map((row,i)=>{let score=0;for(let d=0;d<384;d++)score+=query[d]*vectors[i*384+d];return {reference:row.reference,score};}).sort((a,b)=>b.score-a.score).slice(0,5);
}
async function embed(extractor,records,onBatch) {
 const vectors=new Float32Array(records.length*384);
 for(let i=0;i<records.length;i+=32){const result=await extractor(records.slice(i,i+32).map(r=>r.text),{pooling:'mean',normalize:true,truncation:true,max_length:256});vectors.set(result.data,i*384);if(onBatch)onBatch(i);}
 return vectors;
}
const sample=rows.filter((r,i)=>i%31===0||cases.some(c=>c.reference===r.reference));
const reports=[];
for(const model of models){
 console.error(`Benchmarking ${model.id} against ${sample.length} verses`);
 const start=performance.now();const extractor=await pipeline('feature-extraction',model.id,{dtype:'q8',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
 const loadMs=performance.now()-start,embeddingStart=performance.now();const vectors=await embed(extractor,sample);const buildMs=performance.now()-embeddingStart;
 const results=[];
 for(const c of cases){const at=performance.now();const tensor=await extractor(model.prefix+c.text,{pooling:model.pooling,normalize:true});results.push({...c,top:rank(tensor.data,vectors,sample),latencyMs:performance.now()-at});}
 const positives=results.filter(r=>r.reference);const top1=positives.filter(r=>r.top[0].reference===r.reference).length;
 reports.push({model,loadMs,buildMs,sampleSize:sample.length,top1,positiveCount:positives.length,results});await extractor.dispose();
 fs.writeFileSync(path.join(root,'evaluation/semantic-model-benchmark.json'),JSON.stringify({scope:'Development subset benchmark, not held-out service accuracy',reports},null,2));
}
reports.sort((a,b)=>b.top1-a.top1||a.buildMs-b.buildMs);const winner=reports[0].model;
console.error(`Building full index with ${winner.id}, ${rows.length} verses`);
const extractor=await pipeline('feature-extraction',winner.id,{dtype:'q8',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
const started=performance.now();const vectors=await embed(extractor,rows,i=>{if(i%1024===0)console.error(`${i}/${rows.length}`);});
fs.writeFileSync(path.join(output,'vectors.f32'),Buffer.from(vectors.buffer));fs.writeFileSync(path.join(output,'verses.json'),JSON.stringify(rows));
const results=[];for(const c of cases){const at=performance.now();const tensor=await extractor(winner.prefix+c.text,{pooling:winner.pooling,normalize:true});results.push({...c,top:rank(tensor.data,vectors,rows),latencyMs:performance.now()-at});}
fs.writeFileSync(path.join(root,'evaluation/semantic-full-results.json'),JSON.stringify({scope:'Full KJV retrieval; authored development queries, not independent service evaluation',model:winner,buildMs:performance.now()-started,results},null,2));
const modelFiles={};
for(const file of fs.readdirSync(path.join(output,'models',winner.id),{recursive:true})) {const full=path.join(output,'models',winner.id,file);if(fs.statSync(full).isFile())modelFiles[winner.id+'/'+file]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({schemaVersion:1,runtimeVersion:'3.8.1',modelFiles,rowsSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(output,'verses.json'))).digest('hex'),version:'KJV',model:winner,dimensions:384,count:rows.length,dtype:'q8',pooling:winner.pooling,normalized:true,bibleSha256:crypto.createHash('sha256').update(bibleBytes).digest('hex'),vectorsSha256:crypto.createHash('sha256').update(Buffer.from(vectors.buffer)).digest('hex'),minScore:.65,minMargin:.06},null,2));
await extractor.dispose();console.error('Index complete');
