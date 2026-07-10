/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cloudy", {
  connect: (serverUrl) => ipcRenderer.invoke("cloudy:connect", serverUrl),
  setExpanded: (expanded) => ipcRenderer.send("cloudy:set-expanded", Boolean(expanded)),
  close: () => ipcRenderer.send("cloudy:close"),
});

window.addEventListener("DOMContentLoaded", () => {
  const compactStyle = document.createElement("style");
  compactStyle.textContent = `
    .widget-mode .pet-widget:not(.expanded){width:100%!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important}
    .widget-mode .pet-widget:not(.expanded) .widget-bar,.widget-mode .pet-widget:not(.expanded) .speech,.widget-mode .pet-widget:not(.expanded) .quick-stats,.widget-mode .pet-widget:not(.expanded) .widget-buttons,.widget-mode .pet-widget:not(.expanded) .widget-footer{display:none!important}
    .widget-mode .pet-widget:not(.expanded) .pet-stage{height:100vh!important;min-height:0!important;padding:0!important;display:grid!important;place-items:center!important;-webkit-app-region:drag}
    .widget-mode .pet-widget:not(.expanded) .pet{margin:0!important;-webkit-app-region:no-drag}
    .widget-mode .pet:focus{outline:none!important}
  `;
  document.head.appendChild(compactStyle);

  const syncExpanded = () => {
    const widget = document.querySelector(".widget-mode .pet-widget");
    if (widget) ipcRenderer.send("cloudy:set-expanded", widget.classList.contains("expanded"));
  };
  const observer = new MutationObserver(syncExpanded);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  syncExpanded();

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const label = button?.getAttribute("aria-label");
    if (label === "关闭面板" || label === "关闭云崽") {
      event.preventDefault(); event.stopImmediatePropagation(); ipcRenderer.send("cloudy:close");
    } else if (label === "收起" || label === "最小化云崽") {
      event.preventDefault(); event.stopImmediatePropagation();
      const activePanelButton = Array.from(document.querySelectorAll(".widget-buttons button")).find((item) => item.textContent?.trim() === "收起");
      if (activePanelButton instanceof HTMLElement) activePanelButton.click();
      else ipcRenderer.send("cloudy:set-expanded", false);
    }
  }, true);
});
