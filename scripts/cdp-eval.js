// Dev check helper: starts Kuha with remote debugging, runs a JS expression inside the
// window (where window.kuha lives), prints the result as JSON, then closes the app.
// Usage: node scripts/cdp-eval.js "await kuha.getVersions()"
const { spawn } = require("child_process");
const path = require("path");

const expr = process.argv[2];
const PORT = 9333;
const electron = require("electron"); // path to electron.exe when required from Node
const app = spawn(electron, [path.join(__dirname, ".."), `--remote-debugging-port=${PORT}`], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((t) => t.type === "page");
    } catch {}
  }
  if (!page) throw new Error("Kuha window not found");
  await sleep(1500); // let the page finish loading
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const result = await new Promise((resolve) => {
    ws.addEventListener("message", (m) => {
      const d = JSON.parse(m.data);
      if (d.id === 1) resolve(d.result);
    });
    ws.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: `(async () => { try { return {ok:true, value: await (async () => (${expr}))()} } catch (e) { return {ok:false, error: e.message} } })()`, awaitPromise: true, returnByValue: true },
    }));
  });
  console.log(JSON.stringify(result.result.value, null, 2));
  ws.close();
})()
  .catch((e) => console.error("cdp-eval:", e.message))
  .finally(() => app.kill());
