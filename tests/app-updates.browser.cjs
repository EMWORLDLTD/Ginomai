'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'ginomai-update-ui-'));
process.env.SF_LIVE_STATE_FILE = path.join(temporary,'live.json');
process.env.SF_MEDIA_DIR = path.join(temporary,'backgrounds');
process.env.SF_PRESENTATION_DIR = path.join(temporary,'presentations');
const {server} = require('../server');

(async () => {
  let browser;
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE}:{})});
    const page = await browser.newPage({viewport:{width:1024,height:650}});
    await page.addInitScript(() => {
      let state = {phase:'available',currentVersion:'2.4.1',latestVersion:'2.4.2',releaseNotes:{version:'2.4.2',text:'New features\n• Quiet updates\n• Live restart protection'},percent:0,revision:0,preferences:{automaticDownloads:false},blockers:[]};
      let notify;
      window.__updateCounts = {checks:0,downloads:0,installs:0,underlying:0,external:0};
      window.__updateStatus = patch => {state={...state,...patch,revision:state.revision+1};notify?.(state);return state;};
      window.desktopApi = {
        isDesktop:true, getAppInfo:async () => ({version:'2.4.1'}),
        openExternal:async () => {window.__updateCounts.external++;},
        getUpdateStatus:async () => state, onUpdateStatus:fn => {notify=fn;},
        onOpenUpdates(){}, getDisplays:async () => [],getProjectorStatus:async () => ({isOpen:false}),
        getStageStatus:async () => ({isOpen:false}), getServerInfo:async () => ({port:8500,lanIps:[],urls:{}}),
        checkForUpdates:async () => {window.__updateCounts.checks++;return state;},
        downloadUpdate:async () => {window.__updateCounts.downloads++;return window.__updateStatus({phase:'ready',percent:100});},
        cancelUpdateDownload:async () => window.__updateStatus({phase:'available'}),
        installUpdate:async () => {window.__updateCounts.installs++;return state;},
        setUpdatePreferences:async prefs => window.__updateStatus({preferences:prefs})
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.sermonManager && !document.getElementById('desktop-update-indicator').hidden);
    await page.locator('#desktop-update-indicator').click();
    assert(await page.locator('#update-panel-backdrop').evaluate(node=>node.classList.contains('open')));
    assert.equal(await page.locator('#update-panel-action').textContent(),'Download Update');
    assert.equal(await page.locator('#desktop-update-footer').textContent(),'Update available');
    assert.equal(await page.evaluate(()=>window.__updateCounts.installs),0);
    let popups = 0; page.on('popup',()=>popups++);
    const requestsBeforeNotes = await page.evaluate(()=>({...window.__updateCounts}));
    await page.locator('#update-panel-notes-toggle').click();
    assert.equal(await page.locator('#update-panel-title').textContent(),'What’s new');
    assert.match(await page.locator('#update-notes-content').textContent(),/Live restart protection/);
    assert.equal(await page.locator('#update-panel-action').isVisible(),true);
    assert.deepEqual(await page.evaluate(()=>window.__updateCounts),requestsBeforeNotes);
    assert.equal(popups,0);
    await page.evaluate(()=>window.__updateStatus({releaseNotes:{version:'2.4.2',text:'<img src="https://example.com" onerror="window.__unsafeNote=true">\nQuiet updates\n'.repeat(60)}}));
    assert.equal(await page.locator('#update-notes-content img').count(),0);
    assert.equal(await page.evaluate(()=>window.__unsafeNote),undefined);
    const bounds = await page.locator('#update-panel-notes').boundingBox();
    const action = await page.locator('#update-panel-action').boundingBox();
    assert(bounds.y+bounds.height<=action.y,'The update action stays outside the scrolling notes.');
    await page.locator('#update-panel-notes-toggle').click();
    assert.equal(await page.locator('#update-panel-title').textContent(),'Software updates');
    await page.evaluate(()=>window.__updateStatus({releaseNotes:{version:'2.4.2',text:''}}));
    await page.locator('#update-panel-notes-toggle').click();
    assert.equal(await page.locator('#update-notes-content').textContent(),'No release notes provided for this version.');
    await page.locator('#update-panel-notes-toggle').click();
    await page.evaluate(()=>window.__updateStatus({releaseNotes:{version:'2.4.2',text:'New features\n• Quiet updates\n• Live restart protection'}}));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'desktop-update-indicator');
    await page.evaluate(()=>{window.toggleDesktopProjector=()=>{window.__updateCounts.underlying++;};});
    const target = await page.locator('#desktop-projector-btn').boundingBox();
    await page.locator('#desktop-update-indicator').click();
    await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
    assert.equal(await page.evaluate(()=>window.__updateCounts.underlying),0);
    assert.equal(await page.locator('#update-panel-backdrop').evaluate(node=>node.classList.contains('open')),false);
    await page.locator('#desktop-update-footer').click();
    await page.locator('#update-panel-action').click();
    assert.equal(await page.evaluate(()=>window.__updateCounts.downloads),1);
    assert.equal(await page.locator('#update-panel-action').textContent(),'Restart to Update');
    assert.equal(await page.evaluate(()=>window.__updateCounts.installs),0);
    await page.evaluate(()=>window.checkForUpdates());
    assert.equal(await page.evaluate(()=>window.__updateCounts.installs),0);
    await page.evaluate(()=>window.__updateStatus({phase:'downloading',percent:52}));
    assert.equal(await page.locator('#desktop-update-footer').textContent(),'Downloading · 52%');
    assert.equal(await page.locator('#update-panel-progress').evaluate(node=>node.value),52);
    await page.evaluate(()=>window.__updateStatus({phase:'ready',percent:100}));
    await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.getElementById('update-panel-backdrop').contains(document.activeElement)));
    // The real app's activity inspection is used rather than UI labels.
    await page.evaluate(()=>{window.sermonManager.isRecordingSermon=true;});
    assert((await page.evaluate(()=>window.prepareDesktopUpdateRestart(false))).blockers.includes('Sermon recording'));
    await page.evaluate(()=>{window.sermonManager.isRecordingSermon=false;window.state.aiSpeechRequested=true;});
    assert((await page.evaluate(()=>window.prepareDesktopUpdateRestart(false))).blockers.includes('AI microphone'));
    await page.evaluate(()=>{window.state.aiSpeechRequested=false;});
    assert.equal((await page.evaluate(()=>window.prepareDesktopUpdateRestart(true))).ok,true);
    const output = path.resolve(__dirname,'../scratch/update-ui-preview');fs.mkdirSync(output,{recursive:true});
    await page.locator('#update-panel-notes-toggle').click();
    for (const style of ['bento','classic']) for (const mode of ['dark','light']) {
      await page.evaluate(({style,mode})=>{for(const node of [document.documentElement,document.body]){node.dataset.themeStyle=style;node.dataset.themeMode=mode;}},{style,mode});
      const panel = await page.locator('.sf-update-panel').boundingBox();
      assert(panel.x>=0 && panel.x+panel.width<=1024 && panel.y+panel.height<=650);
      assert.equal(Math.round(panel.y+panel.height),630,'Update card uses the notification bottom offset.');
      const preview = await page.locator('#bento-preview-box').boundingBox();
      assert(panel.y>=preview.y+preview.height+8 || panel.x+panel.width<=preview.x-8,'Update card keeps the preview visible.');
      assert.equal(await page.locator('.sf-update-panel').evaluate(node=>getComputedStyle(node).backdropFilter),'none');
      await page.screenshot({path:path.join(output,`${style}-${mode}.png`)});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>window.__updateStatus({error:'Stop active outputs before restarting. '.repeat(40)}));
    await page.waitForFunction(()=>{
      const card=document.querySelector('.sf-update-panel').getBoundingClientRect();
      const preview=document.getElementById('bento-preview-box').getBoundingClientRect();
      return card.top>=preview.bottom+8 || card.right<=preview.left-8;
    });
    await page.evaluate(()=>document.getElementById('bento-preview-box').style.setProperty('height','650px','important'));
    await page.waitForFunction(()=>{
      const card=document.querySelector('.sf-update-panel').getBoundingClientRect();
      const preview=document.getElementById('bento-preview-box').getBoundingClientRect();
      return card.right<=preview.left-8;
    });
    await page.evaluate(()=>{document.getElementById('bento-preview-box').style.removeProperty('height');window.__updateStatus({error:null});});
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.openSettingsToTab('updates'));
    await page.locator('#tab-updates .sf-update-notes-link').click();
    assert.equal(await page.locator('#update-panel-title').textContent(),'What’s new');
    assert.equal(await page.evaluate(()=>window.__updateCounts.external),0);
    assert.equal(popups,0);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.openSettingsToTab('updates'));
    await page.locator('#automatic-update-downloads').check();
    assert.equal(await page.locator('#automatic-update-downloads').isChecked(),true);
    await page.locator('#automatic-update-downloads').uncheck();
    assert.equal(await page.locator('#automatic-update-downloads').isChecked(),false);
    await page.evaluate(()=>window.__updateStatus({phase:'up-to-date',latestVersion:null}));
    assert.equal(await page.locator('#desktop-update-footer').isVisible(),false);
    console.log('Update UI passed: dismissal absorption, keyboard/focus, explicit actions, progress, activity guards, settings, and four theme combinations at 1024×650.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
