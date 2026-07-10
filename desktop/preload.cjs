/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cloudy", {
  connect: (serverUrl) => ipcRenderer.invoke("cloudy:connect", serverUrl),
  minimize: () => ipcRenderer.send("cloudy:minimize"),
  close: () => ipcRenderer.send("cloudy:close"),
});

window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const label = button?.getAttribute("aria-label");
    if (label === "关闭面板" || label === "关闭云崽") {
      event.preventDefault(); event.stopImmediatePropagation(); ipcRenderer.send("cloudy:close");
    } else if (label === "收起" || label === "最小化云崽") {
      event.preventDefault(); event.stopImmediatePropagation(); ipcRenderer.send("cloudy:minimize");
    }
  }, true);
});
