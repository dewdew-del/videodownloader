const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanError } = require("../src/errors");

test("cleanError: site can't be parsed gives the friendly site message", () => {
  assert.equal(
    cleanError("ERROR: [facebook] 1: Cannot parse data; please report this issue"),
    "This site can't be read right now (it may have changed, or the video needs a login). Try another link, or update yt-dlp later."
  );
});

test("cleanError: private / login video gives the login message", () => {
  assert.equal(
    cleanError("ERROR: [youtube] x: Private video. Sign in if you've been granted access"),
    "This video needs a login or is private, so it can't be downloaded."
  );
});

test("cleanError: MP3 from a video with no audio track gives the no-sound message", () => {
  assert.equal(
    cleanError("ERROR: Postprocessing: WARNING: unable to obtain file audio codec with ffprobe"),
    "This video has no sound, so it can't be saved as MP3. Try MP4 instead."
  );
});

test("cleanError: empty stderr gives Download failed.", () => {
  assert.equal(cleanError(""), "Download failed.");
});

test("cleanError: other errors return the ERROR line without the prefix", () => {
  assert.equal(
    cleanError("WARNING: foo\nERROR: [twitter] 1: No video could be found in this tweet\n"),
    "[twitter] 1: No video could be found in this tweet"
  );
});
