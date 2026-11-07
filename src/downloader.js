// Runs yt-dlp jobs: queue (max N at once), progress events, cancel, final file path.
const { EventEmitter } = require("events");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { StringDecoder } = require("string_decoder");
const { buildArgs, parseProgress, isConverting, parseFilepath } = require("./args");
const { cleanError } = require("./errors");

function defaultKill(pid) {
  // /T kills the whole tree, so the ffmpeg child that yt-dlp started dies too.
  childProcess.spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
}

function createDownloader({ ytdlp, ffmpeg, getSaveDir, spawnFn = childProcess.spawn, killFn = defaultKill, concurrency = 3 }) {
  const events = new EventEmitter();
  const jobs = new Map();
  const queue = [];
  const knownFiles = new Set();
  let running = 0;

  const emit = (job) =>
    events.emit("progress", { id: job.id, status: job.status, progress: job.progress, file: job.file, error: job.error });

  // Preview lookups share their own limit, so a 30-link batch doesn't start 30 yt-dlp processes.
  let infoRunning = 0;
  const infoQueue = [];
  function getInfo(url) {
    return new Promise((resolve, reject) => {
      infoQueue.push({ url, resolve, reject });
      pumpInfo();
    });
  }
  function pumpInfo() {
    while (infoRunning < concurrency && infoQueue.length) {
      const { url, resolve, reject } = infoQueue.shift();
      infoRunning++;
      const done = (fn) => (v) => {
        infoRunning--;
        fn(v);
        pumpInfo();
      };
      lookup(url).then(done(resolve), done(reject));
    }
  }

  function lookup(url) {
    return new Promise((resolve, reject) => {
      const p = spawnFn(ytdlp, ["-J", "--no-playlist", "--no-warnings", url], { windowsHide: true });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("error", () => reject(new Error("Kuha is damaged, please reinstall")));
      p.on("close", (code) => {
        if (code !== 0) return reject(new Error(cleanError(err)));
        try {
          const j = JSON.parse(out);
          resolve({ title: j.title, thumbnail: j.thumbnail, duration: j.duration, site: j.extractor_key, uploader: j.uploader });
        } catch {
          reject(new Error("Could not read video info."));
        }
      });
    });
  }

  function start({ url, format, quality }) {
    // Two jobs for the same link + format would write to the same file at once.
    for (const j of jobs.values()) {
      if (j.url === url && j.format === format && !j.finished && j.status !== "cancelled") {
        throw new Error("Already downloading this link.");
      }
    }
    const job = { id: crypto.randomUUID(), url, format, quality, status: "queued", progress: 0, file: null, error: null, child: null, dests: new Set() };
    jobs.set(job.id, job);
    queue.push(job);
    emit(job);
    pump();
    return job.id;
  }

  function pump() {
    while (running < concurrency && queue.length) run(queue.shift());
  }

  function run(job) {
    running++;
    job.status = "downloading";
    const args = buildArgs({ url: job.url, format: job.format, quality: job.quality, saveDir: getSaveDir(), ffmpegPath: ffmpeg });
    const child = spawnFn(ytdlp, args, { windowsHide: true });
    job.child = child;
    let out = "";
    let err = "";
    let buf = "";
    // A UTF-8 character can be split across two chunks; the decoder holds the partial bytes.
    const decoder = new StringDecoder("utf8");

    child.stdout.on("data", (d) => {
      const text = decoder.write(d);
      out += text;
      buf += text;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) onLine(job, line);
    });
    child.stderr.on("data", (d) => (err += d));
    child.on("error", () => finish(job, 1, "", "Kuha is damaged, please reinstall"));
    child.on("close", (code) => {
      const rest = decoder.end();
      out += rest;
      buf += rest;
      if (buf) onLine(job, buf);
      finish(job, code, out, err);
    });
  }

  function onLine(job, line) {
    if (job.status === "cancelled") return;
    // Every file this job writes: downloads, the merged MP4, the converted MP3.
    const dest = /^\[\w+\] Destination: (.+)$/.exec(line) || /\[Merger\] Merging formats into "(.+)"$/.exec(line);
    if (dest) job.dests.add(dest[1].trim());
    const pct = parseProgress(line);
    if (pct !== null && pct > job.progress && job.status === "downloading") {
      job.progress = pct;
      emit(job);
    }
    if (isConverting(line) && job.status !== "converting") {
      job.status = "converting";
      emit(job);
    }
  }

  function finish(job, code, out, err) {
    if (job.finished) return;
    job.finished = true;
    running--;
    if (job.status === "cancelled") {
      removeLeftovers(job); // only now: the processes have exited and released the files
    } else {
      const file = parseFilepath(out);
      if (code === 0 && file) {
        job.status = "done";
        job.progress = 100;
        job.file = file;
        knownFiles.add(path.normalize(file).toLowerCase());
      } else {
        job.status = "error";
        job.error = code === 0 ? "Download finished but the file wasn't found." : cleanError(err);
      }
      emit(job);
    }
    pump();
  }

  async function cancel(id) {
    const job = jobs.get(id);
    if (!job || job.finished || job.status === "cancelled") return;
    const wasQueued = job.status === "queued";
    job.status = "cancelled";
    emit(job);
    if (wasQueued) {
      queue.splice(queue.indexOf(job), 1);
      return;
    }
    if (job.child) killFn(job.child.pid); // files are removed in finish() once it exits
  }

  // Delete only what this cancelled job wrote: each destination file itself, plus
  // <dest>.part / .ytdl / .part-FragN, and the converter's <name>.temp.<ext>.
  function removeLeftovers(job) {
    for (const dest of job.dests) {
      const dir = path.dirname(dest);
      const base = path.basename(dest);
      const ext = path.extname(base);
      const temp = `${base.slice(0, base.length - ext.length)}.temp${ext}`;
      let names = [];
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) {
        if (n === base || n === temp || n.startsWith(`${base}.`)) {
          try { fs.rmSync(path.join(dir, n), { force: true }); } catch {}
        }
      }
    }
  }

  const isKnownFile = (p) => typeof p === "string" && knownFiles.has(path.normalize(p).toLowerCase());

  return { getInfo, start, cancel, isKnownFile, on: (ev, cb) => events.on(ev, cb) };
}

module.exports = { createDownloader };
