# 奶崽安装模式升级路线图

## 目标体验

新用户不再需要理解 Git、Node.js、npm、Docker 或 systemd。服务器安装最终只保留两种入口：

```bash
# 在线安装
curl -fsSLO https://下载地址/install-naizai.sh
sha256sum -c install-naizai.sh.sha256
sudo sh install-naizai.sh

# 离线安装
sudo sh install-naizai.sh ./naizai-server-linux-x64.tar.gz
```

安装完成后只显示三件事：公网连接地址、一次性配对码、腾讯云需要放行的端口。

## 当前问题

1. 国内服务器访问 GitHub 可能出现 TLS 中断或 443 超时。
2. 当前安装会在服务器执行 `npm ci` 和完整构建，耗时长且依赖外网。
3. 更新包依靠手工命名，容易重复上传旧压缩包。
4. 更新失败时没有自动回滚。
5. 用户需要复制包含长 token 的完整地址。
6. 品牌改名后，内部仍有 `cloudy-*` 服务和 `/opt/cloudy` 路径。

## 核心方案

### 1. 发布预构建服务器包

每个版本由 CI 生成固定资产：

```text
naizai-server-v1.0.0-linux-x64.tar.gz
naizai-server-v1.0.0-linux-arm64.tar.gz
SHA256SUMS
latest.json
install-naizai.sh
```

服务器包直接包含：

- vinext standalone 构建产物
- Python 只读采集器
- 对应架构的 Node.js 运行时
- systemd 模板
- 版本与构建信息

服务器不再执行 `npm install` 或前端构建，只负责校验、解压和启动。

第一阶段优先使用“standalone 产物 + 独立 Node 运行时”。Node.js SEA 仍处于 Active development，可作为后续减小文件数量的实验方向，不作为第一版安装器的基础。

### 2. 双下载源与自动回退

下载顺序：

1. 腾讯云 COS 公共只读对象地址（中国大陆默认）
2. GitHub Release asset
3. 用户手工上传的本地安装包

安装器对每个地址设置短连接超时，失败后自动切换，不再让用户判断 GitHub 网络问题。所有来源必须通过同一份 SHA-256 校验。

### 3. 原子更新与回滚

目录调整为：

```text
/opt/naizai/releases/v1.0.0/
/opt/naizai/releases/v1.1.0/
/opt/naizai/current -> releases/v1.1.0
/etc/naizai/config.env
/var/lib/naizai/
```

更新流程：

1. 下载到临时目录
2. 校验 SHA-256
3. 解压到新的版本目录
4. 在随机本地端口执行健康检查
5. 切换 `current` 软链接
6. 重启服务并验证 `/api/metrics`
7. 失败则自动切回上一个版本

保留最近两个版本，避免无限占用磁盘。

### 4. 统一管理命令

安装 `/usr/local/bin/naizai`，提供：

```bash
naizai status
naizai doctor
naizai logs
naizai update
naizai rollback
naizai token rotate
naizai uninstall
```

网页教程只展示这些命令，不再直接要求用户操作 systemd。

### 5. 简化桌面配对

分两阶段完成：

- v1：安装器继续打印完整私密地址，同时额外显示短配对码。
- v2：桌面端只填写公网 IP 和 6 位一次性配对码；配对成功后在本机保存正式 token，配对码立即失效。

不引入中心服务器，配对仍然发生在用户自己的服务器与桌面端之间。

### 6. 安全边界

- 下载包与安装脚本都必须校验 SHA-256。
- 配置文件权限为 `0600`，token 不写进命令历史。
- 采集器继续只监听 `127.0.0.1`。
- 更新时保留当前 token，只有显式执行 `naizai token rotate` 才更换。
- 默认不自动修改腾讯云安全组，只检测端口并给出清晰操作提示。
- 长期公网使用增加可选 HTTPS 模式，不把关闭 TLS 校验作为故障处理方案。

## 旧版迁移策略

检测到以下任一项目时进入兼容迁移：

- `/opt/cloudy`
- `cloudy-agent.service`
- `cloudy-web.service`

迁移器读取并保留旧 token，在 `/opt/naizai` 旁路安装新版。新版健康检查通过后才停止旧服务；失败则继续运行旧版。首个迁移版本保留旧目录，确认稳定后由 `naizai cleanup` 删除。

## 实施顺序

### P0：先解决安装失败

- [ ] 产出 x64/arm64 预构建包
- [ ] 增加 `SHA256SUMS` 与 `latest.json`
- [ ] 实现 COS/GitHub/本地包三路下载
- [ ] 服务器端不再运行 npm
- [ ] 增加 `naizai doctor`

### P1：让更新可恢复

- [ ] releases/current 目录结构
- [ ] 健康检查后切换
- [ ] 自动回滚与保留最近两版
- [ ] 从 `cloudy-*` 无损迁移到 `naizai-*`

### P2：让普通用户看不见运维细节

- [ ] 6 位一次性配对码
- [ ] 桌面端检测公网/内网地址
- [ ] 网页显示更新状态与版本
- [ ] `naizai update` 和桌面端更新提醒

### P3：发布自动化

- [ ] Git tag 触发 GitHub Actions
- [ ] 自动构建两个架构
- [ ] 自动创建 GitHub Release
- [ ] 自动同步到腾讯云 COS
- [ ] 发布前执行安装、升级、回滚、卸载测试

## 验收标准

- 全新 Ubuntu/TencentOS 在 90 秒内完成安装。
- GitHub 不可访问时自动使用 COS，无需用户换命令。
- 安装过程不执行 npm，不需要 Docker。
- 重复执行安装器不会生成重复服务或更换 token。
- 更新失败后 30 秒内恢复旧版。
- 卸载后只保留用户明确选择保留的数据。
- 一条 `naizai doctor` 输出足够定位端口、服务、权限和网络问题。

## 技术依据

- [GitHub Releases 支持发布二进制资产](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub latest release asset 固定链接](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)
- [腾讯云 COS 支持通过 GET Object 下载对象](https://cloud.tencent.com/document/product/436/14115)
- [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)
