const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { buildArgs, parseProgress, isConverting, parseFilepath } = require("../src/args");

const base = { url: "https://example.com/v", saveDir: "C:\\Users\\a\\Downloads\\Kuha", ffmpegPath: "C:\\tools\\ffmpeg.exe" };
const formatOf = (args) => args[args.indexOf("-f") + 1];

test("buildArgs mp3: extracts audio as mp3, no merge", () => {
  const a = buildArgs({ ...base, format: "mp3", quality: "720" });
  assert.ok(a.includes("-x"));
  const i = a.indexOf("--audio-format");
  assert.equal(a[i + 1], "mp3");
  assert.ok(!a.includes("--merge-output-format"));
  assert.ok(!a.includes("-f"));
});

test("buildArgs mp4 720: exact format string with height cap", () => {
  const a = buildArgs({ ...base, format: "mp4", quality: "720" });
  assert.equal(
    formatOf(a),
    "bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=720]+ba/b[height<=720]/b"
  );
  assert.equal(a[a.indexOf("--merge-output-format") + 1], "mp4");
  assert.equal(a[a.indexOf("--remux-video") + 1], "mp4");
});

test("buildArgs mp4 best: no height cap", () => {
  const a = buildArgs({ ...base, format: "mp4", quality: "best" });
  assert.ok(!formatOf(a).includes("height<="));
  assert.equal(formatOf(a), "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*+ba/b/b");
});

test("buildArgs always: common flags, output template, url last", () => {
  for (const format of ["mp4", "mp3"]) {
    const a = buildArgs({ ...base, format, quality: "360" });
    for (const f of ["--no-playlist", "--newline", "--no-warnings", "--windows-filenames"]) assert.ok(a.includes(f), f);
    // Without this, yt-dlp prints paths in the Windows console code page and emoji titles get mangled.
    assert.equal(a[a.indexOf("--encoding") + 1], "utf-8");
    assert.equal(a[a.indexOf("--print") + 1], "after_move:filepath");
    assert.equal(a[a.indexOf("--ffmpeg-location") + 1], base.ffmpegPath);
    assert.equal(a[a.indexOf("-o") + 1], path.join(base.saveDir, "%(title).150B.%(ext)s"));
    assert.equal(a[a.length - 1], base.url);
  }
});

test("parseProgress reads the percent from a download line", () => {
  assert.equal(parseProgress("[download]  42.5% of 3.1MiB at 1MiB/s"), 42.5);
  assert.equal(parseProgress("[info] x"), null);
});

test("isConverting detects merger / audio / remux steps", () => {
  assert.equal(isConverting("[Merger] Merging formats into \"a.mp4\""), true);
  assert.equal(isConverting("[ExtractAudio] Destination: a.mp3"), true);
  assert.equal(isConverting("[VideoRemuxer] Not remuxing"), true);
  assert.equal(isConverting("[download] 10%"), false);
});

test("parseFilepath returns the last absolute path line", () => {
  assert.equal(
    parseFilepath("[download] 100%\nC:\\Users\\a\\Downloads\\Kuha\\x.mp4\n"),
    "C:\\Users\\a\\Downloads\\Kuha\\x.mp4"
  );
  assert.equal(parseFilepath("[download] 100%\n"), null);
});
