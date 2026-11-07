# Kuha

**Download for Windows:** https://github.com/dewdew-del/videodownloader/releases/latest

> Windows 10/11, 64-bit. The installer is about 234 MB because yt-dlp and FFmpeg come bundled, so there's nothing else to install.

Kuha ("to get" in Bisaya and Tagalog) is a desktop app that saves videos from the internet as **MP4** or **MP3**. Paste a link, see a preview, and download. There's also a batch mode for many links at once.

Built with Electron, powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/).

## Features
- **Single link**: live preview with thumbnail, title, length and site
- **Batch download**: paste many links, one per line. Duplicates and non-links are skipped, and up to 3 download at a time
- **MP4** (360p up to best quality) or **MP3** (best audio quality)
- Saves straight to `Downloads\Kuha`, or any folder you choose
- **Cancel** any download. Half-finished files are cleaned up
- **Open** and **Show in folder** buttons on every finished download
- yt-dlp updates itself on launch, so sites keep working
- Plain-English error messages (private video, no sound for MP3, site not readable)

## Tested sites
| Site | MP4 | MP3 |
|---|---|---|
| YouTube (videos + Shorts) | ✅ | ✅ |
| TikTok | ✅ | ✅ |
| X / Twitter (posts with a video) | ✅ | ✅ |
| Instagram | ✅ | ✅ (if the video has sound) |
| Facebook (videos + reels) | ✅ | ✅ |
| Dailymotion | ✅ | ✅ |
| Vimeo, Reddit | ❌ need a login | ❌ |

yt-dlp supports many more sites. **Not supported, ever:** paid streaming services with DRM (Netflix, Disney+, Spotify, Viu and similar).

## Installing: "Windows protected your PC"
Kuha isn't code-signed (a certificate costs money), so the first time you run the installer Windows SmartScreen may show a blue **"Windows protected your PC"** box. Click **More info**, then **Run anyway**. This is normal for free apps from small developers.

## Why a desktop app
Video sites like YouTube block downloads that come from cloud servers (Vercel, Render and others). Kuha runs on your own PC and uses your home internet, so downloads work, and there's no server to host or pay for.

## Build from source
Requires [Node.js](https://nodejs.org/) 18 or newer, on Windows.

```powershell
git clone https://github.com/dewdew-del/videodownloader.git
cd videodownloader
npm install
npm run fetch-tools   # downloads yt-dlp, ffmpeg and ffprobe into .\vendor
npm start             # run the app
npm test              # unit tests
npm run dist          # build dist\Kuha-Setup-1.0.0.exe
```

`node scripts/real-links.js` downloads one known public video per site, as a real-world check.

## Note
For personal use. Only download videos you own or have permission to use, and respect each site's terms of service.
