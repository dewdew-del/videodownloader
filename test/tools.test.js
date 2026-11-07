const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const tools = require("../src/tools");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "kuha-tools-"));

// Fake child process: emits the given stdout, then exits with `code`.
function fakeSpawn(code, stdout = "") {
  const calls = [];
  const fn = (cmd, args) => {
    calls.push({ cmd, args });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      child.emit("close", code);
    });
    return child;
  };
  fn.calls = calls;
  return fn;
}

function fakeResources() {
  const res = tmp();
  fs.writeFileSync(path.join(res, "yt-dlp.exe"), "YTDLP-V1");
  fs.writeFileSync(path.join(res, "ffmpeg.exe"), "FFMPEG");
  return res;
}

test("updateYtdlp resolves {updated:false} when the update exits non-zero (offline)", async () => {
  const r = await tools.updateYtdlp("C:\\x\\yt-dlp.exe", fakeSpawn(1));
  assert.equal(r.updated, false);
});

test("updateYtdlp runs yt-dlp -U and reports updated on exit 0", async () => {
  const spawn = fakeSpawn(0, "Updated yt-dlp to stable@2026.11.01\n");
  const r = await tools.updateYtdlp("C:\\x\\yt-dlp.exe", spawn);
  assert.deepEqual(spawn.calls[0], { cmd: "C:\\x\\yt-dlp.exe", args: ["-U"] });
  assert.equal(r.updated, true);
});

test("getVersion returns the trimmed version, or null on failure", async () => {
  assert.equal(await tools.getVersion("y", fakeSpawn(0, "2026.11.01\n")), "2026.11.01");
  assert.equal(await tools.getVersion("y", fakeSpawn(1)), null);
});

test("init copies yt-dlp into userData/bin exactly once and uses ffmpeg from resources", () => {
  const res = fakeResources();
  const user = tmp();
  const first = tools.init({ resourcesPath: res, userDataPath: user });
  assert.equal(first.ytdlp, path.join(user, "bin", "yt-dlp.exe"));
  assert.equal(first.ffmpeg, path.join(res, "ffmpeg.exe"));
  assert.equal(fs.readFileSync(first.ytdlp, "utf8"), "YTDLP-V1");

  // A self-updated copy must not be overwritten by the bundled one on the next launch.
  fs.writeFileSync(first.ytdlp, "YTDLP-UPDATED");
  tools.init({ resourcesPath: res, userDataPath: user });
  assert.equal(fs.readFileSync(first.ytdlp, "utf8"), "YTDLP-UPDATED");
});

test("init reports null paths when bundled tools are missing", () => {
  const r = tools.init({ resourcesPath: tmp(), userDataPath: tmp() });
  assert.equal(r.ytdlp, null);
  assert.equal(r.ffmpeg, null);
});
