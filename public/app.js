const $ = (s) => document.querySelector(s);
let format = "mp4";
let mode = "single";
let singleInfo = null; // info for the link in the single box, once loaded

// ---------- Tabs ----------
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    mode = b.dataset.tab;
    document.querySelectorAll(".tabs button").forEach((x) => {
      x.classList.toggle("on", x === b);
      x.setAttribute("aria-selected", x === b);
    });
    $("#single").hidden = mode !== "single";
    $("#batch").hidden = mode !== "batch";
    updateButton();
  })
);

// ---------- Format toggle ----------
document.querySelectorAll(".seg button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".seg button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    format = b.dataset.fmt;
    $("#quality").disabled = format === "mp3";
  })
);

// ---------- Missing tools warning ----------
fetch("/api/status").then((r) => r.json()).then((s) => {
  const missing = [!s.ytdlp && "yt-dlp", !s.ffmpeg && "FFmpeg"].filter(Boolean);
  if (missing.length) {
    $("#warn").hidden = false;
    $("#warn").textContent = `Missing: ${missing.join(", ")}. Run setup.ps1 in the project folder, then restart the server.`;
  }
});

const isUrl = (s) => /^https?:\/\/\S+\.\S+/i.test(s);
const getLinks = () => [...new Set($("#links").value.split(/\s+/).map((s) => s.trim()).filter(isUrl))];

function updateButton() {
  const go = $("#go");
  if (mode === "single") {
    go.textContent = "Download";
    go.disabled = !singleInfo;
  } else {
    const n = getLinks().length;
    go.textContent = n > 1 ? `Download ${n} links` : "Download";
    go.disabled = n === 0;
  }
}
$("#links").addEventListener("input", updateButton);

// ---------- Single mode: live preview ----------
let previewTimer, previewSeq = 0;

function setStatus(text, isError) {
  const el = $("#pstatus");
  el.hidden = !text;
  el.textContent = text || "";
  el.classList.toggle("err", !!isError);
}

async function loadPreview() {
  const url = $("#link").value.trim();
  singleInfo = null;
  $("#preview").hidden = true;
  updateButton();
  if (!url) return setStatus("");
  if (!isUrl(url)) return setStatus("That doesn't look like a link.", true);

  const seq = ++previewSeq;
  setStatus("Loading preview...");
  $("#preview").classList.add("loading");
  try {
    const info = await post("/api/info", { url });
    if (seq !== previewSeq) return; // a newer link was pasted meanwhile
    singleInfo = { ...info, url };
    const p = $("#preview");
    p.querySelector("img").src = info.thumbnail || "";
    p.querySelector(".ptitle").textContent = info.title || url;
    p.querySelector(".pmeta").textContent = [info.site, info.uploader].filter(Boolean).join(" · ");
    const dur = p.querySelector(".dur");
    dur.textContent = fmtTime(info.duration);
    dur.hidden = !info.duration;
    p.hidden = false;
    p.classList.remove("loading");
    setStatus("");
  } catch (e) {
    if (seq !== previewSeq) return;
    setStatus(e.message, true);
  }
  updateButton();
}

$("#link").addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(loadPreview, 500);
});
$("#link").addEventListener("paste", () => {
  clearTimeout(previewTimer);
  setTimeout(loadPreview, 0);
});
$("#link").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && singleInfo) $("#go").click();
});
$("#paste").addEventListener("click", async () => {
  try {
    $("#link").value = (await navigator.clipboard.readText()).trim();
    loadPreview();
  } catch {
    $("#link").focus();
  }
});

// ---------- Download ----------
$("#go").addEventListener("click", async () => {
  const quality = $("#quality").value;
  $("#go").disabled = true;
  if (mode === "single") {
    if (!singleInfo) return;
    await handle(singleInfo.url, format, quality, singleInfo);
  } else {
    const queue = getLinks().map((url) => () => handle(url, format, quality));
    // Up to 3 downloads at the same time.
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) await queue.shift()();
    });
    await Promise.all(workers);
  }
  updateButton();
});

function card(url) {
  const li = document.createElement("li");
  li.className = "item";
  li.innerHTML = `<img alt="" /><div><div class="title"></div><div class="meta"></div><div class="bar"><div></div></div></div><span class="act"></span>`;
  li.querySelector(".title").textContent = url;
  li.querySelector(".meta").textContent = "Getting info...";
  $("#list").prepend(li);
  return li;
}

async function handle(url, fmt, quality, known) {
  const li = card(url);
  const meta = li.querySelector(".meta");
  const bar = li.querySelector(".bar div");
  const fail = (msg) => { li.classList.add("error"); meta.textContent = msg; };

  let info = known;
  if (!info) {
    try { info = await post("/api/info", { url }); }
    catch (e) { return fail(e.message); }
  }
  li.querySelector(".title").textContent = info.title || url;
  if (info.thumbnail) li.querySelector("img").src = info.thumbnail;
  const base = [fmt.toUpperCase(), info.site, fmtTime(info.duration)].filter(Boolean).join(" · ");
  meta.textContent = base;

  let id;
  try { ({ id } = await post("/api/jobs", { url, format: fmt, quality })); }
  catch (e) { return fail(e.message); }

  await new Promise((resolve) => {
    const es = new EventSource(`/api/jobs/${id}/events`);
    es.onmessage = (ev) => {
      const j = JSON.parse(ev.data);
      bar.style.width = j.progress + "%";
      if (j.status === "downloading") meta.textContent = `${base} · ${j.progress.toFixed(0)}%`;
      if (j.status === "converting") meta.textContent = `${base} · converting...`;
      if (j.status === "done") {
        li.classList.add("done");
        meta.textContent = `${base} · ready`;
        const a = document.createElement("a");
        a.className = "save"; a.href = `/api/jobs/${id}/file`; a.textContent = `Save ${fmt.toUpperCase()}`;
        li.querySelector(".act").append(a);
        a.click(); // start saving right away
        es.close(); resolve();
      }
      if (j.status === "error") { fail(j.error); es.close(); resolve(); }
    };
    es.onerror = () => { es.close(); resolve(); };
  });
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

function fmtTime(s) {
  if (!s) return "";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
}
