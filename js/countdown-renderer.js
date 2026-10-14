/* Shared resident background and text styling for setup previews and live outputs. */
(() => {
  const backgrounds=new WeakMap();
  function stop(host) {
    const nodes=backgrounds.get(host);if(!nodes)return;
    nodes.root.hidden=true;nodes.video.pause();
  }
  function background(host,value) {
    const bg=window.PresentationModel.countdownBackground(value);
    if(!bg){stop(host);return;}
    let nodes=backgrounds.get(host);
    if(!nodes) {
      const root=document.createElement('section'),image=document.createElement('img'),video=document.createElement('video'),shade=document.createElement('div');
      root.className='countdown-background';root.setAttribute('aria-hidden','true');image.alt='';
      video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';
      root.append(image,video,shade);host.append(root);nodes={root,image,video,shade};backgrounds.set(host,nodes);
    }
    nodes.root.hidden=false;nodes.root.style.background=bg.bgCss;
    nodes.image.hidden=bg.type!=='image';nodes.video.hidden=bg.type!=='video';
    nodes.image.style.objectFit=nodes.video.style.objectFit=bg.fit;
    nodes.shade.style.opacity=String(bg.dimmer/100);
    if(bg.type==='image'&&nodes.image.getAttribute('src')!==bg.imageUrl)nodes.image.src=bg.imageUrl;
    if(bg.type==='video') {
      if(nodes.video.getAttribute('src')!==bg.videoUrl)nodes.video.src=bg.videoUrl;
      if(nodes.video.paused)nodes.video.play().catch(()=>{});
    } else nodes.video.pause();
  }
  function appearance(display,value,unit='vw') {
    const style=window.PresentationModel.countdownAppearance(value);
    display.style.setProperty('--countdown-heading-size',`${2*style.headingScale}${unit}`);
    display.style.setProperty('--countdown-completion-size',`${3.8*style.completionScale}${unit}`);
    for(const part of ['heading','timer','completion'])display.style.setProperty(`--countdown-${part}-color`,style[`${part}Color`]);
  }
  window.CountdownRenderer={background,appearance,stop};
})();
