# 奶崽 Naizai 桌面壳

这是奶崽的透明、无边框、始终置顶桌面窗口，支持 macOS 与 Windows。平时只显示宠物，点击奶崽后窗口会展开，可切换状态、服务器地图和接入说明；收起面板后自动恢复为小型透明宠物窗口。

```bash
cd desktop
npm install

# 本地开发（直接连接本机网页）
npm start

# 也可以在启动时传入服务器地址
npm start -- 'ssh://ubuntu@你的服务器公网IP'
```

直接执行 `npm start` 时，首次启动会显示配对页：

1. 在腾讯云控制台创建 SSH 密钥，下载私钥文件，并把该密钥绑定到服务器实例。
2. 在奶崽中选择下载的私钥文件。
3. 填写服务器公网 IP 和 SSH 用户名并连接。奶崽会自动读取服务令牌，不需要配对码。

奶崽会调用系统自带的 `ssh` 建立私密通道。应用只在本机配置中保存私钥文件路径，不复制、不显示、也不上传私钥内容；服务器密码不会被保存。

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
