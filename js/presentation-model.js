/* Pure presentation helpers shared by the console and output windows. */
(function(root) {
  const formatCountdown=(startsAt,now=Date.now(),completionMessage='Service starting')=> {
    const seconds=Math.max(0,Math.ceil((Number(startsAt)-now)/1000));
    if(!Number.isFinite(seconds)||seconds===0) return String(completionMessage || 'Service starting');
    const pad=n=>String(n).padStart(2,'0');
    return seconds>=3600 ? `${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}` : `${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;
  };
  const countdownAppearance=countdown=>({
    font:['Outfit','Inter','Cormorant Garamond','Cinzel'].includes(countdown?.font)?countdown.font:'',
    timerScale:[0.8,1,1.2].includes(Number(countdown?.timerScale))?Number(countdown.timerScale):1
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
  const safeMediaUrl=url=>/^\/presentation\/files\/media_[a-f0-9-]+(?:-page-[1-9]\d*(?:-thumb)?)?\.(pdf|png|jpg|jpeg|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/.test(url || '');
  const api={formatCountdown,countdownAppearance,countdownView,countdownDeadline,playbackPosition,safeMediaUrl};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.PresentationModel=api;
})(typeof window!=='undefined'?window:globalThis);
