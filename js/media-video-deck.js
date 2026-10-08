/* Four resident preview players. Only explicit Send Live actions publish output state. */
(() => {
  'use strict';
  const state=window.state,model=window.PresentationModel,el=id=>document.getElementById(id);
  let hooks,grid,toolbar,livePanel,selected=0,preview=null,flags={clear:false,blackout:false};
  let queue=[],preparing=0,generation=0;
  const cards=[];
  const time=value=> {
    const seconds=Math.max(0,Math.floor(Number(value)||0));
    return (seconds>=3600?String(Math.floor(seconds/3600)).padStart(2,'0')+':':'')+
      String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  };
  const assets=()=>hooks?.assets() || [];
  const assetFor=slot=>assets().find(asset=>asset.id===slot?.assetId && asset.kind==='video');
  const slots=()=> {
    if(!Array.isArray(state.mediaVideoSlots)||state.mediaVideoSlots.length!==4)state.mediaVideoSlots=model.videoDeckSlots(state.mediaVideoSlots);
    return state.mediaVideoSlots;
  };
  const notify=text=>window.showToast?.(text,'info');
  const save=()=>hooks?.save();
  const remote=()=>!!window.isRemoteOperator;
  const live=()=>!!state.activeLiveSlideId && !flags.clear && state.activePresentation?.media?.kind==='video';
  function isLive(index) {
    if(!live())return false;
    const media=state.activePresentation.media,slot=slots()[index];
    return media.assetId===slot?.assetId && (media.videoSlot===undefined || media.videoSlot===index);
  }
  function create(tag,className,text) {
    const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;
  }
  function button(text,action,className='') {
    const node=create('button',className,text);node.type='button';node.onclick=event=>{event.stopPropagation();action();};return node;
  }
  const iconPaths={
    play:'<path d="m8 5 11 7-11 7z"/>',pause:'<path d="M8 5v14M16 5v14"/>',
    restart:'<path d="M3 11a9 9 0 1 1 2.7 7.4M3 4v7h7"/>',
    back:'<path d="m11 5-8 7 8 7V5Zm10 0-8 7 8 7V5Z"/>',forward:'<path d="m3 5 8 7-8 7V5Zm10 0 8 7-8 7V5Z"/>',
    loop:'<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
    sound:'<path d="m11 5-5 4H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    muted:'<path d="m11 5-5 4H3v6h3l5 4V5ZM16 9l5 6M21 9l-5 6"/>',
    cue:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    settings:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z"/><circle cx="12" cy="12" r="3"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    agenda:'<path d="M4 5h12M4 10h8M4 15h8M17 12v8M13 16h8"/>'
  };
  function icon(name) {
    const node=create('span','video-control-icon');node.setAttribute('aria-hidden','true');
    node.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${iconPaths[name]}</svg>`;return node;
  }
  function iconButton(text,action,name,className='') {
    const node=button('',action,className);node.title=text;node.setAttribute('aria-label',text);node.append(icon(name));return node;
  }
  function label(text,input) {const node=create('label','',text);node.append(input);return node;}
  function range(name,max,step) {
    const node=create('input');node.type='range';node.min=0;node.max=max;node.step=step;node.value=0;node.setAttribute('aria-label',name);return node;
  }
  function selectDestination() {
    const node=create('select');
    for(const [value,text] of [['both','Both'],['sanctuary','Projector'],['livestream','Livestream']]) {
      const option=create('option','',text);option.value=value;node.append(option);
    }
    return node;
  }
  function pausePreviews(mute=false) {
    for(const card of cards) {card.video.pause();if(mute)card.video.muted=true;updatePreview(card);}
    preview=null;
  }
  function selectCard(index) {
    selected=index;state.activeVideoSlot=index;
    if(slots()[index])state.activeMediaId=slots()[index].assetId;
    for(const card of cards)card.node.classList.toggle('selected',card.index===index);
    save();
  }
  function updatePreview(card) {
    const {video}=card;
    card.playIcons.play.hidden=!video.paused;card.playIcons.pause.hidden=video.paused;card.play.title=video.paused?'Play preview':'Pause preview';
    card.play.setAttribute('aria-label',`${video.paused?'Play':'Pause'} preview ${card.index+1}`);
    card.muteIcons.muted.hidden=!video.muted;card.muteIcons.sound.hidden=video.muted;
    card.mute.title=video.muted?'Unmute preview (local only)':'Mute preview (local only)';card.mute.setAttribute('aria-label',video.muted?'Unmute preview':'Mute preview');
    card.mute.setAttribute('aria-pressed',String(video.muted));
    card.node.classList.toggle('previewing',!video.paused);
    card.current.textContent=time(video.currentTime);
    if(document.activeElement!==card.seek)card.seek.value=video.currentTime || 0;
    card.status.textContent=card.error?'Error':!slots()[card.index]?'Empty':!card.ready?'Loading':!video.paused?'Previewing':'Ready';
  }
  async function playPreview(card,restart=false) {
    if(!card.ready)return;
    if(preview && preview!==card) {preview.video.pause();updatePreview(preview);}
    preview=card;selectCard(card.index);
    if(restart || card.video.ended)card.video.currentTime=0;
    if(!restart && !card.video.paused) {card.video.pause();updatePreview(card);return;}
    const version=card.version;
    try {await card.video.play();}
    catch {if(version===card.version) {card.error='Preview playback failed. Choose Retry to reload the video.';card.ready=false;syncCard(card);}}
    updatePreview(card);
  }
  function seekPreview(card,value) {
    if(!card.ready)return;
    card.video.currentTime=Math.max(0,Math.min(card.video.duration,Number(value)||0));updatePreview(card);
  }
  function send(index,fromCue=false) {
    const card=cards[index],slot=slots()[index],asset=assetFor(slot);
    if(remote() || state.isHoldLive) {notify(remote()?'Media projection is controlled by the host.':'Release Hold live before sending a video.');return;}
    if(!card?.ready || card.error || !asset || card.video.error) {notify('This video is not ready to send live.');return;}
    const position=fromCue?slot.cue:0;
    if(!Number.isFinite(position) || position<0 || position>=card.video.duration) {notify('Set a cue before the end of the video.');return;}
    card.video.pause();card.video.muted=true;updatePreview(card);
    const destinations=slot.destination==='both'?['sanctuary','livestream']:[slot.destination];
    const payload={contentType:'media',media:{assetId:asset.id,kind:'video',url:asset.url,page:1,name:asset.name,videoSlot:index,duration:card.video.duration},
      destinations,playback:{position,playing:true,loop:slot.loop,soundTarget:slot.destination,muted:slot.liveMuted,updatedAt:Date.now()}};
    window.projectSlide(`media_video_slot_${index}_${asset.id}`,asset.name,'Video',{takeLive:true,presentation:payload});
    sync();
  }
  function picker(card) {
    const known=card.picker.value;
    card.picker.replaceChildren();const empty=create('option','',slots()[card.index]?'Replace video…':'Choose video…');empty.value='';card.picker.append(empty);
    for(const asset of assets().filter(asset=>asset.kind==='video')) {const option=create('option','',asset.name);option.value=asset.id;card.picker.append(option);}
    card.picker.value=known;
  }
  function makeCard(index) {
    const node=create('article','media-video-slot');node.dataset.videoSlot=index;node.tabIndex=0;node.setAttribute('aria-label',`Video card ${index+1}`);
    const card={index,node,ready:false,error:'',version:0,assetId:null};
    const head=create('header','video-slot-heading');
    const number=create('span','video-slot-number',String(index+1));card.title=create('strong','video-slot-title','Empty video card');
    card.status=create('span','video-slot-status','Empty');card.live=create('span','video-slot-live','LIVE');card.live.hidden=true;head.append(number,card.title,card.status,card.live);
    card.video=create('video','video-slot-preview');card.video.muted=true;card.video.defaultMuted=true;card.video.playsInline=true;card.video.preload='metadata';
    card.video.setAttribute('aria-label',`Local preview ${index+1}`);
    const canvas=create('div','video-slot-canvas'),frame=create('div','video-slot-frame');frame.append(card.video);canvas.append(frame);
    card.message=create('p','video-slot-message','Choose a video or drop one here.');card.message.setAttribute('role','status');
    const timeline=create('div','video-slot-timeline');card.current=create('span','','00:00');card.duration=create('span','','--:--');card.seek=range(`Preview position ${index+1}`,0,.1);timeline.append(card.current,card.seek,card.duration);
    const transport=create('div','video-slot-transport');
    card.play=button('',()=>playPreview(card), 'video-preview-play');card.playIcons={play:icon('play'),pause:icon('pause')};card.play.append(card.playIcons.play,card.playIcons.pause);
    card.restart=iconButton('Restart',()=>playPreview(card,true),'restart');card.back=iconButton('Rewind 10 seconds',()=>seekPreview(card,card.video.currentTime-10),'back');card.forward=iconButton('Forward 10 seconds',()=>seekPreview(card,card.video.currentTime+10),'forward');
    card.back.append(create('span','video-skip-label','10'));card.forward.append(create('span','video-skip-label','10'));
    card.loop=iconButton('Loop',()=>{const slot=slots()[index];if(!slot)return;slot.loop=!slot.loop;card.video.loop=slot.loop;syncCard(card);save();},'loop');
    transport.append(card.play,card.restart,card.back,card.forward,card.loop);
    const sound=create('div','video-slot-local-sound');
    card.mute=button('',()=>{if(!card.ready)return;card.video.muted=!card.video.muted;updatePreview(card);});card.muteIcons={muted:icon('muted'),sound:icon('sound')};card.mute.append(card.muteIcons.muted,card.muteIcons.sound);
    card.volume=range(`Local preview volume ${index+1}`,1,.05);card.volume.value=1;
    card.volume.oninput=()=>{card.video.volume=Number(card.volume.value);slots()[index].volume=card.video.volume;save();};sound.append(card.mute,label('Local volume',card.volume));
    card.cueLabel=create('span','','Cue 00:00');
    card.setCue=iconButton('Set Cue',()=>{if(!card.ready)return;slots()[index].cue=card.video.currentTime;syncCard(card);save();},'cue');timeline.append(card.setCue);transport.append(card.mute);
    const output=create('div','video-slot-output');card.destination=selectDestination();card.destination.setAttribute('aria-label',`Video ${index+1} live destination`);
    card.destination.onchange=()=>{slots()[index].destination=card.destination.value;save();};
    card.liveMuted=create('input');card.liveMuted.type='checkbox';card.liveMuted.onchange=()=>{slots()[index].liveMuted=card.liveMuted.checked;save();};output.append(label('Send to',card.destination),label('Start live muted',card.liveMuted));
    const actions=create('div','video-slot-send');card.send=button('Send Live',()=>send(index),'video-send-live');card.sendCue=button('Send Live from Cue',()=>send(index,true));actions.append(card.send,card.sendCue);
    const manage=create('div','video-slot-manage');card.picker=create('select');card.picker.setAttribute('aria-label',`Choose video for card ${index+1}`);
    card.picker.onchange=()=>{const asset=assets().find(asset=>asset.id===card.picker.value);if(asset)assign(index,asset);card.picker.value='';};
    card.remove=button('Remove',()=>{if(isLive(index))return;slots()[index]=null;loadCard(card);save();});
    card.retry=button('Retry',()=>loadCard(card,true));card.retry.hidden=true;manage.append(card.picker,card.retry,card.remove);
    card.options=create('details','video-slot-options');card.summary=create('summary');card.summaryLabel=create('span','','Settings');card.summary.append(icon('settings'),card.summaryLabel,card.cueLabel);card.cueLabel.className='video-saved-cue';card.summary.setAttribute('aria-label',`Video and audio settings for card ${index+1}`);card.summary.title='Video, volume and live output settings';card.options.append(card.summary,sound,output,manage);
    card.options.ontoggle=()=>{if(grid?.isConnected && !grid.querySelector('details[open]'))el('bento-medley-container').scrollTop=0;};
    node.append(head,canvas,card.message,timeline,transport,actions,card.options);
    node.onclick=()=>selectCard(index);node.ondblclick=event=>event.stopPropagation();
    node.onkeydown=event=> {
      // Let native buttons/ranges work, but never bubble transport keys into global projection shortcuts.
      if([' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)) {
        event.stopPropagation();
        if(event.target===node) {event.preventDefault();if([' ','Enter'].includes(event.key))playPreview(card);else if(event.key==='ArrowLeft')seekPreview(card,card.video.currentTime-10);else if(event.key==='ArrowRight')seekPreview(card,card.video.currentTime+10);}
      }
    };
    node.ondragover=event=>{if(Array.from(event.dataTransfer.types || []).includes('application/presentation-id')) {event.preventDefault();event.stopPropagation();node.classList.add('drag-over');}};
    node.ondragleave=event=>{if(!node.contains(event.relatedTarget))node.classList.remove('drag-over');};
    node.ondrop=event=>{event.preventDefault();event.stopPropagation();node.classList.remove('drag-over');const asset=assets().find(asset=>asset.id===event.dataTransfer.getData('application/presentation-id'));if(asset?.kind==='video')assign(index,asset);else notify('Choose a video for this card.');};
    card.seek.oninput=()=>seekPreview(card,card.seek.value);
    for(const name of ['timeupdate','play','pause','ended','volumechange'])card.video.addEventListener(name,()=>updatePreview(card));
    card.video.addEventListener('error',()=>{if(card.assetId && card.video.error) {card.ready=false;card.error='Video unavailable or unsupported. Relink using Choose video, or Retry.';syncCard(card);}});
    return card;
  }
  function pump() {
    while(preparing<2 && queue.length) {
      const job=queue.shift();if(job.generation!==generation || job.version!==job.card.version)continue;
      const {card,asset}=job;preparing++;
      let completed=false;
      const finish=()=>{if(completed)return;completed=true;clearTimeout(timeout);card.video.removeEventListener('loadedmetadata',ready);card.video.removeEventListener('error',failed);card.cancelLoad=null;preparing--;pump();};
      const ready=()=> {
        if(job.version!==card.version)return finish();
        if(!Number.isFinite(card.video.duration) || card.video.duration<=0)return failed();
        card.ready=true;card.seek.max=card.video.duration;card.duration.textContent=time(card.video.duration);syncCard(card);finish();
      };
      const failed=()=>{if(job.version===card.version) {card.ready=false;card.error='Video unavailable or unsupported. Relink using Choose video, or Retry.';syncCard(card);}finish();};
      const timeout=setTimeout(failed,15000);
      card.cancelLoad=finish;card.video.addEventListener('loadedmetadata',ready);card.video.addEventListener('error',failed);
      card.video.src=asset.url;card.video.load();
    }
  }
  function loadCard(card,force=false) {
    const slot=slots()[card.index],asset=assetFor(slot);
    if(!force && card.assetId===(slot?.assetId || null) && !(card.error && asset && !card.video.getAttribute('src'))) {syncCard(card);return;}
    if(!card.assetId || force)card.options.open=!slot;
    card.version++;card.cancelLoad?.();card.video.pause();card.video.muted=true;card.video.removeAttribute('src');card.video.load();
    card.assetId=slot?.assetId || null;card.ready=false;card.error='';card.seek.max=0;card.duration.textContent='--:--';
    if(slot) {
      card.video.volume=slot.volume;card.video.loop=slot.loop;
      if(!asset || !model.safeMediaUrl(asset.url))card.error='Video is missing. Choose a replacement to relink this card.';
      else queue.push({card,asset,version:card.version,generation});
    }
    syncCard(card);pump();
  }
  function syncCard(card) {
    const slot=slots()[card.index],active=isLive(card.index);
    card.title.textContent=slot?.name || 'Empty video card';card.title.title=card.title.textContent;
    card.message.textContent=card.error || (!slot?'Choose a video or drop one here.':!card.ready?'Loading video…':'');card.message.hidden=!!slot && card.ready && !card.error;
    card.options.open=card.options.open || !slot;
    card.node.dataset.empty=String(!slot);
    card.summaryLabel.textContent=slot?`${slot.destination==='sanctuary'?'Projector':slot.destination==='livestream'?'Livestream':'Both'}${slot.liveMuted?' · Muted':''}`:'Choose video';
    card.node.classList.toggle('has-error',!!card.error);card.node.classList.toggle('live',active);card.live.hidden=!active;
    card.picker.disabled=active || remote();card.remove.disabled=!slot || active || remote();card.retry.hidden=!card.error;
    for(const control of [card.play,card.restart,card.back,card.forward,card.loop,card.seek,card.mute,card.volume,card.setCue])control.disabled=!card.ready;
    card.send.disabled=card.sendCue.disabled=!card.ready || !!card.error || remote() || state.isHoldLive;
    if(slot) {
      card.destination.value=slot.destination;card.liveMuted.checked=slot.liveMuted;card.volume.value=slot.volume;
      card.loop.setAttribute('aria-pressed',String(slot.loop));card.cueLabel.textContent='Cue '+time(slot.cue);
      card.sendCue.disabled=card.sendCue.disabled || slot.cue>=card.video.duration;
    }
    card.destination.disabled=card.liveMuted.disabled=!slot;updatePreview(card);
  }
  function assign(index,asset) {
    if(remote())return;
    if(isLive(index)) {notify('Send another item live or clear the output before replacing this card.');return;}
    const existing=slots().findIndex(slot=>slot?.assetId===asset.id);
    if(existing!==-1 && existing!==index) {selectCard(existing);notify('This video is already in the deck.');return;}
    slots()[index]={assetId:asset.id,name:asset.name,cue:0,loop:false,volume:1,destination:'both',liveMuted:false};
    loadCard(cards[index]);selectCard(index);save();
  }
  function render(host) {
    if(!grid) {grid=create('section','media-video-grid');grid.setAttribute('aria-label','Four video preview players');for(let index=0;index<4;index++) {const card=makeCard(index);cards.push(card);grid.append(card.node);}}
    if(grid.parentElement!==host) {host.replaceChildren(grid);host.className='media-video-deck';host.removeAttribute('data-cols');}
    el('bento-deck-title').textContent='Media deck';el('bento-deck-sub').textContent='· 4 cards · Preview locally, then send live';
    const bar=el('media-controls-bar');bar.hidden=true;
    if(!toolbar) {
      const help=create('span','video-deck-info');help.tabIndex=0;help.setAttribute('role','img');help.setAttribute('aria-label','Preview is separate from live output. Use Send Live to publish a video.');help.title=help.getAttribute('aria-label');help.append(icon('info'));
      toolbar=create('div','video-deck-toolbar');toolbar.append(help,iconButton('Add selected to agenda',()=>{const slot=slots()[selected];if(slot)window.addPresentationAssetToAgenda?.(slot.assetId);},'agenda'));
    }
    const heading=el('bento-deck-title').parentElement;
    if(toolbar.parentElement!==heading)heading.append(toolbar);
    for(const card of cards) {picker(card);loadCard(card);card.node.classList.toggle('selected',card.index===selected);}
    sync();return true;
  }
  function open(asset) {
    state.activeDeckType='media';state.mediaVideoDeckActive=true;state.isMedleyMode=false;
    window.renderDeck();
    const index=slots().findIndex(slot=>slot?.assetId===asset.id);
    if(index!==-1)selectCard(index);
    else {const empty=slots().findIndex(slot=>!slot);if(empty===-1)notify('All four cards are loaded. Choose a replacement on a card or drag a video onto it.');else assign(empty,asset);}
  }
  function ensureLivePanel() {
    const host=el('media-playback-controls');if(!host)return;
    if(!livePanel) {
      livePanel={};const heading=create('div','video-live-heading');livePanel.title=create('strong','','Live Video');livePanel.name=create('span','video-live-name');heading.append(livePanel.title,livePanel.name);
      const transport=create('div','video-live-transport');livePanel.play=button('Pause',()=>{const p=state.activePresentation.playback;if(model.playbackPosition(p,Date.now(),liveDuration())>=liveDuration())patch({position:0,playing:true});else patch({playing:!p.playing});});livePanel.restart=button('Restart',()=>patch({position:0,playing:true}));
      livePanel.loop=button('Loop',()=>patch({loop:!state.activePresentation.playback.loop}));livePanel.mute=button('Mute live',()=>{const p=state.activePresentation.playback;patch({muted:p.muted!==true && ['both','sanctuary','livestream'].includes(p.soundTarget)});});
      transport.append(livePanel.play,livePanel.restart,livePanel.loop,livePanel.mute);
      livePanel.seek=range('Live video position',0,.1);livePanel.seek.oninput=()=>patch({position:Number(livePanel.seek.value)});livePanel.time=create('span','video-live-time');
      livePanel.sound=selectDestination();const off=create('option','','Muted');off.value='off';livePanel.sound.append(off);livePanel.sound.setAttribute('aria-label','Live video sound destination');livePanel.sound.onchange=()=>patch({soundTarget:livePanel.sound.value,muted:livePanel.sound.value==='off'});
      const timeline=create('div','video-slot-timeline');timeline.append(livePanel.seek,livePanel.time);
      host.replaceChildren(heading,transport,timeline,label('Live sound',livePanel.sound));
      host.onkeydown=event=>{if([' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.stopPropagation();};
    }
    host.hidden=!live() || flags.blackout;
  }
  function liveDuration() {
    const media=state.activePresentation?.media;
    return Number(media?.duration) || cards.find(card=>card.assetId===media?.assetId && card.ready)?.video.duration || Infinity;
  }
  function patch(changes) {
    if(remote() || state.isHoldLive || !live() || flags.blackout)return;
    const current=state.activePresentation;
    if(changes.muted===false && !['both','sanctuary','livestream'].includes(current.playback.soundTarget))changes.soundTarget=current.destinations?.length===1?current.destinations[0]:'both';
    current.playback={...current.playback,position:model.playbackPosition(current.playback,Date.now(),liveDuration()),...changes,updatedAt:Date.now()};
    window.broadcastState();
  }
  function tick() {
    if(grid && !grid.isConnected && preview)pausePreviews(true);
    if(!livePanel || !live())return;
    const current=state.activePresentation,p=current.playback || {},duration=liveDuration(),position=model.playbackPosition(p,Date.now(),duration);
    livePanel.name.textContent=current.media.name;livePanel.play.textContent=p.playing && position<duration?'Pause':'Play';
    livePanel.loop.setAttribute('aria-pressed',String(!!p.loop));
    const muted=p.muted===true || !['both','sanctuary','livestream'].includes(p.soundTarget);
    livePanel.mute.textContent=muted?'Unmute live':'Mute live';livePanel.mute.setAttribute('aria-pressed',String(muted));
    livePanel.sound.value=muted?'off':p.soundTarget;
    livePanel.time.textContent=time(position)+' / '+(Number.isFinite(duration)?time(duration):'--:--');
    livePanel.seek.max=Number.isFinite(duration)?duration:0;
    if(document.activeElement!==livePanel.seek)livePanel.seek.value=position;
    for(const control of [livePanel.play,livePanel.restart,livePanel.loop,livePanel.mute,livePanel.seek,livePanel.sound])control.disabled=remote() || state.isHoldLive || flags.clear || flags.blackout;
  }
  function sync(payload) {
    if(payload)flags={clear:!!payload.clear,blackout:!!payload.blackout};
    const holdButton=el('bento-hold-btn');holdButton?.classList.toggle('active',!!state.isHoldLive);holdButton?.setAttribute('aria-label',state.isHoldLive?'Release hold':'Hold live');
    for(const card of cards)syncCard(card);ensureLivePanel();tick();
  }
  function restore() {
    generation++;queue=[];pausePreviews(true);
    state.mediaVideoSlots=model.videoDeckSlots(state.mediaVideoSlots);selected=Math.max(0,Math.min(3,Number(state.activeVideoSlot)||0));
    for(const card of cards)loadCard(card,true);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePreviews(true);});
  window.addEventListener('pagehide',()=>pausePreviews(true));
  setInterval(tick,250);
  window.MediaVideoDeck={configure:value=>{hooks=value;},open,render,sync,restore,suspend:()=>pausePreviews(true),
    refresh:()=>{for(const card of cards) {picker(card);loadCard(card);}},
    deleted:id=>{for(const card of cards)if(card.assetId===id)loadCard(card,true);}};
})();
