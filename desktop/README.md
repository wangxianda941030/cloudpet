# 奶崽 Naizai 桌面壳

这是奶崽的透明、无边框、始终置顶桌面窗口，支持 macOS 与 Windows。平时只显示宠物，点击奶崽后窗口会展开，可切换状态、服务器地图和接入说明；收起面板后自动恢复为小型透明宠物窗口。

```bash
cd desktop
npm install

# 本地开发（直接连接本机网页）
npm start

# 连接部署在服务器上的奶崽
npm start -- 'http://你的服务器公网IP:6121/?token=你的访问令牌'
```

直接执行 `npm start` 时，首次启动会显示服务器地址输入框；填一次后会保存在本机应用数据目录。桌面壳不保存服务器密码，只保存奶崽网页地址。正式安装包可以在后续加入 Electron Forge 或 electron-builder 生成。
