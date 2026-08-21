const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meshora', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  onMaximized: (cb) => {
    const listener = (_evt, value) => cb(value);
    ipcRenderer.on('win:maximized', listener);
    return () => ipcRenderer.removeListener('win:maximized', listener);
  },
  onMenu: (channel, cb) => {
    const listener = () => cb();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  saveFile: (defaultName, ext) => ipcRenderer.invoke('dialog:saveFile', defaultName, ext),
  saveDir: () => ipcRenderer.invoke('dialog:saveDir'),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  writeFiles: (dir, files) => ipcRenderer.invoke('fs:writeFiles', dir, files),
  appInfo: () => ipcRenderer.invoke('app:info')
});
