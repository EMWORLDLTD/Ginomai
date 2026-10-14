'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
function appFunction(name) {
  let start = app.indexOf('function ' + name + '(');
  if (app.slice(start - 6, start) === 'async ') start -= 6;
  return app.slice(start, app.indexOf('\n}', start) + 2);
}
function ui(desktopApi) {
  const field = { value:'',focus() { this.focused = true; } }, button = {}, status = {};
  const scans = [], notices = [];
  const result = { softwareType:'generic',counts:{songs:0,bibles:0,videos:0,images:0,agendas:0} };
  const context = vm.createContext({ window:{desktopApi,libraryImporter:{scanMigrationFolder:async path=>{scans.push(path);return result;}}},
    document:{getElementById:id=>({'import-migrate-folder-path':field,'import-migrate-browse-btn':button,'import-migrate-status':status}[id] || null)},
    currentMigrationScan:null,showToast:(...notice)=>notices.push(notice) });
  vm.runInContext(['initMigrationTab','browseMigrationFolder','handleMigrationScan'].map(appFunction).join('\n'), context);
  return { context,field,button,status,scans,notices,result };
}

test('desktop picker scans the exact chosen folder, including spaces and Unicode', async () => {
  for (const folder of ['C:\\Users\\Worship Team\\Yorùbá Library', '/Users/team/VideoPsalm']) {
    const state = ui({selectMigrationFolder:async()=>folder});
    state.context.initMigrationTab();
    assert.equal(state.field.value,'');
    assert.equal(state.button.disabled,false);
    await state.context.browseMigrationFolder();
    assert.equal(state.field.value,folder);
    assert.deepEqual(state.scans,[folder]);
    assert.equal(state.context.currentMigrationScan,state.result);
  }
});

test('cancel and picker failure preserve the existing path and scan', async () => {
  const state = ui({selectMigrationFolder:async()=>null});
  const previous = {previous:true};
  state.field.value = 'C:\\Library';state.context.currentMigrationScan = previous;
  await state.context.browseMigrationFolder();
  assert.equal(state.field.value,'C:\\Library');
  assert.equal(state.context.currentMigrationScan,previous);
  assert.equal(state.scans.length,0);
  state.context.window.desktopApi.selectMigrationFolder = async()=>{throw new Error('Picker unavailable');};
  await state.context.browseMigrationFolder();
  assert.equal(state.scans.length,0);
  assert.equal(state.field.value,'C:\\Library');
  assert.match(state.notices[0][0],/Picker unavailable/);
});

test('browser mode explains manual paths and never scans a guessed folder', async () => {
  const state = ui();
  state.context.initMigrationTab();
  assert.equal(state.field.value,'');assert.equal(state.button.disabled,true);
  assert.match(state.status.textContent,/computer running Ginomai/);
  await state.context.browseMigrationFolder();
  assert.equal(state.scans.length,0);assert.equal(state.field.focused,true);
  state.field.value = '  C:\\Library\\VideoPsalm  ';
  state.context.initMigrationTab();
  assert.equal(state.field.value,'  C:\\Library\\VideoPsalm  ');
  await state.context.handleMigrationScan();
  assert.deepEqual(state.scans,['C:\\Library\\VideoPsalm']);
});

test('native folder dialog is host-only and returns the selected directory or cancellation', async () => {
  let handler, allowed = true, response = {canceled:false,filePaths:['C:\\Library\\VideoPsalm']};
  const parent = {}, calls = [];
  const context = vm.createContext({mainWindow:parent,isUpdateHost:()=>allowed,
    ipcMain:{handle:(name,callback)=>{assert.equal(name,'desktop:select-migration-folder');handler=callback;}},
    dialog:{showOpenDialog:async(window,options)=>{calls.push({window,options});return response;}}});
  const start = main.indexOf("ipcMain.handle('desktop:select-migration-folder'");
  vm.runInContext(main.slice(start,main.indexOf("ipcMain.handle('desktop:get-displays'",start)),context);
  assert.equal(await handler({}),'C:\\Library\\VideoPsalm');
  assert.equal(calls[0].window,parent);
  assert.deepEqual(Array.from(calls[0].options.properties),['openDirectory']);
  response = {canceled:true,filePaths:[]};assert.equal(await handler({}),null);
  allowed = false;assert.equal(await handler({}),null);assert.equal(calls.length,2);
});

test('preload forwards folder selection through the protected IPC bridge', async () => {
  let bridge;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../electron/preload.js'),'utf8'),{
    process:{platform:'win32'},require:()=>({contextBridge:{exposeInMainWorld:(name,api)=>{bridge=api;}},
      ipcRenderer:{invoke:async channel=>{calls.push(channel);return 'C:\\Library';}}})
  });
  assert.equal(await bridge.selectMigrationFolder(),'C:\\Library');
  assert.deepEqual(calls,['desktop:select-migration-folder']);
});
