# 奶崽 Naizai 桌面壳

这是奶崽的透明、无边框、始终置顶桌面窗口，支持 macOS 与 Windows。平时只显示宠物，点击奶崽后窗口会展开，可切换状态、服务器地图和接入说明；收起面板后自动恢复为小型透明宠物窗口。

```bash
cd desktop
npm install

# 本地开发（直接连接本机网页）
npm start

# 推荐：使用安装器输出的配对码，通过系统 SSH 隧道连接
npm start -- 'naizai://ubuntu@你的服务器公网IP?token=你的访问令牌'

# 兼容旧版公网直连
npm start -- 'http://你的服务器公网IP:6121/?token=你的访问令牌'
```

直接执行 `npm start` 时，首次启动会显示配对码输入框；填一次后会保存在本机应用数据目录。桌面壳调用系统自带的 `ssh` 建立仅绑定 `127.0.0.1` 的临时隧道，不保存服务器密码或私钥，也不需要开放 TCP 6121。当前自动模式只支持已配置好的 SSH 密钥或系统 ssh-agent，不在应用内接收密码。

## 生成安装包

桌面端使用 Electron Forge 打包。图标源文件与 Windows/macOS 格式位于 `assets/`。

```bash
npm ci

# 当前系统安装包
npm run make

# Windows x64（应在 Windows 构建）
npm run make:windows

# macOS 当前架构
npm run make:mac
```

产物位于 `desktop/out/make/`。推送 `v*` 标签后，GitHub Actions 会分别构建 Windows x64、macOS arm64 和 macOS x64，并上传到 GitHub Releases。当前配置生成未签名测试包；公开推广前建议再配置 Windows 代码签名和 Apple 公证凭据。
