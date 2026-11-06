# VideoDownloader

**Live demo:** https://exception-kid-communication-spas.trycloudflare.com

> The demo runs from my laptop through a free Cloudflare Tunnel, so it only works while my laptop is on, and the link changes when I restart it. If it doesn't load, see [Setup](#setup-windows) to run it yourself.

A local web app that turns video links into **MP4** or **MP3** files. Paste a link, see a preview, and download. There's also a batch mode for many links at once.

Built with Node.js + Express, powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/).

## Features
- **Single link mode** with a live preview (thumbnail, title, length, site)
- **Batch mode**: paste many links, one per line, and download up to 3 at a time
- **MP4** (360p to best quality) or **MP3** (best audio quality)
- Live progress bar for each download
- Plain-English error messages

## Tested sites
| Site | Status |
|---|---|
| YouTube (videos + Shorts) | ✅ |
| TikTok | ✅ |
| X / Twitter (posts with a video) | ✅ |
| Instagram | ✅ |
| Facebook (videos + reels) | ✅ |
| Dailymotion | ✅ |
| Vimeo, Reddit | ❌ need a login |

yt-dlp supports many more sites. Some break now and then when a site changes its pages. Updating yt-dlp usually fixes that.

## Setup (Windows)
Requires [Node.js](https://nodejs.org/) 18 or newer.

```powershell
git clone https://github.com/dewdew-del/videodownloader.git
cd videodownloader
npm install
powershell -ExecutionPolicy Bypass -File setup.ps1   # downloads yt-dlp + FFmpeg into .\bin
npm start
```

Open **http://localhost:3100**.

To use a different port: `$env:PORT=4000; npm start`

## Share it with a public link (Cloudflare Tunnel)
```powershell
powershell -ExecutionPolicy Bypass -File start-public.ps1
```
This starts the app and prints a free public link like `https://something.trycloudflare.com`. Downloads still run on your PC's home internet, so YouTube allows them. The link only works while that window is open, and you get a new link each time.

## Updating yt-dlp
If a site stops working:
```powershell
.\bin\yt-dlp.exe -U
```

## Why it runs locally
Free hosting (like Vercel) can't run long downloads or FFmpeg, and many video sites block cloud servers. Running on your own PC avoids both problems, and Cloudflare Tunnel makes it reachable from anywhere.

## Note
For personal use. Only download videos you own or have permission to use, and respect each site's terms of service.
