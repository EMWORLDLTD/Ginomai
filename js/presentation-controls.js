/* Appearance drafts never enter the live transport. Quick size/effect controls remain independent. */
(() => {
  const el = id => document.getElementById(id);
  let lastPayload = null, draft = null, originalView = null, target = 'sanctuary';
  let comparison = false, uploading = false, token = 0, priorInert = false;
  const dirty = new Set(), fitDirty = new Set();
  const backgroundButtons = new Map();
  const streamImageButtons = new Map();
  let selectedStreamImage='';
  let galleryCategory='all',selectedBackground=null;
  let backgroundThumbnails;
  let galleryThemes;
  const previewRatios={sanctuary:1920/1080,livestream:1920/1080};
  try { window.state.streamAppearance = window.normalizeStreamAppearance(JSON.parse(localStorage.getItem('sf_stream_appearance') || '{}')); }
  catch { window.state.streamAppearance = window.normalizeStreamAppearance(); }
  function settings() {
    const manager = window.themeManager;
    return {activeSanctuaryTheme:manager.activeSanctuaryTheme, sanctuaryFont:manager.sanctuaryFont,
      sanctuaryDimmer:manager.sanctuaryDimmer, sanctuaryFits:{...manager.sanctuaryFits},
      obsModeRule:manager.obsModeRule === 'follow' ? 'always_lt' : manager.obsModeRule,
      streamAppearance:{...window.state.streamAppearance}, transparentBg:window.state.transparentBg};
  }
  function previewPayload() {
    const state = window.state;
    const payload = {...lastPayload, slideId:state.activeLiveSlideId, text:state.activeLiveText || 'Amazing grace\nHow sweet the sound',
      reference:state.activeLiveRef || '', textSize:state.textSize, songScaleFull:state.songScaleFull, songScaleLt:state.songScaleLt,
      sanctuaryTheme:window.themeManager.getSanctuaryPayload(comparison ? undefined : draft),
      streamAppearance:comparison ? state.streamAppearance : draft.streamAppearance,
      transparentBg:comparison ? state.transparentBg : draft.transparentBg,
      mode:state.currentMode, transitionType:'cut', _timestamp:Date.now(), _serverTime:Date.now(), dashboard:undefined};
    if (!comparison) { payload.clear=false; payload.blackout=false; }
    if (!comparison && ['media','countdown'].includes(payload.contentType)) {
      Object.assign(payload,{contentType:'song',slideId:'style-sample',text:'Amazing grace\nHow sweet the sound',reference:'',isBible:false,media:null,countdown:null,playback:null,destinations:['sanctuary','livestream']});
    }
    const caption=el('style-preview-caption-label');
    if(caption) caption.textContent=!comparison && ['media','countdown'].includes(lastPayload?.contentType) ? 'Preview only · Sample lyrics' : 'Preview only';
    return payload;
  }
  function renderPreview() {
    if (!draft) return;
    for(const [id,destination] of [['style-preview-frame','sanctuary'],['style-preview-livestream-frame','livestream']]) {
      const frame=el(id),url=`display.html?target=${destination}&embedded=1&draft=1`;
      frame.hidden=destination!==target;
      if(frame.getAttribute('src')!==url) frame.src=url;
    }
    const frame=el(target==='livestream'?'style-preview-livestream-frame':'style-preview-frame');
    if(frame.parentElement) frame.parentElement.style.aspectRatio=previewRatios[target];
    frame.contentWindow?.postMessage({type:'APPEARANCE_PREVIEW',payload:previewPayload()}, window.location.origin);
  }
  window.syncPresentationControls = payload => {
    if (payload) lastPayload = payload;
    const state = window.state;
    const liveStatus = el('bento-live-status');
    if (liveStatus) liveStatus.textContent = lastPayload?.blackout ? 'BLACKOUT' : lastPayload?.clear ? 'CLEARED' : state.activeLiveSlideId ? 'LIVE' : 'IDLE';
    const label = el('bento-hold-btn')?.querySelector('.btn-label');
    if (label) label.textContent = state.isHoldLive ? 'Release hold' : 'Hold live';
    if (!draft) return;
    const style = draft.streamAppearance, surface = draft.transparentBg ? 'none' : style.surface;
    el('style-projector-controls').hidden = target === 'livestream' && draft.obsModeRule === 'always_lt';
    el('style-font-controls').hidden = el('style-projector-controls').hidden;
    backgroundThumbnails?.refresh();
    el('style-overlay-controls').hidden = target !== 'livestream' || draft.obsModeRule !== 'always_lt';
    el('style-shared-note').hidden = target !== 'livestream';
    el('style-layout-row').hidden = target !== 'livestream';
    for (const button of el('presentation-settings').querySelectorAll('[data-style-target]')) button.setAttribute('aria-pressed',String(button.dataset.styleTarget===target));
    morphSelection('.style-targets','data-style-target');
    for (const [id,value] of [['stream-background-solid','solid'],['stream-background-none','none'],['stream-background-image','image']]) {
      el(id).setAttribute('aria-pressed',String(surface===value)); el(id).disabled=uploading || REMOTE_MODE;
    }
    el('stream-upload-trigger').disabled=uploading || REMOTE_MODE;
    el('stream-bottom-fade-row').hidden=surface!=='none';
    el('stream-bottom-fade').checked=style.bottomFade;
    el('stream-bottom-fade').disabled=uploading || REMOTE_MODE;
    el('stream-fade-strength-row').hidden=surface!=='none' || !style.bottomFade;
    el('stream-fade-strength').value=style.opacity;
    el('stream-fade-strength').disabled=uploading || REMOTE_MODE;
    el('stream-fade-strength-value').textContent=style.opacity+'%';
    if(el('stream-image-crop')) el('stream-image-crop').disabled=uploading || REMOTE_MODE;
    el('stream-image-library').hidden=surface!=='image';
    syncStreamImageSelection();
    for (const button of el('style-font-controls').querySelectorAll('[data-style-font]')) button.setAttribute('aria-pressed',String(button.dataset.styleFont===draft.sanctuaryFont));
    syncBackgroundSelection();
    for (const [id,value] of [['style-layout',draft.obsModeRule],['style-dimmer',draft.sanctuaryDimmer],['style-fit',draft.sanctuaryFits[draft.activeSanctuaryTheme] || 'cover'],['stream-reference-style',style.referenceStyle],['stream-opacity',style.opacity],['stream-band-height',style.height],['stream-image-position',style.position]]) el(id).value=value;
    el('stream-image-actions').hidden=surface!=='image' || !style.imageUrl;
    el('stream-opacity-row').hidden=surface==='none';
    el('stream-position-row').hidden=surface!=='image' || !style.imageUrl;
    el('stream-reference-style').closest('label').hidden=lastPayload?.contentType!=='bible' && !lastPayload?.isBible;
    el('style-apply').disabled=!dirty.size || state.isHoldLive || REMOTE_MODE || uploading;
    el('style-status').textContent=uploading ? 'Saving background…' : state.isHoldLive ? 'Release Hold live to apply.' : REMOTE_MODE ? 'Style is controlled by the host.' : dirty.size ? 'Preview only — apply when ready.' : '';
    el('style-compare').textContent=comparison ? 'View changes' : 'View live';
    renderPreview();
  };
  window.updateStyleDraft = patch => {
    if (!draft || REMOTE_MODE) return;
    for (const [key,value] of Object.entries(patch)) if (Object.hasOwn(draft,key) && !['streamAppearance','sanctuaryFits'].includes(key)) { draft[key]=value; dirty.add(key); }
    comparison=false; window.syncPresentationControls();
  };
  window.updateStyleFit = value => {
    if (!draft || !['cover','contain','fill'].includes(value) || REMOTE_MODE) return;
    draft.sanctuaryFits[draft.activeSanctuaryTheme]=value; fitDirty.add(draft.activeSanctuaryTheme); dirty.add('sanctuaryFits');
    comparison=false; window.syncPresentationControls();
  };
  window.updateStreamAppearance = patch => {
    if (!draft || REMOTE_MODE) return;
    draft.streamAppearance=window.normalizeStreamAppearance({...draft.streamAppearance,...patch});
    dirty.add('streamAppearance');
    if (patch.surface !== undefined) { draft.transparentBg=false; dirty.add('transparentBg'); }
    comparison=false; window.syncPresentationControls();
  };
  window.setStreamLayout = mode => window.updateStyleDraft({obsModeRule:mode==='lt' ? 'always_lt':'always_full'});
  window.setStyleTarget = value => {
    if (!draft || !['sanctuary','livestream'].includes(value) || (value===target && !comparison)) return;
    target=value; comparison=false; window.syncPresentationControls();
    try{localStorage.setItem('sf_style_target',value);}catch{}
  };
  window.toggleStyleComparison = () => { comparison=!comparison; window.syncPresentationControls(); };
  window.applyStyleDraft = () => {
    if (!draft || !dirty.size || REMOTE_MODE || uploading || window.state.isHoldLive) return;
    const manager=window.themeManager, state=window.state;
    for (const key of dirty) {
      if (key==='sanctuaryFits') { for (const id of fitDirty) manager.sanctuaryFits[id]=draft.sanctuaryFits[id]; }
      else if (key==='streamAppearance' || key==='transparentBg') state[key]=draft[key];
      else manager[key]=draft[key];
    }
    if (dirty.has('obsModeRule')) state.currentMode=draft.obsModeRule==='always_lt' ? 'lt':'full';
    state.sanctuaryTheme=manager.getSanctuaryPayload();
    try {
      for (const [key,value] of Object.entries({sf_sanctuary_theme:manager.activeSanctuaryTheme,sf_sanctuary_font:manager.sanctuaryFont,sf_sanctuary_dimmer:manager.sanctuaryDimmer,sf_sanctuary_fits:JSON.stringify(manager.sanctuaryFits),sf_obs_mode_rule:manager.obsModeRule,sf_stream_appearance:JSON.stringify(state.streamAppearance)})) localStorage.setItem(key,value);
    } catch { window.showToast('Style applied but could not be saved on this device.','warning'); }
    // Carry forward the latest clear/blackout flags, never a captured slide snapshot.
    window.broadcastState({clear:!!lastPayload?.clear,blackout:!!lastPayload?.blackout,transitionType:'cut'});
    window.closePresentationSettings();
  };
  function position() {
    const dialog=el('presentation-settings');
    if (!dialog || dialog.hidden) return;
    const width=Math.min(1040,window.innerWidth-32),height=Math.min(760,window.innerHeight-32);
    dialog.style.width=width+'px';
    dialog.style.height=height+'px';
    dialog.style.left=((window.innerWidth-width)/2)+'px';
    dialog.style.top=((window.innerHeight-height)/2)+'px';
    dialog.style.maxHeight=(window.innerHeight-32)+'px';
    for(const [id,destination] of [['style-preview-frame','sanctuary'],['style-preview-livestream-frame','livestream']]) {
      const size=window.getOutputPreviewDimensions?.(destination) || {width:1920,height:1080};
      previewRatios[destination]=size.width+'/'+size.height;
      const frame=el(id),previewWidth=frame.parentElement?.clientWidth || (width>760 ? 302:width-38);
      frame.style.width=size.width+'px';frame.style.height=size.height+'px';frame.style.transform='scale('+(previewWidth/size.width)+')';
      if(frame.parentElement && target===destination) frame.parentElement.style.aspectRatio=size.width+'/'+size.height;
    }
    morphSelection('.style-targets','data-style-target');morphSelection('.style-background-filters','data-style-category');
  }
  window.closePresentationSettings = () => {
    const dialog=el('presentation-settings'); if (!dialog || dialog.hidden) return;
    window.closeStreamCrop?.();
    token++; draft=null; uploading=false; dirty.clear(); fitDirty.clear();
    backgroundThumbnails?.refresh();
    dialog.hidden=true; el('presentation-settings-shield').hidden=true;
    const workspace=el('bento-layout-root'); if (workspace) workspace.inert=priorInert;
    el('presentation-settings-trigger').setAttribute('aria-expanded','false');
    if (originalView==='dual') window.setPreviewTargetMode('dual');
    el('presentation-settings-trigger').focus({preventScroll:true});
  };
  window.togglePresentationSettings = async () => {
    const dialog=el('presentation-settings'); if (!dialog.hidden) { window.closePresentationSettings(); return; }
    window.dismissAllOverlays?.(); originalView=window.previewTargetMode;
    target=originalView==='livestream' ? 'livestream':originalView==='dual' ? (localStorage.getItem('sf_style_target') || 'sanctuary'):'sanctuary';
    draft=settings(); dirty.clear(); fitDirty.clear(); comparison=false; token++;
    dialog.hidden=false; el('presentation-settings-shield').hidden=false;
    const workspace=el('bento-layout-root'); priorInert=!!workspace?.inert; if (workspace) workspace.inert=true;
    el('presentation-settings-trigger').setAttribute('aria-expanded','true');
    window.syncPresentationControls(); position(); dialog.querySelector('button').focus({preventScroll:true});
    gallery();
    const requestToken=token;
    await window.loadSanctuaryUploads?.(false); if (draft && token===requestToken) gallery();
  };
  function gallery() {
    const themes=window.SANCTUARY_THEMES || {};
    refreshStreamImageLibrary();
    if(galleryThemes && Object.keys(galleryThemes).length===Object.keys(themes).length && Object.entries(themes).every(([id,theme])=>galleryThemes[id]===theme)) {
      syncBackgroundSelection();window.filterStyleBackgrounds(galleryCategory);return;
    }
    backgroundThumbnails?.dispose();
    const host=el('style-background-list'); host.replaceChildren();backgroundButtons.clear();selectedBackground=null;
    backgroundThumbnails=window.createBackgroundThumbnails?.(host,()=>!!draft && !el('style-projector-controls').hidden);
    const seen=new Set();
    for (const [id,theme] of Object.entries(window.SANCTUARY_THEMES || {})) {
      if(id==='deep_celestial' || seen.has(theme.id || id)) continue;seen.add(theme.id || id);
      const button=document.createElement('button');button.type='button';button.className='style-background-option';button.dataset.styleTheme=id;
      button.dataset.category=theme.type==='video'?'motion':theme.type==='image'?'still':theme.category || 'minimal';button.dataset.custom=String(!!theme.custom);
      button.style.background=theme.previewGradient || theme.bgCss || '#171722';
      if(theme.videoUrl || (theme.imageUrl && button.dataset.category==='motion')) backgroundThumbnails?.attach(button,theme);
      else if(theme.imageUrl) {const image=document.createElement('img');image.src=theme.imageUrl;image.alt='';image.loading='lazy';button.append(image);}
      const badge=document.createElement('span');badge.className='style-background-badge';badge.textContent=theme.category==='colors'?(theme.badge==='SOLID'?'Solid':'Gradient'):theme.type==='video'?'Motion':theme.type==='image'?'Still':'Minimal';button.append(badge);
      const name=document.createElement('span');name.className='style-background-name';name.textContent=theme.name;button.append(name);
      button.onclick=()=>window.updateStyleDraft({activeSanctuaryTheme:id});
      backgroundButtons.set(id,button);
      host.append(theme.custom ? customTile(button,id,theme.name) : button);
    }
    syncBackgroundSelection();window.filterStyleBackgrounds(galleryCategory);
    galleryThemes={...themes};
  }
  function refreshStreamImageLibrary() {
    const host=el('stream-image-list');if(!host) return;
    const urls=new Set();
    for(const [id,theme] of Object.entries(window.SANCTUARY_THEMES || {})) {
      const url=window.normalizeStreamAppearance({imageUrl:theme.imageUrl}).imageUrl;
      if(!theme.custom || theme.type!=='image' || !url || urls.has(url)) continue;
      urls.add(url);
      let button=streamImageButtons.get(url);
      if(!button) {
        button=document.createElement('button');button.type='button';button.className='stream-image-option';button.dataset.imageUrl=url;
        button.setAttribute('aria-pressed','false');
        const preview=document.createElement('span');preview.className='stream-image-thumbnail';
        const image=document.createElement('img');image.src=url;image.alt='';image.loading='lazy';preview.append(image);button.append(preview);
        const name=document.createElement('span');name.className='stream-image-option-name';button.append(name);
        button.onclick=()=>window.updateStreamAppearance({imageUrl:url,surface:'image'});
        streamImageButtons.set(url,button);host.append(customTile(button,id,theme.name));
      }
      if(button.dataset.name!==theme.name) {button.dataset.name=theme.name;button.querySelector('.stream-image-option-name').textContent=theme.name;}
      button.disabled=REMOTE_MODE;
    }
    for(const [url,button] of streamImageButtons) if(!urls.has(url)) {button._tile.remove();streamImageButtons.delete(url);}
    el('stream-image-empty').hidden=urls.size>0;
    syncStreamImageSelection();
  }
  function syncStreamImageSelection() {
    const url=draft?.streamAppearance.imageUrl || '';
    if(url!==selectedStreamImage) {streamImageButtons.get(selectedStreamImage)?.setAttribute('aria-pressed','false');selectedStreamImage=url;}
    const selected=streamImageButtons.get(url);selected?.setAttribute('aria-pressed','true');
    if(el('stream-image-name')) el('stream-image-name').textContent=selected?.dataset.name || 'Image selected';
  }
  function syncBackgroundSelection() {
    if(!draft) return;
    const id=draft.activeSanctuaryTheme==='deep_celestial'?'celestial_motion':draft.activeSanctuaryTheme;
    if(selectedBackground!==id) {backgroundButtons.get(selectedBackground)?.setAttribute('aria-pressed','false');selectedBackground=id;}
    backgroundButtons.get(id)?.setAttribute('aria-pressed','true');
  }
  function customTile(button,id,name) {
    const tile=document.createElement('div');tile.className='style-custom-tile';tile.append(button);button._tile=tile;
    const remove=document.createElement('button');remove.type='button';remove.className='style-delete-upload';remove.disabled=REMOTE_MODE;
    remove.setAttribute('aria-label',`Delete ${name}`);
    remove.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7"/></svg>';
    remove.onclick=async event=>{
      event.preventDefault();event.stopPropagation();if(REMOTE_MODE || uploading || remove.disabled) return;
      remove.disabled=true;
      try {await window.deleteSanctuaryBackground(id,{source:'style',focusId:target==='livestream'?'stream-upload-trigger':'style-upload-trigger'});}
      finally {remove.disabled=REMOTE_MODE;if(remove.isConnected && draft)remove.focus({preventScroll:true});}
    };
    tile.append(remove);return tile;
  }
  window.onStyleBackgroundDeleted=(id,theme,fallback)=>{
    const button=backgroundButtons.get(id);if(button) {backgroundThumbnails?.detach?.(button);(button._tile || button).remove();backgroundButtons.delete(id);}
    if(galleryThemes) delete galleryThemes[id];
    if(draft) {
      if(draft.activeSanctuaryTheme===id) {draft.activeSanctuaryTheme=fallback;dirty.add('activeSanctuaryTheme');}
      delete draft.sanctuaryFits[id];fitDirty.delete(id);
      if(draft.streamAppearance.imageUrl && draft.streamAppearance.imageUrl===theme.imageUrl) {
        draft.streamAppearance=window.normalizeStreamAppearance({...draft.streamAppearance,imageUrl:'',surface:'solid'});dirty.add('streamAppearance');
      }
    }
    const state=window.state;
    if(state.streamAppearance.imageUrl && state.streamAppearance.imageUrl===theme.imageUrl) {
      state.streamAppearance=window.normalizeStreamAppearance({...state.streamAppearance,imageUrl:'',surface:'solid'});
      try {localStorage.setItem('sf_stream_appearance',JSON.stringify(state.streamAppearance));}catch{}
      if(window.themeManager.activeSanctuaryTheme!==id) window.broadcastState({transitionType:'cut'});
    }
    window.closeStreamCrop?.();refreshStreamImageLibrary();window.filterStyleBackgrounds(galleryCategory);window.syncPresentationControls();
  };
  window.filterStyleBackgrounds=category=>{
    galleryCategory=category;
    for(const button of el('presentation-settings').querySelectorAll('[data-style-category]')) button.setAttribute('aria-pressed',String(button.dataset.styleCategory===category));
    let visible=0;
    for(const button of backgroundButtons.values()) {button.hidden=category==='uploads'?button.dataset.custom!=='true':category!=='all' && button.dataset.category!==category;if(button._tile)button._tile.hidden=button.hidden;if(button.hidden) button.querySelector('video')?.pause();if(!button.hidden)visible++;}
    el('style-background-empty').hidden=visible>0;
    backgroundThumbnails?.refresh();
    morphSelection('.style-background-filters','data-style-category');
  };
  function morphSelection(selector,attribute) {
    const group=el('presentation-settings')?.querySelector(selector);
    const selected=group?.querySelector(`[${attribute}][aria-pressed="true"]`),indicator=group?.querySelector('.style-selection-indicator');
    if(!selected || !indicator || !selected.offsetWidth) return;
    indicator.style.width=selected.offsetWidth+'px';indicator.style.transform=`translateX(${selected.offsetLeft}px)`;
  }
  // The existing upload route remains a background library operation, never an Apply.
  window.refreshStyleGallery=gallery;
  window.uploadStyleBackground = async input => {
    if(!draft || REMOTE_MODE) {input.value='';return;}
    const requestToken=token;uploading=true;window.syncPresentationControls();
    try {await window.uploadSanctuaryBackgrounds(input,{publish:false,onSaved:item=>{
      if(draft && token===requestToken) {galleryCategory='uploads';window.updateStyleDraft({activeSanctuaryTheme:item.id});}
    }});} finally {if(token===requestToken) uploading=false;window.syncPresentationControls();}
  };
  window.uploadStreamBackground = async input => {
    const file=input.files?.[0]; input.value=''; if (!file || !draft || REMOTE_MODE) return;
    const requestToken=token, status=el('stream-upload-status');
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file.name) || !file.size || file.size>20*1024*1024) { status.textContent='Choose a PNG, JPG, WebP or GIF up to 20 MB.'; return; }
    uploading=true; status.textContent='Saving background…'; window.syncPresentationControls();
    const url=URL.createObjectURL(file);
    try {
      const image=new Image(); image.src=url; await image.decode();
      const params=new URLSearchParams({name:file.name,width:image.naturalWidth,height:image.naturalHeight});
      const response=await fetch(`/api/sanctuary-media?${params}`,{method:'POST',body:file});
      const result=await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed.');
      window.SANCTUARY_THEMES[result.item.id]=result.item;
      gallery();
      await window.refreshMediaLibrary?.();
      if (draft && token===requestToken) { window.updateStreamAppearance({imageUrl:result.item.imageUrl,surface:'image'}); el('stream-image-name').textContent=file.name; status.textContent='Ready to preview.'; uploading=false;window.cropStreamBackground(); }
    } catch(error) { if (draft && token===requestToken) status.textContent=error.message; }
    finally { if(token===requestToken) uploading=false; URL.revokeObjectURL(url); window.syncPresentationControls(); }
  };
  window.cropStreamBackground=()=>{
    if(!draft || uploading || REMOTE_MODE || !draft.streamAppearance.imageUrl) return;
    const requestToken=token,url=draft.streamAppearance.imageUrl;
    const size=window.getOutputPreviewDimensions?.('livestream') || {width:1920,height:1080};
    let ratio=Math.min(size.width*.84,1600)/(size.height*draft.streamAppearance.height/100);
    try {
      const box=el('style-preview-livestream-frame').contentDocument?.querySelector('.card-box.broadcast-card');
      if(box?.offsetWidth && box?.offsetHeight) ratio=box.offsetWidth/box.offsetHeight;
    }catch{}
    const name=streamImageButtons.get(url)?.dataset.name || 'Lower third.jpg';
    window.openStreamCrop?.({url,name,ratio,onSave:async(blob,width,height,isCurrent=()=>true)=>{
      if(!draft || token!==requestToken || draft.streamAppearance.imageUrl!==url) throw new Error('This selection changed. Reopen Crop for the selected image.');
      uploading=true;window.syncPresentationControls();
      try {
        const params=new URLSearchParams({name:name.replace(/\.[^.]+$/,'')+' (cropped).png',width,height});
        const response=await fetch(`/api/sanctuary-media?${params}`,{method:'POST',body:blob});
        const result=await response.json();if(!response.ok) throw new Error(result.error || 'Could not save this crop.');
        window.SANCTUARY_THEMES[result.item.id]=result.item;gallery();
        await window.refreshMediaLibrary?.();
        if(isCurrent() && draft && token===requestToken && draft.streamAppearance.imageUrl===url) window.updateStreamAppearance({imageUrl:result.item.imageUrl,position:50,surface:'image'});
      }finally {if(token===requestToken)uploading=false;window.syncPresentationControls();}
    }});
  };
  window.blackoutAllOutputs=()=> {window.cancelPreparedSlide?.();window.broadcastState({blackout:true,clear:false,transitionType:'cut'});};
  el('style-preview-frame')?.addEventListener('load',renderPreview);
  el('style-preview-livestream-frame')?.addEventListener('load',renderPreview);
  if(typeof ResizeObserver!=='undefined' && el('style-preview-frame')?.parentElement) new ResizeObserver(position).observe(el('style-preview-frame').parentElement);
  document.addEventListener('keydown',event=> {
    if (el('presentation-settings')?.hidden!==false) return;
    if(el('stream-crop-shield')?.hidden===false || el('sf-custom-dialog-backdrop')?.classList?.contains('open')) return;
    if (event.key==='Escape') {event.preventDefault();event.stopImmediatePropagation();window.closePresentationSettings();}
    if (event.key==='Tab') {
      const fields=[...el('presentation-settings').querySelectorAll('button:not(:disabled),select,input,summary')].filter(node=>node.getClientRects().length);
      const first=fields[0],last=fields[fields.length-1];
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    }
  },true);
  window.addEventListener?.('resize',position);
  window.syncPresentationControls();
})();
