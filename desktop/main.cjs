/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

let mainWindow;

function normalizeTarget(value) {
  let raw = String(value || "").trim().replace(/\/$/, "");
  if (raw && !/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  if (!raw) throw new Error("请输入服务器地址");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("只支持 http 或 https 地址");
  url.searchParams.set("widget", "1");
  return url.toString();
}

function configPath() { return path.join(app.getPath("userData"), "server.json"); }
function readSavedTarget() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")).serverUrl; }
  catch { return ""; }
}
function saveTarget(serverUrl) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ serverUrl }, null, 2));
}

function openTarget(value) {
  const target = normalizeTarget(value);
  saveTarget(target.replace(/[?&]widget=1/, ""));
  return mainWindow.loadURL(target);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: 430, height: 540,
    x: Math.max(0, width - 455), y: Math.max(0, height - 565),
    minWidth: 390, minHeight: 500,
    frame: false, transparent: true, alwaysOnTop: true, resizable: true, hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  const argumentUrl = process.argv.find((value) => /^https?:\/\//.test(value));
  const target = argumentUrl || process.env.CLOUDY_SERVER_URL || readSavedTarget();
  if (target) openTarget(target).catch(() => mainWindow.loadFile(path.join(__dirname, "setup.html")));
  else mainWindow.loadFile(path.join(__dirname, "setup.html"));
  mainWindow.setAlwaysOnTop(true, "floating");
}

ipcMain.handle("cloudy:connect", async (_event, value) => {
  try { await openTarget(value); return { ok: true }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "无法连接" }; }
});
ipcMain.on("cloudy:close", () => mainWindow?.close());

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
