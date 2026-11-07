const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLinks } = require("../renderer/links");

test("parseLinks keeps http(s) links in order, drops junk and duplicates", () => {
  assert.deepEqual(parseLinks("https://a.com/1\nhttps://a.com/1 junk https://b.com"), ["https://a.com/1", "https://b.com"]);
});

test("parseLinks handles blank input and Windows line endings", () => {
  assert.deepEqual(parseLinks(""), []);
  assert.deepEqual(parseLinks("http://a.com/x\r\n\r\nhttps://c.com/y\r\n"), ["http://a.com/x", "https://c.com/y"]);
});
