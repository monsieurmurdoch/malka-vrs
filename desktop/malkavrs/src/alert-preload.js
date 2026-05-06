const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('MalkaAlert', {
    dismiss: () => ipcRenderer.send('malka:alert-dismiss'),
    onIncomingCall: callback => {
        ipcRenderer.on('malka:alert-data', (_event, data) => callback(data));
    },
    openMainWindow: () => ipcRenderer.send('malka:alert-open-main')
});
