# 云崽桌面壳

这是云崽的透明、无边框、始终置顶桌面窗口，支持 macOS 与 Windows。

```bash
cd desktop
npm install

# 本地开发
npm start

# 连接部署在服务器上的云崽
npm start -- http://你的服务器公网IP:6121
```

桌面壳不保存服务器密码，只加载服务器上已经运行的云崽页面。正式安装包可以在后续加入 Electron Forge 或 electron-builder 生成。
