// Remembers the save folder and the last-used format/quality in a small JSON file.
const fs = require("fs");
const path = require("path");

const defaults = (saveDir) => ({ saveDir, format: "mp4", quality: "720" });

function load(file, defaultSaveDir) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...defaults(defaultSaveDir), ...data };
  } catch {
    return defaults(defaultSaveDir);
  }
}

function save(file, partial, defaultSaveDir) {
  const merged = { ...load(file, defaultSaveDir), ...partial };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  return merged;
}

function ensureSaveDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { load, save, ensureSaveDir };
