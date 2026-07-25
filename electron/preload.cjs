/** Minimal preload — no Node exposure to web app */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('tradexDesktop', {
  platform: process.platform,
  version: '1.0.0',
});
