/* Pure presentation helpers shared by the console and output windows. */
(function(root) {
  const formatCountdown=(startsAt,now=Date.now(),completionMessage='Service starting')=> {
    const seconds=Math.max(0,Math.ceil((Number(startsAt)-now)/1000));
    if(!Number.isFinite(seconds)||seconds===0) return String(completionMessage || 'Service starting');
    const pad=n=>String(n).padStart(2,'0');
    return seconds>=3600 ? `${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}` : `${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;
  };
  const scale=(value,min,max)=>Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):1;
  const color=value=>/^#[a-f0-9]{6}$/i.test(value || '')?value:'#ffffff';
  const countdownBackground=background=> {
    if(!background || typeof background!=='object')return null;
    const safeUrl=url=>/^(?:Themes\/|\/media\/uploads\/)[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/i.test(url || '') || /^\/presentation\/files\/media_[a-f0-9-]+(?:-page-[1-9]\d*(?:-thumb)?)?\.(?:png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/.test(url || '')?url:'';
    const imageUrl=safeUrl(background.imageUrl),videoUrl=safeUrl(background.videoUrl);
    const type=['image','video','gradient','solid','minimal'].includes(background.type)?background.type:'gradient';
    if((type==='image'&&!imageUrl)||(type==='video'&&!videoUrl))return null;
    const css=String(background.bgCss || '');
    return {id:String(background.id || '').slice(0,100),type,imageUrl,videoUrl,
      bgCss:css.length<=500&&/^(?:#|rgba?\(|hsla?\(|(?:linear|radial)-gradient\()/i.test(css)&&/^[#a-z0-9.,()%\s-]+$/i.test(css)?css:'#10121c',
      fit:['cover','contain','fill'].includes(background.fit)?background.fit:'cover',
      dimmer:Number.isFinite(Number(background.dimmer))?Math.max(0,Math.min(100,Number(background.dimmer))):30};
  };
  const countdownAppearance=countdown=>({
    font:['Outfit','Inter','Cormorant Garamond','Cinzel'].includes(countdown?.font)?countdown.font:'',
    timerScale:scale(countdown?.timerScale,.5,2),headingScale:scale(countdown?.headingScale,.5,3),completionScale:scale(countdown?.completionScale,.5,3),
    headingColor:color(countdown?.headingColor),timerColor:color(countdown?.timerColor),completionColor:color(countdown?.completionColor)
  });
  const countdownView=(countdown,now=Date.now())=>({
    finished:!Number.isFinite(Number(countdown?.startsAt)) || Number(countdown.startsAt)<=now,
    message:countdown?.message || 'Service starts in',
    clock:formatCountdown(countdown?.startsAt,now,countdown?.completionMessage)
  });
  const countdownDeadline=(fields,now=Date.now())=> {
    if(fields.mode==='minutes') {
      const minutes=Number(fields.minutes);
      return Number.isFinite(minutes)&&minutes>=1&&minutes<=1440 ? now+minutes*60000:NaN;
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '') || !/^\d{2}:\d{2}$/.test(fields.time || '')) return NaN;
    return new Date(`${fields.date}T${fields.time}`).getTime();
  };
  const playbackPosition=(playback,now=Date.now(),duration=Infinity)=> {
    let position=Math.max(0,Number(playback?.position)||0)+(playback?.playing ? Math.max(0,now-(Number(playback.updatedAt)||now))/1000:0);
    if(Number.isFinite(duration)&&duration>0) position=playback?.loop ? position%duration:Math.min(position,duration);
    return position;
  };
  const safeMediaUrl=url=>/^\/presentation\/files\/media_[a-f0-9-]+(?:-page-[1-9]\d*(?:-thumb)?)?\.(pdf|png|jpg|jpeg|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/.test(url || '') || /^Themes\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/.test(url || '') || /^\/media\/uploads\/upload_[a-f0-9-]+\.(png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/.test(url || '');
  const api={formatCountdown,countdownAppearance,countdownBackground,countdownView,countdownDeadline,playbackPosition,safeMediaUrl};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.PresentationModel=api;
})(typeof window!=='undefined'?window:globalThis);
