'use strict';
(function(root){
 const keyOf=item=>`${item._type||item.kind||(item.songId?'song':'verse')}:${item.songId ? `${item.songId}:${item.stanzaIndex||0}` : item.id||item.rawReference||item.reference}`;
 root.renderDetectionCards=function(list,items,{bento=false,diagnostics=false}={}){
  if(!list)return;
  if(list.style.overflowAnchor!=='none')list.style.overflowAnchor='none';
  const top=list.scrollTop;
  const viewportTop=top>0?list.getBoundingClientRect().top:0;
  const anchor=top>0?Array.from(list.children).find(node=>node.dataset.detectionKey && node.getBoundingClientRect().bottom>viewportTop):null;
  const anchorTop=anchor?anchor.getBoundingClientRect().top:0;
  if(!list._detectionCards){list._detectionCards=new Map();while(list.firstChild)list.firstChild.remove();}
  const map=list._detectionCards,wanted=new Set();
  for(const item of items.slice(0,60).reverse()){
   const key=keyOf(item);if(wanted.has(key))continue;wanted.add(key);
   let card=map.get(key);
   if(!card){
    card=document.createElement('div');card.className=bento?'bento-ai-card':'ai-detection-card';card.dataset.detectionKey=key;
    const header=document.createElement('div');header.className='ai-card-header';
    const badge=document.createElement('span');badge.className='ai-badge';header.appendChild(badge);
    const ref=document.createElement('span');ref.className='ai-card-ref';header.appendChild(ref);
    const score=document.createElement('span');score.className='ai-conf-pill';header.appendChild(score);
    const body=document.createElement('div');body.className='ai-card-body';
    const actions=document.createElement('div');actions.className='ai-card-actions';
    const project=document.createElement('button');project.type='button';project.className=bento?'bento-ai-btn proj':'ai-action-btn live-btn';
    project.onclick=e=>{e.stopPropagation();root.performDetectionAction?.(card._item,'select');};actions.appendChild(project);
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.className=bento?'bento-ai-btn':'ai-action-btn';dismiss.textContent='Dismiss';
    dismiss.onclick=e=>{e.stopPropagation();root.performDetectionAction?.(card._item,'dismiss');};actions.appendChild(dismiss);
    if(bento){const agenda=document.createElement('button');agenda.type='button';agenda.className='ai-action-btn';agenda.textContent='Add to Agenda';agenda.onclick=e=>{e.stopPropagation();const item=card._item;root.addAiToAgenda?.(item.rawReference||item.reference||item.title);};actions.appendChild(agenda);card._agenda=agenda;}
    card.appendChild(header);card.appendChild(body);card.appendChild(actions);card._parts={ref,score,body,project,badge};
    map.set(key,card);list.insertBefore(card,list.firstChild);
   }
   card._item=item;
   if(card._agenda)card._agenda.style.display=item._type==='concordance'||item.kind==='chapter'?'none':'';
   const ref=item.rawReference||item.reference||item.title||`${item.id}: ${item.translit||''}`;
   const text=item.text||item.fullStanzaText||item.shortDef||item.def||'';
   const score=item.detectionScore??item.confidence;
   const values={ref,badge:item._type==='concordance'?(item.lang||'Word Study'):item.songId?'SONG':item.kind==='semantic'?'SEMANTIC':item.kind==='quotation'?'QUOTE':item.kind==='chapter'?'CHAPTER':'SCRIPTURE',body:text,score:score===undefined?'':`Match ${score}`,project:item._type==='concordance'?'Word Study':item.kind==='chapter'?'Open Chapter':'Project Live'};
   for(const [part,value] of Object.entries(values))if(card._parts[part].textContent!==value)card._parts[part].textContent=value;
   card._parts.score.title='Detection match score, not a calibrated probability';
   card.classList.toggle('scripture-card',!item.songId);card.classList.toggle('song-card',!!item.songId);
  }
  for(const [key,card] of map)if(!wanted.has(key)){card.remove();map.delete(key);}
  if(!list._empty){list._empty=document.createElement('div');list._empty.className='ai-empty-state';list._empty.textContent='No detections yet.';list.appendChild(list._empty);}
  list._empty.style.display=map.size>0?'none':'';
  if(diagnostics&&!list._diagnostics){const button=document.createElement('button');button.type='button';button.className='ai-diagnostics-btn';button.textContent='Export diagnostics';button.title='Download recent detection decisions and operator actions';button.onclick=()=>root.exportDetectionDiagnostics?.();list._diagnostics=button;list.appendChild(button);}
  if(top>0)list.scrollTop=top+(anchor?.isConnected?anchor.getBoundingClientRect().top-anchorTop:0);else list.scrollTop=0;
 };
 root.detectionCardKey=keyOf;
})(window);
