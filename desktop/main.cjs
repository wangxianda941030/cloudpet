/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, screen, net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

let mainWindow;

function resizeWindow(expanded) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const area = display.workArea;
  const width = expanded ? 430 : 230;
  const height = expanded ? Math.min(680, area.height - 36) : 210;
  mainWindow.setResizable(expanded);
  mainWindow.setMinimumSize(expanded ? 390 : 210, expanded ? 500 : 180);
  mainWindow.setBounds({
    width,
    height,
    x: area.x + area.width - width - 18,
    y: area.y + area.height - height - 18,
  }, true);
}

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
function clearSavedTarget() {
  try { fs.unlinkSync(configPath()); }
  catch { /* nothing saved yet */ }
}

function isPrivateHost(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

async function verifyTarget(target) {
  const pageUrl = new URL(target);
  const healthUrl = new URL("/api/metrics", pageUrl);
  const token = pageUrl.searchParams.get("token");
  if (token) healthUrl.searchParams.set("token", token);

  let response;
  try {
    response = await net.fetch(healthUrl.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    if (isPrivateHost(pageUrl.hostname)) {
      throw new Error("这是服务器内网地址，当前电脑访问不到。请改用安装器显示的公网地址，并在腾讯云放行 TCP 6121。");
    }
    throw new Error("连接不到服务器。请检查公网 IP、TCP 6121 防火墙和服务运行状态。");
  }
  if (response.status === 401) throw new Error("访问令牌不正确，请粘贴安装器显示的完整私密地址。");
  if (!response.ok) throw new Error(`服务器返回 ${response.status}，请运行 systemctl status cloudy-agent cloudy-web 检查服务。`);
}

async function openTarget(value) {
  const target = normalizeTarget(value);
  await verifyTarget(target);
  await mainWindow.loadURL(target);
  saveTarget(target.replace(/[?&]widget=1/, ""));
}

function showSetup(message = "", serverUrl = "") {
  resizeWindow(true);
  return mainWindow.loadFile(path.join(__dirname, "setup.html"), {
    query: { error: message, server: serverUrl },
  });
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
  if (target) openTarget(target).catch((error) => {
    clearSavedTarget();
    showSetup(error instanceof Error ? error.message : "连接失败", target);
  });
  else showSetup();
  mainWindow.setAlwaysOnTop(true, "floating");
}

ipcMain.handle("cloudy:connect", async (_event, value) => {
  try { await openTarget(value); return { ok: true }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "无法连接" }; }
});
ipcMain.on("cloudy:minimize", () => mainWindow?.minimize());
ipcMain.on("cloudy:close", () => mainWindow?.close());
ipcMain.on("cloudy:set-expanded", (_event, expanded) => resizeWindow(Boolean(expanded)));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
