'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
class SemanticService {
 constructor(){this.worker=null;this.pending=null;this.id=0;}
 query(text){
  if(this.pending)return Promise.reject(Error('Semantic retrieval busy'));
  if(typeof text!=='string'||text.length>2000||text.trim().split(/\s+/).length<5)return Promise.resolve(null);
  if(!this.worker){
   const worker=this.worker=new Worker(path.join(__dirname,'semantic-worker.mjs'));worker.unref();
   worker.on('message',message=>{
    if(this.worker!==worker||!this.pending||message.id!==this.pending.id)return;
    const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
    if(message.error)pending.reject(Error(message.error));else pending.resolve(message.result);
   });
   worker.on('error',()=>{if(this.worker===worker)this.close('Semantic worker failed');});
   worker.on('exit',()=>{if(this.worker===worker)this.close('Semantic worker exited');});
  }
  return new Promise((resolve,reject)=>{
   const id=++this.id;const timer=setTimeout(()=>this.close('Semantic retrieval timed out'),15000);timer.unref();
   this.pending={id,resolve,reject,timer};this.worker.postMessage({id,text});
  });
 }
 close(reason='Semantic retrieval stopped'){
  const worker=this.worker;this.worker=null;
  if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(reason));this.pending=null;}
  worker?.terminate();
 }
}
module.exports=SemanticService;
