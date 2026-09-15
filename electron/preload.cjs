const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('systemMetrics', {
    get: () => ipcRenderer.invoke('system-metrics:get')
});

contextBridge.exposeInMainWorld('doom3dDesktop', {
    isElectron: true,
    openMap: (mode) => ipcRenderer.invoke('editor:open-map', mode),
    saveMap: (payload) => ipcRenderer.invoke('editor:save-map', payload),
    readBundledMap: (mapId) => ipcRenderer.invoke('editor:read-bundled-map', mapId),
});
