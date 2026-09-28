'use strict';
const fs=require('node:fs'),path=require('node:path');
const Service=require('../lib/semantic-service.cjs');
(async()=>{
 const service=new Service(),results=[];
 try {
  for(const c of require('../evaluation/semantic-cases.json')) {
   const start=performance.now(),match=await service.query(c.text);
   results.push({...c,match,latencyMs:performance.now()-start});
  }
  const positives=results.filter(r=>r.reference),negatives=results.filter(r=>!r.reference);
  const report={scope:'Actual offline host-worker inference on authored development queries; not live STT or held-out service accuracy',summary:{positiveCount:positives.length,acceptedCorrect:positives.filter(r=>r.match?.reference===r.reference).length,acceptedWrong:results.filter(r=>r.match&&r.match.reference!==r.reference).length,negativeCount:negatives.length,negativesRejected:negatives.filter(r=>!r.match).length},results};
  fs.writeFileSync(path.join(__dirname,'../evaluation/semantic-runtime-results.json'),JSON.stringify(report,null,2)+'\n');console.log(report.summary);
 }finally{service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
