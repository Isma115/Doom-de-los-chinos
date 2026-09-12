const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('systemMetrics', {
    get: () => ipcRenderer.invoke('system-metrics:get')
});
