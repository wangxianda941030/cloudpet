/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, screen, net } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const socketNet = require("node:net");
const path = require("node:path");

let mainWindow;
let tunnelProcess;

app.setName("奶崽 Naizai");

function resizeWindow(expanded) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const area = display.workArea;
  const width = expanded ? 430 : 230;
  const height = expanded ? Math.min(680, area.height - 36) : 210;
  mainWindow.setResizable(expanded);
  if (typeof mainWindow.setHasShadow === "function") mainWindow.setHasShadow(expanded);
  mainWindow.setMinimumSize(expanded ? 390 : 210, expanded ? 500 : 180);
  mainWindow.setBounds({
    width,
    height,
    x: area.x + area.width - width - 18,
    y: area.y + area.height - height - 18,
  }, true);
}

function parseConnection(value) {
  let raw = String(value || "").trim().replace(/\/$/, "");
  if (/^naizai:\/\//i.test(raw)) {
    const pairing = new URL(raw);
    const host = pairing.hostname;
    const user = decodeURIComponent(pairing.username || "");
    const token = pairing.searchParams.get("token") || "";
    const port = Number(pairing.port || 22);
    if (!host || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("配对码缺少有效的 SSH 用户名或服务器地址");
    if (!token) throw new Error("配对码缺少访问令牌，请复制安装器输出的完整一行");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("配对码中的 SSH 端口不正确");
    return { type: "ssh", host, user, token, port, saved: raw };
  }
  if (raw && !/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  if (!raw) throw new Error("请输入服务器地址");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("只支持奶崽配对码、http 或 https 地址");
  url.searchParams.set("widget", "1");
  return { type: "web", target: url.toString(), saved: raw };
}

function stopTunnel() {
  if (tunnelProcess && tunnelProcess.exitCode === null) tunnelProcess.kill();
  tunnelProcess = undefined;
}

function freeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = socketNet.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
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

async function verifyTarget(target, timeoutMs = 8000) {
  const pageUrl = new URL(target);
  const healthUrl = new URL("/api/metrics", pageUrl);
  const token = pageUrl.searchParams.get("token");
  if (token) healthUrl.searchParams.set("token", token);

  let response;
  try {
    response = await net.fetch(healthUrl.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    if (isPrivateHost(pageUrl.hostname)) throw new Error("连接不到本地奶崽通道，请检查 SSH 隧道是否仍在运行。");
    throw new Error("连接不到服务器。推荐改用安装器显示的 naizai:// 配对码，无需开放 6121 防火墙。");
  }
  if (response.status === 401) throw new Error("访问令牌不正确，请粘贴安装器显示的完整私密地址。");
  if (!response.ok) throw new Error(`服务器返回 ${response.status}，请运行 systemctl status cloudy-agent cloudy-web 检查服务。`);
}

async function openSshTarget(connection) {
  stopTunnel();
  const localPort = await freeLocalPort();
  const target = `http://127.0.0.1:${localPort}/?token=${encodeURIComponent(connection.token)}&widget=1`;
  const args = [
    "-N", "-T", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=yes",
    "-L", `127.0.0.1:${localPort}:127.0.0.1:6121`,
    "-p", String(connection.port), `${connection.user}@${connection.host}`,
  ];
  const child = spawn("ssh", args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  tunnelProcess = child;
  let stderr = "";
  let spawnError = "";
  child.on("error", (error) => { spawnError = error.message; });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-1200); });

  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (spawnError || child.exitCode !== null) break;
    try {
      await verifyTarget(target, 700);
      await mainWindow.loadURL(target);
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 320)); }
  }
  stopTunnel();
  const detail = spawnError || stderr.trim().split("\n").slice(-1)[0];
  throw new Error(detail ? `SSH 连接失败：${detail}` : "SSH 连接失败。请先在系统终端确认可以用密钥登录这台服务器。");
}

async function openTarget(value) {
  const connection = parseConnection(value);
  if (connection.type === "ssh") await openSshTarget(connection);
  else {
    stopTunnel();
    await verifyTarget(connection.target);
    await mainWindow.loadURL(connection.target);
  }
  saveTarget(connection.saved);
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
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  const argumentUrl = process.argv.find((value) => /^(https?|naizai):\/\//.test(value));
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
ipcMain.on("cloudy:close", () => mainWindow?.close());
ipcMain.on("cloudy:set-expanded", (_event, expanded) => resizeWindow(Boolean(expanded)));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", stopTunnel);
