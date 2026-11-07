// Kuha window logic. Talks to the back end only through window.kuha (preload.js).
const $ = (s) => document.querySelector(s);
let format = "mp4";
let mode = "single";
let singleInfo = null; // preview info for the link in the Single box
const cards = new Map(); // job id -> card element

// ---------- Start-up ----------
(async () => {
  const s = await kuha.getSettings();
  setFormat(s.format);
  $("#quality").value = s.quality;
  $("#saveDir").textContent = s.saveDir;
  const v = await kuha.getVersions();
  if (!v.ytdlp) showWarn("Kuha is damaged, please reinstall");
})().catch((e) => showWarn(e.message));

function showWarn(text) {
  $("#warn").hidden = false;
  $("#warn").textContent = text;
}

// ---------- Tabs ----------
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    mode = b.dataset.tab;
    document.querySelectorAll(".tabs button").forEach((x) => {
      x.classList.toggle("on", x === b);
      x.setAttribute("aria-selected", String(x === b));
    });
    $("#single").hidden = mode !== "single";
    $("#batch").hidden = mode !== "batch";
    updateButton();
  })
);

// ---------- Format / quality (remembered as the defaults) ----------
function setFormat(f) {
  format = f === "mp3" ? "mp3" : "mp4";
  document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x.dataset.fmt === format));
  $("#quality").disabled = format === "mp3";
}
document.querySelectorAll(".seg button").forEach((b) =>
  b.addEventListener("click", () => {
    setFormat(b.dataset.fmt);
    kuha.setSettings({ format });
  })
);
$("#quality").addEventListener("change", () => kuha.setSettings({ quality: $("#quality").value }));

// ---------- Save folder ----------
$("#changeFolder").addEventListener("click", chooseFolder);
async function chooseFolder() {
  const s = await kuha.chooseFolder();
  $("#saveDir").textContent = s.saveDir;
}

// ---------- Button state ----------
const isUrl = (s) => /^https?:\/\/\S+\.\S+/i.test(s);
function updateButton() {
  const go = $("#go");
  if (mode === "single") {
    go.textContent = "Download";
    go.disabled = !singleInfo;
  } else {
    const n = parseLinks($("#links").value).length;
    go.textContent = n > 1 ? `Download ${n} links` : "Download";
    go.disabled = n === 0;
  }
}
$("#links").addEventListener("input", updateButton);

// ---------- Single mode: live preview ----------
let previewTimer;
let previewSeq = 0;

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
  try {
    const info = await kuha.getInfo(url);
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
    setStatus("");
  } catch (e) {
    if (seq === previewSeq) setStatus(e.message, true);
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
  if (mode === "single") {
    if (!singleInfo) return;
    await startOne(singleInfo.url, quality, singleInfo);
    $("#link").value = "";
    singleInfo = null;
    $("#preview").hidden = true;
  } else {
    // The main process queues them and runs at most 3 at once.
    for (const url of parseLinks($("#links").value)) await startOne(url, quality);
    $("#links").value = "";
  }
  updateButton();
});

async function startOne(url, quality, known) {
  const li = card(url, known);
  try {
    const id = await kuha.download({ url, format, quality });
    li.dataset.id = id;
    cards.set(id, li);
    li.querySelector(".cancel").onclick = () => kuha.cancel(id);
    if (!known) fillInfo(li, url); // batch: fetch title/thumbnail alongside the download
  } catch (e) {
    fail(li, e.message);
    if (/Choose another one/.test(e.message)) chooseFolder();
  }
}

function card(url, info) {
  $("#listTitle").hidden = false;
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.fmt = format.toUpperCase();
  li.innerHTML = `<img alt="" /><div><div class="title"></div><div class="meta"></div><div class="bar"><div></div></div></div><div class="act"><button type="button" class="ghost small cancel">Cancel</button></div>`;
  li.querySelector(".title").textContent = (info && info.title) || url;
  if (info && info.thumbnail) li.querySelector("img").src = info.thumbnail;
  li.dataset.base = [li.dataset.fmt, info && info.site, info && fmtTime(info.duration)].filter(Boolean).join(" · ");
  li.querySelector(".meta").textContent = `${li.dataset.base} · waiting...`;
  $("#list").prepend(li);
  return li;
}

async function fillInfo(li, url) {
  try {
    const info = await kuha.getInfo(url);
    li.querySelector(".title").textContent = info.title || url;
    if (info.thumbnail) li.querySelector("img").src = info.thumbnail;
    li.dataset.base = [li.dataset.fmt, info.site, fmtTime(info.duration)].filter(Boolean).join(" · ");
  } catch {
    // The download itself reports any real error.
  }
}

function fail(li, msg) {
  li.classList.add("error");
  li.querySelector(".meta").textContent = msg;
  li.querySelector(".act").replaceChildren();
}

kuha.onProgress((j) => {
  const li = cards.get(j.id);
  if (!li) return;
  const meta = li.querySelector(".meta");
  const base = li.dataset.base;
  li.querySelector(".bar div").style.width = `${j.progress}%`;
  if (j.status === "queued") meta.textContent = `${base} · waiting...`;
  if (j.status === "downloading") meta.textContent = `${base} · ${j.progress.toFixed(0)}%`;
  if (j.status === "converting") meta.textContent = `${base} · converting...`;
  if (j.status === "error") fail(li, j.error);
  if (j.status === "cancelled") {
    li.classList.add("cancelled");
    meta.textContent = `${base} · cancelled`;
    li.querySelector(".act").replaceChildren();
  }
  if (j.status === "done") {
    li.classList.add("done");
    meta.textContent = `${base} · saved`;
    const open = button("Open", "ghost small ok", () => kuha.openFile(j.file));
    const folder = button("Show in folder", "ghost small", () => kuha.showInFolder(j.file));
    li.querySelector(".act").replaceChildren(open, folder);
  }
});

function button(text, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.addEventListener("click", () => onClick().catch((e) => alert(e.message)));
  return b;
}

// ---------- Settings ----------
$("#openSettings").addEventListener("click", async () => {
  const s = await kuha.getSettings();
  $("#defFormat").value = s.format;
  $("#defQuality").value = s.quality;
  $("#updateStatus").textContent = "";
  $("#settings").showModal();
  const v = await kuha.getVersions();
  $("#vApp").textContent = v.app;
  $("#vYtdlp").textContent = v.ytdlp || "missing";
});
$("#defFormat").addEventListener("change", () => {
  setFormat($("#defFormat").value);
  kuha.setSettings({ format });
});
$("#defQuality").addEventListener("change", () => {
  $("#quality").value = $("#defQuality").value;
  kuha.setSettings({ quality: $("#defQuality").value });
});
$("#updateYtdlp").addEventListener("click", async () => {
  $("#updateStatus").textContent = "Checking...";
  try {
    const r = await kuha.updateYtdlp();
    $("#updateStatus").textContent = r.updated ? "Up to date" : "Couldn't update (offline?)";
    const v = await kuha.getVersions();
    $("#vYtdlp").textContent = v.ytdlp || "missing";
  } catch (e) {
    $("#updateStatus").textContent = e.message;
  }
});

function fmtTime(s) {
  if (!s) return "";
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
}
