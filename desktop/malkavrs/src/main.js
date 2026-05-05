const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, nativeImage, shell } = require('electron');

const DEFAULT_URL = 'https://vrs.malkacomm.com/interpreter-profile.html?desktop=1';
const APP_URL = process.env.MALKA_DESKTOP_URL || DEFAULT_URL;
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png');
const TRUSTED_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    'vrs.malkacomm.com'
]);

let mainWindow = null;
let alertWindow = null;
let dockBounceId = null;
let lastIncomingCall = null;
let alwaysOnTopTimer = null;

function isTrustedUrl(url) {
    try {
        const parsed = new URL(url);
        return TRUSTED_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

function createMainWindow() {
    const icon = nativeImage.createFromPath(ICON_PATH);

    mainWindow = new BrowserWindow({
        backgroundColor: '#0d1326',
        height: 920,
        icon: icon.isEmpty() ? undefined : icon,
        minHeight: 720,
        minWidth: 1040,
        show: false,
        title: 'MalkaVRS',
        width: 1280,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isTrustedUrl(url)) {
            return { action: 'allow' };
        }

        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', event => {
        const targetUrl = event.url;
        if (!isTrustedUrl(targetUrl)) {
            event.preventDefault();
            shell.openExternal(targetUrl);
        }
    });

    mainWindow.loadURL(APP_URL);
}

function stopFlashing() {
    if (alwaysOnTopTimer) {
        clearTimeout(alwaysOnTopTimer);
        alwaysOnTopTimer = null;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.flashFrame(false);
        mainWindow.setAlwaysOnTop(false);
    }

    if (process.platform === 'darwin' && app.dock && dockBounceId !== null) {
        app.dock.cancelBounce(dockBounceId);
        dockBounceId = null;
    }
}

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function createAlertWindow() {
    if (alertWindow && !alertWindow.isDestroyed()) return alertWindow;

    alertWindow = new BrowserWindow({
        alwaysOnTop: true,
        backgroundColor: '#101629',
        frame: false,
        height: 520,
        resizable: false,
        show: false,
        title: 'Incoming MalkaVRS Request',
        width: 720,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'alert-preload.js')
        }
    });

    alertWindow.on('closed', () => {
        alertWindow = null;
    });

    alertWindow.loadFile(path.join(__dirname, 'alert.html'));
    return alertWindow;
}

function showIncomingCallAlert(callData) {
    lastIncomingCall = callData || {};
    focusMainWindow();

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.flashFrame(true);
        mainWindow.setAlwaysOnTop(true, 'floating');
        alwaysOnTopTimer = setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setAlwaysOnTop(false);
            }
        }, 8000);
    }

    if (process.platform === 'darwin' && app.dock) {
        dockBounceId = app.dock.bounce('critical');
    }

    const incomingWindow = createAlertWindow();
    incomingWindow.once('ready-to-show', () => {
        incomingWindow.show();
        incomingWindow.webContents.send('malka:alert-data', lastIncomingCall);
    });

    if (!incomingWindow.webContents.isLoading()) {
        incomingWindow.show();
        incomingWindow.webContents.send('malka:alert-data', lastIncomingCall);
    }
}

function clearIncomingCallAlert() {
    stopFlashing();
    lastIncomingCall = null;

    if (alertWindow && !alertWindow.isDestroyed()) {
        alertWindow.close();
    }
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const icon = nativeImage.createFromPath(ICON_PATH);

    if (process.platform === 'darwin' && app.dock && !icon.isEmpty()) {
        app.dock.setIcon(icon);
    }

    app.on('web-contents-created', (_event, contents) => {
        contents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
            callback(['media', 'display-capture', 'notifications'].includes(permission));
        });
    });

    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('malka:incoming-call', (_event, data) => {
    showIncomingCallAlert(data);
});

ipcMain.on('malka:clear-incoming-call', () => {
    clearIncomingCallAlert();
});

ipcMain.on('malka:alert-open-main', () => {
    clearIncomingCallAlert();
    focusMainWindow();
});

ipcMain.on('malka:alert-dismiss', () => {
    clearIncomingCallAlert();
});
