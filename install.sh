#!/usr/bin/env sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "奶崽服务器端需要 Linux。macOS/Windows 请只安装 desktop 桌面宠物。"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo sh "$0" "$@"
  fi
  echo "请使用 root 运行：sudo sh install.sh"
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

OS_NAME="Linux"
OS_ID="linux"
if [ -r /etc/os-release ]; then
  OS_NAME=$(sed -n 's/^PRETTY_NAME="\{0,1\}\([^"].*\)"\{0,1\}$/\1/p' /etc/os-release | head -n 1)
  OS_ID=$(sed -n 's/^ID="\{0,1\}\([^"].*\)"\{0,1\}$/\1/p' /etc/os-release | head -n 1)
fi

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64|aarch64|arm64) ;;
  *) echo "暂不支持的 CPU 架构：$ARCH（当前支持 x86_64 与 arm64）"; exit 1 ;;
esac

echo "检测到：${OS_NAME:-Linux} / $ARCH"

install_curl() {
  if command -v curl >/dev/null 2>&1; then return; fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y curl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl ca-certificates
  else
    echo "请先安装 curl 后重新执行。"; exit 1
  fi
}

install_docker_fallback() {
  echo "正在使用 ${OS_ID:-当前系统} 的软件源安装 Docker…"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y docker.io docker-compose-v2 || apt-get install -y docker.io docker-compose-plugin
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y docker docker-compose-plugin || dnf install -y moby-engine docker-compose-plugin
  elif command -v yum >/dev/null 2>&1; then
    yum install -y docker docker-compose-plugin || yum install -y docker docker-compose
  else
    return 1
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  install_curl
  echo "未检测到 Docker，正在安装…"
  curl -fsSL https://get.docker.com -o /tmp/cloudy-get-docker.sh
  if ! sh /tmp/cloudy-get-docker.sh; then install_docker_fallback; fi
  rm -f /tmp/cloudy-get-docker.sh
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now docker >/dev/null 2>&1 || true
elif command -v service >/dev/null 2>&1; then
  service docker start >/dev/null 2>&1 || true
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker 已安装但尚未启动，请启动 Docker 后重新执行。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "缺少 Docker Compose 插件，请参考：https://docs.docker.com/compose/install/linux/"
  exit 1
fi

echo "正在启动奶崽…"
docker compose up -d --build

PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
PUBLIC_IP=""
if command -v curl >/dev/null 2>&1; then PUBLIC_IP=$(curl -4 -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true); fi

echo ""
echo "✓ 奶崽已经住进你的服务器"
echo "  公网访问：http://${PUBLIC_IP:-你的服务器公网IP}:6121"
echo "  内网访问：http://${PRIVATE_IP:-服务器内网IP}:6121"
echo ""
echo "如果公网无法访问，请在腾讯云控制台的防火墙/安全组中放行 TCP 6121。"
echo "桌面宠物首次启动时，只需填写：${PUBLIC_IP:-你的服务器公网IP}:6121"
