#!/usr/bin/env sh
set -eu
if [ "$(id -u)" -ne 0 ]; then exec sudo sh "$0" "$@"; fi
systemctl disable --now cloudy-web cloudy-agent 2>/dev/null || true
rm -f /etc/systemd/system/cloudy-web.service /etc/systemd/system/cloudy-agent.service /etc/naizai-token
systemctl daemon-reload
rm -rf /opt/cloudy
echo "奶崽原生服务已卸载。"
echo "如需彻底清理，可继续执行：sudo userdel cloudy"
