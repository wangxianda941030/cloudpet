#!/usr/bin/env sh
set -eu

if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 Docker。请先安装 Docker： https://docs.docker.com/engine/install/ubuntu/"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "未检测到 Docker Compose 插件，请先安装 docker-compose-plugin。"
  exit 1
fi

docker compose up -d --build
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "云崽已启动： http://${IP:-你的服务器IP}:6121"
echo "如果无法访问，请在腾讯云防火墙中放行 TCP 6121 端口。"
