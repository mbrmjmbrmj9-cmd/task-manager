const { app, BrowserWindow, shell, dialog } = require('electron');
const https = require('https');

const CURRENT_VERSION = '1.0.0';
const VERSIONS_URL = 'https://task-manager-theta-beryl-91.vercel.app/versions.json';
const HOME_URL = 'https://task-manager-theta-beryl-91.vercel.app/index.html';

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            nativeWindowOpen: true,
            sandbox: false
        }
    });

    mainWindow.setMenuBarVisibility(false);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // ✅ فتح صفحة تسجيل الدخول مباشرة
    mainWindow.loadURL(HOME_URL);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('accounts.google.com')) {
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('did-fail-load', () => {
        setTimeout(() => {
            if (mainWindow) mainWindow.loadURL(HOME_URL);
        }, 3000);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function checkForUpdates() {
    https.get(VERSIONS_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const windowsInfo = json.windows;
                const latestVersion = windowsInfo.version;
                const downloadUrl = windowsInfo.url;
                const notes = json.releaseNotes || 'تحديث جديد';

                if (latestVersion !== CURRENT_VERSION) {
                    const result = dialog.showMessageBoxSync({
                        type: 'info',
                        title: 'تحديث جديد',
                        message: `يوجد تحديث جديد v${latestVersion}`,
                        detail: notes + '\n\nهل تريد التحميل؟',
                        buttons: ['تحميل', 'لاحقًا'],
                        defaultId: 0
                    });
                    
                    if (result === 0) {
                        shell.openExternal(downloadUrl);
                    }
                }
            } catch (e) {}
        });
    }).on('error', () => {});
}

app.whenReady().then(() => {
    createWindow();
    setTimeout(checkForUpdates, 3000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});