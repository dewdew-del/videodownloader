const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { createDownloader } = require("../src/downloader");

// A fake spawn whose children the test drives by hand.
function controlledSpawn() {
  const children = [];
  let nextPid = 100;
  const fn = (cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = nextPid++;
    child.args = args;
    child.out = (s) => child.stdout.emit("data", Buffer.from(s));
    child.err = (s) => child.stderr.emit("data", Buffer.from(s));
    child.exit = (code) => child.emit("close", code);
    children.push(child);
    return child;
  };
  fn.children = children;
  return fn;
}

function setup(opts = {}) {
  const spawnFn = controlledSpawn();
  const kills = [];
  const saveDir = opts.saveDir || fs.mkdtempSync(path.join(os.tmpdir(), "kuha-dl-"));
  const d = createDownloader({
    ytdlp: "yt-dlp.exe",
    ffmpeg: "ffmpeg.exe",
    getSaveDir: () => saveDir,
    spawnFn,
    killFn: (pid) => kills.push(pid),
    concurrency: 3,
  });
  const events = [];
  d.on("progress", (e) => events.push({ ...e }));
  return { d, spawnFn, kills, events, saveDir };
}

const last = (events, id) => events.filter((e) => e.id === id).pop();

test("download line emits downloading with the percent", () => {
  const { d, spawnFn, events } = setup();
  const id = d.start({ url: "https://x/v", format: "mp4", quality: "720" });
  spawnFn.children[0].out("[download]  50.0% of 1MiB\n");
  assert.deepEqual(
    { status: last(events, id).status, progress: last(events, id).progress },
    { status: "downloading", progress: 50 }
  );
});

test("ExtractAudio line emits converting", () => {
  const { d, spawnFn, events } = setup();
  const id = d.start({ url: "https://x/v", format: "mp3", quality: "best" });
  spawnFn.children[0].out("[ExtractAudio] Destination: a.mp3\n");
  assert.equal(last(events, id).status, "converting");
});

test("exit 0 emits done with the printed file path, which becomes a known file", () => {
  const { d, spawnFn, events } = setup();
  const id = d.start({ url: "https://x/v", format: "mp3", quality: "best" });
  spawnFn.children[0].out("[download] 100%\nC:\\x\\a.mp3\n");
  spawnFn.children[0].exit(0);
  const e = last(events, id);
  assert.equal(e.status, "done");
  assert.equal(e.file, "C:\\x\\a.mp3");
  assert.equal(e.progress, 100);
  assert.equal(d.isKnownFile("C:\\x\\a.mp3"), true);
});

test("emoji file path survives being split across stdout chunks", () => {
  const { d, spawnFn, events } = setup();
  const id = d.start({ url: "https://x/v", format: "mp4", quality: "720" });
  const bytes = Buffer.from("C:\\x\\Scramble I’ll guess 😍❤️.mp4\n", "utf8");
  const cut = bytes.indexOf(Buffer.from("😍", "utf8")) + 2; // split inside the emoji
  spawnFn.children[0].stdout.emit("data", bytes.subarray(0, cut));
  spawnFn.children[0].stdout.emit("data", bytes.subarray(cut));
  spawnFn.children[0].exit(0);
  assert.equal(last(events, id).file, "C:\\x\\Scramble I’ll guess 😍❤️.mp4");
});

test("non-zero exit emits error with the friendly message", () => {
  const { d, spawnFn, events } = setup();
  const id = d.start({ url: "https://x/v", format: "mp4", quality: "720" });
  spawnFn.children[0].err("ERROR: [youtube] x: Private video\n");
  spawnFn.children[0].exit(1);
  const e = last(events, id);
  assert.equal(e.status, "error");
  assert.equal(e.error, "This video needs a login or is private, so it can't be downloaded.");
});

test("only 3 run at once; the 4th starts when one finishes", () => {
  const { d, spawnFn, events } = setup();
  const ids = [1, 2, 3, 4].map((n) => d.start({ url: `https://x/${n}`, format: "mp4", quality: "720" }));
  assert.equal(spawnFn.children.length, 3);
  assert.equal(last(events, ids[3]).status, "queued");
  spawnFn.children[0].out("C:\\x\\1.mp4\n");
  spawnFn.children[0].exit(0);
  assert.equal(spawnFn.children.length, 4);
  assert.equal(spawnFn.children[3].args[spawnFn.children[3].args.length - 1], "https://x/4");
});

test("cancel kills the process tree, emits cancelled, and the later exit is not an error", () => {
  const { d, spawnFn, kills, events } = setup();
  const id = d.start({ url: "https://x/v", format: "mp4", quality: "720" });
  d.cancel(id);
  assert.deepEqual(kills, [spawnFn.children[0].pid]);
  spawnFn.children[0].exit(1);
  assert.equal(last(events, id).status, "cancelled");
});

test("cancel removes this job's .part/.ytdl/fragment files, not other downloads' files", async () => {
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuha-dl-"));
  const { d, spawnFn } = setup({ saveDir });
  const id = d.start({ url: "https://x/v", format: "mp4", quality: "720" });
  d.start({ url: "https://x/other", format: "mp4", quality: "720" });
  const mine = path.join(saveDir, "Mine.f137.mp4");
  spawnFn.children[0].out(`[download] Destination: ${mine}\n`);
  spawnFn.children[1].out(`[download] Destination: ${path.join(saveDir, "Other.mp4")}\n`);
  for (const f of ["Mine.f137.mp4.part", "Mine.f137.mp4.ytdl", "Mine.f137.mp4.part-Frag3", "Other.mp4.part", "done.mp4"]) {
    fs.writeFileSync(path.join(saveDir, f), "x");
  }
  await d.cancel(id);
  spawnFn.children[0].exit(1); // the process is gone only now; files are unlocked
  assert.deepEqual(fs.readdirSync(saveDir).sort(), ["Other.mp4.part", "done.mp4"]);
});

test("cancel while converting removes the downloaded source and the half-written output", async () => {
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuha-dl-"));
  const { d, spawnFn } = setup({ saveDir });
  const id = d.start({ url: "https://x/v", format: "mp3", quality: "best" });
  const src = path.join(saveDir, "Song.webm");
  const mp3 = path.join(saveDir, "Song.mp3");
  spawnFn.children[0].out(`[download] Destination: ${src}\n[download] 100%\n[ExtractAudio] Destination: ${mp3}\n`);
  for (const f of ["Song.webm", "Song.mp3", "Song.temp.mp3", "Keep.mp3"]) fs.writeFileSync(path.join(saveDir, f), "x");
  await d.cancel(id);
  assert.ok(fs.existsSync(mp3), "files stay until the process has exited");
  spawnFn.children[0].exit(1);
  assert.deepEqual(fs.readdirSync(saveDir), ["Keep.mp3"]);
});

test("cancelling a queued job removes it without spawning", () => {
  const { d, spawnFn, events } = setup();
  const ids = [1, 2, 3, 4].map((n) => d.start({ url: `https://x/${n}`, format: "mp4", quality: "720" }));
  d.cancel(ids[3]);
  assert.equal(last(events, ids[3]).status, "cancelled");
  spawnFn.children[0].exit(0);
  assert.equal(spawnFn.children.length, 3);
});

test("starting the same link + format while it is still running is refused", () => {
  const { d, spawnFn } = setup();
  d.start({ url: "https://x/v", format: "mp4", quality: "720" });
  assert.throws(() => d.start({ url: "https://x/v", format: "mp4", quality: "1080" }), /already downloading/i);
  d.start({ url: "https://x/v", format: "mp3", quality: "best" }); // a different format is fine
  spawnFn.children[0].out("C:\\x\\v.mp4\n");
  spawnFn.children[0].exit(0);
  d.start({ url: "https://x/v", format: "mp4", quality: "720" }); // allowed again once finished
});

test("getInfo runs at most 3 lookups at once; the rest wait", async () => {
  const { d, spawnFn } = setup();
  const ps = [1, 2, 3, 4, 5].map((n) => d.getInfo(`https://x/${n}`));
  assert.equal(spawnFn.children.length, 3);
  spawnFn.children[0].out(JSON.stringify({ title: "one" }));
  spawnFn.children[0].exit(0);
  assert.equal((await ps[0]).title, "one");
  assert.equal(spawnFn.children.length, 4);
  assert.equal(spawnFn.children[3].args[spawnFn.children[3].args.length - 1], "https://x/4");
});

test("isKnownFile is false for files Kuha didn't download", () => {
  const { d } = setup();
  assert.equal(d.isKnownFile("C:\\Windows\\notepad.exe"), false);
});

test("getInfo parses yt-dlp -J output", async () => {
  const { d, spawnFn } = setup();
  const p = d.getInfo("https://x/v");
  const c = spawnFn.children[0];
  assert.deepEqual(c.args.slice(0, 3), ["-J", "--no-playlist", "--no-warnings"]);
  c.out(JSON.stringify({ title: "T", thumbnail: "https://i/t.jpg", duration: 19, extractor_key: "Youtube", uploader: "u" }));
  c.exit(0);
  assert.deepEqual(await p, { title: "T", thumbnail: "https://i/t.jpg", duration: 19, site: "Youtube", uploader: "u" });
});

test("getInfo rejects with the friendly error", async () => {
  const { d, spawnFn } = setup();
  const p = d.getInfo("https://x/v");
  spawnFn.children[0].err("ERROR: [facebook] 1: Cannot parse data");
  spawnFn.children[0].exit(1);
  await assert.rejects(p, /This site can't be read right now/);
});
