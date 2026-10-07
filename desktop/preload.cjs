const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recleaner", {
  isDesktop: true,
  host: () => ipcRenderer.invoke("host"),
  run: (actionId, params) => ipcRenderer.invoke("run", actionId, params ?? {}),
  applySettings: (settings) => ipcRenderer.invoke("settings", settings),
  notify: (title, body) => ipcRenderer.invoke("notify", String(title ?? ""), String(body ?? "")),
  window: {
    minimize: () => ipcRenderer.invoke("window", "minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window", "maximize"),
    close: () => ipcRenderer.invoke("window", "close"),
  },
});

ipcRenderer.on("request-close", () => {
  window.dispatchEvent(new Event("recleaner-close"));
});
