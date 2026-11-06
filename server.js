// VideoDownloader - local web app that turns video links into MP4 or MP3.
// Uses yt-dlp (supports 1000+ sites) and FFmpeg (merging / MP3 conversion).
const express = require("express");
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3100; // 3000 is used by Exposure Lab
// Local PC: only this computer can connect. On Render/Docker, HOST=0.0.0.0 lets the host reach it.
const HOST = process.env.HOST || "127.0.0.1";
const BIN_DIR = path.join(__dirname, "bin");
const TMP_DIR = path.join(os.tmpdir(), "videodownloader");
fs.mkdirSync(TMP_DIR, { recursive: true });

// Find a tool in ./bin first, then on PATH.
function findTool(name) {
  const local = path.join(BIN_DIR, process.platform === "win32" ? `${name}.exe` : name);
  if (fs.existsSync(local)) return local;
  const r = spawnSync(name, ["-version"], { stdio: "ignore", shell: false });
  if (!r.error) return name;
  const r2 = spawnSync(name, ["--version"], { stdio: "ignore", shell: false });
  return r2.error ? null : name;
}

const YTDLP = findTool("yt-dlp");
const FFMPEG = findTool("ffmpeg");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function isValidUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

// Health check so the page can warn if tools are missing.
app.get("/api/status", (req, res) => {
  res.json({ ytdlp: !!YTDLP, ffmpeg: !!FFMPEG });
});

// Get title / thumbnail / duration for a link.
app.post("/api/info", (req, res) => {
  const { url } = req.body || {};
  if (!isValidUrl(url)) return res.status(400).json({ error: "Invalid link." });
  if (!YTDLP) return res.status(500).json({ error: "yt-dlp not found. Run setup.ps1 first." });

  const p = spawn(YTDLP, ["-J", "--no-playlist", "--no-warnings", url]);
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.on("close", (code) => {
    if (code !== 0) return res.status(400).json({ error: cleanError(err) });
    try {
      const j = JSON.parse(out);
      res.json({
        title: j.title,
        thumbnail: j.thumbnail,
        duration: j.duration,
        site: j.extractor_key,
        uploader: j.uploader,
      });
    } catch {
      res.status(500).json({ error: "Could not read video info." });
    }
  });
});

// ---- Download jobs ----
const jobs = new Map(); // id -> { status, progress, file, name, error, listeners }

function cleanError(text) {
  if (/Cannot parse data|Unsupported URL/i.test(text))
    return "This site can't be read right now (it may have changed, or the video needs a login). Try another link, or update yt-dlp later.";
  if (/login|sign in|private|cookies/i.test(text))
    return "This video needs a login or is private, so it can't be downloaded.";
  const line = text.split("\n").find((l) => l.includes("ERROR")) || text.trim().split("\n").pop() || "";
  return line.replace(/^ERROR:\s*/, "").slice(0, 300) || "Download failed.";
}

function emit(job) {
  const data = JSON.stringify({
    status: job.status, progress: job.progress, name: job.name, error: job.error,
  });
  job.listeners.forEach((res) => res.write(`data: ${data}\n\n`));
}

app.post("/api/jobs", (req, res) => {
  const { url, format = "mp4", quality = "best" } = req.body || {};
  if (!isValidUrl(url)) return res.status(400).json({ error: "Invalid link." });
  if (!YTDLP) return res.status(500).json({ error: "yt-dlp not found. Run setup.ps1 first." });
  if (!["mp4", "mp3"].includes(format)) return res.status(400).json({ error: "Bad format." });

  const id = crypto.randomUUID();
  const dir = path.join(TMP_DIR, id);
  fs.mkdirSync(dir);

  const args = ["--no-playlist", "--newline", "--no-warnings", "-o", path.join(dir, "%(title).150B.%(ext)s")];
  if (FFMPEG && FFMPEG !== "ffmpeg") args.push("--ffmpeg-location", FFMPEG);

  if (format === "mp3") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    const h = /^\d+$/.test(String(quality)) ? `[height<=${quality}]` : "";
    // Prefer H.264/AAC so the MP4 plays everywhere; fall back to anything.
    args.push(
      "-f", `bv*${h}[vcodec^=avc1]+ba[acodec^=mp4a]/bv*${h}+ba/b${h}/b`,
      "--merge-output-format", "mp4",
      "--remux-video", "mp4"
    );
  }
  args.push(url);

  const job = { status: "downloading", progress: 0, file: null, name: null, error: null, listeners: [], dir };
  jobs.set(id, job);

  const p = spawn(YTDLP, args);
  let err = "";
  p.stdout.on("data", (d) => {
    const m = String(d).match(/\[download\]\s+([\d.]+)%/g);
    if (m) {
      const pct = parseFloat(m[m.length - 1].match(/([\d.]+)%/)[1]);
      if (pct > job.progress) { job.progress = pct; emit(job); }
    }
    if (/\[(Merger|ExtractAudio|VideoRemuxer)\]/.test(d)) { job.status = "converting"; emit(job); }
  });
  p.stderr.on("data", (d) => (err += d));
  p.on("close", (code) => {
    const files = fs.readdirSync(dir).filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    const wanted = files.find((f) => f.endsWith("." + format)) || files[0];
    if (code === 0 && wanted) {
      job.status = "done"; job.progress = 100;
      job.file = path.join(dir, wanted); job.name = wanted;
    } else {
      job.status = "error"; job.error = cleanError(err);
    }
    emit(job);
    job.listeners.forEach((r) => r.end());
    job.listeners = [];
  });

  res.json({ id });
});

// Live progress (Server-Sent Events).
app.get("/api/jobs/:id/events", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  job.listeners.push(res);
  emit(job);
  if (job.status === "done" || job.status === "error") res.end();
  req.on("close", () => (job.listeners = job.listeners.filter((r) => r !== res)));
});

// Send the finished file, then clean it up.
app.get("/api/jobs/:id/file", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "done") return res.status(404).send("Not ready.");
  res.download(job.file, job.name, () => {
    fs.rm(job.dir, { recursive: true, force: true }, () => {});
    jobs.delete(req.params.id);
  });
});

// Remove leftovers older than 1 hour.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const d of fs.readdirSync(TMP_DIR)) {
    const full = path.join(TMP_DIR, d);
    try { if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true }); } catch {}
  }
}, 10 * 60 * 1000);

app.listen(PORT, HOST, () => {
  console.log(`VideoDownloader running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`yt-dlp: ${YTDLP || "MISSING"}  |  ffmpeg: ${FFMPEG || "MISSING"}`);
});
