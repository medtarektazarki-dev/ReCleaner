const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { executeAction, readHost } = require("./runner.cjs");

process.env.RECLEANER_EXE = process.execPath;

let allowClose = false;
let win = null;
let tray = null;
let settings = {
  launchWithWindows: false,
  runMinimized: false,
  notifications: false,
};

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    if (parsed && typeof parsed === "object") settings = { ...settings, ...parsed };
  } catch {
    settings = { ...settings };
  }
}

function saveSettings(next) {
  settings = { ...settings, ...next };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings));
}

function psSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function applyStartup(enabled) {
  if (process.platform !== "win32") return;
  const run = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const command = enabled
    ? `New-ItemProperty -Path ${psSingle(run)} -Name 'REcleaner' -Value ${psSingle(`"${process.execPath}"`)} -PropertyType String -Force | Out-Null`
    : `Remove-ItemProperty -Path ${psSingle(run)} -Name 'REcleaner' -ErrorAction SilentlyContinue`;
  execFile("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true });
}

function cleanParams(input) {
  const params = {};
  if (!input || typeof input !== "object") return params;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#07111c",
    title: "REcleaner",
    icon: path.join(__dirname, "icon.png"),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setTitle("REcleaner");
  win.removeMenu();
  win.on("close", (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (!win.isDestroyed()) win.webContents.send("request-close");
  });
  win.once("ready-to-show", () => {
    if (settings.runMinimized) {
      win.hide();
      return;
    }
    win.show();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
  });
  void win.loadFile(path.join(__dirname, "ui", "index.html"));
}

function createTray() {
  const image = nativeImage.createFromPath(path.join(__dirname, "tray.png"));
  tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(path.join(__dirname, "icon.png")) : image);
  tray.setToolTip("REcleaner");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show REcleaner",
        click: () => {
          if (!win || win.isDestroyed()) createWindow();
          win.show();
          win.focus();
        },
      },
      {
        label: "Exit",
        click: () => {
          allowClose = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(() => {
    loadSettings();
    app.setAppUserModelId("REcleaner");
    Menu.setApplicationMenu(null);
    createTray();
    createWindow();
    applyStartup(Boolean(settings.launchWithWindows));
  });
}

app.on("window-all-closed", () => {
  if (allowClose) app.quit();
});

ipcMain.handle("host", () => readHost());

ipcMain.handle("run", async (_event, actionId, params) => {
  const id = typeof actionId === "string" ? actionId : "";
  return executeAction(id, cleanParams(params));
});

ipcMain.handle("settings", (_event, next) => {
  if (!next || typeof next !== "object") return;
  saveSettings({
    launchWithWindows: Boolean(next.launchWithWindows),
    runMinimized: Boolean(next.runMinimized),
    notifications: Boolean(next.notifications),
  });
  applyStartup(Boolean(settings.launchWithWindows));
});

ipcMain.handle("notify", (_event, title, body) => {
  if (!settings.notifications || !Notification.isSupported()) return;
  new Notification({
    title: String(title || "REcleaner").slice(0, 80),
    body: String(body || "").slice(0, 240),
  }).show();
});

ipcMain.handle("window", (_event, command) => {
  if (!win || win.isDestroyed()) return;
  if (command === "minimize") win.minimize();
  if (command === "maximize") {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
  if (command === "close") {
    allowClose = true;
    win.close();
    app.quit();
  }
});
