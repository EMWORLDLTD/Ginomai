'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ginomai-display-settings-'));
process.env.SF_LIVE_STATE_FILE=path.join(temporary,'live.json');
process.env.SF_MEDIA_DIR=path.join(temporary,'backgrounds');
process.env.SF_PRESENTATION_DIR=path.join(temporary,'presentations');
const {server}=require('../server');
(async()=>{
  let browser;
  try{
    server.listen(0,'127.0.0.1');await once(server,'listening');
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    let syncRequests=0;
    page.on('request',request=>{if(request.method()==='POST' && new URL(request.url()).pathname==='/api/sync')syncRequests++;});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      localStorage.setItem('sf_concordance_style','classic');
      localStorage.setItem('sf_concordance_display_mode','auto');
      localStorage.setItem('sf_concordance_position','left');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.themeManager && window.openSettingsToTab);
    await page.evaluate(()=>window.openSettingsToTab('display'));
    assert.equal(await page.locator('#setting-transparent-bg-toggle').count(),0);
    assert.equal(await page.getByText('Default Output Aspect Ratio',{exact:true}).count(),0);
    assert.equal(await page.locator('#tab-display #setting-song-editor-mode').count(),0);
    assert.equal(await page.locator('#tab-control #setting-song-editor-mode').count(),1);
    assert.equal(await page.locator('#setting-max-lines-select').inputValue(),'0');
    assert.equal(await page.locator('#setting-auto-shrink-toggle').isChecked(),true);
    await page.locator('#setting-auto-shrink-toggle').locator('..').click();
    assert.equal(await page.evaluate(()=>window.state.textAutoScale),false);
    await page.locator('#setting-max-lines-select').selectOption('3',{force:true});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.themeManager && window.openSettingsToTab);
    await page.evaluate(()=>window.openSettingsToTab('display'));
    assert.equal(await page.locator('#setting-auto-shrink-toggle').isChecked(),false);
    assert.equal(await page.locator('#setting-max-lines-select').inputValue(),'3');
    await page.locator('#display-advanced-settings summary').click();
    for(const [id,value] of [['style','classic'],['mode','auto'],['position','left']]) assert.equal(await page.locator(`#setting-concordance-${id}`).inputValue(),value);
    assert.equal(await page.locator('#setting-concordance-style + .custom-select-wrapper .custom-select-trigger').textContent(),'Classic Theological Card');
    const liveBefore=await page.evaluate(()=>JSON.stringify({id:window.state.activeLiveSlideId,text:window.state.activeLiveText,reference:window.state.activeLiveRef,theme:window.themeManager.getSanctuaryPayload()}));
    const syncBefore=syncRequests;
    await page.locator('#display-advanced-settings button[onclick="testLiveTransitionEffect()"]').click();
    const preview=page.frameLocator('#transition-preview-frame');
    await preview.getByText('Summer and winter, and springtime and harvest',{exact:false}).first().waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify({id:window.state.activeLiveSlideId,text:window.state.activeLiveText,reference:window.state.activeLiveRef,theme:window.themeManager.getSanctuaryPayload()})),liveBefore);
    assert.equal(syncRequests,syncBefore,'transition preview must make no live-output requests');
    // Changing auto-shrink fits the same card without replacing its content node.
    await page.evaluate(()=>{
      const frame=document.getElementById('transition-preview-frame');
      window.__fitPayload={slideId:'bible_fit_test',text:'Long verse '.repeat(150),reference:'John 3:16',isBible:true,contentType:'bible',mode:'full',projectorActive:true,textAutoScale:true,transitionType:'cut',_timestamp:Date.now()+100};
      frame.contentWindow.postMessage({type:'APPEARANCE_PREVIEW',payload:window.__fitPayload},location.origin);
    });
    const text=preview.locator('.slide-slot.active .content-line');
    await text.waitFor();
    await page.waitForFunction(()=>document.getElementById('transition-preview-frame').contentDocument.querySelector('.slide-slot.active .content-line')?.textContent.includes('Long verse'));
    const fitted=await text.evaluate(node=>{window.__residentText=node;return parseFloat(node.style.fontSize);});
    await page.evaluate(()=>document.getElementById('transition-preview-frame').contentWindow.postMessage({type:'APPEARANCE_PREVIEW',payload:{...window.__fitPayload,textAutoScale:false,_timestamp:window.__fitPayload._timestamp+1}},location.origin));
    await page.waitForFunction(()=>{
      const node=document.getElementById('transition-preview-frame').contentDocument.querySelector('.slide-slot.active .content-line');
      return node && node.style.fontSize===node.dataset.preferredSize+'px';
    });
    assert(await text.evaluate((node,size)=>node===window.__residentText && parseFloat(node.style.fontSize)>size,fitted));
    await page.screenshot({path:path.join(__dirname,'../scratch/display-settings-cleanup.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: settings cleanup, saved values, local transition preview, and auto-shrink on resident output text.');
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));
    assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
