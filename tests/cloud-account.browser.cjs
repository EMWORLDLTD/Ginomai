'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ginomai-cloud-ui-'));
process.env.SF_LIVE_STATE_FILE = path.join(temporary,'live.json');
process.env.SF_MEDIA_DIR = path.join(temporary,'backgrounds');
process.env.SF_PRESENTATION_DIR = path.join(temporary,'presentations');
const {server} = require('../server');
const webRoot=path.resolve(__dirname,'../web/dist');
const webServer=require('node:http').createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  const file=path.resolve(webRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(webRoot+path.sep)){response.writeHead(403);response.end();return;}
  fs.readFile(file,(error,bytes)=>{if(error){response.writeHead(404);response.end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});response.end(bytes);
  });
});
const cloudUrl = 'https://cloud.ginomai.test';
const user = {id:'11111111-1111-4111-8111-111111111111',email:'test@example.com'};
let backups=[], events=[], adminAllowed=false;
async function mock(context) {
  await context.route('**/js/cloud-config.js', route => route.fulfill({contentType:'application/javascript',body:`window.GINOMAI_CLOUD_CONFIG={url:'${cloudUrl}',publishableKey:'sb_publishable_test',appVersion:'test'};`}));
  await context.route(cloudUrl+'/**', async route => {
    const request=route.request(), url=new URL(request.url());
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type','access-control-allow-methods':'POST,GET,OPTIONS'};
    if(request.method()==='OPTIONS') {await route.fulfill({status:204,headers});return;}
    const data=request.postDataJSON() || {}; events.push({path:url.pathname,data,authorization:request.headers().authorization});
    let result={},status=200;
    if(url.pathname.endsWith('/verify')) {if(data.token!=='01234567'){status=403;result={msg:'Code invalid or expired'};}else result={access_token:'verified',refresh_token:'refresh',expires_at:9999999999,user};}
    if(url.pathname.endsWith('cloud_backup_save')) {const record={id:crypto.randomUUID(),created_at:new Date().toISOString(),source_platform:data.p_payload.sourcePlatform,byte_size:JSON.stringify(data.p_payload).length,payload:data.p_payload};backups.unshift(record);backups=backups.slice(0,5);result=record.id;}
    if(url.pathname.endsWith('cloud_backup_list')) result=backups.map(({payload,...record})=>record);
    if(url.pathname.endsWith('cloud_backup_get')) result=backups.find(b=>b.id===data.p_id)?.payload;
    if(url.pathname.endsWith('cloud_backup_delete')) backups=backups.filter(b=>b.id!==data.p_id);
    if(url.pathname.endsWith('cloud_admin_report')) {if(!adminAllowed){status=403;result={message:'Administrator access required'};}else result={generated_at:new Date().toISOString(),verified_accounts:4,daily_accounts:2,monthly_accounts:3,daily_installations:3,monthly_installations:5};}
    if(url.pathname.endsWith('/logout')) {await route.fulfill({status:204,headers});return;}
    await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(result??null)});
  });
}
const account = page => page.locator('#ginomai-account-backdrop');
async function open(page) {await page.locator('.ginomai-account-launcher').first().click();await account(page).waitFor({state:'visible'});}
async function close(page) {await account(page).getByRole('button',{name:'Close account panel'}).click();}
async function login(page) {
  await account(page).getByLabel('Email',{exact:true}).fill(user.email);await account(page).getByRole('button',{name:'Send sign-in code'}).click();
  await page.waitForFunction(()=>!document.querySelector('#ginomai-account-backdrop form:nth-of-type(2)').hidden,{},{timeout:5000}).catch(async error=>{console.error('Login diagnostic',await account(page).innerText(),events);throw error;});
  assert.equal(await account(page).getByLabel('Email',{exact:true}).isVisible(),false);
  assert.equal(await account(page).getByRole('heading',{name:'Enter code'}).isVisible(),true);
  assert.equal(await account(page).getByRole('button',{name:/Resend in/}).isDisabled(),true);
  assert.equal(await account(page).locator('.ginomai-account-intro').isVisible(),false);
  assert.equal(await account(page).locator('.ginomai-account-offline').isVisible(),false);
  assert.equal(await account(page).locator('.ginomai-account-feedback').isVisible(),false);
  const codeStyles=await account(page).getByLabel('Email code',{exact:true}).evaluate(el=>({placeholder:el.placeholder,outline:getComputedStyle(el).outlineStyle,placeholderSize:getComputedStyle(el,'::placeholder').fontSize,placeholderSpacing:getComputedStyle(el,'::placeholder').letterSpacing}));
  assert.deepEqual(codeStyles,{placeholder:'Code',outline:'none',placeholderSize:'14px',placeholderSpacing:'normal'});
  if(process.env.CLOUD_ARTIFACTS) await page.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,`account-code-${page.viewportSize().width}.png`)});
  await account(page).getByLabel('Email code',{exact:true}).fill('000000');await account(page).getByRole('button',{name:'Verify',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ginomai-account-feedback').textContent.includes('invalid'));
  const codeInput=account(page).getByLabel('Email code',{exact:true});
  await codeInput.fill('0123456789');assert.equal(await codeInput.inputValue(),'0123456789');
  await codeInput.fill('01234567');await account(page).getByRole('button',{name:'Verify',exact:true}).click();
  await account(page).getByRole('button',{name:'Back up now'}).waitFor({state:'visible'});
}
(async()=>{
  let browser;
  server.listen(0,'127.0.0.1');await once(server,'listening');
  webServer.listen(0,'127.0.0.1');await once(webServer,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const webBase='http://127.0.0.1:'+webServer.address().port;
  try {
    await require('../web/build.cjs').build();
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await mock(context);
    const desktop=await context.newPage(),errors=[];desktop.on('pageerror',error=>errors.push(error.message));
    await desktop.goto(base);await desktop.waitForFunction(()=>window.openGinomaiAccount && window.libraryImporter?.db);await desktop.evaluate(()=>window.libraryImporter.dbReady);
    await desktop.evaluate(()=>{
      const song={id:'cloud-test-song',title:'Cloud test song',author:'Test',stanzas:[{type:'Chorus',text:'Test lyrics'}]};
      SONGS_DATABASE.push(song);window.libraryImporter.customSongs.push(song);
      window.state.agendaItems=[{type:'song',id:song.id,title:song.title},{type:'media',id:'private-video',title:'Video announcement',path:'C:/private/video.mp4'}];
      window.sessionManager.saveCurrentSessionSnapshot(null,true);
      window.__cloudBroadcasts=0;const original=window.broadcastState;window.broadcastState=(...args)=>{window.__cloudBroadcasts++;return original?.(...args);};
    });
    const active=await desktop.evaluate(()=>window.sessionManager.activeSessionId);
    await open(desktop);
    await desktop.waitForFunction(()=>localStorage.getItem('ginomai.cloud.analytics.v1:https://cloud.ginomai.test:last'));
    assert.equal(events.length,1,'only basic daily statistics are sent before signup');
    assert.equal(events[0].path,'/rest/v1/rpc/record_cloud_activity');
    assert.equal(await account(desktop).getByRole('checkbox').isVisible(),false);
    if(process.env.CLOUD_ARTIFACTS) fs.mkdirSync(process.env.CLOUD_ARTIFACTS,{recursive:true});
    for(const mode of ['dark','light']) {
      await desktop.evaluate(mode=>{document.documentElement.dataset.themeMode=mode;document.body.dataset.themeMode=mode;},mode);
      const surface=await account(desktop).locator('.ginomai-account-panel').evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(surface,mode==='light'?'rgb(255, 255, 255)':'rgb(19, 18, 24)');
      if(process.env.CLOUD_ARTIFACTS) await desktop.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,`account-signin-${mode}.png`)});
    }
    await account(desktop).locator('summary').click();
    assert.equal(await account(desktop).getByRole('checkbox').isChecked(),true);
    const infoButton=account(desktop).getByRole('button',{name:'About usage statistics'}),tooltip=account(desktop).getByRole('tooltip');
    assert.equal(await tooltip.isVisible(),false);
    await infoButton.hover();await tooltip.waitFor({state:'visible'});
    assert.match(await tooltip.innerText(),/Signed-in activity is linked to your account/);
    if(process.env.CLOUD_ARTIFACTS) await desktop.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,'account-privacy.png')});
    await account(desktop).getByRole('heading').hover();await tooltip.waitFor({state:'hidden'});
    await infoButton.focus();await tooltip.waitFor({state:'visible'});
    await desktop.keyboard.press('Escape');assert.equal(await tooltip.isVisible(),false);assert.equal(await account(desktop).isVisible(),true);
    await account(desktop).getByRole('checkbox').uncheck();
    assert.equal(await account(desktop).locator('.ginomai-account-feedback').isVisible(),false,'changing statistics does not add a status card');
    await account(desktop).locator('summary').click();
    await login(desktop);
    await account(desktop).getByRole('heading',{name:'No backups yet'}).waitFor({state:'visible'});
    assert.equal(await account(desktop).locator('.ginomai-account-email').innerText(),user.email);
    assert.equal(await account(desktop).locator('.ginomai-account-intro').isVisible(),false);
    assert.equal(await account(desktop).locator('.ginomai-account-feedback').isVisible(),false,'successful login does not leave a banner');
    assert.equal(await account(desktop).locator('.ginomai-account-footer').getByRole('button',{name:'Sign out on this device'}).isVisible(),true);
    for(const mode of ['dark','light']) {
      await desktop.evaluate(mode=>{document.documentElement.dataset.themeMode=mode;document.body.dataset.themeMode=mode;},mode);
      if(process.env.CLOUD_ARTIFACTS) await desktop.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,`account-empty-${mode}.png`)});
    }
    await account(desktop).getByRole('button',{name:'About cloud backups'}).hover();await account(desktop).locator('.ginomai-account-tooltip').waitFor({state:'visible'});
    assert.match(await account(desktop).locator('.ginomai-account-tooltip').innerText(),/latest five backups/);
    await desktop.keyboard.press('Escape');assert.equal(await account(desktop).isVisible(),true);
    await account(desktop).getByRole('button',{name:'Refresh backups'}).click();await desktop.waitForFunction(()=>document.querySelector('.ginomai-account-feedback').textContent==='Backups refreshed.');
    await account(desktop).getByRole('button',{name:'Back up now'}).click();
    await desktop.waitForFunction(()=>document.querySelector('.ginomai-account-feedback').textContent==='Cloud backup saved.');
    assert.doesNotMatch(JSON.stringify(backups[0]),/private\/video|C:\//);
    assert.equal(await account(desktop).getByRole('heading',{name:'No backups yet'}).isVisible(),false);
    assert.match(await account(desktop).locator('.ginomai-backup-row').innerText(),/Desktop/);
    if(process.env.CLOUD_ARTIFACTS) await desktop.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,'account-backups-light.png')});
    await account(desktop).getByRole('button',{name:'Delete',exact:true}).click();await account(desktop).getByRole('button',{name:'Delete backup',exact:true}).waitFor({state:'visible'});await account(desktop).getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(backups.length,1);
    await account(desktop).getByRole('button',{name:'Restore',exact:true}).click();
    await account(desktop).getByRole('button',{name:'Add restored sessions'}).click();
    await desktop.waitForFunction(()=>document.querySelector('.ginomai-account-feedback').textContent.includes('sessions restored'));
    assert.equal(await desktop.evaluate(()=>window.sessionManager.activeSessionId),active);assert.equal(await desktop.evaluate(()=>window.__cloudBroadcasts),0);
    await account(desktop).locator('summary').click();
    await account(desktop).getByRole('checkbox').check();await desktop.waitForTimeout(150);
    assert.equal(events.filter(e=>e.path.endsWith('record_cloud_activity')).length,2);
    assert.doesNotMatch(await account(desktop).locator('.ginomai-account-feedback').innerText(),/Usage analytics enabled/);
    await account(desktop).getByRole('checkbox').uncheck();
    await close(desktop);
    await desktop.evaluate(()=>{const button=document.createElement('button');button.id='cloud-underlay';button.textContent='Underlying action';button.style.cssText='position:fixed;left:0;top:0;width:120px;height:120px;z-index:90000';window.__underlayClicks=0;button.onclick=()=>window.__underlayClicks++;document.body.append(button);});
    await open(desktop);await desktop.mouse.click(20,20);
    assert.equal(await desktop.evaluate(()=>window.__underlayClicks),0);assert.equal(await account(desktop).isVisible(),false);
    await open(desktop);await desktop.keyboard.press('Escape');assert.equal(await account(desktop).isVisible(),false);
    for(const mode of ['light','dark']) {await desktop.evaluate(mode=>{document.documentElement.dataset.themeMode=mode;document.body.dataset.themeMode=mode;},mode);await open(desktop);assert.equal(await account(desktop).evaluate(el=>getComputedStyle(el).backdropFilter),'none');await close(desktop);}
    await desktop.reload();await desktop.waitForFunction(()=>window.openGinomaiAccount && window.libraryImporter?.db);await open(desktop);await account(desktop).getByRole('button',{name:'Back up now'}).waitFor({state:'visible'});
    await account(desktop).locator('summary').click();assert.equal(await account(desktop).getByRole('checkbox').isChecked(),false,'saved opt-out survives reload');
    await close(desktop);
    const web=await context.newPage();web.on('pageerror',error=>errors.push(error.message));await web.goto(webBase);await web.waitForFunction(()=>window.openGinomaiAccount);
    const webActive=await web.locator('#service').inputValue();await open(web);await login(web);await account(web).getByRole('button',{name:'Restore',exact:true}).waitFor({state:'visible'});await account(web).getByRole('button',{name:'Restore',exact:true}).click();
    await account(web).locator('.ginomai-backup-confirm').waitFor({state:'visible'});
    assert.match(await account(web).locator('.ginomai-backup-confirm').innerText(),/unavailable placeholder/);
    await account(web).getByRole('button',{name:'Add restored sessions'}).click();await web.waitForFunction(()=>document.querySelector('#service').options.length===2);
    assert.equal(await web.locator('#service').inputValue(),webActive);await close(web);
    const restoredId=await web.locator('#service option').last().getAttribute('value');await web.selectOption('#service',restoredId);
    assert.match(await web.locator('#agenda-list').innerText(),/Unavailable on this device/);
    await web.locator('#agenda-list .row-main').first().click();await web.getByRole('button',{name:'Take live',exact:true}).click();
    const live=await web.evaluate(()=>localStorage.getItem('ginomai.web.live.v1'));await open(web);await account(web).getByRole('button',{name:'Back up now'}).click();await web.waitForFunction(()=>document.querySelector('.ginomai-account-feedback').textContent==='Cloud backup saved.');
    assert.equal(await web.evaluate(()=>localStorage.getItem('ginomai.web.live.v1')),live);
    await account(web).getByRole('button',{name:'Sign out on this device'}).click();await close(web);
    assert.equal(await web.locator('#service option').count(),2);assert.equal(await web.evaluate(()=>localStorage.getItem('ginomai.web.live.v1')),live);
    await web.setViewportSize({width:390,height:844});await open(web);assert.ok(await account(web).locator('section').first().evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
    await account(web).locator('summary').click();await account(web).getByRole('button',{name:'About usage statistics'}).click();await account(web).getByRole('tooltip').waitFor({state:'visible'});
    assert.ok(await account(web).getByRole('tooltip').evaluate(el=>{const bounds=el.getBoundingClientRect();return bounds.left>=0 && bounds.right<=innerWidth;}));
    await account(web).getByRole('button',{name:'About usage statistics'}).click();assert.equal(await account(web).getByRole('tooltip').isVisible(),false);await close(web);
    await open(web);await login(web);await close(web);
    const admin=await context.newPage();await admin.goto(webBase+'/js/cloud-admin.html');await admin.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('administrator'));
    assert.equal(await admin.locator('#report-table').isVisible(),false);adminAllowed=true;await admin.getByRole('button',{name:'Refresh report'}).click();await admin.locator('#report-table').waitFor({state:'visible'});
    assert.match(await admin.locator('#report-table').innerText(),/Verified accounts\s+4/);
    const offlineContext=await browser.newContext({serviceWorkers:'block'}),offline=await offlineContext.newPage();
    await offlineContext.route('**/js/cloud-config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.GINOMAI_CLOUD_CONFIG={url:'${cloudUrl}',publishableKey:'sb_publishable_test',enabled:false,localTesting:false};`}));
    await offline.goto(webBase);await offline.waitForFunction(()=>window.openGinomaiAccount);await open(offline);assert.match(await account(offline).innerText(),/not configured/);await close(offline);
    assert.deepEqual(errors,[]);
    if(process.env.CLOUD_ARTIFACTS){fs.mkdirSync(process.env.CLOUD_ARTIFACTS,{recursive:true});await desktop.bringToFront();await desktop.evaluate(()=>window.openGinomaiAccount());await desktop.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,'desktop-account.png'),timeout:10000});await admin.bringToFront();await admin.screenshot({path:path.join(process.env.CLOUD_ARTIFACTS,'admin-report.png'),timeout:10000});}
    console.log('PASS: desktop/web OTP, persistence, backup interchange, additive restore, unchanged live output, default-on statistics, saved opt-out, accessible privacy details, report access, outside-click absorption, Escape, light/dark surfaces, narrow layout and unconfigured local use.');
  } catch(error) {
    console.error('Cloud browser failure:',error);
    for(const page of browser?.contexts().flatMap(context=>context.pages()) || []) console.error('Browser diagnostic',await page.evaluate(()=>({url:location.href,status:document.getElementById('save-status')?.textContent,body:document.body.innerText.slice(0,1800)})));
    throw error;
  } finally {await browser?.close();server.closeAllConnections();webServer.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>webServer.close(resolve))]);fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
