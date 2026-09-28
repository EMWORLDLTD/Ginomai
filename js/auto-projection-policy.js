'use strict';
(function(root){
 class AutoProjectionPolicy {
  constructor({readState,project,diagnose=()=>{},now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}) {
   Object.assign(this,{readState,project,diagnose,now,schedule,cancel});this.pending=null;this.timer=null;this.lastKey=null;this.lastShown=-Infinity;this.manual=false;
  }
  clear(reason){if(this.timer!==null)this.cancel(this.timer);this.timer=null;if(this.pending)this.diagnose('suppressed',{reason,reference:this.pending.item.rawReference});this.pending=null;}
  manualSelection(reference){this.clear('manual-selection');this.manual=true;this.lastShown=this.now();this.diagnose('manual-selection',{reference});}
  arm(){this.clear('rearmed');this.manual=false;this.lastKey=null;}
  offer(item,execute){
   const state=this.readState(),now=this.now();
   if(item.correction){this.clear('correction');this.diagnose('correction',{reference:item.rawReference});return;}
   const reason=!state.autoProject?'disabled':state.isHoldLive?'hold':this.manual?'manual-authority':
    item.autoProjectEligible!==true||item.kind!=='verse'||item.validation!=='verified'?'not-explicit-verified':
    (item.detectionScore??item.confidence??0)<95?'weak-evidence':
    item.recognitionConfidence!==null&&item.recognitionConfidence!==undefined&&item.recognitionConfidence<.8?'weak-recognition':
    !Number.isFinite(item.timestamp)||now-item.timestamp>6000||item.timestamp>now+100?'stale':null;
   if(reason){if(['verse','chapter'].includes(item.kind) && this.pending && this.pending.item.rawReference!==item.rawReference)this.clear('uncertain-reference');this.diagnose('suppressed',{reason,reference:item.rawReference});return;}
   const key=`${item.version||state.bibleVersion}:${item.rawReference}`;
   if(key===this.lastKey){this.diagnose('suppressed',{reason:'duplicate',reference:item.rawReference});return;}
   if(this.pending?.key===key)return; // Repeated callbacks do not postpone stability indefinitely.
   this.clear('superseded');this.pending={item,key,execute,version:state.bibleVersion};
   this.timer=this.schedule(()=>this.commit(),Math.max(350,this.lastShown+4000-now));
  }
  commit(){
   this.timer=null;const pending=this.pending;this.pending=null;if(!pending)return;
   const state=this.readState();
   if(!state.autoProject||state.isHoldLive||this.manual||state.bibleVersion!==pending.version||this.now()-pending.item.timestamp>6000){this.diagnose('suppressed',{reason:'state-changed-or-stale',reference:pending.item.rawReference});return;}
   try{if((pending.execute||this.project)(pending.item)===false)return;this.lastKey=pending.key;this.lastShown=this.now();this.diagnose('auto-projected',{reference:pending.item.rawReference});}
   catch(_){this.diagnose('projection-failed',{reference:pending.item.rawReference});}
  }
 }
 root.AutoProjectionPolicy=AutoProjectionPolicy;if(typeof module!=='undefined')module.exports={AutoProjectionPolicy};
})(typeof window!=='undefined'?window:globalThis);
