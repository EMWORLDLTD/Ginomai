'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { InstallEngine } = require('./install-engine');

let window;
let engine;
const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'dev-resources');
const preview = process.argv.includes('--preview');
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', () => { if (window) { window.restore(); window.focus(); } });

function handle(name, callback) {
  ipcMain.handle(`setup:${name}`, (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Setup request rejected.');
    return callback(...args);
  });
}

app.whenReady().then(async () => {
  if (!lock) return;
  const platform = process.platform;
  const manifest = preview ? { version:app.getVersion(), platform } : JSON.parse(fs.readFileSync(path.join(resources, 'installer-manifest.json'), 'utf8'));
  let directory;
  if (platform === 'darwin') {
    try { await fs.promises.access('/Applications', fs.constants.W_OK); directory = '/Applications/Ginomia.app'; }
    catch { directory = path.join(app.getPath('home'), 'Applications', 'Ginomia.app'); }
  } else directory = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Programs', 'Ginomia');

  engine = new InstallEngine({ platform, resources, manifest, directory, onProgress:update => {
    if (window && !window.isDestroyed()) window.webContents.send('setup:progress', update);
  } });
  const area = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({
    width:Math.min(840, area.width), height:Math.min(570, area.height), minWidth:640,
    resizable:false, maximizable:false, fullscreenable:false, frame:false, show:false,
    backgroundColor:'#131218', title:platform === 'darwin' ? 'Install Ginomia' : 'Ginomia Setup',
    webPreferences:{ preload:path.join(__dirname, 'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:true }
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (engine.busy) event.preventDefault(); });
  window.once('ready-to-show', () => window.show());

  handle('info', () => ({ platform, directory:engine.directory, version:manifest.version, preview }));
  handle('minimize', () => window.minimize());
  handle('close', () => { if (!engine.busy) window.close(); });
  handle('details', expanded => {
    const height = Math.min(expanded ? 680 : 570, area.height);
    const [width] = window.getSize();
    window.setSize(width, height, false);
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds).workArea;
    if (bounds.y + height > display.y + display.height) window.setPosition(bounds.x, Math.max(display.y, display.y + display.height - height));
  });
  handle('choose-location', async () => {
    if (engine.busy || engine.complete || preview) return null;
    const result = await dialog.showOpenDialog(window, { title:'Choose Ginomia installation folder', defaultPath:path.dirname(engine.directory), properties:['openDirectory', 'createDirectory'] });
    if (result.canceled) return null;
    engine.setDirectory(path.join(result.filePaths[0], platform === 'darwin' ? 'Ginomia.app' : 'Ginomia'));
    return engine.directory;
  });
  handle('install', options => {
    if (preview) throw new Error('Installation is disabled in design preview.');
    if (!options || typeof options.desktopShortcut !== 'boolean') throw new Error('Invalid setup options.');
    return engine.install({ desktopShortcut:options.desktopShortcut });
  });
  handle('launch', async () => {
    if (!engine.complete) throw new Error('Finish installing Ginomia first.');
    const executable = platform === 'darwin' ? engine.directory : path.join(engine.directory, 'Ginomia.exe');
    const error = await shell.openPath(executable);
    if (error) throw new Error(error);
    app.quit();
  });
  if (preview) await window.loadFile(path.join(__dirname, 'index.html'), { query:{ platform } });
  else await window.loadFile(path.join(__dirname, 'index.html'));
}).catch(error => { dialog.showErrorBox('Ginomia Setup could not start', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
