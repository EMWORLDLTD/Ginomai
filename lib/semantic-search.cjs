'use strict';
function rank(query,vectors,rows,dimensions) {
 if(query.length!==dimensions || vectors.length!==rows.length*dimensions) throw Error('Embedding dimensions mismatch');
 const best=[];
 for(let i=0;i<rows.length;i++) {
  let score=0;for(let d=0;d<dimensions;d++)score+=query[d]*vectors[i*dimensions+d];
  if(!Number.isFinite(score))throw Error('Invalid embedding');
  if(best.length<5||score>best.at(-1).score){best.push({row:rows[i],score});best.sort((a,b)=>b.score-a.score);best.length=Math.min(5,best.length);}
 }
 return best;
}
function select(best,manifest) {
 if(!best.length || best[0].score<manifest.minScore || (best[1]&&best[0].score-best[1].score<manifest.minMargin))return null;
 const {row,score}=best[0];
 return {...row,version:manifest.version,kind:'semantic',similarity:score,detectionScore:Math.round(score*100),recognitionConfidence:null,autoProjectEligible:false,matchMethod:'local-embedding'};
}
module.exports={rank,select};
