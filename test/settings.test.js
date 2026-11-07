const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const settings = require("../src/settings");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "kuha-settings-"));
const DEF_DIR = "C:\\Users\\a\\Downloads\\Kuha";

test("load on a missing file returns the defaults", () => {
  const file = path.join(tmp(), "settings.json");
  assert.deepEqual(settings.load(file, DEF_DIR), { saveDir: DEF_DIR, format: "mp4", quality: "720" });
});

test("save then load round-trips a change and keeps other defaults", () => {
  const file = path.join(tmp(), "settings.json");
  const merged = settings.save(file, { quality: "1080" }, DEF_DIR);
  assert.deepEqual(merged, { saveDir: DEF_DIR, format: "mp4", quality: "1080" });
  assert.deepEqual(settings.load(file, DEF_DIR), merged);
});

test("load on corrupt JSON returns the defaults instead of throwing", () => {
  const file = path.join(tmp(), "settings.json");
  fs.writeFileSync(file, "{not json");
  assert.deepEqual(settings.load(file, DEF_DIR), { saveDir: DEF_DIR, format: "mp4", quality: "720" });
});

test("ensureSaveDir recreates a deleted folder", () => {
  const dir = path.join(tmp(), "Kuha");
  fs.mkdirSync(dir);
  fs.rmSync(dir, { recursive: true });
  assert.equal(settings.ensureSaveDir(dir), dir);
  assert.ok(fs.statSync(dir).isDirectory());
});
