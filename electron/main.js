// Ginomia - Electron Main Process
'use strict';

const { app, BrowserWindow, screen, ipcMain, Menu, shell, dialog, session } = require('electron');
const path = require('path');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const serverModule = require('../server.js');

// Optimize memory and enforce proactive V8 Garbage Collection
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

// Global exception protection
process.on('uncaughtException', (err) => {
  console.error('[Ginomia Desktop] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Ginomia Desktop] Unhandled rejection:', reason);
});

let mainWindow = null;
let projectorWindow = null;
let stageWindow = null;
let currentStageMode = 'stage';
let serverPort = Number(process.env.PORT) || 8500;

// Single instance lock to prevent duplicate apps
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Local Background Server Management ──────────────────────────────────────
function startBackgroundServer(onReady) {
  try {
    serverModule.startServer(serverPort, (err, srv, boundPort) => {
      if (err) {
        console.error('[Ginomia Desktop] Server start warning/error:', err);
      }
      const activePort = boundPort || serverPort;
      serverPort = activePort;
      if (onReady) onReady(activePort);
    });
  } catch (err) {
    console.error('[Ginomia Desktop] Failed to start embedded server:', err);
    if (onReady) onReady(serverPort);
  }
}

function stopBackgroundServer() {
  try {
    serverModule.stopServer();
  } catch (e) {
    // ignore
  }
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createMainWindow(port) {
  if (!gotTheLock) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  const activePort = port || serverPort || 8500;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1440, Math.floor(width * 0.95)),
    height: Math.min(900, Math.floor(height * 0.92)),
    minWidth: 1024,
    minHeight: 650,
    show: false, // Don't show until page is loaded so there is never an empty/blank window
    backgroundColor: '#0a0f1d',
    title: 'Ginomia — The Word in Motion',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const appUrl = `http://localhost:${activePort}/index.html`;

  const loadApp = () => {
    mainWindow.loadURL(appUrl).then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }).catch((err) => {
      console.warn('[Ginomia Desktop] Waiting for server to accept connection, retrying...', err);
      setTimeout(loadApp, 250);
    });
  };

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (projectorWindow && !projectorWindow.isDestroyed()) {
      projectorWindow.close();
    }
    if (stageWindow && !stageWindow.isDestroyed()) {
      stageWindow.close();
    }
  });

  setupAppMenu();
}

// ─── Projector / Audience Display Window ──────────────────────────────────────
function launchProjectorWindow(targetDisplayId = null, targetMode = 'sanctuary') {
  const displays = screen.getAllDisplays();
  let targetDisplay = null;

  if (targetDisplayId) {
    targetDisplay = displays.find((d) => String(d.id) === String(targetDisplayId));
  }

  // If no target specified or not found, prefer the first non-primary display (external monitor / projector)
  if (!targetDisplay) {
    const primaryDisplay = screen.getPrimaryDisplay();
    targetDisplay = displays.find((d) => d.id !== primaryDisplay.id) || primaryDisplay;
  }

  if (projectorWindow) {
    // Reposition to targeted display
    const { x, y, width, height } = targetDisplay.bounds;
    projectorWindow.setPosition(x, y);
    projectorWindow.setSize(width, height);
    projectorWindow.setFullScreen(true);
    projectorWindow.show();
    projectorWindow.focus();
    notifyProjectorStatus();
    return { success: true, displayId: targetDisplay.id };
  }

  const { x, y, width, height } = targetDisplay.bounds;

  projectorWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'Ginomia — Sanctuary Projector Output',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const projectorUrl = `http://localhost:${serverPort}/display.html?target=${targetMode}`;
  projectorWindow.loadURL(projectorUrl).catch(() => {
    projectorWindow.loadFile(path.join(__dirname, '..', 'display.html'), {
      query: { target: targetMode }
    });
  });

  projectorWindow.setFullScreen(true);

  projectorWindow.on('closed', () => {
    projectorWindow = null;
    notifyProjectorStatus();
  });

  notifyProjectorStatus();
  return { success: true, displayId: targetDisplay.id };
}

function closeProjectorWindow() {
  if (projectorWindow) {
    projectorWindow.close();
    projectorWindow = null;
    notifyProjectorStatus();
    return { success: true };
  }
  return { success: false, message: 'Projector window not open' };
}

function notifyProjectorStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const status = {
      isOpen: !!projectorWindow,
      displayId: projectorWindow ? projectorWindow.getBounds() : null
    };
    mainWindow.webContents.send('desktop:projector-status-changed', status);
  }
}

// ─── Stage Confidence Monitor Window (Choir / Pastors) ────────────────────────
function launchStageWindow(targetDisplayId = null, stageMode = 'stage') {
  currentStageMode = stageMode || 'stage';
  const displays = screen.getAllDisplays();
  let targetDisplay = null;

  if (targetDisplayId) {
    targetDisplay = displays.find((d) => String(d.id) === String(targetDisplayId));
  }

  // If no target specified or not found, prefer a secondary display not currently occupied by the projector
  if (!targetDisplay) {
    const primaryDisplay = screen.getPrimaryDisplay();
    let projectorDisplayId = null;
    if (projectorWindow) {
      try {
        projectorDisplayId = screen.getDisplayMatching(projectorWindow.getBounds()).id;
      } catch (e) {}
    }

    targetDisplay = displays.find((d) => d.id !== primaryDisplay.id && d.id !== projectorDisplayId) ||
                    displays.find((d) => d.id !== primaryDisplay.id) ||
                    primaryDisplay;
  }

  const { x, y, width, height } = targetDisplay.bounds;

  if (stageWindow) {
    stageWindow.setPosition(x, y);
    stageWindow.setSize(width, height);
    stageWindow.setFullScreen(true);
    const stageUrl = `http://localhost:${serverPort}/display.html?target=${stageMode}`;
    stageWindow.loadURL(stageUrl).catch(() => {
      stageWindow.loadFile(path.join(__dirname, '..', 'display.html'), {
        query: { target: stageMode }
      });
    });
    stageWindow.show();
    stageWindow.focus();
    notifyStageStatus();
    return { success: true, displayId: targetDisplay.id, mode: stageMode };
  }

  stageWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'Ginomia — Stage Confidence Monitor (Choir / Pastors)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const stageUrl = `http://localhost:${serverPort}/display.html?target=${stageMode}`;
  stageWindow.loadURL(stageUrl).catch(() => {
    stageWindow.loadFile(path.join(__dirname, '..', 'display.html'), {
      query: { target: stageMode }
    });
  });

  stageWindow.setFullScreen(true);

  stageWindow.on('closed', () => {
    stageWindow = null;
    notifyStageStatus();
  });

  notifyStageStatus();
  return { success: true, displayId: targetDisplay.id, mode: stageMode };
}

function closeStageWindow() {
  if (stageWindow) {
    stageWindow.close();
    stageWindow = null;
    notifyStageStatus();
    return { success: true };
  }
  return { success: false, message: 'Stage monitor window not open' };
}

function notifyStageStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const status = {
      isOpen: !!stageWindow,
      displayBounds: stageWindow ? stageWindow.getBounds() : null,
      mode: currentStageMode
    };
    mainWindow.webContents.send('desktop:stage-status-changed', status);
  }
}

// ─── Network Info Helper ──────────────────────────────────────────────────────
const os = require('os');
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// ─── Native Application Menu ──────────────────────────────────────────────────
function setupAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Service Session',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (window.sessionManager) window.sessionManager.promptNewSession();');
          }
        },
        {
          label: 'Save Session Snapshot',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (window.sessionManager) window.sessionManager.saveCurrentSessionSnapshot();');
          }
        },
        {
          label: 'Save Session As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (window.sessionManager) window.sessionManager.promptSaveAs();');
          }
        },
        {
          label: 'Manage Sessions Hub...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (window.sessionManager) window.sessionManager.openSessionManagerModal();');
          }
        },
        { type: 'separator' },
        {
          label: 'Export Session Package (.sflow)',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (window.sessionManager) window.sessionManager.exportSessionToFile();');
          }
        },
        {
          label: 'Import Session Package...',
          click: () => {
            if (mainWindow) mainWindow.webContents.executeJavaScript('if (window.sessionManager) window.sessionManager.triggerFileInput();');
          }
        },
        { type: 'separator' },
        {
          label: 'Open OBS Sanctuary Output',
          click: () => {
            shell.openExternal(`http://localhost:${serverPort}/display.html?target=sanctuary`);
          }
        },
        {
          label: 'Open OBS Lower-Third Output',
          click: () => {
            shell.openExternal(`http://localhost:${serverPort}/display.html?target=livestream`);
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Projector',
      submenu: [
        {
          label: 'Launch Projector Window (Secondary Display)',
          accelerator: 'F5',
          click: () => {
            launchProjectorWindow();
          }
        },
        {
          label: 'Close Projector Window',
          accelerator: 'Shift+F5',
          click: () => {
            closeProjectorWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Blackout / Clear Display',
          accelerator: 'F1',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript('if (typeof window.clearDisplay === "function") window.clearDisplay();');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            if (app.isPackaged) {
              autoUpdater.checkForUpdates().then((result) => {
                if (!result || !result.updateInfo) return;
                const currentVer = app.getVersion();
                if (result.updateInfo.version === currentVer) {
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Ginomia is Up to Date',
                    message: `You are running the latest version of Ginomia (v${currentVer}).`
                  });
                }
              }).catch((err) => {
                dialog.showMessageBox(mainWindow, {
                  type: 'warning',
                  title: 'Update Check',
                  message: 'Could not check for updates.',
                  detail: err ? (err.message || String(err)) : 'Unknown network error.'
                });
              });
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Development Mode',
                message: 'Auto-update is active only in packaged desktop builds.'
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Ginomia Releases',
          click: () => {
            shell.openExternal('https://github.com/EMWORLDLTD/ginomai-pro/releases');
          }
        },
        {
          label: 'About Ginomia',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Ginomia',
              message: 'Ginomia v' + app.getVersion(),
              detail: 'The Word in Motion\n\nNext-Gen Church Presentation, Multi-Monitor Projection & OBS Broadcast System.\nRunning as native desktop application with embedded broadcast server on port ' + serverPort + '.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── IPC Communication Handlers ──────────────────────────────────────────────
ipcMain.handle('desktop:get-displays', () => {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  return displays.map((d) => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    isPrimary: d.id === primaryDisplay.id,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor
  }));
});

ipcMain.handle('desktop:launch-projector', (event, options = {}) => {
  return launchProjectorWindow(options.displayId, options.targetMode || 'sanctuary');
});

ipcMain.handle('desktop:close-projector', () => {
  return closeProjectorWindow();
});

ipcMain.handle('desktop:get-projector-status', () => {
  return {
    isOpen: !!projectorWindow,
    displayBounds: projectorWindow ? projectorWindow.getBounds() : null
  };
});

ipcMain.handle('desktop:launch-stage-monitor', (event, options = {}) => {
  return launchStageWindow(options.displayId, options.targetMode || options.mode || 'stage');
});

ipcMain.handle('desktop:close-stage-monitor', () => {
  return closeStageWindow();
});

ipcMain.handle('desktop:get-stage-status', () => {
  return {
    isOpen: !!stageWindow,
    displayBounds: stageWindow ? stageWindow.getBounds() : null,
    mode: currentStageMode
  };
});

ipcMain.handle('desktop:get-server-info', () => {
  const lanIps = getLanAddresses();
  const primaryLanIp = lanIps[0] || 'localhost';
  return {
    port: serverPort,
    lanIps,
    urls: {
      hostConsole: `http://localhost:${serverPort}`,
      remoteOperator: `http://${primaryLanIp}:${serverPort}/operator.html`,
      sanctuaryDisplay: `http://${primaryLanIp}:${serverPort}/display.html?target=sanctuary`,
      livestreamDisplay: `http://${primaryLanIp}:${serverPort}/display.html?target=livestream`,
      stageDisplay: `http://${primaryLanIp}:${serverPort}/display.html?target=stage`,
      choirDisplay: `http://${primaryLanIp}:${serverPort}/display.html?target=choir`,
      pastorDisplay: `http://${primaryLanIp}:${serverPort}/display.html?target=pastor`
    }
  };
});

ipcMain.handle('desktop:get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion()
}));

ipcMain.handle('desktop:open-external', (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('desktop:toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

// ─── Over-The-Air (OTA) Auto-Updater ──────────────────────────────────────────
function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Ginomia AutoUpdater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Ginomia AutoUpdater] Update available: v' + info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Ginomia AutoUpdater] Up to date (v' + app.getVersion() + ')');
  });

  autoUpdater.on('error', (err) => {
    console.warn('[Ginomia AutoUpdater] Update check error:', err ? (err.message || err) : 'unknown');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:update-download-progress', {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Ginomia AutoUpdater] Update downloaded: v' + info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:update-ready', info);
    }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready — Ginomia',
      message: `Ginomia v${info.version} has been downloaded and is ready to install.`,
      detail: 'Click "Restart Now" to apply the update immediately, or choose "Later" to update when you next exit.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Check for updates shortly after launch (only in packaged production app)
  if (app.isPackaged) {
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
          console.warn('[Ginomia AutoUpdater] Background check failed:', err);
        });
      } catch (e) {
        // ignore
      }
    }, 4000);
  }
}

ipcMain.handle('desktop:check-for-updates', () => {
  if (app.isPackaged) {
    return autoUpdater.checkForUpdates();
  }
  return Promise.resolve({ isDev: true });
});

ipcMain.handle('desktop:install-update', () => {
  autoUpdater.quitAndInstall();
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────
if (gotTheLock) {
  app.whenReady().then(() => {
    // Explicitly allow media capture (microphones, USB audio interfaces) in desktop
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') return callback(true);
        callback(true);
      });
      session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return true;
      });
    }

    startBackgroundServer((port) => {
      createMainWindow(port);
      initAutoUpdater();
    });

    // Listen for display changes (e.g. connecting/disconnecting projector cable)
    screen.on('display-added', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop:displays-updated');
      }
    });

    screen.on('display-removed', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop:displays-updated');
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(serverPort);
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackgroundServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackgroundServer();
});
