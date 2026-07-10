#!/usr/bin/env sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then echo "原生服务端仅支持 Linux。"; exit 1; fi
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then exec sudo sh "$0" "$@"; fi
  echo "请使用 root 运行：sudo sh install-native.sh"; exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then echo "原生模式需要 systemd。你仍可使用 Docker 模式：sudo sh install.sh"; exit 1; fi

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INSTALL_DIR=/opt/cloudy
RUNTIME_DIR=$INSTALL_DIR/.runtime/node

install_dependencies() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y python3 curl ca-certificates tar xz-utils procps
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y python3 curl ca-certificates tar xz procps-ng
  elif command -v yum >/dev/null 2>&1; then
    yum install -y python3 curl ca-certificates tar xz procps-ng
  else
    echo "无法识别软件包管理器，请先安装 python3、curl、tar、xz 与 procps。"; exit 1
  fi
}

echo "正在准备云崽原生运行环境（不使用 Docker）…"
install_dependencies

NOLOGIN=$(command -v nologin 2>/dev/null || printf '/sbin/nologin')
id cloudy >/dev/null 2>&1 || useradd --system --home-dir "$INSTALL_DIR" --shell "$NOLOGIN" cloudy
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ] && id "$SUDO_USER" >/dev/null 2>&1; then
  INSTALL_GROUP=$(id -gn "$SUDO_USER")
  usermod -a -G "$INSTALL_GROUP" cloudy
fi
mkdir -p "$INSTALL_DIR"
tar --exclude=.git --exclude=node_modules --exclude=dist --exclude=.next --exclude=.vinext --exclude=.wrangler --exclude=desktop/node_modules -C "$SOURCE_DIR" -cf - . | tar -C "$INSTALL_DIR" -xf -

case "$(uname -m)" in
  x86_64|amd64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) echo "原生模式当前支持 x86_64 与 arm64。"; exit 1 ;;
esac

if [ ! -x "$RUNTIME_DIR/bin/node" ]; then
  SUMS_URL=https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
  SUMS=$(curl -fsSL "$SUMS_URL")
  NODE_FILE=$(printf '%s\n' "$SUMS" | awk -v arch="$NODE_ARCH" '$2 ~ ("linux-" arch "\\.tar\\.xz$") {print $2; exit}')
  NODE_VERSION=$(printf '%s' "$NODE_FILE" | sed -n 's/^node-\(v[^-]*\)-.*/\1/p')
  [ -n "$NODE_FILE" ] && [ -n "$NODE_VERSION" ] || { echo "无法获取 Node.js 22 运行时。"; exit 1; }
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$NODE_FILE" -o "/tmp/$NODE_FILE"
  EXPECTED=$(printf '%s\n' "$SUMS" | awk -v file="$NODE_FILE" '$2 == file {print $1}')
  ACTUAL=$(sha256sum "/tmp/$NODE_FILE" | awk '{print $1}')
  [ "$EXPECTED" = "$ACTUAL" ] || { echo "Node.js 下载校验失败。"; exit 1; }
  rm -rf "$RUNTIME_DIR" && mkdir -p "$RUNTIME_DIR"
  tar -xJf "/tmp/$NODE_FILE" --strip-components=1 -C "$RUNTIME_DIR"
  rm -f "/tmp/$NODE_FILE"
fi

export PATH="$RUNTIME_DIR/bin:$PATH"
cd "$INSTALL_DIR"
npm ci
npm run build
chown -R cloudy:cloudy "$INSTALL_DIR"
APP_VERSION=$(sha256sum package-lock.json app/page.tsx collector/agent.py | sha256sum | awk '{print substr($1,1,12)}')
ACCESS_TOKEN=""
if [ "${CLOUDY_ROTATE_TOKEN:-0}" != "1" ] && [ -f /etc/systemd/system/cloudy-web.service ]; then
  ACCESS_TOKEN=$(sed -n 's/^Environment=CLOUDY_ACCESS_TOKEN=//p' /etc/systemd/system/cloudy-web.service | head -n 1)
fi
[ -n "$ACCESS_TOKEN" ] || ACCESS_TOKEN=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')

cat > /etc/systemd/system/cloudy-agent.service <<'SERVICE'
[Unit]
Description=Cloudy server metrics collector
After=network.target

[Service]
Type=simple
User=cloudy
WorkingDirectory=/opt/cloudy
Environment=CLOUDY_PROC=/proc
Environment=CLOUDY_ROOT=/
Environment=CLOUDY_BIND=127.0.0.1
Environment=PORT=6120
ExecStart=/usr/bin/python3 /opt/cloudy/collector/agent.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/systemd/system/cloudy-web.service <<'SERVICE'
[Unit]
Description=Cloudy desktop pet web service
After=network.target cloudy-agent.service
Requires=cloudy-agent.service

[Service]
Type=simple
User=cloudy
WorkingDirectory=/opt/cloudy
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=6121
Environment=CLOUDY_COLLECTOR_URL=http://127.0.0.1:6120/metrics
Environment=CLOUDY_ACCESS_TOKEN=__CLOUDY_ACCESS_TOKEN__
Environment=CLOUDY_APP_VERSION=__CLOUDY_APP_VERSION__
Environment=PATH=/opt/cloudy/.runtime/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=/opt/cloudy/.runtime/node/bin/npm run start
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE
sed -i "s/__CLOUDY_ACCESS_TOKEN__/$ACCESS_TOKEN/" /etc/systemd/system/cloudy-web.service
sed -i "s/__CLOUDY_APP_VERSION__/$APP_VERSION/" /etc/systemd/system/cloudy-web.service

systemctl daemon-reload
systemctl enable --now cloudy-agent cloudy-web

PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
PUBLIC_IP=$(curl -4 -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)
echo ""
echo "✓ 云崽已通过原生模式启动（无 Docker）"
echo "  桌面端请填写：http://${PUBLIC_IP:-你的服务器公网IP}:6121/?token=$ACCESS_TOKEN"
echo "  仅同一腾讯云内网可用：http://${PRIVATE_IP:-服务器内网IP}:6121/?token=$ACCESS_TOKEN"
echo ""
echo "腾讯云防火墙/安全组只需放行 TCP 6121；采集器 6120 仅监听本机。请勿公开上面的私密访问地址。"
echo "查看状态：systemctl status cloudy-agent cloudy-web"
