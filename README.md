# 奶崽 Naizai

> 把服务器状态，养成一只桌面小宠物。

奶崽是一个面向独立开发者和 Vibe Coding 用户的服务器桌面宠物。它把 Linux 里难读的指标，变成宠物的心情：健康时捧腹大笑，资源紧张时冒汗，服务器掉线时提醒你重新连接。

## 它能看什么

- CPU：使用率、核心数、系统负载与趋势
- 内存：已用/总量、Swap 使用情况
- 磁盘：空间占用与剩余容量
- 网络：实时上传/下载速度、TCP 连接数
- Docker：容器、镜像、端口与运行状态
- 数据库：自动识别 MySQL、MariaDB、PostgreSQL、Redis、MongoDB 容器
- 进程：CPU 占用最高的进程
- 健康结论：把指标翻译成“一切正常 / 需要关注 / 需要处理”

## 服务器地图

- 自动扫描 `/var/www`、`/srv`、`/opt` 与 `/home` 中可读取的项目
- 识别 Next.js、React、Vue、Nuxt、NestJS、Express、Vite、Django、FastAPI、Flask、Laravel、Go、Rust、Java、Ruby 与 Docker Compose
- 展示项目路径、清单文件和最多三层的安全文件树
- 自动识别原生 PostgreSQL、MySQL、MariaDB、Redis、MongoDB 进程及常用端口
- 对项目中的 SQLite 数据库使用只读连接，展示表名、字段类型和主键，不读取任何业务行

资产发现每 60 秒刷新一次。它不会返回文件内容，并自动跳过 `.env`、私钥、证书、Git 历史、依赖目录和构建缓存。MySQL/PostgreSQL 等需要账号的数据库只做服务识别，不会尝试从项目文件中提取密码。

## 3 分钟安装

支持主流 Linux 发行版与 x86_64/arm64，包括 Ubuntu、Debian、CentOS Stream、Rocky Linux、AlmaLinux、Fedora、TencentOS Server 和 openEuler。

```bash
git clone https://github.com/wangxianda941030/cloudpet.git && cd cloudpet && sudo sh install-native.sh
```

原生安装器会下载并校验独立的 Node.js 22 运行时，使用系统 Python 运行只读采集器，并创建两个 systemd 服务。默认情况下 `6120` 与 `6121` 都只监听 `127.0.0.1`，无需在腾讯云防火墙额外开放端口。安装器会打印一条 `naizai://` 配对码；桌面宠物调用系统 SSH 建立本地隧道，不保存服务器密码或私钥。

> 品牌已经升级为“奶崽 Naizai”。为保证已经部署的用户可以无感更新，当前版本继续沿用 `/opt/cloudy`、`cloudy-agent`、`cloudy-web` 等内部标识；后续安装器会提供自动迁移，不需要手工删除旧服务。

下一代安装方式规划见 [安装模式升级路线图](docs/installation-roadmap.md)。目标是把安装缩短为一次下载、一次校验和一条命令，并同时支持 GitHub、腾讯云 COS 镜像与离线安装包。

如果更喜欢容器部署，仍可执行：

```bash
sudo sh install.sh
```

推荐连接：把安装器输出的 `naizai://用户名@公网IP?token=…` 配对码粘贴进桌面版。服务器只需保持原有 SSH 端口可访问，不需要开放 TCP `6121`。

如果确实需要旧版公网直连，可执行 `NAIZAI_WEB_BIND=0.0.0.0 sudo sh install-native.sh`，随后自行在防火墙放行 TCP `6121`；此模式建议再叠加 HTTPS、Tailscale 或 Cloudflare Access。

## 更新与卸载

```bash
# 原生模式更新（在克隆的仓库中执行）
git pull && sudo sh install-native.sh

# 查看状态
systemctl status cloudy-agent cloudy-web

# 卸载服务和应用文件
sudo sh uninstall-native.sh

# 如果当前就在 cloudpet 目录中，同时删除克隆的源码目录
cd .. && rm -rf cloudpet

# 可选：删除安装时创建的专用系统账户
sudo userdel cloudy
```

卸载脚本会停止并删除两个 systemd 服务，并删除 `/opt/cloudy` 下的应用和独立 Node.js 运行时。系统自带或通过包管理器补齐的 Python、curl、tar 等通用工具不会自动删除，以免影响服务器上的其他程序。

## 安全设计

- 采集器只读取 `/proc`、磁盘容量和 Docker 状态，不读取数据库业务数据。
- 默认不需要数据库账号、SSH 密钥或云厂商密钥。
- 原生模式的采集端口和网页端口默认都只监听 `127.0.0.1`，桌面端通过系统 SSH 本地隧道访问。
- 服务器地图只返回项目结构元数据；SQLite 以只读模式打开，其他数据库不自动登录。
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

服务器端启动后，可以使用 `desktop/` 中的 Electron 壳将奶崽固定在 macOS 或 Windows 桌面最上层。具体步骤见 `desktop/README.md`。

推送 `v*` Git 标签后，GitHub Actions 会自动生成 Windows x64 的 `Naizai-Setup.exe`，以及 macOS Apple Silicon/Intel 的 `.dmg` 和 `.zip`，并发布到 GitHub Releases。安装包、任务栏和网页 favicon 均使用奶崽专属像素图标。

## License

MIT © 2026 Naizai contributors
