'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ginomai-video-deck-'));
process.env.SF_LIVE_STATE_FILE=path.join(temporary,'live.json');
process.env.SF_MEDIA_DIR=path.join(temporary,'backgrounds');
process.env.SF_PRESENTATION_DIR=path.join(temporary,'presentations');
const {server}=require('../server');

(async()=>{
 let browser;
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1316,height:740}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MediaVideoDeck && window.sessionManager?.getActiveSession());
  const ids=[],names=['Opening film','Service announcements','Worship background','Closing film','Replacement film'];
  const clips=['celestial_worship_loop.webm','golden_sunrise_loop.webm','emerald_ambient_loop.webm','atmospheric_ember_loop.webm','celestial_worship_loop.webm'];
  for(let i=0;i<5;i++) {
   const response=await page.request.post(base+`/api/presentation-media?name=${encodeURIComponent(names[i]+'.webm')}&width=1920&height=1080&pages=1`,{data:fs.readFileSync(path.join(__dirname,'..','Themes',clips[i])),headers:{'Content-Type':'video/webm'}});
   assert.equal(response.status(),201);ids.push((await response.json()).item.id);
  }
  await page.evaluate(async()=>{window.switchLibraryTab('media');await window.refreshMediaLibrary();});
  for(const id of ids.slice(0,4))await page.locator(`[data-media-library-id="${id}"]`).click();
  const cards=page.locator('.media-video-slot');assert.equal(await cards.count(),4);
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-send-live')].every(button=>!button.disabled));
  assert.equal(await page.locator('#bento-prev-card .bento-sbtn.clear').isVisible(),false);
  assert.equal(await page.locator('#bento-prev-card .stage-appearance-row').isVisible(),false);
  assert.equal(await page.locator('#bento-hold-btn').isVisible(),false);
  assert.equal(await page.locator('#presentation-settings-trigger').isVisible(),true);
  assert.equal(await page.locator('#bento-trans-trigger').isVisible(),true);
  assert.equal(await page.locator('#bento-feed-card').isVisible(),true);
  assert.equal(await page.locator('#media-controls-bar').isVisible(),false);
  assert.equal(await page.evaluate(()=>{const title=document.querySelector('#bento-deck-title').getBoundingClientRect(),sub=document.querySelector('#bento-deck-sub').getBoundingClientRect();return Math.abs(title.top+title.height/2-sub.top-sub.height/2)<2;}),true,'Media heading and preview guidance share one line.');
  assert.equal(await cards.first().locator('video').evaluate(video=>video.muted && video.paused),true);
  await page.evaluate(()=>{window.__playerNodes=[...document.querySelectorAll('.video-slot-preview')];window.__liveBefore=JSON.stringify({presentation:window.state.activePresentation,id:window.state.activeLiveSlideId});});
  await cards.nth(0).getByRole('button',{name:'Play preview 1',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.video-slot-preview').paused);
  await cards.nth(0).getByRole('button',{name:'Unmute preview',exact:true}).click();
  await cards.nth(1).getByRole('button',{name:'Play preview 2',exact:true}).click();
  assert.equal(await cards.nth(0).locator('video').evaluate(video=>video.paused),true);
  assert.equal(await page.evaluate(()=>window.__liveBefore===JSON.stringify({presentation:window.state.activePresentation,id:window.state.activeLiveSlideId})),true);
  await cards.nth(1).getByRole('button',{name:'Pause preview 2',exact:true}).click();
  await cards.nth(1).locator('video').evaluate(video=>new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=1;}));
  await cards.nth(1).getByRole('button',{name:'Set Cue',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.state.mediaVideoSlots[1].cue),1);
  // A queued scripture must not be sent by keyboard transport on a video card/button.
  await page.evaluate(()=>window.prepareSlideIfNeeded('bible_Test_1_1','Queued verse','Test',{ }));
  await cards.nth(1).focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.__liveBefore===JSON.stringify({presentation:window.state.activePresentation,id:window.state.activeLiveSlideId})),true);
  await cards.nth(1).getByRole('button',{name:'Send Live from Cue',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.state.activePresentation.playback.position),1);
  assert.equal(await page.evaluate(()=>window.state.activePresentation.playback.soundTarget),'both');
  assert.equal(await cards.nth(1).locator('video').evaluate(video=>video.muted && video.paused),true);
  assert.equal(await cards.nth(1).getByRole('button',{name:'Remove',exact:true,includeHidden:true}).isDisabled(),true);
  const livePanel=page.locator('#media-playback-controls');assert.equal(await livePanel.isVisible(),true);
  await livePanel.getByRole('button',{name:'Mute live',exact:true}).click();assert.equal(await page.evaluate(()=>window.state.activePresentation.playback.muted),true);
  await cards.nth(0).getByRole('button',{name:'Play preview 1',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.state.activePresentation.media.assetId),ids[1]);assert.equal(await page.evaluate(()=>window.state.activePresentation.playback.muted),true);
  await cards.nth(0).getByRole('button',{name:'Loop',exact:true}).click();
  await cards.nth(0).getByRole('button',{name:'Send Live',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.state.activePresentation.playback.position),0);
  assert.equal(await cards.nth(1).getByRole('button',{name:'Remove',exact:true,includeHidden:true}).isDisabled(),false);
  const output=await browser.newPage();await output.goto(base+'/display.html?target=sanctuary');
  await output.locator('#presentation-output').click();
  await output.waitForFunction(()=>document.querySelector('#presentation-output>video')?.paused===false);
  assert.equal(await output.locator('#presentation-output>video').evaluate(video=>video.muted),false);
  await page.evaluate(()=>{window.state.isHoldLive=true;window.syncPresentationControls();window.syncBentoStagePreview();});
  assert.equal(await page.getByRole('button',{name:'Release hold',exact:true}).isVisible(),true,await page.locator('#bento-hold-btn').evaluate(button=>JSON.stringify({html:button.outerHTML,display:getComputedStyle(button).display,parent:getComputedStyle(button.parentElement).display,held:window.state.isHoldLive})));
  assert.equal(await cards.nth(2).getByRole('button',{name:'Send Live',exact:true}).isDisabled(),true);
  await cards.nth(2).getByRole('button',{name:'Play preview 3',exact:true}).click();assert.equal(await cards.nth(2).locator('video').evaluate(video=>video.paused),false);
  await page.getByRole('button',{name:'Release hold',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.state.isHoldLive),false);
  assert.equal(await page.locator('#bento-hold-btn').isVisible(),false);
  const before=await page.evaluate(()=>JSON.stringify(window.state.mediaVideoSlots));
  await page.locator(`[data-media-library-id="${ids[4]}"]`).click();assert.equal(await page.evaluate(()=>JSON.stringify(window.state.mediaVideoSlots)),before);
  await page.locator(`[data-media-library-id="${ids[4]}"]`).dragTo(cards.nth(0));assert.equal(await page.evaluate(()=>window.state.mediaVideoSlots[0].assetId),ids[0]);
  await cards.nth(3).locator('summary').click();await cards.nth(3).getByLabel('Choose video for card 4').selectOption(ids[4]);await cards.nth(3).locator('summary').click();
  await page.waitForFunction(id=>window.state.mediaVideoSlots[3].assetId===id && !document.querySelectorAll('.video-send-live')[3].disabled,ids[4]);
  assert.equal(await page.evaluate(()=>window.__playerNodes.every((node,index)=>node===document.querySelectorAll('.video-slot-preview')[index])),true);
  // Card and live buttons remain native keyboard targets without global projection shortcuts.
  await livePanel.getByRole('button',{name:'Pause',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.state.activePresentation.playback.playing),false);
  await page.evaluate(()=>{window.MediaVideoDeck.suspend();window.sessionManager.saveCurrentSessionSnapshot(null,true);});
  await page.evaluate(()=>window.switchLibraryTab('songs'));
  assert.equal(await page.locator('#bento-prev-card .bento-sbtn.clear').isVisible(),true);
  assert.equal(await page.locator('#bento-prev-card .stage-appearance-row').isVisible(),true);
  assert.equal(await page.locator('#bento-hold-btn').isVisible(),true);
  await page.evaluate(()=>window.switchLibraryTab('media'));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.media-video-grid')).gridTemplateColumns.split(' ').length),2);
  assert.equal(await cards.locator('video').evaluateAll(videos=>videos.every(video=>{const r=video.getBoundingClientRect();return r.height>0 && Math.abs(r.width/r.height-16/9)<.01;})),true,'Every desktop video preview stays 16:9.');
  const fullWidthPreviews=()=>[...document.querySelectorAll('.media-video-slot')].every(card=>{
   const video=card.querySelector('video'),frame=video.getBoundingClientRect(),canvas=card.querySelector('.video-slot-canvas').getBoundingClientRect();
   const timeline=card.querySelector('.video-slot-timeline').getBoundingClientRect(),transport=card.querySelector('.video-slot-transport').getBoundingClientRect();
   return Math.abs(frame.width-canvas.width)<1 && frame.width>card.clientWidth-24 && getComputedStyle(video).objectFit==='contain' && timeline.top>=frame.bottom && transport.top>=timeline.bottom;
  });
  assert.equal(await page.evaluate(fullWidthPreviews),true,'Desktop previews fill the card width without cropping, with controls underneath.');
  await cards.nth(3).getByRole('button',{name:'Play preview 4',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelectorAll('.video-slot-preview')[3].paused);
  await cards.nth(3).getByRole('button',{name:'Pause preview 4',exact:true}).click();
  await page.locator('#bento-medley-container').evaluate(deck=>{deck.scrollTop=0;});
  await page.mouse.move(282,78);await page.waitForFunction(()=>!document.querySelector('.app-toast'));
  if(process.env.MEDIA_DECK_ARTIFACTS) {fs.mkdirSync(process.env.MEDIA_DECK_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.MEDIA_DECK_ARTIFACTS,'media-deck-desktop.png')});}
  await page.setViewportSize({width:780,height:900});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.media-video-grid')).gridTemplateColumns.split(' ').length),1);
  await cards.nth(0).getByRole('button',{name:'Play preview 1',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.video-slot-preview').paused);
  await cards.nth(0).getByRole('button',{name:'Pause preview 1',exact:true}).click();
  assert.equal(await cards.locator('video').evaluateAll(videos=>videos.every(video=>{const r=video.getBoundingClientRect();return r.height>0 && Math.abs(r.width/r.height-16/9)<.01;})),true,'Every narrow video preview stays 16:9.');
  assert.equal(await page.evaluate(fullWidthPreviews),true,'Narrow previews fill the card width with controls underneath.');
  if(process.env.MEDIA_DECK_ARTIFACTS) {await cards.first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.MEDIA_DECK_ARTIFACTS,'media-deck-narrow.png')});}
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('.media-video-slot').length===4);
  await page.waitForFunction(()=>[...document.querySelectorAll('.video-send-live')].every(button=>!button.disabled));
  assert.equal(await page.evaluate(()=>window.state.mediaVideoSlots[1].cue),1);
  assert.equal(await cards.locator('video').evaluateAll(videos=>videos.every(video=>video.paused && video.muted)),true);
  // A missing asset affects its card rather than the active output or other cards.
  const liveAsset=await page.evaluate(()=>window.state.activePresentation?.media?.assetId);
  await page.evaluate(()=>{window.state.mediaVideoSlots[2]={assetId:'media_missing',name:'Missing clip',cue:0};window.MediaVideoDeck.restore();window.renderDeck();});
  assert.match(await cards.nth(2).locator('.video-slot-message').textContent(),/missing/i);
  assert.equal(await cards.nth(2).getByRole('button',{name:'Send Live',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.state.activePresentation?.media?.assetId),liveAsset);
  const corruptUrl=await page.evaluate(()=>{window.state.mediaVideoSlots[2]={assetId:window.state.mediaVideoSlots[0].assetId,name:'Duplicate test',cue:0};return window.state.activePresentation.media.url;});
  // Missing/corrupt media never publishes a replacement. Use a distinct unloaded slot.
  await page.route('**/presentation/files/'+ids[2]+'.webm',route=>route.fulfill({status:200,contentType:'video/webm',body:'invalid video data'}));
  await page.evaluate(id=>{window.state.mediaVideoSlots[2]={assetId:id,name:'Corrupt clip',cue:0};window.MediaVideoDeck.restore();window.renderDeck();},ids[2]);
  await page.waitForFunction(()=>document.querySelectorAll('.media-video-slot')[2].classList.contains('has-error'));
  assert.equal(await cards.nth(2).getByRole('button',{name:'Send Live',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.state.activePresentation?.media?.url),corruptUrl);
  await page.evaluate(()=>{window.isRemoteOperator=true;window.syncPresentationControls();});
  assert.equal(await cards.nth(0).getByRole('button',{name:'Send Live',exact:true}).isDisabled(),true);
  assert.equal(await livePanel.getByRole('button',{name:'Restart',exact:true}).isDisabled(),true);
  await page.evaluate(()=>{window.isRemoteOperator=false;window.syncPresentationControls();});
  assert.deepEqual(errors,[]);
  console.log('PASS: preview isolation, cue/beginning, mute, Hold, host restrictions, full deck, replacement, stable players, session restore, missing/corrupt media, desktop and narrow layouts.');
 } catch(error) {
  if(process.env.MEDIA_DECK_ARTIFACTS) {
   fs.mkdirSync(process.env.MEDIA_DECK_ARTIFACTS,{recursive:true});
   for(const [index,page] of browser?.contexts().flatMap(context=>context.pages()).entries() || []) {
    console.error('Browser diagnostic',index,await page.evaluate(()=>({url:location.href,slots:window.state?.mediaVideoSlots,presentation:window.state?.activePresentation,output:document.querySelector('#presentation-output')?.hidden,error:document.querySelector('.presentation-output-error')?.textContent,cards:[...document.querySelectorAll('.media-video-slot')].map(c=>({status:c.querySelector('.video-slot-message').textContent,rect:c.getBoundingClientRect().toJSON()}))})));
    await page.screenshot({path:path.join(process.env.MEDIA_DECK_ARTIFACTS,`failure-${index}.png`),timeout:3000}).catch(()=>{});
   }
  }
  throw error;
 } finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
