const { contextBridge, ipcRenderer } = require('electron');

// Expose protected desktop API to the renderer process
contextBridge.exposeInMainWorld('desktopApi', {
  isDesktop: true,
  platform: process.platform,

  // Canonical packaged application metadata
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),

  // Display & Projector Control
  getDisplays: () => ipcRenderer.invoke('desktop:get-displays'),
  launchProjector: (options) => ipcRenderer.invoke('desktop:launch-projector', options),
  closeProjector: () => ipcRenderer.invoke('desktop:close-projector'),
  getProjectorStatus: () => ipcRenderer.invoke('desktop:get-projector-status'),

  // Stage Confidence Monitor Control (Choir / Pastors)
  launchStageMonitor: (options) => ipcRenderer.invoke('desktop:launch-stage-monitor', options),
  closeStageMonitor: () => ipcRenderer.invoke('desktop:close-stage-monitor'),
  getStageStatus: () => ipcRenderer.invoke('desktop:get-stage-status'),

  // Server & Broadcast Info
  getServerInfo: () => ipcRenderer.invoke('desktop:get-server-info'),

  // System & Window Controls
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  minimize: () => ipcRenderer.invoke('desktop:minimize'),
  maximize: () => ipcRenderer.invoke('desktop:maximize'),
  close: () => ipcRenderer.invoke('desktop:close'),

  // Event Listeners from Main Process
  onProjectorStatusChange: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('desktop:projector-status-changed', handler);
    return () => ipcRenderer.removeListener('desktop:projector-status-changed', handler);
  },
  onStageStatusChange: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('desktop:stage-status-changed', handler);
    return () => ipcRenderer.removeListener('desktop:stage-status-changed', handler);
  },
  onDisplaysUpdated: (callback) => {
    const handler = (event, displays) => callback(displays);
    ipcRenderer.on('desktop:displays-updated', handler);
    return () => ipcRenderer.removeListener('desktop:displays-updated', handler);
  },

  // Over-The-Air (OTA) Updates
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('desktop:update-available', handler);
    return () => ipcRenderer.removeListener('desktop:update-available', handler);
  },
  onUpdateReady: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('desktop:update-ready', handler);
    return () => ipcRenderer.removeListener('desktop:update-ready', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('desktop:update-download-progress', handler);
    return () => ipcRenderer.removeListener('desktop:update-download-progress', handler);
  }
});
