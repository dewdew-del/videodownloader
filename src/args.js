// Pure helpers for talking to yt-dlp: build its arguments and read its output.
const path = require("path");

function buildArgs({ url, format, quality, saveDir, ffmpegPath }) {
  const args = [
    "--no-playlist",
    "--newline",
    "--no-warnings",
    "--windows-filenames",
    "--encoding", "utf-8", // otherwise Windows prints paths in the console code page and emoji break

    "--print", "after_move:filepath",
    // --print implies --quiet; turn progress and "Destination:" lines back on.
    "--no-quiet", "--progress",
    "--ffmpeg-location", ffmpegPath,
    // The id keeps same-titled videos (e.g. "Video by user") from overwriting each other.
    "-o", path.join(saveDir, "%(title).150B [%(id)s].%(ext)s"),
  ];
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
  return args;
}

function parseProgress(line) {
  const m = /\[download\]\s+([\d.]+)%/.exec(line);
  return m ? parseFloat(m[1]) : null;
}

function isConverting(line) {
  return /\[(Merger|ExtractAudio|VideoRemuxer)\]/.test(line);
}

// yt-dlp prints the final path (from --print after_move:filepath) as its own line.
function parseFilepath(stdout) {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^[A-Za-z]:[\\/]/.test(lines[i]) || lines[i].startsWith("/")) return lines[i];
  }
  return null;
}

module.exports = { buildArgs, parseProgress, isConverting, parseFilepath };
