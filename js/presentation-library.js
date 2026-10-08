/* Media and countdown cards use the same projection/staging controls as scripture and songs. */
(() => {
  const state=window.state, el=id=>document.getElementById(id), model=window.PresentationModel;
  let assets=bundledMediaAssets(),loaded=false,selection=null,selectedPage=1,libraryQuery='',dialogItem=null,returnFocus=null;
  let saveTimer=null,liveMediaCard=null,selectedMediaCard=null,outputFlags={clear:false,blackout:false};
  let countdownMode='time',durationDeadline=NaN,previewFinished=false,countdownPriorInert=false;
  let countdownSelectedBackground=null,countdownDialogToken=0,countdownUploading=false;
  let libraryPreviewVideo=null,librarySelectedRow=null,libraryPreviewObserver=null;
  const documents=new Map(), jobs=new Map(), readyImages=new Map(),loadedImages=new Set();
  const batches=new Map(),preparationWaiters=[];let preparing=0;
  function acquirePreparation() {if(preparing<2) {preparing++;return Promise.resolve();}return new Promise(resolve=>preparationWaiters.push(resolve));}
  function releasePreparation() {const next=preparationWaiters.shift();if(next) next();else preparing--;}
  const toolbarDisplays=new Map();
  const playIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';
  const escaped=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const notify=message=>window.showToast(message,'info');
  function bundledMediaAssets() {
    const seen=new Set(),items=[];
    for(const theme of Object.values(window.SANCTUARY_THEMES || {})) {
      const kind=theme.type,url=kind==='video'?theme.videoUrl:theme.imageUrl;
      if(theme.custom || !['image','video'].includes(kind) || !model.safeMediaUrl(url) || seen.has(url)) continue;
      seen.add(url);items.push({id:'builtin_'+theme.id,name:theme.name,kind,url,posterUrl:theme.imageUrl,width:1920,height:1080,pageCount:1,pages:{},ready:kind==='video',builtIn:true});
    }
    return items.sort((a,b)=>Number(a.kind==='video')-Number(b.kind==='video'));
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{window.sessionManager?.saveCurrentSessionSnapshot(null,true);
      try {localStorage.setItem('sf_workspace_dashboard_snapshot',JSON.stringify({dashboard:window.createDashboardSnapshot()}));}catch{}
    },0);
  }
  function destinations(value) {return value==='both'?['sanctuary','livestream']:[value];}
  function ensureImage(url) {
    if(readyImages.has(url)) return readyImages.get(url);
    const task=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{loadedImages.add(url);resolve(image);};image.onerror=()=>{loadedImages.delete(url);reject(new Error('The slide image is missing. Relink its file.'));};image.src=url;});
    readyImages.set(url,task);
    if(readyImages.size>8) readyImages.delete(readyImages.keys().next().value);return task.catch(error=>{readyImages.delete(url);throw error;});
  }
  async function json(response) {const data=await response.json();if(!response.ok) throw new Error(data.error || 'Media request failed.');return data.item;}
  async function load() {
    if(loaded) return;
    try {const response=await fetch('/api/presentation-media');const data=await response.json();if(!response.ok) throw new Error(data.error);assets=[...(data.items || []),...bundledMediaAssets()];loaded=true;window.MediaVideoDeck?.refresh();}
    catch(error) {if(el('media-upload-status')) el('media-upload-status').textContent=error.message || 'Could not load media.';}
    if(state.currentTab==='media') window.renderMediaLibrary();
  }
  window.refreshMediaLibrary=async()=>{loaded=false;await load();};
  window.onPresentationMediaDeleted=id=>{
    assets=assets.filter(asset=>asset.id!==id);stopLibraryPreview();window.MediaVideoDeck?.deleted(id);
    document.querySelector(`[data-media-library-id="${id}"]`)?.remove();
    if(librarySelectedRow?.dataset.mediaLibraryId===id) librarySelectedRow=null;
    if(state.activePresentation?.media?.assetId===id) {
      state.activePresentation=null;state.activeLiveSlideId=null;state.activeLiveText='';state.activeLiveRef='';window.broadcastState({clear:true});
    }
    if(selection?.id===id && !state.mediaVideoDeckActive) showMissing(selection);
    for(const item of state.agendaItems || []) if(item.countdown?.background?.id===id) item.countdown.background=null;
    if(state.activePresentation?.countdown?.background?.id===id) {state.activePresentation.countdown.background=null;window.broadcastState();}
    save();
  };
  let pdfLibrary;
  async function pdfjs() {
    if(!pdfLibrary) pdfLibrary=import('../assets/pdfjs/pdf.mjs').then(module=>{module.GlobalWorkerOptions.workerSrc='/assets/pdfjs/pdf.worker.mjs';return module;});
    return pdfLibrary;
  }
  async function documentFor(asset,source) {
    if(documents.has(asset.id)) return documents.get(asset.id);
    const lib=await pdfjs();
    const task=lib.getDocument({...(source ? {data:source}:{url:asset.url}),cMapUrl:'/assets/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/pdfjs/standard_fonts/',wasmUrl:'/assets/pdfjs/wasm/',isEvalSupported:false});
    task.onPassword=()=>task.destroy();
    const promise=task.promise.catch(error=>{documents.delete(asset.id);throw new Error(error.name==='PasswordException' || /password|destroyed/i.test(error.message)?'Encrypted PDFs are not supported. Upload an unlocked copy.':'This PDF could not be read. Upload a valid PDF.');});
    documents.set(asset.id,promise);return promise;
  }
  async function preparePage(asset,number) {
    const key=asset.id+':'+number;
    if(jobs.has(key)) return jobs.get(key);
    const task=(async()=>{
      await acquirePreparation();
      try {
      if(asset.pages[number]) {await ensureImage(asset.pages[number].url);updatePreparedPage(asset,number);return asset.pages[number];}
      const doc=await documentFor(asset),page=await doc.getPage(number),base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(1920/base.width,1080/base.height)});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      try {
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob) throw new Error('Could not render PDF page.');
        const params=new URLSearchParams({id:asset.id,page:number,width:canvas.width,height:canvas.height});
        const result=await json(await fetch('/api/presentation-media/page?'+params,{method:'POST',body:blob}));
        const thumb=document.createElement('canvas');const factor=Math.min(320/canvas.width,180/canvas.height);
        thumb.width=Math.max(1,Math.round(canvas.width*factor));thumb.height=Math.max(1,Math.round(canvas.height*factor));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
        const thumbBlob=await new Promise(resolve=>thumb.toBlob(resolve,'image/png'));
        if(thumbBlob) {const thumbParams=new URLSearchParams({id:asset.id,page:number,width:thumb.width,height:thumb.height,thumbnail:1});const rendered=await json(await fetch('/api/presentation-media/page?'+thumbParams,{method:'POST',body:thumbBlob}));Object.assign(result,rendered);}
        thumb.width=thumb.height=0;
        asset.pages[number]=result;await ensureImage(result.url);updatePreparedPage(asset,number);return result;
      } finally {page.cleanup();canvas.width=canvas.height=0;}
      } finally {releasePreparation();}
    })();
    jobs.set(key,task);try{return await task;}finally{jobs.delete(key);}
  }
  function updatePreparedPage(asset,number) {
    for(const card of document.querySelectorAll(`[data-media-id="${asset.id}"][data-page="${number}"]`)) {
      card.dataset.ready='true';card.querySelector('img').src=asset.pages[number].thumbnailUrl || asset.pages[number].url;card.querySelector('.media-load-status').textContent='';card.querySelector('.play-circle-btn').disabled=false;
    }
    if(number===1) {
      for(const row of document.querySelectorAll(`[data-media-library-id="${asset.id}"]`)) {
        const image=row.querySelector('img');if(image) image.src=asset.pages[1].thumbnailUrl || asset.pages[1].url;
      }
    }
    updateNavigation();
  }
  // At most two rasterization jobs; selected pages are prepared before the background queue.
  async function prepareAll(asset) {
    if(batches.has(asset.id)) return batches.get(asset.id);
    const batch=(async()=>{try {
      await preparePage(asset,1);if(asset.pageCount>1) await preparePage(asset,2);
      let next=3;
      const results=await Promise.allSettled([0,1].map(async()=>{while(next<=asset.pageCount) {const page=next++;await preparePage(asset,page);}}));
      const failure=results.find(result=>result.status==='rejected');if(failure) throw failure.reason;
    } finally {documents.get(asset.id)?.then(doc=>doc.destroy()).catch(()=>{});documents.delete(asset.id);}})();
    batches.set(asset.id,batch);try {return await batch;} finally {batches.delete(asset.id);}
  }
  window.uploadPresentationMedia=async input=> {
    const files=Array.from(input.files || input);if(input.value!==undefined) input.value='';
    if(REMOTE_MODE) {notify('Media uploads are controlled by the host.');return;}
    const status=el('media-upload-status');
    for(const file of files) {
      try {
        if(!file.size || file.size>250*1024*1024) throw new Error('Choose a non-empty file up to 250 MB.');
        const pdf=/\.pdf$/i.test(file.name),video=/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
        if(!/\.(pdf|png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/i.test(file.name)) throw new Error('Choose a PDF, supported image, or playable video.');
        status.textContent='Reading '+file.name+'…';
        let width=1,height=1,pages=1,document;
        if(pdf) {
          document=await documentFor({id:'pending-'+file.name},new Uint8Array(await file.arrayBuffer()));pages=document.numPages;
          const first=await document.getPage(1),viewport=first.getViewport({scale:1});width=Math.ceil(viewport.width);height=Math.ceil(viewport.height);first.cleanup();
        } else {
          const url=URL.createObjectURL(file);
          try {
            const media=video ? documentElementVideo():new Image();
            await new Promise((resolve,reject)=> {const timeout=setTimeout(()=>reject(new Error('File took too long to decode. Try another format.')),30000);const done=()=>{clearTimeout(timeout);resolve();};media.onload=media.onloadedmetadata=done;media.onerror=()=>{clearTimeout(timeout);reject(new Error('Unsupported media. Try PNG, JPG, MP4 (H.264), or WebM.'));};media.src=url;});
            width=video?media.videoWidth:media.naturalWidth;height=video?media.videoHeight:media.naturalHeight;
            if(video) {media.pause();media.removeAttribute('src');media.load();}
          } finally {URL.revokeObjectURL(url);}
        }
        status.textContent='Uploading '+file.name+'…';
        const params=new URLSearchParams({name:file.name,width,height,pages});
        const asset=await json(await fetch('/api/presentation-media?'+params,{method:'POST',body:file}));assets.unshift(asset);
        if(document) {documents.delete('pending-'+file.name);documents.set(asset.id,Promise.resolve(document));}
        if(asset.kind==='image') await ensureImage(asset.url);
        if(asset.kind==='video') asset.ready=true;
        window.renderMediaLibrary();if(selection?.type==='media' && !assets.some(item=>item.id===selection.id)) showMissing(selection);status.textContent=pdf ? 'Preparing PDF pages…':'';
        if(pdf) await prepareAll(asset);
        await window.loadSanctuaryUploads?.(false,true);window.refreshStyleGallery?.();
        status.textContent='';
      } catch(error) {status.textContent=file.name+': '+error.message;}
    }
  };
  function documentElementVideo() {const video=document.createElement('video');video.muted=true;video.preload='metadata';return video;}
  function stopLibraryPreview(video=libraryPreviewVideo) {
    if(!video) return;video.pause();
    try {video.currentTime=0;} catch {}
    if(libraryPreviewVideo===video) libraryPreviewVideo=null;
  }
  function playLibraryPreview(video) {
    if(libraryPreviewVideo!==video) stopLibraryPreview();
    libraryPreviewVideo=video;video.muted=true;video.defaultMuted=true;video.volume=0;
    video.play().catch(()=>{if(libraryPreviewVideo===video) libraryPreviewVideo=null;});
  }
  function mediaLibraryCard(asset) {
    const row=document.createElement('button');row.type='button';row.className='media-list-item';row.dataset.mediaLibraryId=asset.id;
    row.title=asset.name;row.setAttribute('aria-label','Open '+asset.name);row.classList.toggle('active',state.activeMediaId===asset.id);
    if(state.activeMediaId===asset.id) librarySelectedRow=row;
    const preview=document.createElement('span');preview.className='media-library-preview';
    const fallback=document.createElement('span');fallback.className='media-library-fallback';fallback.textContent=asset.kind==='pdf'?'Preparing first page…':'Loading preview…';
    const type=document.createElement('span');type.className='media-library-type';type.textContent=asset.kind==='pdf'?'PDF · '+asset.pageCount+(asset.pageCount===1?' page':' pages'):asset.kind==='video'?'Video':'Image';
    const title=document.createElement('span');title.className='media-library-name';title.textContent=asset.name;
    const hint=document.createElement('span');hint.className='media-library-hint';hint.textContent=asset.kind==='video'?'Hover to preview · Muted':asset.kind==='pdf'?'First page · Click to open':'Click to open · Drag to agenda';
    const caption=document.createElement('span');caption.className='media-library-caption';caption.append(title,hint);
    preview.append(fallback,type);row.append(preview,caption);
    if(asset.kind==='video') {
      const video=documentElementVideo();video.className='media-library-thumbnail';video.defaultMuted=true;video.setAttribute('muted','');video.playsInline=true;video.loop=true;video.setAttribute('aria-hidden','true');
      if(asset.posterUrl) {video.poster=asset.posterUrl;fallback.hidden=true;}
      video.onloadeddata=()=>{fallback.hidden=true;};video.onerror=()=>{fallback.hidden=false;fallback.textContent='Preview unavailable';};video.src=asset.url;preview.prepend(video);
      let dragging=false;
      row.onpointerenter=()=>playLibraryPreview(video);row.onpointerleave=()=>{if(!dragging) stopLibraryPreview(video);};
      row.ondragstart=event=>{dragging=true;event.dataTransfer.setData('application/presentation-id',asset.id);playLibraryPreview(video);};
      row.ondragend=()=>{dragging=false;stopLibraryPreview(video);};
    } else {
      const image=document.createElement('img');image.className='media-library-thumbnail';image.loading='lazy';image.alt=asset.kind==='pdf'?'First page of '+asset.name:asset.name;image.draggable=false;
      image.onload=()=>{fallback.hidden=true;};image.onerror=()=>{fallback.hidden=false;fallback.textContent='Preview unavailable';};preview.prepend(image);
      const source=asset.kind==='pdf'?(asset.pages[1]?.thumbnailUrl || asset.pages[1]?.url):asset.url;
      if(source) image.src=source;
      else if(asset.kind==='pdf') preparePage(asset,1).catch(()=>{if(row.isConnected) fallback.textContent='Preview unavailable';});
      row.ondragstart=event=>event.dataTransfer.setData('application/presentation-id',asset.id);
    }
    row.onclick=()=>{
      stopLibraryPreview();librarySelectedRow?.classList.remove('active');row.classList.add('active');librarySelectedRow=row;
      window.openPresentationItem({type:'media',id:asset.id,title:asset.name});
    };
    row.draggable=true;return row;
  }
  window.renderMediaLibrary=(query=libraryQuery)=> {
    if(state.currentTab!=='media') return false;libraryQuery=query || '';
    stopLibraryPreview();librarySelectedRow=null;
    const host=el('bento-library-list');host.classList.remove('bento-bible-grid');host.replaceChildren();
    if(!libraryPreviewObserver) {
      libraryPreviewObserver=new MutationObserver(()=>{if(libraryPreviewVideo && !libraryPreviewVideo.isConnected) stopLibraryPreview();});
      libraryPreviewObserver.observe(host,{childList:true,subtree:true});
      host.ondragover=event=>{if(Array.from(event.dataTransfer.types || []).includes('Files')) {event.preventDefault();host.classList.add('media-file-drag-over');}};
      host.ondragleave=event=>{if(!host.contains(event.relatedTarget)) host.classList.remove('media-file-drag-over');};
      host.ondrop=event=>{host.classList.remove('media-file-drag-over');if(event.dataTransfer.files.length) {event.preventDefault();event.stopPropagation();window.uploadPresentationMedia(event.dataTransfer.files);}};
      document.addEventListener('visibilitychange',()=>{if(document.hidden) stopLibraryPreview();});
      window.addEventListener('pagehide',()=>stopLibraryPreview());
    }
    if(!assets.length) {
    const drop=document.createElement('div');drop.id='media-dropzone';
    const label=document.createElement('span');label.className='media-upload-label';label.textContent='Add your media';
    const hint=document.createElement('span');hint.className='media-upload-hint';hint.textContent='Drop images, videos or PDFs here';
    drop.append(label,hint);
    const action=document.createElement('button');action.type='button';action.className='media-upload-icon';action.title='Upload media';action.setAttribute('aria-label','Upload media');action.onclick=()=>el('presentation-media-input').click();
    action.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5M12 3v12"/></svg>';
    drop.append(action);host.append(drop);
    drop.ondragover=event=>{event.preventDefault();drop.classList.add('drag-over');};drop.ondragleave=()=>drop.classList.remove('drag-over');drop.ondrop=event=>{event.preventDefault();event.stopPropagation();drop.classList.remove('drag-over');window.uploadPresentationMedia(event.dataTransfer.files);};
    }
    const matching=assets.filter(asset=>asset.name.toLowerCase().includes(libraryQuery.toLowerCase()));
    for(const asset of matching) host.append(mediaLibraryCard(asset));
    if(loaded && !matching.length) {const empty=document.createElement('p');empty.className='media-library-empty';empty.textContent=libraryQuery?'No matching media.':'Your media previews will appear here.';host.append(empty);}
    if(!loaded) load();return true;
  };
  window.addPresentationAssetToAgenda=id=> {const asset=assets.find(item=>item.id===id);if(!asset)return;state.agendaItems.push({type:'media',id,title:asset.name,page:1,meta:'Media'});window.renderAgenda();save();};
  window.addMediaToAgenda=()=> {
    if(!selection || selection.type!=='media') return;
    state.agendaItems.push({...selection,page:selectedPage,meta:'Media'});window.renderAgenda();save();
  };
  window.openPresentationItem=async item=> {
    if(item.type==='media') {
      await load();const asset=assets.find(asset=>asset.id===item.id);
      if(!asset) {selection=item;selectedPage=Number(item.page)||1;state.activeMediaId=item.id;showMissing(item);save();return;}
      if(asset.kind==='video' && window.MediaVideoDeck) {selection={...item,title:asset.name};selectedPage=1;window.MediaVideoDeck.open(asset);save();return;}
      state.mediaVideoDeckActive=false;window.MediaVideoDeck?.suspend();
      selection={...item,title:asset.name};selectedPage=Math.max(1,Math.min(asset.pageCount,Number(item.page)||state.mediaPageSelections?.[item.id]||1));
      state.activeMediaId=item.id;state.activeDeckType='media';state.isMedleyMode=false;
      window.renderDeck();
      try {if(asset.kind==='pdf') {await preparePage(asset,selectedPage);if(selectedPage<asset.pageCount) preparePage(asset,selectedPage+1).catch(error=>notify(error.message));prepareAll(asset).catch(error=>notify(error.message));}else {
        if(asset.kind==='image') await ensureImage(asset.url);
        else {const response=await fetch(asset.url,{method:'HEAD'});if(!response.ok) throw new Error('The video is missing. Relink its file.');asset.ready=true;}
        const card=el('bento_card_'+asset.id+'_page_1');if(card) {card.dataset.ready='true';card.querySelector('.media-load-status').textContent='';card.querySelector('.play-circle-btn').disabled=false;}
      }}
      catch(error) {notify(error.message);showMissing(item);}
    } else if(item.type==='countdown') {state.mediaVideoDeckActive=false;window.MediaVideoDeck?.suspend();selection=item;selectedPage=1;state.activeCountdownId=item.id;state.activeDeckType='countdown';state.isMedleyMode=false;window.renderDeck();}
    save();
  };
  function showMissing(item) {
    state.activeDeckType='media';el('media-controls-bar').hidden=true;el('bento-deck-title').textContent=item.title;el('bento-deck-sub').textContent='Missing media';const host=el('bento-medley-container');host.replaceChildren();
    const text=document.createElement('p');text.textContent='Missing media: '+item.title+'. Upload the replacement file, then choose Relink.';
    const upload=document.createElement('button');upload.textContent='Upload replacement';upload.onclick=()=>el('presentation-media-input').click();
    const picker=document.createElement('select');for(const asset of assets) {const option=document.createElement('option');option.value=asset.id;option.textContent=asset.name;picker.append(option);}
    const relink=document.createElement('button');relink.textContent='Relink';relink.onclick=()=>{const asset=assets.find(asset=>asset.id===picker.value);if(!asset)return;for(const entry of state.agendaItems) if(entry.type==='media'&&entry.id===item.id) {entry.id=asset.id;entry.title=asset.name;entry.page=1;}window.renderAgenda();save();window.openPresentationItem({type:'media',id:asset.id,title:asset.name});};host.append(text,upload,picker,relink);
  }
  function cardFor(item,page,asset) {
    const card=document.createElement('article'),id=item.type==='countdown'?item.id:`${item.id}_page_${page}`;
    card.id='bento_card_'+id;card.dataset.slideId=id;
    card.className='bento-single-card media-card';
    const ready=!asset || loadedImages.has(asset.kind==='pdf'?asset.pages[page]?.url:asset.url);
    card.dataset.ready=String(ready);if(asset) {card.dataset.mediaId=asset.id;card.dataset.page=page;}
    card.innerHTML=`<svg class="bento-live-shape-svg" aria-hidden="true"><path d=""/></svg><div class="head-tag-row"><span class="tag-title">${asset?.kind==='pdf'?'PAGE '+page:escaped(item.title)}</span><span class="live-pill" hidden>LIVE</span></div>${item.type==='countdown'?'<div class="countdown-preview"></div>':'<img class="media-thumbnail" loading="lazy" alt="Slide preview">'}<p class="media-load-status">${ready?'':'Preparing page…'}</p><div class="bento-corner-dock"><button type="button" class="play-circle-btn" aria-label="Take live" ${ready?'':'disabled'}>${playIcon}</button></div>`;
    if(asset) {const source=asset.kind==='pdf'?(asset.pages[page]?.thumbnailUrl || asset.pages[page]?.url):asset.url;if(source) card.querySelector('img').src=source;}
    card.querySelector('button').onclick=event=>{event.stopPropagation();take(item,page,true);};
    card.onclick=e=>{if(e.target.closest('.media-deck-player-bar')) return; take(item,page,false);};
    card.ondblclick=e=>{if(e.target.closest('.media-deck-player-bar')) return; take(item,page,true);};
    window.setupLiveCardObserver?.(card);
    return card;
  }
  function updateNavigation() {
    const asset=assets.find(asset=>asset.id===selection?.id);
    if(el('media-page-count')) el('media-page-count').textContent=`Page ${selectedPage} / ${asset?.pageCount || 1}`;
    if(el('media-prev')) el('media-prev').disabled=selectedPage<=1 || state.isHoldLive || !loadedImages.has(asset?.pages[selectedPage-1]?.url);
    if(el('media-next')) el('media-next').disabled=!asset || selectedPage>=asset.pageCount || state.isHoldLive || !loadedImages.has(asset.pages[selectedPage+1]?.url);
    const card=selection?.type==='media'?el(`bento_card_${selection.id}_page_${selectedPage}`):null;
    if(selectedMediaCard!==card) {selectedMediaCard?.classList.remove('selected');card?.classList.add('selected');selectedMediaCard=card;}
  }
  window.renderPresentationDeck=()=> {
    if(!['media','countdown'].includes(state.activeDeckType)) {
      window.MediaVideoDeck?.suspend();
      el('media-controls-bar').hidden=true;
      for(const [id,display] of toolbarDisplays) if(el(id)) el(id).style.display=display;
      toolbarDisplays.clear();return false;
    }
    if(state.activeDeckType==='media' && state.mediaVideoDeckActive && window.MediaVideoDeck) {
      for(const id of ['bento-edit-btn','bento-add-song-btn','bento-compare-btn','bento-strongs-btn','bento-concordance-search-btn','bento-mode-seg','bento-lines-seg','bento-cols-seg']) if(el(id)) {if(!toolbarDisplays.has(id))toolbarDisplays.set(id,el(id).style.display);el(id).style.display='none';}
      return window.MediaVideoDeck.render(el('bento-medley-container'));
    }
    const item=selection || (state.activeMediaId?{type:'media',id:state.activeMediaId,title:'Media'}:null);if(!item)return false;
    const asset=assets.find(asset=>asset.id===item.id);if(item.type==='media'&&!asset) {showMissing(item);return true;}
    if(asset?.kind==='video' && window.MediaVideoDeck) {state.mediaVideoDeckActive=true;return window.renderPresentationDeck();}
    const host=el('bento-medley-container');host.replaceChildren();host.className='bento-single-deck';host.dataset.cols=asset?.kind==='video'?'1':'2';
    for(const id of ['bento-edit-btn','bento-add-song-btn','bento-compare-btn','bento-strongs-btn','bento-lines-seg','bento-cols-seg']) if(el(id)) {if(!toolbarDisplays.has(id)) toolbarDisplays.set(id,el(id).style.display);el(id).style.display='none';}
    el('bento-deck-title').textContent=item.title;el('bento-deck-sub').textContent=asset?.kind==='pdf'?asset.pageCount+' pages':item.type==='countdown'?'Service-start countdown':asset?.kind || 'Media';
    const bar=el('media-controls-bar');bar.hidden=false;
    bar.innerHTML=`<div class="media-navigation">${asset?.kind==='pdf'?'<button id="media-prev" type="button">Previous</button><span id="media-page-count"></span><button id="media-next" type="button">Next</button>':''}<label>Show on <select id="media-dest"><option value="both">Both</option><option value="sanctuary">Projector</option><option value="livestream">Livestream</option></select></label>${item.type==='media'?'<button id="media-agenda" type="button">Add to agenda</button>':'<button id="countdown-edit" type="button">Edit countdown</button>'}</div>`;
    el('media-dest').value=item.destinations?.length===1?item.destinations[0]:'both';el('media-dest').onchange=()=>{selection.destinations=destinations(el('media-dest').value);};
    if(el('media-prev')) el('media-prev').onclick=()=>navigate(-1);if(el('media-next')) el('media-next').onclick=()=>navigate(1);
    if(el('media-agenda')) el('media-agenda').onclick=window.addMediaToAgenda;
    if(el('countdown-edit')) el('countdown-edit').onclick=()=>window.openCountdownSetup(selection);
    for(let page=1;page<=(asset?.pageCount || 1);page++) host.append(cardFor(item,page,asset));
    window.MediaVideoDeck?.sync();
    updateNavigation();highlight();tick();window.syncStagedCardVisuals?.();return true;
  };
  function navigate(delta) {
    if(state.isHoldLive) return;
    const asset=assets.find(asset=>asset.id===selection?.id),next=selectedPage+delta;
    if(!asset || next<1 || next>asset.pageCount || !loadedImages.has(asset.pages[next]?.url)) return;
    const live=!!state.activeLiveSlideId && !outputFlags.clear && !outputFlags.blackout && state.activePresentation?.media?.assetId===asset.id;
    selectedPage=next;state.mediaPageSelections={...state.mediaPageSelections,[asset.id]:next};updateNavigation();save();
    if(live) take(selection,next,true);if(next<asset.pageCount) preparePage(asset,next+1).catch(error=>notify(error.message));
  }
  function take(item,page,takeLive) {
    const asset=assets.find(asset=>asset.id===item.id);
    if(item.type==='media'&&(!asset || (asset.kind==='video'?!asset.ready:!loadedImages.has(asset.kind==='pdf'?asset.pages[page]?.url:asset.url)))) {notify('This slide is still preparing.');return;}
    const payload=item.type==='countdown'?{contentType:'countdown',countdown:{...item.countdown},destinations:item.destinations || ['sanctuary','livestream']}:{contentType:'media',media:{assetId:asset.id,kind:asset.kind==='video'?'video':'image',url:asset.kind==='pdf'?asset.pages[page].url:asset.url,page,name:asset.name},destinations:selection.destinations || ['sanctuary','livestream'],playback:{position:0,playing:asset.kind==='video',loop:false,soundTarget:'',updatedAt:Date.now()}};
    const id=item.type==='countdown'?item.id:`${item.id}_page_${page}`;
    window.projectSlide(id,item.title,item.type==='countdown'?'Countdown':`Page ${page}`,{takeLive,presentation:payload});
  }
  window.projectPresentation=(slideId,text,reference,extra)=> {
    if(REMOTE_MODE) {notify('Media projection is controlled by the host.');return;}
    if(state.isHoldLive) {notify('Release Hold live before changing the output.');return;}
    if(window.prepareSlideIfNeeded?.(slideId,text,reference,extra)) return;
    window.cancelPreparedSlide?.();state.activePresentation=extra.presentation;state.activeLexiconData=null;state.compareData=null;
    state.activeLiveSlideId=slideId;state.activeLiveText=text;state.activeLiveRef=reference;state.liveEngagedDeck={type:extra.presentation.contentType};
    if(extra.presentation.media) {selectedPage=extra.presentation.media.page;state.mediaPageSelections={...state.mediaPageSelections,[extra.presentation.media.assetId]:selectedPage};}
    save();highlight();window.broadcastState({slideId,text,reference,clear:false,blackout:false});updateNavigation();
  };
  function highlight() {
    const card=state.activeLiveSlideId?el('bento_card_'+state.activeLiveSlideId):null;
    if(liveMediaCard!==card) {
      if(liveMediaCard) {liveMediaCard.classList.remove('live');const badge=liveMediaCard.querySelector('.live-pill');if(badge)badge.hidden=true;}
      liveMediaCard=card?.classList.contains('media-card')?card:null;
      if(liveMediaCard) {liveMediaCard.classList.add('live');const badge=liveMediaCard.querySelector('.live-pill');if(badge)badge.hidden=false;}
    }
  }
  function tick() {
    for(const card of document.querySelectorAll('.media-card .countdown-preview')) {const item=selection?.type==='countdown'?selection:null;if(item) {const text=model.countdownView(item.countdown).clock;if(card.textContent!==text)card.textContent=text;}}
    if(el('countdown-setup-preview') && !el('countdown-setup-shield').hidden) renderCountdownPreview();
  }
  setInterval(tick,250);
  function countdownFields() {return {mode:countdownMode,date:el('countdown-date').value,time:el('countdown-start').value,minutes:el('countdown-minutes').value};}
  function countdownTheme(id) {
    const theme=window.SANCTUARY_THEMES?.[id];
    return theme?model.countdownBackground({...theme,id,fit:window.themeManager?.sanctuaryFits?.[id],dimmer:window.themeManager?.sanctuaryDimmer ?? 30}):null;
  }
  let countdownBackgroundButtons=new Map();
  let countdownActiveBackgroundButton=null;
  function countdownBackgroundOptions() {
    const grid=el('countdown-background-grid');
    grid.replaceChildren();countdownBackgroundButtons=new Map();countdownActiveBackgroundButton=null;
    const themes=[['', {...window.themeManager?.getSanctuaryPayload?.(),name:'Output background'}],
      ...Object.entries(window.SANCTUARY_THEMES || {}).filter(([id])=>id!=='deep_celestial')];
    if(countdownSelectedBackground && !window.SANCTUARY_THEMES?.[countdownSelectedBackground.id])
      themes.push([countdownSelectedBackground.id,{...countdownSelectedBackground,name:'Saved background'}]);
    for(const [id,theme] of themes) {
      const button=document.createElement('button'),swatch=document.createElement('span'),label=document.createElement('span');
      button.type='button';button.className='countdown-background-tile';button.title=theme.name;
      button.setAttribute('aria-label',theme.name);button.setAttribute('aria-pressed','false');
      swatch.className='countdown-background-swatch';swatch.style.background=theme.bgCss || theme.previewGradient || '#10121c';
      if(theme.imageUrl) {
        const image=document.createElement('img');image.src=theme.imageUrl;image.alt='';image.loading='lazy';swatch.append(image);
      } else if(theme.type==='video' && theme.videoUrl) {
        const video=document.createElement('video');video.src=theme.videoUrl;video.muted=true;video.playsInline=true;video.preload='metadata';
        video.onloadeddata=()=>{video.currentTime=Math.min(0.1,video.duration || 0);};swatch.append(video);
      }
      if(theme.type==='video') {const badge=document.createElement('small');badge.textContent='Motion';swatch.append(badge);}
      label.className='countdown-background-name';label.textContent=theme.name;
      button.append(swatch,label);button.onclick=()=>{el('countdown-background').value=id;window.selectCountdownBackground();};
      countdownBackgroundButtons.set(id,button);grid.append(button);
    }
    el('countdown-background').value=countdownSelectedBackground?.id || '';
    syncCountdownBackgroundSelection();
    window.filterCountdownBackgrounds(el('countdown-background-search').value);
  }
  window.filterCountdownBackgrounds=query=> {
    const term=String(query || '').trim().toLocaleLowerCase();
    let matches=0;
    for(const button of countdownBackgroundButtons.values()) {
      const visible=!term || button.title.toLocaleLowerCase().includes(term);
      button.hidden=!visible;if(visible)matches++;
    }
    el('countdown-background-empty').hidden=matches>0;
  };
  function syncCountdownBackgroundSelection() {
    const next=countdownBackgroundButtons.get(el('countdown-background').value);
    if(next===countdownActiveBackgroundButton)return;
    countdownActiveBackgroundButton?.setAttribute('aria-pressed','false');
    next?.setAttribute('aria-pressed','true');countdownActiveBackgroundButton=next;
  }
  window.selectCountdownBackground=()=> {
    const id=el('countdown-background').value;
    countdownSelectedBackground=id?(countdownTheme(id) || countdownSelectedBackground):null;
    syncCountdownBackgroundSelection();window.updateCountdownSetup();
  };
  window.setCountdownStylePart=part=> {
    for(const name of ['heading','timer','completion'])el(`countdown-style-${name}`).hidden=name!==part;
  };
  window.uploadCountdownBackground=async input=> {
    if(REMOTE_MODE || el('countdown-setup-shield').hidden || countdownUploading) {input.value='';return;}
    const requestToken=countdownDialogToken;countdownUploading=true;window.updateCountdownSetup();
    try {
      await window.uploadSanctuaryBackgrounds(input,{publish:false,buttonId:'countdown-upload-button',statusId:'countdown-upload-status',onSaved:item=>{
        if(requestToken!==countdownDialogToken || el('countdown-setup-shield').hidden)return;
        countdownSelectedBackground=countdownTheme(item.id);countdownBackgroundOptions();window.updateCountdownSetup();
      }});
    } catch(error) {if(requestToken===countdownDialogToken)el('countdown-upload-status').textContent=error.message || 'Could not upload background.';}
    finally {if(requestToken===countdownDialogToken){countdownUploading=false;window.updateCountdownSetup();}}
  };
  window.setCountdownColor=(part,value)=> {
    if(!['heading','timer','completion'].includes(part))return;
    const valid=/^#[a-f0-9]{6}$/i.test(value);
    el(`countdown-${part}-color-hex`).setAttribute('aria-invalid',String(!valid));
    if(valid) {el(`countdown-${part}-color`).value=value;window.updateCountdownSetup();}
  };
  function countdownDraft() {
    return {startsAt:countdownMode==='minutes'?durationDeadline:model.countdownDeadline(countdownFields()),
      message:el('countdown-message').value.trim() || 'Service starts in',completionMessage:el('countdown-completion').value.trim() || 'Service starting',
      ...model.countdownAppearance({font:el('countdown-font').value,timerScale:el('countdown-size').value,
        headingScale:el('countdown-heading-size').value,completionScale:el('countdown-completion-size').value,
        headingColor:el('countdown-heading-color').value,timerColor:el('countdown-timer-color').value,completionColor:el('countdown-completion-color').value}),
      background:model.countdownBackground(countdownSelectedBackground),inputMode:countdownMode,
      ...(countdownMode==='minutes'?{minutes:Number(el('countdown-minutes').value)}:{})};
  }
  function renderCountdownPreview() {
    const countdown=countdownDraft(),view=model.countdownView(previewFinished?{...countdown,startsAt:0}:countdown);
    const valid=Number.isFinite(countdown.startsAt),clock=el('countdown-preview-clock'),message=el('countdown-preview-message'),display=el('countdown-preview-display');
    const text=!valid && !previewFinished?'--:--':view.clock;
    if(clock.textContent!==text)clock.textContent=text;
    if(message.textContent!==view.message)message.textContent=view.message;
    message.hidden=view.finished && (valid || previewFinished);display.classList.toggle('countdown-finished',message.hidden);
    display.style.fontFamily=countdown.font?`'${countdown.font}', sans-serif`:`'${window.themeManager?.sanctuaryFont || 'Outfit'}', sans-serif`;
    display.style.setProperty('--countdown-scale',countdown.timerScale);
    window.CountdownRenderer.appearance(display,countdown,'cqw');
    for(const part of ['heading','timer','completion']) {
      const hex=el(`countdown-${part}-color-hex`);
      if(document.activeElement!==hex) {hex.value=countdown[`${part}Color`];hex.setAttribute('aria-invalid','false');}
    }
    const preview=el('countdown-setup-preview'),background=countdown.background || window.themeManager?.getSanctuaryPayload?.();
    window.CountdownRenderer.background(preview,background);
    for(const [id,value] of [['countdown-heading-size-value',countdown.headingScale],['countdown-size-value',countdown.timerScale],['countdown-completion-size-value',countdown.completionScale]])el(id).textContent=`${Math.round(value*100)}%`;
    el('countdown-save').disabled=countdownUploading || REMOTE_MODE || (!!dialogItem && state.isHoldLive);
    el('countdown-start-live').disabled=countdownUploading || REMOTE_MODE || state.isHoldLive;
    el('countdown-upload-button').disabled=countdownUploading || REMOTE_MODE;
  }
  window.updateCountdownSetup=(durationChanged=false)=>{
    if(durationChanged)durationDeadline=model.countdownDeadline(countdownFields());
    el('countdown-setup-error').textContent='';
    const countdown=countdownDraft();
    el('countdown-schedule-hint').textContent=Number.isFinite(countdown.startsAt)?`Service starts ${new Date(countdown.startsAt).toLocaleString()}`:'Choose a start time or enter 1–1440 minutes.';
    renderCountdownPreview();
  };
  window.setCountdownInputMode=mode=>{
    countdownMode=mode==='minutes'?'minutes':'time';
    el('countdown-time-fields').hidden=countdownMode==='minutes';el('countdown-minutes-field').hidden=countdownMode!=='minutes';
    el('countdown-mode-time').setAttribute('aria-pressed',String(countdownMode==='time'));el('countdown-mode-minutes').setAttribute('aria-pressed',String(countdownMode==='minutes'));
    window.updateCountdownSetup(countdownMode==='minutes');
  };
  window.setCountdownPreviewFinished=value=>{
    previewFinished=!!value;el('countdown-preview-running').setAttribute('aria-pressed',String(!previewFinished));el('countdown-preview-finished').setAttribute('aria-pressed',String(previewFinished));renderCountdownPreview();
  };
  window.openCountdownSetup=item=> {
    if(!el('countdown-setup-shield').hidden)window.closeCountdownSetup();
    window.dismissAllOverlays?.();returnFocus=document.activeElement;dialogItem=item || null;
    const requestToken=++countdownDialogToken;countdownUploading=false;
    el('countdown-background-search').value='';
    countdownSelectedBackground=model.countdownBackground(item?.countdown?.background);
    countdownBackgroundOptions();el('countdown-upload-status').textContent='';
    el('countdown-style-part').value='timer';window.setCountdownStylePart('timer');
    window.loadSanctuaryUploads?.(false)?.then(()=>{if(requestToken===countdownDialogToken && !el('countdown-setup-shield').hidden)countdownBackgroundOptions();});
    const date=new Date(item?.countdown?.startsAt || Date.now()+15*60*1000);const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    el('countdown-date').value=local.slice(0,10);el('countdown-start').value=local.slice(11);
    el('countdown-minutes').value=item?.countdown?.minutes || 15;
    el('countdown-message').value=item?.countdown?.message || 'Service starts in';el('countdown-completion').value=item?.countdown?.completionMessage || 'Service starting';el('countdown-dest').value=item?.destinations?.length===1?item.destinations[0]:'both';
    const appearance=model.countdownAppearance(item?.countdown);el('countdown-font').value=appearance.font;el('countdown-size').value=appearance.timerScale;
    for(const part of ['heading','completion']) {el(`countdown-${part}-size`).value=appearance[`${part}Scale`];el(`countdown-${part}-color`).value=appearance[`${part}Color`];}
    el('countdown-timer-color').value=appearance.timerColor;
    el('countdown-setup-error').textContent='';el('countdown-save').textContent=item?'Save changes':'Add to agenda';el('countdown-setup-shield').hidden=false;
    countdownPriorInert=el('bento-layout-root').inert;el('bento-layout-root').inert=true;
    window.setCountdownInputMode(item?.countdown?.inputMode);if(countdownMode==='minutes' && item)durationDeadline=item.countdown.startsAt;
    window.setCountdownPreviewFinished(false);window.updateCountdownSetup();el(countdownMode==='time'?'countdown-start':'countdown-minutes').focus();
  };
  window.closeCountdownSetup=()=>{if(el('countdown-setup-shield').hidden)return;el('countdown-setup-shield').hidden=true;++countdownDialogToken;window.CountdownRenderer.stop(el('countdown-setup-preview'));el('bento-layout-root').inert=countdownPriorInert;returnFocus?.focus({preventScroll:true});};
  window.saveCountdownSetup=(startNow=false)=> {
    if(REMOTE_MODE || countdownUploading || el('countdown-setup-shield').hidden) return;
    if(countdownMode==='minutes' && (startNow || !dialogItem))durationDeadline=model.countdownDeadline(countdownFields());
    const countdown=countdownDraft(),startsAt=countdown.startsAt;
    if(!Number.isFinite(startsAt)||startsAt<=Date.now()) {el('countdown-setup-error').textContent=countdownMode==='minutes'?'Enter a countdown duration between 1 and 1440 minutes.':'Choose a service start time in the future.';return;}
    if((dialogItem || startNow) && state.isHoldLive) {el('countdown-setup-error').textContent='Release Hold live to start or update the countdown.';return;}
    const item={type:'countdown',id:dialogItem?.id || 'countdown_'+Date.now(),title:countdown.message,meta:new Date(startsAt).toLocaleString(),countdown:{...countdown,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},destinations:destinations(el('countdown-dest').value)};
    if(dialogItem) {const index=state.agendaItems.findIndex(entry=>entry.id===item.id);if(index>=0) state.agendaItems[index]=item;if(selection?.id===item.id) selection=item;if(!startNow && state.activePresentation?.contentType==='countdown' && state.activeLiveSlideId===item.id) {state.activePresentation={contentType:'countdown',countdown:item.countdown,destinations:item.destinations};state.activeLiveText=item.title;window.broadcastState({clear:outputFlags.clear,blackout:outputFlags.blackout});}}
    else state.agendaItems.push(item);
    window.renderAgenda();save();window.closeCountdownSetup();
    if(selection?.id!==item.id)window.openPresentationItem(item);
    else {const title=el('bento-deck-title');if(title)title.textContent=item.title;const tag=el('bento_card_'+item.id)?.querySelector('.tag-title');if(tag)tag.textContent=item.title;tick();}
    if(startNow)take(item,1,true);
  };
  document.addEventListener('keydown',event=> {
    const shield=el('countdown-setup-shield');if(shield.hidden)return;
    if(event.key==='Escape') {event.preventDefault();event.stopImmediatePropagation();window.closeCountdownSetup();}
    if(event.key==='Tab') {const fields=[...shield.querySelectorAll('input,select,button,summary')].filter(node=>!node.disabled && node.getClientRects().length);const first=fields[0],last=fields[fields.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  },true);
  window.toggleAgendaAdd=event=> {
    event.stopPropagation();const menu=el('agenda-add-options');if(!menu.hidden) {window.closeAgendaAdd();return;}
    window.dismissAllOverlays?.();menu.hidden=false;el('agenda-add-shield').hidden=false;
    const trigger=el('agenda-add-trigger'),anchor=trigger.getBoundingClientRect();
    const width=menu.offsetWidth,height=menu.offsetHeight;
    const left=Math.max(8,Math.min(anchor.right-width,window.innerWidth-width-8));
    const below=anchor.bottom+6,above=anchor.top-height-6;
    const top=below+height<=window.innerHeight-8?below:Math.max(8,above);
    menu.style.left=`${left}px`;menu.style.top=`${Math.min(top,window.innerHeight-height-8)}px`;
    trigger.setAttribute('aria-expanded','true');menu.querySelector('button').focus({preventScroll:true});
  };
  window.closeAgendaAdd=()=>{el('agenda-add-options').hidden=true;el('agenda-add-shield').hidden=true;el('agenda-add-trigger').setAttribute('aria-expanded','false');};
  window.addEventListener('resize',()=>{if(!el('agenda-add-options').hidden)window.closeAgendaAdd();});
  document.addEventListener('scroll',event=>{const menu=el('agenda-add-options');if(!menu.hidden&&!menu.contains(event.target))window.closeAgendaAdd();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('agenda-add-options').hidden){event.preventDefault();event.stopImmediatePropagation();window.closeAgendaAdd();el('agenda-add-trigger').focus();}},true);
  const originalSync=window.syncPresentationControls;
  window.syncPresentationControls=payload=>{if(payload)outputFlags={clear:!!payload.clear,blackout:!!payload.blackout};originalSync(payload);window.MediaVideoDeck?.sync(payload);highlight();updateNavigation();tick();};
  window.MediaVideoDeck?.configure({assets:()=>assets,save});
  window.restorePresentationSelection=()=>{
    selection=null;window.MediaVideoDeck?.restore();
    if(state.activeDeckType==='media' && state.mediaVideoDeckActive) {load().then(()=>window.renderDeck());return;}
    if(state.activeDeckType==='countdown') {const item=state.agendaItems.find(item=>item.type==='countdown'&&item.id===state.activeCountdownId);if(item) window.openPresentationItem(item);}
    else if(state.activeDeckType==='media' && state.activeMediaId) load().then(()=>{const asset=assets.find(asset=>asset.id===state.activeMediaId);if(asset?.kind==='video') {state.mediaVideoDeckActive=true;window.renderDeck();}else window.openPresentationItem({type:'media',id:state.activeMediaId,title:'Media',page:state.mediaPageSelections?.[state.activeMediaId]});});
  };
  document.addEventListener('DOMContentLoaded',window.restorePresentationSelection);
})();
