/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cloudy", {
  connect: (serverUrl) => ipcRenderer.invoke("cloudy:connect", serverUrl),
  close: () => ipcRenderer.send("cloudy:close"),
});
