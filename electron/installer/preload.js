'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ginomiaInstaller', {
  info: () => ipcRenderer.invoke('setup:info'),
  chooseLocation: () => ipcRenderer.invoke('setup:choose-location'),
  install: options => ipcRenderer.invoke('setup:install', options),
  launch: () => ipcRenderer.invoke('setup:launch'),
  close: () => ipcRenderer.invoke('setup:close'),
  minimize: () => ipcRenderer.invoke('setup:minimize'),
  resizeDetails: expanded => ipcRenderer.invoke('setup:details', Boolean(expanded)),
  onProgress: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  }
});
