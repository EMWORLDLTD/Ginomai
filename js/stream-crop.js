/* A single still-image crop; no animation, continuous decoding, or live publication. */
(() => {
  const el=id=>document.getElementById(id);
  let session=null;
  window.getStreamCropRect=(width,height,ratio,zoom=1,x=50,y=50)=>{
    if(![width,height,ratio].every(value=>Number.isFinite(value) && value>0)) throw new Error('Invalid image dimensions.');
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value) || min));
    const w=Math.min(width,height*ratio)/clamp(zoom,1,4),h=w/ratio;
    return {x:(width-w)*clamp(x,0,100)/100,y:(height-h)*clamp(y,0,100)/100,width:w,height:h};
  };
  window.closeStreamCrop=()=>{
    if(!session) return;
    const old=session;session=null;
    el('stream-crop-shield').hidden=true;
    el('stream-crop-image').removeAttribute('src');
    el('presentation-settings').inert=old.priorInert;
    old.focus?.focus({preventScroll:true});
  };
  window.openStreamCrop=async({url,name,ratio,onSave})=>{
    window.closeStreamCrop();
    const current={url,name,ratio,onSave,ready:false,saving:false,focus:document.activeElement,priorInert:el('presentation-settings').inert};session=current;
    el('presentation-settings').inert=true;
    el('stream-crop-shield').hidden=false;
    el('stream-crop-viewport').style.aspectRatio=ratio;
    el('stream-crop-zoom').value=1;el('stream-crop-x').value=el('stream-crop-y').value=50;
    el('stream-crop-save').disabled=true;el('stream-crop-status').textContent='Loading image…';
    const image=el('stream-crop-image');image.style.visibility='hidden';image.src=url;
    el('stream-crop-shield').querySelector('button').focus({preventScroll:true});
    try {
      await image.decode();if(session!==current) return;
      current.width=image.naturalWidth;current.height=image.naturalHeight;current.ready=true;
      window.updateStreamCrop();image.style.visibility='visible';el('stream-crop-save').disabled=false;
      el('stream-crop-status').textContent=name;
    }catch(error) {if(session===current)el('stream-crop-status').textContent='This image could not be loaded. Cancel and try another image.';}
  };
  window.updateStreamCrop=()=>{
    if(!session?.ready || session.saving) return;
    const rect=window.getStreamCropRect(session.width,session.height,session.ratio,el('stream-crop-zoom').value,el('stream-crop-x').value,el('stream-crop-y').value);
    session.rect=rect;
    const image=el('stream-crop-image');
    image.style.width=session.width/rect.width*100+'%';image.style.height=session.height/rect.height*100+'%';
    image.style.left=-rect.x/rect.width*100+'%';image.style.top=-rect.y/rect.height*100+'%';
  };
  window.saveStreamCrop=async()=>{
    const current=session;if(!current?.ready || current.saving) return;
    current.saving=true;el('stream-crop-save').disabled=true;el('stream-crop-status').textContent='Saving crop…';
    try {
      const rect=current.rect,scale=Math.min(1,1920/Math.max(rect.width,rect.height));
      const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image cropping is unavailable on this device.');
      context.drawImage(el('stream-crop-image'),rect.x,rect.y,rect.width,rect.height,0,0,width,height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      canvas.width=canvas.height=0;
      if(!blob)throw new Error('Could not create the cropped image.');
      if(session!==current)return;
      await current.onSave(blob,width,height,()=>session===current);
      if(session===current)window.closeStreamCrop();
    }catch(error) {
      if(session===current) {current.saving=false;el('stream-crop-save').disabled=false;el('stream-crop-status').textContent=error.message || 'Could not save this crop. Please try again.';}
    }
  };
  document.addEventListener('keydown',event=>{
    if(!session) return;
    if(event.key==='Escape') {event.preventDefault();event.stopImmediatePropagation();window.closeStreamCrop();}
    if(event.key==='Tab') {
      const fields=[...el('stream-crop-shield').querySelectorAll('button:not(:disabled),input')];
      const first=fields[0],last=fields[fields.length-1];
      if(event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    }
  },true);
})();
