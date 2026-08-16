const { app, BrowserWindow, shell, dialog } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');

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
    // ✅ حفظ آخر مرة ظهر فيها التنبيه
    const dataPath = path.join(app.getPath('userData'), 'last_check.json');
    
    try {
        if (fs.existsSync(dataPath)) {
            const lastCheck = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const now = Date.now();
            
            // فحص مرة واحدة كل 24 ساعة
            if (now - lastCheck.timestamp < 24 * 60 * 60 * 1000) {
                return;
            }
        }
    } catch (e) {}

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

                // ✅ إذا نفس الإصدار - لا نافذة
                if (latestVersion === CURRENT_VERSION) {
                    return;
                }

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
                
                // ✅ حفظ وقت الفحص
                try {
                    fs.writeFileSync(dataPath, JSON.stringify({ timestamp: Date.now() }));
                } catch (e) {}
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