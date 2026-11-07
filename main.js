// Kuha - Electron main process: window, tools, downloader, and the IPC handlers
// behind window.kuha (see preload.js).
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const tools = require("./src/tools");
const settings = require("./src/settings");
const { createDownloader } = require("./src/downloader");

let win = null;
let toolPaths = { ytdlp: null, ffmpeg: null };
let downloader = null;
let settingsFile;
let defaultSaveDir;

const getSettings = () => settings.load(settingsFile, defaultSaveDir);

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 640,
    minHeight: 560,
    title: "Kuha",
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Links like yt-dlp's site list open in the real browser, never inside Kuha.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

// Wrap each handler so the window always gets {ok, value} or {ok:false, error}.
function handle(name, fn) {
  ipcMain.handle(`kuha:${name}`, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function requireTools() {
  if (!toolPaths.ytdlp || !toolPaths.ffmpeg) throw new Error("Kuha is damaged, please reinstall");
}

function registerHandlers() {
  handle("getInfo", (url) => {
    requireTools();
    return downloader.getInfo(String(url));
  });

  handle("download", ({ url, format, quality }) => {
    requireTools();
    try {
      settings.ensureSaveDir(getSettings().saveDir);
    } catch {
      throw new Error("Can't save to this folder. Choose another one.");
    }
    return downloader.start({ url: String(url), format: format === "mp3" ? "mp3" : "mp4", quality: String(quality) });
  });

  handle("cancel", (id) => downloader.cancel(String(id)));

  handle("openFile", async (p) => {
    if (!downloader.isKnownFile(p)) throw new Error("Not allowed");
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });

  handle("showInFolder", (p) => {
    if (!downloader.isKnownFile(p)) throw new Error("Not allowed");
    shell.showItemInFolder(p);
  });

  handle("getSettings", () => getSettings());

  handle("setSettings", (partial = {}) => {
    const clean = {};
    if (partial.format === "mp4" || partial.format === "mp3") clean.format = partial.format;
    if (["best", "1080", "720", "480", "360"].includes(String(partial.quality))) clean.quality = String(partial.quality);
    return settings.save(settingsFile, clean, defaultSaveDir);
  });

  handle("chooseFolder", async () => {
    const r = await dialog.showOpenDialog(win, {
      title: "Choose where Kuha saves files",
      defaultPath: getSettings().saveDir,
      properties: ["openDirectory", "createDirectory"],
    });
    if (r.canceled || !r.filePaths[0]) return getSettings();
    return settings.save(settingsFile, { saveDir: r.filePaths[0] }, defaultSaveDir);
  });

  handle("getVersions", async () => ({
    app: app.getVersion(),
    ytdlp: toolPaths.ytdlp && toolPaths.ffmpeg ? await tools.getVersion(toolPaths.ytdlp) : null,
  }));

  handle("updateYtdlp", () => {
    requireTools();
    return tools.updateYtdlp(toolPaths.ytdlp);
  });
}

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  settingsFile = path.join(userData, "settings.json");
  defaultSaveDir = path.join(app.getPath("downloads"), "Kuha");

  const resourcesPath = app.isPackaged ? path.join(process.resourcesPath, "vendor") : path.join(__dirname, "vendor");
  toolPaths = tools.init({ resourcesPath, userDataPath: userData });

  downloader = createDownloader({
    ytdlp: toolPaths.ytdlp,
    ffmpeg: toolPaths.ffmpeg,
    getSaveDir: () => getSettings().saveDir,
  });
  downloader.on("progress", (e) => {
    if (win && !win.isDestroyed()) win.webContents.send("kuha:progress", e);
  });

  registerHandlers();
  createWindow();

  // Keep sites working: update yt-dlp quietly in the background. Offline? Ignored.
  if (toolPaths.ytdlp) tools.updateYtdlp(toolPaths.ytdlp).catch(() => {});
});

app.on("window-all-closed", () => app.quit());
