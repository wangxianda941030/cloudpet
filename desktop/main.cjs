/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, screen } = require("electron");

function normalizeTarget(value) {
  const raw = value || "http://localhost:3000";
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported protocol");
    url.searchParams.set("widget", "1");
    return url.toString();
  } catch {
    return "http://localhost:3000/?widget=1";
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: 430,
    height: 540,
    x: Math.max(0, width - 455),
    y: Math.max(0, height - 565),
    minWidth: 390,
    minHeight: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true, sandbox: true }
  });

  const argumentUrl = process.argv.find((value) => /^https?:\/\//.test(value));
  win.loadURL(normalizeTarget(argumentUrl || process.env.CLOUDY_SERVER_URL));
  win.setAlwaysOnTop(true, "floating");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
