const { contextBridge, ipcRenderer } = require('electron');
// Expose operations, never ipcRenderer or a general channel/path API. The main
// process validates the sender, payload and native-dialog path grants.
contextBridge.exposeInMainWorld('solidflow', Object.freeze({
  openDocument: () => ipcRenderer.invoke('document:open'),
  importStep: () => ipcRenderer.invoke('document:import-step'),
  saveDocument: (content, name, filePath) => ipcRenderer.invoke('document:save', { content, name, filePath }),
  exportDocument: (data, name, format) => ipcRenderer.invoke('document:export', { data, name, format })
}));
