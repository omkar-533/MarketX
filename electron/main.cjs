/**
 * Wolf Trade AI — desktop shell (Electron)
 * Loads the live site (or local Vite in TRADEX_DEV=1).
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const APP_URL = process.env.TRADEX_APP_URL || 'https://wolftradeai.in';
const isDev = process.env.TRADEX_DEV === '1';

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Wolf Trade AI',
    backgroundColor: '#0a0e17',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const startUrl = isDev ? 'http://localhost:5173' : APP_URL;
  void win.loadURL(startUrl);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
