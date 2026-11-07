// Turns yt-dlp's stderr into a short message a normal person can read.
const SITE_MSG =
  "This site can't be read right now (it may have changed, or the video needs a login). Try another link, or update yt-dlp later.";
const LOGIN_MSG = "This video needs a login or is private, so it can't be downloaded.";

const NO_SOUND_MSG = "This video has no sound, so it can't be saved as MP3. Try MP4 instead.";

function cleanError(text = "") {
  if (/unable to obtain file audio codec/i.test(text)) return NO_SOUND_MSG;
  if (/Cannot parse data|Unsupported URL/i.test(text)) return SITE_MSG;
  if (/login|sign in|private|cookies/i.test(text)) return LOGIN_MSG;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const line = lines.find((l) => l.includes("ERROR")) || lines.pop() || "";
  return line.replace(/^ERROR:\s*/, "").slice(0, 300) || "Download failed.";
}

module.exports = { cleanError };
