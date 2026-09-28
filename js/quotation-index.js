'use strict';
// Local lexical retrieval only. No embeddings, external API, or text downloads.
(function (root) {
  const stop = new Set('a an the and or but for of to in on at by with from as is are was were be been being it its this that these those which who whom whose you your yours thee thou thy thine he his him she her they them their we us our i me my have has had hath hast do does did doth shall will may might can could would should unto'.split(' '));
  function tokens(text) {
    return (String(text).toLowerCase().replace(/<[^>]*>/g,' ').match(/[a-z]+/g) || []).filter(t => !stop.has(t));
  }
  const grams = words => words.slice(2).map((_,i) => words.slice(i,i+3).join(' '));
  class QuotationIndex {
    constructor(data, version) {
      this.version=version;this.rows=[];this.postings=new Map();this.frequency=new Map();
      for(const [book,chapters] of Object.entries(data || {})) for(const [chapter,verses] of Object.entries(chapters || {})) {
        if(!Array.isArray(verses)) continue;
        for(const verse of verses) {
          if(!Number.isInteger(verse.verse) || typeof verse.text!=='string') continue;
          const words=tokens(verse.text),id=this.rows.length;
          if(words.length<5) continue;
          this.rows.push({book,chapter:Number(chapter),verse:verse.verse,text:verse.text,words,reference:`${book} ${chapter}:${verse.verse}`});
          for(const word of new Set(words)) this.frequency.set(word,(this.frequency.get(word)||0)+1);
          for(const gram of new Set(grams(words))) {
            if(!this.postings.has(gram)) this.postings.set(gram,[]);
            this.postings.get(gram).push(id);
          }
        }
      }
    }
    match(text) {
      const query=tokens(text).slice(-120), unique=new Set(query);
      if(query.length<5 || unique.size<5) return null;
      const votes=new Map();
      for(const gram of new Set(grams(query))) for(const id of this.postings.get(gram)||[]) votes.set(id,(votes.get(id)||0)+1);
      const ranked=[];
      for(const [id] of [...votes].sort((a,b)=>b[1]-a[1]).slice(0,80)) {
        const row=this.rows[id], shared=[...new Set(row.words)].filter(w=>unique.has(w));
        const rareWords = shared.filter(w=>(this.frequency.get(w)||0)/this.rows.length<.015).length;
        const uniquePhrases = grams(query).filter(g => this.postings.get(g)?.length === 1 && this.postings.get(g)[0] === id).length;
        if(shared.length<5 || (rareWords<2 && !(rareWords>=1 && uniquePhrases>=2))) continue;
        // Ordered evidence tolerates omitted function words and small transcription edits.
        let previous=new Uint16Array(row.words.length+1);
        for(const word of query) {
          const current=new Uint16Array(row.words.length+1);
          for(let j=1;j<=row.words.length;j++) current[j]=word===row.words[j-1]?previous[j-1]+1:Math.max(previous[j],current[j-1]);
          previous=current;
        }
        const ordered=previous[row.words.length];
        const coverage=ordered/Math.min(query.length,row.words.length);
        if(ordered<5 || coverage<.75 || ordered/query.length<.5) continue;
        const score=coverage*.7+Math.min(1,shared.length/10)*.3;
        ranked.push({row,score,ordered,coverage});
      }
      ranked.sort((a,b)=>b.score-a.score);
      if(!ranked.length || (ranked[1] && ranked[0].score-ranked[1].score<.06)) return null;
      const {row,score,ordered}=ranked[0];
      return {reference:row.reference,book:row.book,chapter:row.chapter,verse:row.verse,text:row.text,version:this.version,
        kind:'quotation',detectionScore:Math.round(score*100),confidence:Math.round(score*100),recognitionConfidence:null,
        evidenceWords:ordered,autoProjectEligible:false,matchMethod:'full-bible-phrase-index'};
    }
  }
  root.QuotationIndex=QuotationIndex;
  if(typeof module!=='undefined' && module.exports) module.exports={QuotationIndex};
})(typeof self!=='undefined'?self:globalThis);
