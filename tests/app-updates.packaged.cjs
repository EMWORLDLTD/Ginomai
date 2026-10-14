'use strict';
// Packaged runtime smoke test. The update transport/installer is simulated;
// production IPC, preferences, workspace saving and restart guards run unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = path.resolve(process.argv[2] || 'scratch/update-desktop-validation/win-unpacked');
const resources = path.join(directory,'resources');
const archive = path.join(resources,'app.asar');
const original = path.join(resources,'update-validation-production.asar');
const harness = path.join(resources,'app');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'ginomai-packaged-update-'));
const packageMetadata = require('../package.json');
async function renameAfterShutdown(from,to) {
  for (let attempt=0; ; attempt++) {
    try { await fs.promises.rename(from,to); return; }
    catch (error) {
      if (error.code !== 'EBUSY' || attempt === 19) throw error;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }
}

(async () => {
  let app;
  assert(fs.existsSync(archive),'Build the unpacked Windows app first.');
  assert(!fs.existsSync(original) && !fs.existsSync(harness),'Validation paths must be unused.');
  const asar = require('@electron/asar');
  const packedMain = asar.extractFile(archive,'electron/main.js').toString();
  new (require('node:vm').Script)(packedMain); // Reject corrupt executable code before Electron can show an error dialog.
  const updaterSection = source => source.slice(source.indexOf('// ─── Over-The-Air'), source.indexOf('// ─── App Lifecycle'));
  assert.equal(updaterSection(packedMain),updaterSection(fs.readFileSync(path.resolve(__dirname,'../electron/main.js'),'utf8')),'Packaged updater integration must match the verified source.');
  for (const file of ['electron/preload.js','electron/update-controller.js','server.js','index.html','js/app.js','js/app-updates.js','css/app-updates.css','lib/output-status.js','lib/live-state-store.js']) {
    assert(asar.extractFile(archive,file).equals(fs.readFileSync(path.resolve(__dirname,'..',file))), `Packaged ${file} must match the verified source before launch.`);
  }
  fs.renameSync(archive,original);
  const unpacked = archive + '.unpacked';
  if (fs.existsSync(unpacked)) fs.renameSync(unpacked,original+'.unpacked');
  fs.mkdirSync(harness);
  fs.writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'ginomai-update-validation',version:packageMetadata.version,main:'main.cjs'}));
  fs.writeFileSync(path.join(harness,'main.cjs'), `
    const {app,BrowserWindow}=require('electron');
    process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
    app.setName('Ginomai Update Validation');
    app.setPath('userData',process.env.GINOMAI_UPDATE_TEST_DATA);
    // Hide test windows, including their constructor's initial display.
    const show=BrowserWindow.prototype.show;
    BrowserWindow.prototype.show=function(){this.hide();};
    BrowserWindow.prototype.setFullScreen=function(){};
    app.on('browser-window-created',(_,window)=>window.hide());
    const root=require('node:path').join(__dirname,'../update-validation-production.asar');
    const updater=require(root+'/node_modules/electron-updater').autoUpdater;
    global.__updateSmoke={checks:0,downloads:0,installs:0};
    updater.checkForUpdates=async()=>{global.__updateSmoke.checks++;return {updateInfo:{version:'2.4.3'},isUpdateAvailable:true};};
    updater.downloadUpdate=async()=>{global.__updateSmoke.downloads++;updater.emit('download-progress',{percent:52});updater.emit('update-downloaded',{version:'2.4.3'});return ['verified-test-payload'];};
    updater.quitAndInstall=()=>{global.__updateSmoke.installs++;};
    require(root+'/electron/main.js');
  `);
  try {
    app = await _electron.launch({timeout:60000,executablePath:path.join(directory,'Ginomai.exe'),args:['--headless','--disable-gpu'],env:{...process.env,GINOMAI_UPDATE_TEST_DATA:temporary,PORT:'0',SF_LIVE_STATE_FILE:path.join(temporary,'live.json'),SF_MEDIA_DIR:path.join(temporary,'backgrounds'),SF_PRESENTATION_DIR:path.join(temporary,'presentations')}});
    const page = await app.firstWindow();
    await page.waitForFunction(()=>window.sermonManager && window.checkForUpdates && window.desktopApi?.getUpdateStatus && !document.getElementById('desktop-update-indicator').hidden);
    assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
    assert.equal(await app.evaluate(({app})=>app.getPath('userData')),temporary);
    let status = await page.evaluate(()=>window.desktopApi.getUpdateStatus());
    assert.equal(status.preferences.automaticDownloads,false);
    await page.evaluate(()=>window.checkForUpdates());
    assert.equal((await page.evaluate(()=>window.desktopApi.getUpdateStatus())).phase,'available');
    assert.equal(await app.evaluate(()=>global.__updateSmoke.downloads),0);
    await page.locator('#update-panel-action').click();
    assert.equal((await page.evaluate(()=>window.desktopApi.getUpdateStatus())).phase,'ready');
    assert.equal(await app.evaluate(()=>global.__updateSmoke.installs),0);
    await page.evaluate(()=>{window.sermonManager.isRecordingSermon=true;});
    status = await page.evaluate(()=>window.desktopApi.installUpdate());
    assert(status.blockers.includes('Sermon recording'));
    await page.evaluate(()=>{window.sermonManager.isRecordingSermon=false;window.state.aiSpeechRequested=true;});
    status = await page.evaluate(()=>window.desktopApi.installUpdate());
    assert(status.blockers.includes('AI microphone'));
    await page.evaluate(()=>{window.state.aiSpeechRequested=false;});
    const result = await page.evaluate(async()=>{
      const outputs = new EventSource('/api/events?target=livestream');
      await new Promise(resolve=>outputs.onopen=resolve);
      const blocked = await window.desktopApi.installUpdate();
      outputs.close();return blocked;
    });
    assert(result.blockers.includes('Connected livestream output'));
    await page.evaluate(()=>window.desktopApi.setUpdatePreferences({automaticDownloads:true}));
    assert.equal(JSON.parse(fs.readFileSync(path.join(temporary,'update-preferences.json'),'utf8')).automaticDownloads,true);
    await page.evaluate(()=>window.desktopApi.setUpdatePreferences({automaticDownloads:false}));
    // A second window with the same preload must not control the host updater.
    const other = await app.evaluate(async({BrowserWindow},preload)=>{
      const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,preload}});
      const host=BrowserWindow.getAllWindows().find(item=>item!==window).webContents.getURL();
      await window.loadURL(host);
      const response=await window.webContents.executeJavaScript('window.desktopApi.installUpdate()');
      window.destroy();return response;
    },path.join(resources,'update-validation-production.asar/electron/preload.js'));
    assert.match(other.error,/host desktop/);
    await page.waitForFunction(async()=>!(await fetch('/api/output-status').then(response=>response.json())).outputs.some(output=>output.connected));
    status = await page.evaluate(()=>window.desktopApi.installUpdate());
    assert.equal(status.phase,'restarting');
    assert.equal(await app.evaluate(()=>global.__updateSmoke.installs),1);
    assert(fs.existsSync(path.join(temporary,'live.json')));
    console.log('Packaged Windows update smoke passed: explicit download, persisted opt-in, recording/mic/output blocks, host-only IPC, saved workspace and explicit installation request (installer simulated).');
  } finally {
    await app?.close();
    const checkedHarness=path.resolve(harness);
    assert(checkedHarness.startsWith(directory+path.sep));
    fs.rmSync(checkedHarness,{recursive:true,force:true});
    await renameAfterShutdown(original,archive);
    if (fs.existsSync(original+'.unpacked')) await renameAfterShutdown(original+'.unpacked',archive+'.unpacked');
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));
