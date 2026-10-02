'use strict';
importScripts('quotation-index.js');
let index=null;
self.onmessage=({data})=>{
  try {
    if(data.type==='build') { index=new self.QuotationIndex(data.bible,data.version);self.postMessage({type:'ready',generation:data.generation}); }
    else if(data.type==='query' && index) self.postMessage({type:'result',id:data.id,generation:data.generation,match:index.match(data.text) || (data.combinedText ? index.match(data.combinedText) : null)});
  } catch (_) { self.postMessage({type:'error',generation:data.generation}); }
};
