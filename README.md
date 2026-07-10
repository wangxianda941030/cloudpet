# 云崽 Cloudy

> 把服务器状态，养成一只桌面小宠物。

云崽是一个面向独立开发者和 Vibe Coding 用户的服务器桌面宠物。它把 Linux 里难读的指标，变成宠物的心情：健康时开心晃动，资源紧张时冒汗，服务器掉线时提醒你重新连接。

## 它能看什么

- CPU：使用率、核心数、系统负载与趋势
- 内存：已用/总量、Swap 使用情况
- 磁盘：空间占用与剩余容量
- 网络：实时上传/下载速度、TCP 连接数
- Docker：容器、镜像、端口与运行状态
- 数据库：自动识别 MySQL、MariaDB、PostgreSQL、Redis、MongoDB 容器
- 进程：CPU 占用最高的进程
- 健康结论：把指标翻译成“一切正常 / 需要关注 / 需要处理”

## 3 分钟安装

支持主流 Linux 发行版与 x86_64/arm64，包括 Ubuntu、Debian、CentOS Stream、Rocky Linux、AlmaLinux、Fedora、TencentOS Server 和 openEuler。

```bash
git clone https://github.com/wangxianda941030/cloudpet.git && cd cloudpet && sudo sh install-native.sh
```

原生安装器会下载并校验独立的 Node.js 22 运行时，使用系统 Python 运行只读采集器，并创建两个 systemd 服务。公网只需放行 TCP `6121`，采集器端口 `6120` 仅监听 `127.0.0.1`。安装器会自动生成访问令牌并打印完整私密地址，将整条地址粘贴到桌面宠物即可。

如果更喜欢容器部署，仍可执行：

```bash
sudo sh install.sh
```

浏览器访问：使用安装器输出的完整地址，例如 `http://你的服务器公网IP:6121/?token=自动生成的令牌`。

腾讯云轻量应用服务器需要在控制台的「防火墙」中放行 TCP `6121` 端口。访问令牌会挡住未授权请求；需要更高安全等级时，可以再叠加 Tailscale、Cloudflare Access 或 HTTPS 反向代理。

## 更新与卸载

```bash
# 原生模式更新（在克隆的仓库中执行）
git pull && sudo sh install-native.sh

# 查看状态
systemctl status cloudy-agent cloudy-web

# 卸载
sudo sh uninstall-native.sh
```

## 安全设计

- 采集器只读取 `/proc`、磁盘容量和 Docker 状态，不读取数据库业务数据。
- 默认不需要数据库账号、SSH 密钥或云厂商密钥。
- 原生模式的采集端口只监听 `127.0.0.1`，网页接口使用随机访问令牌。
- Docker Socket 以只读方式挂载；尽管如此，它仍是高权限接口，请勿运行来源不明的分支或镜像。
- 请不要公开或截图分享安装器输出的私密访问地址。

## 项目结构

```text
app/                可视化仪表盘
collector/          零第三方 Python 依赖的 Linux 采集器
install-native.sh   无 Docker 的 systemd 安装器
desktop/            macOS / Windows 桌面宠物壳
docker-compose.yml  一键部署编排
nginx.conf          同源网关，避免暴露采集端口
```

## 本地开发

```bash
npm install
npm run dev
```

没有连接采集器时，页面会自动显示演示数据，便于开发界面。完整联调使用 `docker compose up --build`。

## 路线图

- [ ] 温度、GPU 与磁盘 I/O
- [ ] 历史指标存储和 24 小时趋势
- [ ] 告警通知（飞书、企业微信、邮件）
- [ ] 登录与双因素认证
- [ ] 多服务器总览
- [ ] 可选的 MySQL/PostgreSQL 深度指标

欢迎提交 Issue 和 Pull Request。这个项目尤其欢迎第一次参与开源的朋友。

## 桌面宠物

服务器端启动后，可以使用 `desktop/` 中的 Electron 壳将云崽固定在 macOS 或 Windows 桌面最上层。具体步骤见 `desktop/README.md`。

## License

MIT © 2026 Cloudy contributors
