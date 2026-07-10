/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, screen, net } = require("electron");
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

function parseConnection(value, defaultUser = "ubuntu") {
  let raw = String(value || "").trim().replace(/\/$/, "");
  if (/^naizai:\/\//i.test(raw)) {
    const pairing = new URL(raw);
    const host = pairing.hostname;
    const user = decodeURIComponent(pairing.username || "");
    const token = pairing.searchParams.get("token") || "";
    const port = Number(pairing.port || 22);
    if (!host || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("旧版连接地址缺少有效的 SSH 用户名或服务器地址");
    if (!token) throw new Error("旧版连接地址缺少访问令牌");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("旧版连接地址中的 SSH 端口不正确");
    return { type: "ssh", host, user, token, port, saved: raw };
  }
  if (!raw) throw new Error("请输入服务器公网 IP 或域名");
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    url.searchParams.set("widget", "1");
    return { type: "web", target: url.toString(), saved: raw };
  }
  const sshUrl = new URL(/^ssh:\/\//i.test(raw) ? raw : `ssh://${raw}`);
  const host = sshUrl.hostname;
  const user = decodeURIComponent(sshUrl.username || String(defaultUser || "ubuntu").trim());
  const port = Number(sshUrl.port || 22);
  if (!host || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new Error("请填写有效的 SSH 用户名和服务器地址");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH 端口不正确");
  return { type: "ssh", host, user, token: "", port, saved: raw };
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

function configPath() { return path.join(app.getPath("userData"), "connection.json"); }
function legacyConfigPath() { return path.join(app.getPath("userData"), "server.json"); }
function readSavedConnection() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); }
  catch {
    try { return { serverUrl: JSON.parse(fs.readFileSync(legacyConfigPath(), "utf8")).serverUrl || "", identityFile: "", username: "ubuntu" }; }
    catch { return { serverUrl: "", identityFile: "", username: "ubuntu" }; }
  }
}
function saveConnection(serverUrl, identityFile = "", username = "ubuntu") {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ serverUrl, identityFile, username }, null, 2));
  try { fs.unlinkSync(legacyConfigPath()); }
  catch { /* no legacy config */ }
}
function clearSavedConnection() {
  try { fs.unlinkSync(configPath()); }
  catch { /* nothing saved yet */ }
  try { fs.unlinkSync(legacyConfigPath()); }
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
    throw new Error("连接不到服务器，请确认服务器地址、SSH 私钥和服务状态。");
  }
  if (response.status === 401) throw new Error("访问令牌不正确，请粘贴安装器显示的完整私密地址。");
  if (!response.ok) throw new Error(`服务器返回 ${response.status}，请运行 systemctl status cloudy-agent cloudy-web 检查服务。`);
}

function prepareIdentityFile(identityFile) {
  const resolved = String(identityFile || "").trim();
  if (!resolved) return "";
  let stats;
  try { stats = fs.statSync(resolved); }
  catch { throw new Error("找不到 SSH 私钥文件，请重新选择腾讯云下载的密钥。"); }
  if (!stats.isFile()) throw new Error("所选 SSH 私钥不是有效文件，请重新选择。");
  if (process.platform !== "win32") {
    try { fs.chmodSync(resolved, 0o600); }
    catch { throw new Error("无法保护私钥文件权限，请把密钥移动到自己的用户目录后重试。"); }
  }
  return resolved;
}

async function openSshTarget(connection, identityFile) {
  stopTunnel();
  const knownHostsFile = path.join(app.getPath("userData"), "known_hosts");
  fs.mkdirSync(path.dirname(knownHostsFile), { recursive: true });
  const selectedIdentity = prepareIdentityFile(identityFile);
  const destination = `${connection.user}@${connection.host}`;
  const authOptions = [
    "-T", "-o", "BatchMode=yes",
    "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${knownHostsFile}`,
    ...(selectedIdentity ? ["-o", "IdentitiesOnly=yes", "-i", selectedIdentity] : []),
    "-p", String(connection.port),
  ];
  let token = connection.token;
  if (!token) {
    token = await new Promise((resolve, reject) => {
      const command = "if [ -r /etc/naizai-token ]; then head -n 1 /etc/naizai-token; else sed -n 's/^Environment=CLOUDY_ACCESS_TOKEN=//p' /etc/systemd/system/cloudy-web.service | head -n 1; fi";
      const reader = spawn("ssh", [...authOptions, destination, command], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let stdout = "";
      let stderr = "";
      reader.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-1000); });
      reader.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-1200); });
      reader.once("error", (error) => reject(new Error(`无法启动系统 SSH：${error.message}`)));
      reader.once("close", (code) => {
        const value = stdout.trim().split("\n")[0] || "";
        if (code === 0 && value) resolve(value);
        else if (/permission denied|no supported authentication methods/i.test(stderr)) reject(new Error("SSH 私钥未被服务器接受，请确认密钥已绑定到这台实例。"));
        else reject(new Error("已登录服务器，但没有找到奶崽服务令牌。请重新运行服务器安装命令。"));
      });
    });
  }
  const localPort = await freeLocalPort();
  const target = `http://127.0.0.1:${localPort}/?token=${encodeURIComponent(token)}&widget=1`;
  const args = [
    "-N", "-o", "ExitOnForwardFailure=yes",
    ...authOptions,
    "-L", `127.0.0.1:${localPort}:127.0.0.1:6121`,
    destination,
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
  if (/permission denied|no supported authentication methods/i.test(detail)) {
    throw new Error(selectedIdentity ? "SSH 私钥未被服务器接受，请确认它已绑定到当前实例的 ubuntu 用户。" : "请选择腾讯云已绑定到服务器的 SSH 私钥。");
  }
  if (/host key verification failed|remote host identification has changed/i.test(detail)) {
    throw new Error("服务器身份与奶崽首次记录的不一致。请确认服务器没有被重装或更换后再重新配对。");
  }
  throw new Error(detail ? `SSH 连接失败：${detail}` : "SSH 连接失败，请检查服务器地址、用户名和私钥。");
}

async function openTarget(value, identityFile = "", username = "ubuntu") {
  const connection = parseConnection(value, username);
  if (connection.type === "ssh") await openSshTarget(connection, identityFile);
  else {
    stopTunnel();
    await verifyTarget(connection.target);
    await mainWindow.loadURL(connection.target);
  }
  saveConnection(connection.saved, identityFile, connection.user || username);
}

function showSetup(message = "", serverUrl = "", identityFile = "", username = "ubuntu") {
  resizeWindow(true);
  return mainWindow.loadFile(path.join(__dirname, "setup.html"), {
    query: { error: message, server: serverUrl, identity: identityFile, username },
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

  const saved = readSavedConnection();
  const argumentTarget = process.argv.find((value) => /^(https?|ssh|naizai):\/\//.test(value));
  const target = argumentTarget || process.env.NAIZAI_SERVER_URL || process.env.CLOUDY_SERVER_URL || saved.serverUrl;
  const identityFile = process.env.NAIZAI_IDENTITY_FILE || saved.identityFile;
  const username = process.env.NAIZAI_SSH_USER || saved.username || "ubuntu";
  if (target) openTarget(target, identityFile, username).catch((error) => {
    clearSavedConnection();
    showSetup(error instanceof Error ? error.message : "连接失败", target, identityFile, username);
  });
  else showSetup();
  mainWindow.setAlwaysOnTop(true, "floating");
}

ipcMain.handle("cloudy:choose-key", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择腾讯云 SSH 私钥",
    properties: ["openFile"],
    filters: [{ name: "SSH 私钥", extensions: ["pem", "key", "txt"] }, { name: "所有文件", extensions: ["*"] }],
  });
  return result.canceled ? "" : result.filePaths[0] || "";
});
ipcMain.handle("cloudy:connect", async (_event, value, identityFile, username) => {
  try { await openTarget(value, identityFile, username); return { ok: true }; }
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
