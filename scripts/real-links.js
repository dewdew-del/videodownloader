// Real-world check: downloads one known public video per site through the downloader.
// Usage: node scripts/real-links.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDownloader } = require("../src/downloader");

const vendor = path.join(__dirname, "..", "vendor");
const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuha-real-"));

const LINKS = [
  ["YouTube", "https://www.youtube.com/watch?v=jNQXAC9IVRw", "mp4"],
  ["YouTube Shorts", "https://www.youtube.com/shorts/tPEE9ZwTmy0", "mp4"],
  ["TikTok", "https://www.tiktok.com/@scout2015/video/6718335390845095173", "mp4"],
  ["X", "https://twitter.com/Twitter/status/1600649710662213632", "mp4"],
  ["Instagram", "https://www.instagram.com/p/aye83DjauH/", "mp4"],
  ["Facebook reel", "https://www.facebook.com/reel/1195289147628387", "mp4"],
  ["Facebook video (MP3)", "https://www.facebook.com/watch/?v=10153231379946729", "mp3"],
  ["Dailymotion", "https://www.dailymotion.com/video/x7tgad0", "mp4"],
];

const d = createDownloader({
  ytdlp: path.join(vendor, "yt-dlp.exe"),
  ffmpeg: path.join(vendor, "ffmpeg.exe"),
  getSaveDir: () => saveDir,
});

const names = new Map();
let left = LINKS.length;
let failed = 0;
d.on("progress", (e) => {
  if (e.status !== "done" && e.status !== "error") return;
  const name = names.get(e.id);
  if (e.status === "done") {
    const kb = Math.round(fs.statSync(e.file).size / 1024);
    console.log(`OK   ${name}: ${path.basename(e.file)} (${kb} KB)`);
  } else {
    failed++;
    console.log(`FAIL ${name}: ${e.error}`);
  }
  if (--left === 0) {
    console.log(`\n${LINKS.length - failed}/${LINKS.length} OK. Files in ${saveDir}`);
    process.exit(failed ? 1 : 0);
  }
});

for (const [name, url, format] of LINKS) names.set(d.start({ url, format, quality: "360" }), name);
