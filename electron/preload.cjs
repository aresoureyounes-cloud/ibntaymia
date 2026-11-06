// Exposes a tiny, explicit desktop API to the school website.
// The main process re-checks that every call comes from the institution origin.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("idaroomDesktop", {
  isDesktop: true,
  info: () => ipcRenderer.invoke("desktop:info"),
  saveBackup: (payload) => ipcRenderer.invoke("desktop:save-backup", payload),
  openBackups: () => ipcRenderer.invoke("desktop:open-backups"),
  print: () => ipcRenderer.invoke("desktop:print"),
  openWindow: (pagePath) => ipcRenderer.invoke("desktop:new-window", pagePath),
});
