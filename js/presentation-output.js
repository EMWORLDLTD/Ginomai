/* Resident output nodes: no page rendering or deck reconstruction on projection. */
(() => {
  const layer=document.createElement('section');layer.id='presentation-output';layer.hidden=true;
  const image=document.createElement('img'),video=document.createElement('video'),countdown=document.createElement('div'),message=document.createElement('div'),clock=document.createElement('div');
  image.alt='Presented slide';video.playsInline=true;video.preload='auto';video.muted=true;
  message.className='countdown-message';clock.className='countdown-clock';countdown.append(message,clock);layer.append(image,video,countdown);document.body.append(layer);
  let current=null, stageCountdown=null, outputTarget='', embedded=false, identity='',blocked=false,clockOffset=0;
  const error=document.createElement('p');error.className='presentation-output-error';error.textContent='Media could not be loaded.';error.hidden=true;layer.append(error);
  image.onerror=video.onerror=()=>{error.hidden=false;};
  function tick() {
    const now=Date.now()+clockOffset;
    if(stageCountdown) {const stage=document.getElementById('stage-current-slide-text');const text=window.PresentationModel.countdownView(stageCountdown,now).clock;if(stage && stage.textContent!==text)stage.textContent=text;}
    if(!current || layer.hidden) return;
    if(current.countdown) {
      const view=window.PresentationModel.countdownView(current.countdown,now);
      if(clock.textContent!==view.clock) clock.textContent=view.clock;
      message.hidden=view.finished;countdown.classList.toggle('countdown-finished',view.finished);
    }
    if(current.media?.kind==='video' && video.readyState>=1) {
      const playback=current.playback || {};
      const expected=window.PresentationModel.playbackPosition(playback,now,video.duration);
      if(Math.abs(video.currentTime-expected)>.35) video.currentTime=expected;
      video.loop=!!playback.loop;
      video.muted=embedded || playback.soundTarget!==outputTarget;
      if(playback.playing && !blocked && (video.loop || expected<video.duration)) video.play().catch(()=>{blocked=true;error.hidden=false;error.textContent='Playback blocked. Open this output and enable playback.';});
      else video.pause();
    }
  }
  video.addEventListener('loadedmetadata',tick);
  layer.addEventListener('click',()=>{blocked=false;error.hidden=true;tick();});
  setInterval(tick,250);
  window.renderPresentationOutput=(data,context)=> {
    if(Number.isFinite(data._serverTime)) clockOffset=data._serverTime-Date.now();
    const special=['media','countdown'].includes(data.contentType),target=context.isSanctuary?'sanctuary':context.isStage?'stage':'livestream';
    const destinations=data.destinations || ['sanctuary','livestream'];
    const visible=special && !data.clear && !data.blackout && !context.isExplicitLt && !context.isStage && destinations.includes(target) && (target==='sanctuary'?data.projectorActive!==false:data.livestreamActive!==false);
    outputTarget=target;embedded=context.embedded;
    stageCountdown=context.isStage && !data.clear && !data.blackout ? data.countdown:null;
    if(!visible) {layer.hidden=true;video.pause();video.muted=true;current=null;if(!special) identity='';return special;}
    current=data;layer.hidden=false;
    image.hidden=data.contentType!=='media' || data.media?.kind==='video';video.hidden=data.media?.kind!=='video';countdown.hidden=data.contentType!=='countdown';
    layer.classList.toggle('is-countdown',data.contentType==='countdown');
    const key=data.media?.url || data.slideId;
    if(key!==identity) {
      identity=key;error.hidden=true;blocked=false;video.pause();video.muted=true;
      if(data.media && window.PresentationModel.safeMediaUrl(data.media.url)) {
        if(data.media.kind==='video') video.src=data.media.url;else image.src=data.media.url;
      } else if(data.contentType==='media') {image.removeAttribute('src');video.removeAttribute('src');error.hidden=false;}
    }
    if(data.countdown) {
      const appearance=window.PresentationModel.countdownAppearance(data.countdown);
      message.textContent=data.countdown.message || 'Service starts in';
      countdown.style.fontFamily=appearance.font?`'${appearance.font}', sans-serif`:'var(--sf-sanctuary-font, Outfit, sans-serif)';
      countdown.style.fontSize=`${10*appearance.timerScale}vw`;
    }
    tick();return true;
  };
})();
