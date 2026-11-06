# Kuha Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the VideoDownloader website into Kuha, an installable Windows Electron app that downloads videos as MP4/MP3 with bundled yt-dlp + FFmpeg.

**Architecture:** The Electron main process owns all yt-dlp/FFmpeg work (`src/*`). A sandboxed renderer (the existing UI, adapted) talks to it only through the `window.kuha` API exposed by `preload.js`. electron-builder packages everything, plus `vendor/` tools, into an NSIS installer.

**Tech Stack:** Electron (latest stable), electron-builder, Node built-in test runner (`node --test`), yt-dlp.exe, ffmpeg.exe.

**Spec:** `docs/superpowers/specs/2026-11-06-kuha-desktop-design.md`

## Global Constraints
- App name `Kuha`; appId `com.dewdewdel.kuha`; installer `Kuha-Setup-${version}.exe`; version `1.0.0`
- Windows x64 only; NSIS installer with desktop + Start menu shortcuts
- BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; 900×680, min 640×560
- CSP: `default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'`
- Default save folder: `path.join(app.getPath('downloads'), 'Kuha')`
- Batch concurrency: max 3 jobs
- Output template `%(title).150B.%(ext)s`; always `--no-playlist --newline --no-warnings --print after_move:filepath`
- MP4 format string: `bv*{h}[vcodec^=avc1]+ba[acodec^=mp4a]/bv*{h}+ba/b{h}/b`, where `{h}` = `[height<=Q]` for numeric Q or empty for `best`; plus `--merge-output-format mp4 --remux-video mp4`
- MP3: `-x --audio-format mp3 --audio-quality 0`
- Tools come from official sources only: `github.com/yt-dlp/yt-dlp` releases and `github.com/yt-dlp/FFmpeg-Builds` releases
- Commits: no Claude attribution (global rule). README top line: `**Download for Windows:** <latest release link>`

## Review Focus
- **Titles with emoji or Windows-illegal characters (`? : " |`)**: the file still saves and Open works. Pin: Task 2 test that `buildArgs` includes `--windows-filenames`; Task 4 real-link check with the TikTok emoji title.
- **Same link pasted twice in Batch**: it's downloaded once. Pin: Task 6, `parseLinks` dedupe test.
- **Cancel during the "converting" stage**: no stray ffmpeg process or `.part` file left behind. Pin: Task 4 test that cancel kills the process tree (`taskkill /T /F` on Windows) and removes `*.part` / `*.ytdl` in the save folder that match the job's temp prefix.
- **Offline at launch**: the app opens normally and the update failure is silent. Pin: Task 3 test that `updateYtdlp` resolves `{updated:false}` when the spawn exits non-zero.
- **Save folder deleted while the app is open**: the next download recreates it. Pin: Task 3 test that `ensureSaveDir()` recreates a missing folder.

---

### Task 1: Electron scaffold, tools fetch, empty window

**Files:**
- Modify: `package.json` (name `kuha`, `main: "main.js"`, scripts `start: "electron ."`, `test: "node --test test/"`, `fetch-tools`, `dist: "electron-builder --win nsis"`; devDeps `electron`, `electron-builder`; remove `express`)
- Create: `main.js` (window only, loads `renderer/index.html`), `scripts/fetch-tools.ps1`, `renderer/index.html` (placeholder), `.gitignore` (add `vendor/`, `dist/`)

**Interfaces:**
- Produces: `vendor/yt-dlp.exe`, `vendor/ffmpeg.exe` on disk; `npm start` opens a window

- [ ] **Step 1:** `npm uninstall express; npm install -D electron electron-builder`
- [ ] **Step 2:** Write `scripts/fetch-tools.ps1`: same download logic as the current `setup.ps1`, but target `vendor/`, copy only `ffmpeg.exe` (no ffprobe needed), and skip files that already exist
- [ ] **Step 3:** Run `powershell -ExecutionPolicy Bypass -File scripts/fetch-tools.ps1`. Expected: `vendor\yt-dlp.exe` and `vendor\ffmpeg.exe` exist
- [ ] **Step 4:** Write `main.js` with the Global Constraints window settings, plus a placeholder `renderer/index.html` containing the CSP meta tag
- [ ] **Step 5:** Run `npm start`. Expected: a window titled "Kuha" opens with no console errors
- [ ] **Step 6:** Commit `chore: scaffold Kuha Electron app`

### Task 2: Pure helpers (errors, args, progress)

**Files:**
- Create: `src/errors.js`, `src/args.js`, `test/errors.test.js`, `test/args.test.js`

**Interfaces:**
- Produces: `cleanError(stderr: string): string`; `buildArgs({url, format, quality, saveDir, ffmpegPath}): string[]`; `parseProgress(line: string): number|null`; `isConverting(line: string): boolean`; `parseFilepath(stdout: string): string|null` (last non-empty line that is an absolute path)

- [ ] **Step 1: Write failing tests**
  - `cleanError("ERROR: [facebook] 1: Cannot parse data; please report")` gives the "This site can't be read right now..." message (text copied from the current `server.js`)
  - `cleanError("ERROR: Private video. Sign in ...")` gives "This video needs a login or is private, so it can't be downloaded."
  - `cleanError("")` gives "Download failed."
  - `buildArgs({format:'mp3',...})` includes `-x`, `--audio-format`, `mp3` and has no `--merge-output-format`
  - `buildArgs({format:'mp4',quality:'720',...})` includes `bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=720]+ba/b[height<=720]/b`
  - `buildArgs({format:'mp4',quality:'best',...})` format string has no `height<=`
  - every result includes `--no-playlist`, `--print`, `after_move:filepath`, `--windows-filenames`, `--ffmpeg-location <ffmpegPath>`, `-o <saveDir>\%(title).150B.%(ext)s`, and ends with the url
  - `parseProgress("[download]  42.5% of 3.1MiB")` gives `42.5`; `parseProgress("[info] x")` gives `null`
  - `isConverting("[Merger] Merging formats into")` gives `true`
  - `parseFilepath("[download] 100%\nC:\\Users\\a\\Downloads\\Kuha\\x.mp4\n")` gives `C:\Users\a\Downloads\Kuha\x.mp4`
- [ ] **Step 2:** `npm test`. Expected: FAIL (modules missing)
- [ ] **Step 3:** Implement the functions (port the logic from `server.js`)
- [ ] **Step 4:** `npm test`. Expected: all PASS
- [ ] **Step 5:** Commit `feat: add yt-dlp argument, progress and error helpers`

### Task 3: Tools and settings

**Files:**
- Create: `src/tools.js`, `src/settings.js`, `test/settings.test.js`, `test/tools.test.js`

**Interfaces:**
- Produces:
  - `tools.init({resourcesPath, userDataPath}): {ytdlp: string, ffmpeg: string}`: copies `yt-dlp.exe` to `userData/bin` if missing; ffmpeg is used straight from resources. Dev mode resourcesPath = `<repo>/vendor`, packaged = `process.resourcesPath/vendor`
  - `tools.updateYtdlp(ytdlpPath, spawnFn = child_process.spawn): Promise<{updated: boolean, version: string|null}>`
  - `tools.getVersion(ytdlpPath): Promise<string|null>`
  - `settings.load(file): {saveDir, format, quality}`, defaults `{saveDir: <Downloads>/Kuha, format: 'mp4', quality: '720'}`; `settings.save(file, partial): object` (merged); `settings.ensureSaveDir(dir): string` (mkdir -p, returns dir)

- [ ] **Step 1: Failing tests** (use a temp dir via `fs.mkdtempSync`)
  - `load` on a missing file returns the defaults; `save` then `load` round-trips `{quality:'1080'}` and keeps the other defaults
  - `load` on a corrupt JSON file returns the defaults (doesn't throw)
  - `ensureSaveDir` on a deleted folder recreates it
  - `updateYtdlp` with a fake spawn that exits 1 resolves `{updated:false}`
  - `init` copies `yt-dlp.exe` from a fake resources dir into `userData/bin` exactly once
- [ ] **Step 2:** `npm test`. Expected: FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npm test`. Expected: PASS
- [ ] **Step 5:** Commit `feat: add tools setup and settings storage`

### Task 4: Downloader (jobs, queue, cancel)

**Files:**
- Create: `src/downloader.js`, `test/downloader.test.js`, `scripts/real-links.js`

**Interfaces:**
- Consumes: Task 2 helpers; tool paths from Task 3
- Produces: `createDownloader({ytdlp, ffmpeg, getSaveDir, spawnFn, concurrency = 3})` returns an object with:
  - `getInfo(url): Promise<{title, thumbnail, duration, site, uploader}>` (spawns `-J --no-playlist --no-warnings`; rejects with `Error(cleanError(stderr))`)
  - `start({url, format, quality}): string`, the job id (queued if 3 are already running)
  - `cancel(id): void`
  - `on('progress', cb)`, where cb gets `{id, status, progress, file, error}`; status is one of `queued|downloading|converting|done|error|cancelled`
  - `isKnownFile(path): boolean` (true only for `file` values of `done` jobs)

- [ ] **Step 1: Failing tests** with a fake `spawnFn` (an EventEmitter with stdout/stderr streams)
  - stdout `[download]  50.0%` emits `downloading` with progress 50
  - stdout `[ExtractAudio]` emits `converting`
  - exit 0 with a last line `C:\x\a.mp3` emits `done`, `file` is `C:\x\a.mp3`, and `isKnownFile('C:\\x\\a.mp3')` is true
  - exit 1 with stderr `ERROR: Private video` emits `error` with the login message
  - starting 4 jobs: only 3 spawns happen until one exits, then the 4th spawns
  - `cancel` on a running job calls the kill function with the child pid and emits `cancelled`
  - `isKnownFile('C:\\Windows\\notepad.exe')` is false
- [ ] **Step 2:** `npm test`. Expected: FAIL
- [ ] **Step 3:** Implement. Cancel on Windows: `spawn('taskkill', ['/pid', pid, '/T', '/F'])`, then remove `*.part` and `*.ytdl` files in saveDir newer than the job's start time
- [ ] **Step 4:** `npm test`. Expected: PASS
- [ ] **Step 5:** Write `scripts/real-links.js`: runs the downloader against the links from the earlier tests (YouTube `jNQXAC9IVRw`, Shorts `tPEE9ZwTmy0`, TikTok `@scout2015/video/6718335390845095173`, X `Twitter/status/1600649710662213632`, Instagram `p/aye83DjauH`, FB reel `1195289147628387`, FB `watch/?v=10153231379946729` as MP3, Dailymotion `x7tgad0`) at MP4 360p into a temp folder, and prints OK/FAIL with the file size
- [ ] **Step 6:** `node scripts/real-links.js`. Expected: 8 OK lines, and the TikTok file name keeps a readable title
- [ ] **Step 7:** Commit `feat: add downloader with queue and cancel`

### Task 5: IPC bridge

**Files:**
- Modify: `main.js`
- Create: `preload.js`

**Interfaces:**
- Consumes: Tasks 3 and 4
- Produces: `window.kuha` with exactly: `getInfo(url)`, `download({url,format,quality})`, `cancel(id)`, `onProgress(cb)`, `openFile(path)`, `showInFolder(path)`, `getSettings()`, `setSettings(partial)`, `chooseFolder()`, `getVersions()`, `updateYtdlp()`. IPC channel names: `kuha:<method>`; progress is sent on `kuha:progress`

- [ ] **Step 1:** Implement `preload.js` with `contextBridge.exposeInMainWorld('kuha', …)` using `ipcRenderer.invoke` (and `ipcRenderer.on` for progress)
- [ ] **Step 2:** In `main.js`: on `app.whenReady` run `tools.init`, `createDownloader`, register an `ipcMain.handle` for each method; call `tools.updateYtdlp` in the background (fire-and-forget). `openFile`/`showInFolder` call `shell.openPath`/`shell.showItemInFolder` only when `downloader.isKnownFile(path)`; otherwise they reject with `Error('Not allowed')`. `chooseFolder` uses `dialog.showOpenDialog({properties:['openDirectory','createDirectory']})` then `settings.save`. `download` calls `settings.ensureSaveDir` first; if that throws (not writable), reject with `Error('Can't save to this folder. Choose another one.')`. `getVersions` returns `ytdlp: null` when a tool file is missing
- [ ] **Step 3:** `npm start`, then in DevTools run `await kuha.getInfo('https://www.youtube.com/watch?v=jNQXAC9IVRw')`. Expected: an object with title "Me at the zoo"; `await kuha.showInFolder('C:\\Windows\\notepad.exe')` rejects
- [ ] **Step 4:** Commit `feat: add secure IPC bridge`

### Task 6: Renderer UI

**Files:**
- Create: `renderer/index.html`, `renderer/app.js`, `renderer/style.css`, `renderer/links.js`, `test/links.test.js` (adapted from `public/*`)

**Interfaces:**
- Consumes: `window.kuha` (Task 5)
- Produces: `parseLinks(text: string): string[]` in `renderer/links.js` (split on whitespace, keep only `http(s)` links, dedupe, keep order). Exported for the test via `if (typeof module !== 'undefined') module.exports = …`

- [ ] **Step 1: Failing test:** `parseLinks("https://a.com/1\nhttps://a.com/1 junk https://b.com")` gives `['https://a.com/1','https://b.com']`
- [ ] **Step 2:** `npm test`. Expected: FAIL. **Step 3:** implement. **Step 4:** PASS
- [ ] **Step 5:** Port the UI: replace `fetch`/`EventSource` with `window.kuha`; header "Kuha" with a ⚙ button; save bar "Saving to: <path> [Change]"; cards get [Cancel] while running and [Open] / [Show in folder] when done (no Save button); settings panel with default format, default quality, versions and an [Update yt-dlp] button; load the defaults from `getSettings()` on start; if `getVersions().ytdlp` is null, show the banner "Kuha is damaged, please reinstall"; if a download fails with the "Can't save to this folder" error, open `chooseFolder()`
- [ ] **Step 6:** `npm start` and check by hand: the Single preview appears for the TikTok link; Download saves into `Downloads\Kuha`; Open plays it; Show in folder highlights it; Cancel on a long video stops it and leaves no `.part` file; Batch with 4 links shows at most 3 running; Change folder persists after a restart
- [ ] **Step 7:** Commit `feat: Kuha desktop UI`

### Task 7: Installer build

**Files:**
- Modify: `package.json` (`build` block)
- Create: `build/icon.ico` (256×256, simple red "K" on dark, generated with a script or by hand)

**Interfaces:**
- Produces: `dist/Kuha-Setup-1.0.0.exe`

- [ ] **Step 1:** Add the `build` config: `appId`, `productName: "Kuha"`, `files: ["main.js","preload.js","src/**","renderer/**"]`, `extraResources: [{from:"vendor", to:"vendor"}]`, `win: {target: "nsis", icon: "build/icon.ico"}`, `nsis: {oneClick:false, allowToChangeInstallationDirectory:true, createDesktopShortcut:true, createStartMenuShortcut:true, artifactName:"Kuha-Setup-${version}.exe"}`
- [ ] **Step 2:** `npm run dist`. Expected: `dist\Kuha-Setup-1.0.0.exe` exists, about 150 MB
- [ ] **Step 3:** Install it, open Kuha from the desktop shortcut, run one MP4 and one MP3 download, check the files are in `Downloads\Kuha`, then uninstall from Windows Settings. Expected: all work, and the uninstall removes the app
- [ ] **Step 4:** Commit `build: Windows installer config`

### Task 8: Cleanup, README, release

**Files:**
- Delete: `server.js`, `public/`, `setup.ps1`, `start-public.ps1`, `Dockerfile`, `.dockerignore`, `.claude/launch.json`
- Modify: `README.md`

- [ ] **Step 1:** Delete the files; `npm test` still passes; `npm start` still works
- [ ] **Step 2:** Rewrite the README: top line `**Download for Windows:** https://github.com/dewdew-del/videodownloader/releases/latest`, plus features, tested sites, the SmartScreen "More info, then Run anyway" note, build-from-source steps (`npm install`, `npm run fetch-tools`, `npm start` / `npm run dist`), and the not-supported list (DRM sites)
- [ ] **Step 3:** Commit `docs: Kuha README and remove website files`
- [ ] **Step 4:** With Dewdew's go-ahead: push, then create GitHub Release `v1.0.0` and upload `dist/Kuha-Setup-1.0.0.exe` (via the github.com "Draft a new release" page, walked through step by step, since `gh` isn't installed)
