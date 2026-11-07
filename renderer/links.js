// Turns the Batch textarea into a clean list of links: http(s) only, no duplicates, same order.
function parseLinks(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(/\s+/)) {
    if (/^https?:\/\/\S+\.\S+/i.test(part) && !seen.has(part)) {
      seen.add(part);
      out.push(part);
    }
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { parseLinks };
