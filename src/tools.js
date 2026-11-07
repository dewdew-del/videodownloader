// Finds the bundled yt-dlp/FFmpeg and keeps yt-dlp up to date.
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

// yt-dlp is copied to userData once, because Program Files isn't writable and
// yt-dlp -U replaces its own file. FFmpeg never changes, so it runs from resources.
// `ffmpeg` is the folder holding ffmpeg.exe + ffprobe.exe (passed to --ffmpeg-location).
function init({ resourcesPath, userDataPath }) {
  const bundledYtdlp = path.join(resourcesPath, "yt-dlp.exe");
  const hasFfmpeg = ["ffmpeg.exe", "ffprobe.exe"].every((f) => fs.existsSync(path.join(resourcesPath, f)));
  const ytdlp = path.join(userDataPath, "bin", "yt-dlp.exe");

  if (!fs.existsSync(ytdlp) && fs.existsSync(bundledYtdlp)) {
    fs.mkdirSync(path.dirname(ytdlp), { recursive: true });
    fs.copyFileSync(bundledYtdlp, ytdlp);
  }
  return {
    ytdlp: fs.existsSync(ytdlp) ? ytdlp : null,
    ffmpeg: hasFfmpeg ? resourcesPath : null,
  };
}

function run(cmd, args, spawnFn) {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawnFn(cmd, args, { windowsHide: true });
    } catch {
      return resolve({ code: -1, out });
    }
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => resolve({ code: -1, out }));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function updateYtdlp(ytdlpPath, spawnFn = childProcess.spawn) {
  const { code, out } = await run(ytdlpPath, ["-U"], spawnFn);
  const m = /(?:Updated yt-dlp to|up to date \()\s*([^\s)]+)/.exec(out);
  return { updated: code === 0, version: m ? m[1] : null };
}

async function getVersion(ytdlpPath, spawnFn = childProcess.spawn) {
  const { code, out } = await run(ytdlpPath, ["--version"], spawnFn);
  return code === 0 && out.trim() ? out.trim() : null;
}

module.exports = { init, updateYtdlp, getVersion };
