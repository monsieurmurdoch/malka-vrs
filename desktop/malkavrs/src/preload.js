const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('MalkaDesktop', {
    clearIncomingCall: () => ipcRenderer.send('malka:clear-incoming-call'),
    incomingCall: data => ipcRenderer.send('malka:incoming-call', data || {}),
    isDesktop: true
});
