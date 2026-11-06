# Kuha: desktop video downloader (design)

Date: 2026-11-06
Status: Draft, waiting for Dewdew's review
Repo: `dewdew-del/videodownloader` (repo name stays; app name is **Kuha**)

## 1. Goal

Turn the existing VideoDownloader website into an installable Windows desktop app.

- **Dewdew said:** an app that anyone can install and use to download videos from the internet, and that runs without Dewdew's laptop being on.
- **Assumed (confirmed):** it's a public portfolio piece. It should feel like a real app, not a browser page. It keeps the Single + Batch modes and the MP4/MP3 options.
- **Success:** someone downloads `Kuha-Setup-1.0.0.exe` from GitHub Releases, installs it, pastes a YouTube/TikTok/Facebook link, and the file lands in `Downloads\Kuha`. No setup steps, no terminal.

Why a desktop app: each user downloads on their own home internet, so YouTube doesn't block it (cloud servers get blocked). There's also no server to host, and it stays ₱0.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Framework | Electron (reuses the current Node code and UI) |
| Packaging | electron-builder, NSIS installer |
| yt-dlp + FFmpeg | Bundled in the installer. yt-dlp self-updates on launch |
| Platforms | Windows x64 only (v1) |
| App name | Kuha |
| Save folder | `Downloads\Kuha` by default, changeable, remembered |
| Distribution | GitHub Releases. README top line: `**Download for Windows:** <latest release link>` |
| Code signing | None (cost). README explains the SmartScreen "More info, then Run anyway" step |

## 3. Out of scope (v1)

Mac/Linux builds, app auto-update (yt-dlp still updates), accounts, download history across restarts, browser extension, playlists (still `--no-playlist`), DRM/paid streaming sites (Netflix, Disney+, Spotify, Viu). Those are never supported.

## 4. Architecture

```
main.js          Electron main process: creates the window, registers IPC handlers
src/downloader.js  getInfo(url), startDownload(opts) -> job events, cancel(id). Runs yt-dlp/ffmpeg
src/tools.js       Paths to bundled yt-dlp.exe / ffmpeg.exe; yt-dlp update on launch; version
src/settings.js    Read/write settings.json in Electron userData (saveDir, format, quality)
src/errors.js      cleanError(stderr) -> plain-English message (moved from server.js)
preload.js       contextBridge: exposes window.kuha API (fixed list below), nothing else
renderer/        index.html, app.js, style.css (current UI, adapted)
build/           icon.ico
vendor/          yt-dlp.exe, ffmpeg.exe (git-ignored; fetched by scripts/fetch-tools.ps1)
```

**Electron security settings:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A strict Content-Security-Policy allows images from https (for thumbnails) and nothing remote for scripts.

**`window.kuha` API (the only things the UI can ask for):**
- `getInfo(url)` gives `{title, thumbnail, duration, site, uploader}` or throws a friendly error
- `download({url, format, quality})` gives `{id}`
- `cancel(id)`
- `onProgress(callback)` sends `{id, status: downloading|converting|done|error|cancelled, progress, file, error}`
- `openFile(path)`, `showInFolder(path)`
- `getSettings()`, `setSettings(partial)`, `chooseFolder()` opens the folder picker and saves the choice
- `getVersions()` gives `{app, ytdlp}`; `updateYtdlp()`

Paths passed to `openFile` and `showInFolder` must be files that Kuha itself created (checked against a list of finished jobs). This stops the UI from asking to open anything else.

## 5. Download flow

1. The UI calls `getInfo` and shows the preview (Single mode), or a card per link (Batch mode).
2. `download` spawns yt-dlp with the same format rules as today:
   - MP4: `bv*[height<=Q][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=Q]+ba/b[height<=Q]/b`, merge and remux to mp4
   - MP3: `-x --audio-format mp3 --audio-quality 0`
   - `--ffmpeg-location` points to the bundled ffmpeg. `-o` points to the save folder using `%(title).150B.%(ext)s`
   - `--print after_move:filepath` makes yt-dlp print the final file path. That's how the job learns which file to open (this also covers the "already downloaded" case)
3. stdout `[download] NN%` lines become progress events. `[Merger|ExtractAudio|VideoRemuxer]` lines switch the status to `converting`.
4. On exit code 0, the job is `done` with the final file path. Otherwise it's `error` with `cleanError(stderr)`. `cancel` kills the process and deletes the `.part` files.
5. Batch mode runs at most 3 jobs at once (queue in the main process).

If a file with the same name already exists, yt-dlp's default behaviour applies: it skips the download and reports the existing file as `done`.

## 6. UI

Same dark style as now. Window 900×680, min 640×560.
- Header: "Kuha" and a ⚙ button
- Tabs: Single link (preview card, Paste button, Enter to download) and Batch download (textarea, button counts the links)
- Format toggle (MP4/MP3) and quality select (best/1080/720/480/360; disabled for MP3)
- Save bar: "Saving to: <path>" with a [Change] button
- Download list: thumbnail, title, progress bar, [Cancel] while running, [Open] and [Show in folder] when done
- Settings panel: default format and quality, versions, "Update yt-dlp" button

## 7. Tools and updates

- `scripts/fetch-tools.ps1` downloads `yt-dlp.exe` (official GitHub release) and `ffmpeg.exe` (yt-dlp FFmpeg-Builds) into `vendor/`. It runs before building.
- electron-builder copies `vendor/` into the app as `extraResources`.
- On launch, `tools.js` copies the bundled yt-dlp.exe to `userData/bin/` once (Program Files isn't writable), then runs `yt-dlp -U` there in the background. If it fails (offline), it's ignored.

## 8. Errors

- Missing tools: a banner in the app ("Kuha is damaged, please reinstall")
- Invalid link: inline message under the input
- Site errors: the existing friendly messages (can't read site / needs login / private)
- Save folder missing or not writable: the app recreates `Downloads\Kuha`, or asks the user to choose another folder

## 9. Testing

- **Unit (node --test):** `cleanError` cases, `buildArgs(format, quality)` output, progress-line parsing
- **Real links (manual script):** YouTube, YouTube Shorts, TikTok, X, Instagram, Facebook reel and video, Dailymotion, using MP4 360p and one MP3
- **Installer:** build `Kuha-Setup-1.0.0.exe`, install on Dewdew's laptop, run one MP4 and one MP3 through the installed app, check the shortcut, Downloads\Kuha and uninstall

## 10. Repo cleanup

Remove: `server.js`, `public/`, `setup.ps1`, `start-public.ps1`, `Dockerfile`, `.dockerignore`, the Express dependency, `bin/`. Git history keeps the website version. Update the README for the desktop app (download link, SmartScreen note, how to build).
