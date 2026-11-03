const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const APP_URL = process.env.IDAROOM_URL || require("./deployment.json").url || "";
function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 360, minHeight: 600,
    backgroundColor: "#0f1a14",
    icon: path.join(__dirname, "..", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(APP_URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const t = new URL(url), s = new URL(APP_URL);
      if (t.origin !== s.origin) { shell.openExternal(url); return { action: "deny" }; }
    } catch {}
    return { action: "allow" };
  });
  Menu.setApplicationMenu(null);
}
app.whenReady().then(() => {
  try {
    const configured = new URL(APP_URL);
    if (!["https:", "http:"].includes(configured.protocol)) throw new Error("Invalid protocol");
    app.setPath("userData", path.join(app.getPath("appData"), "IDAROOM", configured.hostname));
  } catch {
    require("electron").dialog.showErrorBox("عنوان المؤسسة غير مضبوط", "اضبط عنوان المؤسسة في deployment.json أو IDAROOM_URL قبل التشغيل.");
    app.quit();
    return;
  }
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
