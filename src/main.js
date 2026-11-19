const { invoke } = window.__TAURI__.core;
const log = (line) => invoke("log", { line: String(line) }).catch(() => {});
addEventListener("error", (e) => log(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => log(`rejection: ${e.reason && (e.reason.stack || e.reason)}`));
const $ = (id) => document.getElementById(id);
const island = $("island");

// [width, height, radius] per view
const SIZES = {
  idle: [120, 28, 14],
  "mini-music": [180, 32, 16],
  "mini-stopwatch": [160, 32, 16],
  "mini-timer": [160, 32, 16],
  "timer-live": [270, 46, 23],
  "pop-done": [230, 44, 22],
  "pop-charge": [250, 40, 20],
  "pop-bt": [310, 58, 29],
  hub: [340, 176, 30],
  music: [344, 168, 30],
  calendar: [366, 272, 28],
  weather: [410, 160, 30],
  stopwatch: [370, 116, 34],
  notes: [310, 200, 24],
  wifi: [300, 228, 24],
  bluetooth: [300, 210, 24],
  volume: [290, 54, 27],
};
const COMPACT = new Set(["idle", "mini-music", "mini-stopwatch", "mini-timer", "pop-charge", "pop-bt", "pop-done"]);

const state = {
  view: "idle",
  media: null,
  battery: null,
  volume: null,
  radios: {},
  wifiCurrent: null,
  bt: null,
  popup: null,
  popupTimer: 0,
};

Icons.apply();
let settings = Settings.load();

// ---------- Views & hit area ----------

/** [width, height, radius] for a view, after the user's settings. */
function sizeOf(name) {
  let [w, h, r] = SIZES[name];
  if (name === "hub") {
    const rows = Math.max(1, Math.ceil(visibleTiles().length / 4));
    h = 52 + rows * 58;
  }
  // Timer mode shows the preset row while not yet started.
  if (name === "stopwatch" && swMode === "timer" && !tm.active) h += 34;
  return [w, h, Math.round(r * settings.radius)];
}

function setView(name) {
  if (!SIZES[name]) return;
  const [w, h, r] = sizeOf(name);
  const [pw, ph] = sizeOf(state.view);
  state.view = name;
  island.dataset.view = name;
  island.style.width = w + "px";
  island.style.height = h + "px";
  island.style.borderRadius = r + "px";
  document.documentElement.style.setProperty("--iw", w + "px");
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.name === name));
  $("back").classList.toggle("show", hasBack());
  updateBubble();
  // While animating, accept clicks over whichever box is larger.
  setHit(Math.max(w, pw), Math.max(h, ph));
  clearTimeout(setView.settle);
  setView.settle = setTimeout(() => setHit(w, h), settings.anim ? 600 * settings.speed : 20);
  onEnter(name);
}

/** Sub-pages get the back square; the compact island, control center and timer pill don't. */
const hasBack = () => !COMPACT.has(state.view) && state.view !== "hub" && state.view !== "timer-live";
const BACK_SPAN = 32; // the back square, flush against the island's left edge
const BUBBLE_SPAN = 38; // the split-off bubble (32) and its gap (6)

/**
 * Two activities at once (a timer or stopwatch running while music plays): the timer
 * keeps the island and the music splits off into a round bubble beside it.
 */
function updateBubble() {
  const hasMusic = !!(state.media && state.media.title);
  const show = hasMusic && (state.view === "mini-timer" || state.view === "mini-stopwatch");
  const bubble = $("bubble");
  bubble.classList.toggle("show", show);
  bubble.classList.add("music");
  bubble.classList.remove("timer");
  const cover = (state.media && state.media.cover) || "";
  if ($("bubble-cover").getAttribute("src") !== cover) $("bubble-cover").setAttribute("src", cover);
  return show;
}

function setHit(w, h) {
  const z = settings.scale;
  const compact = COMPACT.has(state.view);
  const left = hasBack() ? BACK_SPAN : 0;
  const right = $("bubble").classList.contains("show") ? BUBBLE_SPAN : 0;
  // The hit box widens to take in the back square (left) and the bubble (right).
  invoke("set_hit", {
    x: (innerWidth - w * z) / 2 - left,
    y: settings.top,
    w: w * z + left + right,
    h: h * z,
    compact,
  }).catch(() => {});
}

$("back").addEventListener("click", () => setView("hub"));
$("bubble").addEventListener("click", () => setView("music"));

// Over an app window the compact island steps aside while the pointer is on it.
window.__TAURI__.event.listen("island-peek", (e) => {
  document.body.classList.toggle("peek", !!e.payload);
});

function compactView() {
  if (state.popup) return state.popup;
  if (tm.active) return "mini-timer";
  if (sw.running) return "mini-stopwatch";
  if (state.media && state.media.title) return "mini-music";
  return "idle";
}

function collapse() {
  setView(compactView());
}

function refreshCompact() {
  if (COMPACT.has(state.view) && state.view !== compactView()) collapse();
  else if (COMPACT.has(state.view)) {
    const was = $("bubble").classList.contains("show");
    if (updateBubble() !== was) setHit(...sizeOf(state.view));
  }
}

function onEnter(name) {
  if (name === "hub") renderHub();
  if (name === "calendar") Cal.render();
  if (name === "weather") loadWeather();
  if (name === "wifi") Wifi.scan();
  if (name === "bluetooth") Bt.load();
  if (name === "volume") renderVolume();
  if (name === "notes") setTimeout(() => $("note").focus(), 350);
}

/** Left click on the compact island opens what it is showing; right click opens the control center. */
function openFromCompact() {
  // Clicking a popup dismisses it early and goes back to what was open.
  if (state.popup) return endPopup();
  if (state.view === "mini-timer") return setView("timer-live");
  if (state.view === "mini-stopwatch") return setView("stopwatch");
  if (state.media && state.media.title) return setView("music");
  setView("hub");
}

island.addEventListener("click", () => {
  if (COMPACT.has(state.view)) openFromCompact();
});

// Hover mode: open on enter, close a moment after the pointer leaves.
let leaveTimer = 0;
island.addEventListener("mouseenter", () => {
  clearTimeout(leaveTimer);
  if (settings.openOn === "hover" && COMPACT.has(state.view)) openFromCompact();
});
island.addEventListener("mouseleave", () => {
  if (settings.openOn !== "hover" || COMPACT.has(state.view)) return;
  leaveTimer = setTimeout(() => {
    if (!document.activeElement || !document.activeElement.matches("input, textarea")) collapse();
  }, 500);
});

document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.go)));
Icons.apply();

// Right click: control center from anywhere; again on it closes. Esc steps back.
addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (state.view === "hub") collapse();
  else setView("hub");
});
addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || COMPACT.has(state.view)) return;
  if (state.view === "hub" || state.view === "music" || state.view === "timer-live") collapse();
  else setView("hub");
});
// A Windows permission prompt (location for weather / Wi-Fi) takes focus: don't
// treat that as "clicked elsewhere" while one may be showing.
let blurHoldUntil = 0;
const holdBlur = (ms = 15000) => { blurHoldUntil = Date.now() + ms; };
addEventListener("blur", () => {
  if (Date.now() < blurHoldUntil) return;
  if (!COMPACT.has(state.view)) collapse();
});

// ---------- Popups ----------

/**
 * Show a popup over whatever is open, then go back to it: an expanded page is
 * restored as it was, a compact island returns to its current compact state.
 */
function popup(name, ms = settings.popSeconds * 1000) {
  log(`popup ${name} (from ${state.view})`);
  if (name === "pop-charge" && !settings.popCharge) return;
  if (name === "pop-bt" && !settings.popBt) return;
  if (!state.popup) state.returnTo = state.view;
  state.popup = name;
  clearTimeout(state.popupTimer);
  state.popupTimer = setTimeout(endPopup, ms);
  setView(name);
}

function endPopup() {
  clearTimeout(state.popupTimer);
  const back = state.returnTo;
  state.popup = null;
  state.returnTo = null;
  island.classList.remove("shake");
  if (back && !COMPACT.has(back)) setView(back);
  else collapse();
}

// ---------- Helpers ----------

const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const WD_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtDuration = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

function setIcon(el, name) {
  el.dataset.icon = name;
  Icons.apply(el.parentElement);
}

function paintBattery(el, pct, charging) {
  el.querySelector("b").style.width = `calc(${pct ?? 0}% - 2px)`;
  el.classList.toggle("charging", !!charging);
  el.classList.toggle("low", pct != null && pct <= 20 && !charging);
}

// ---------- Control center ----------

const TILE_DEF = {
  weather: { icon: "weather", open: "weather" },
  calendar: { id: "tile-calendar", open: "calendar" },
  stopwatch: { icon: "stopwatch", open: "stopwatch" },
  notes: { icon: "notebook", open: "notes" },
  wifi: { id: "tile-wifi", icon: "wifi", open: "wifi", radio: "wifi" },
  bluetooth: { id: "tile-bt", icon: "bluetooth", open: "bluetooth", radio: "bluetooth" },
  airplane: { id: "tile-plane", icon: "plane" },
  volume: { id: "tile-volume", icon: "volume", open: "volume" },
};

const visibleTiles = () => settings.tiles.filter((t) => !settings.hidden.includes(t));

function buildTiles() {
  const box = $("tiles");
  box.innerHTML = visibleTiles().map((t, i) => {
    const d = TILE_DEF[t];
    return `<button class="tile" style="--i:${i}" data-tile="${t}"><span class="ic lg" ${d.id ? `id="${d.id}"` : ""} ${d.icon ? `data-icon="${d.icon}"` : ""}></span></button>`;
  }).join("");
  Icons.apply(box);
  box.querySelectorAll(".tile").forEach((b) => {
    const d = TILE_DEF[b.dataset.tile];
    b.addEventListener("click", () => (d.open ? setView(d.open) : toggleAirplane()));
    // Right-click a Wi-Fi/Bluetooth tile to switch it without opening the list.
    if (d.radio) {
      b.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleRadio(d.radio);
      });
    }
  });
}

const tileOn = (id, on) => { const el = $(id); if (el) el.parentElement.classList.toggle("on", on); };

function renderHub() {
  const now = new Date();
  $("hub-time").textContent = fmtTime(now);
  $("hub-date").textContent = `${WD_SHORT[now.getDay()]} ${now.getDate()} Thg ${now.getMonth() + 1}`;
  if ($("tile-calendar")) $("tile-calendar").innerHTML = Icons.calendarIcon(now.getDate());
  const b = state.battery;
  $("hub-pct").textContent = b && b.percent != null ? `${b.percent}%` : "";
  $("hub-bat").style.display = b && b.percent != null ? "" : "none";
  if (b) paintBattery($("hub-bat"), b.percent, b.charging);
  $("hub-bt").classList.toggle("off", !state.radios.bluetooth);
  $("hub-wifi").classList.toggle("off", !state.wifiCurrent);
  tileOn("tile-wifi", !!state.radios.wifi);
  tileOn("tile-bt", !!state.radios.bluetooth);
  tileOn("tile-plane", !!state.radios.airplane);
  if ($("tile-volume")) setIcon($("tile-volume"), state.volume && state.volume.muted ? "volume-mute" : "volume");
}

async function toggleAirplane() {
  const on = !state.radios.airplane;
  state.radios.airplane = on;
  renderHub();
  try { await invoke("set_airplane", { on }); } catch {}
  setTimeout(pollRadios, 800);
}

async function toggleRadio(kind) {
  const on = !state.radios[kind];
  state.radios[kind] = on;
  renderHub();
  renderSwitches();
  try { await invoke("set_radio", { kind, on }); } catch {}
  setTimeout(pollRadios, 800);
}

function renderSwitches() {
  $("wifi-switch").classList.toggle("on", !!state.radios.wifi);
  $("bt-switch").classList.toggle("on", !!state.radios.bluetooth);
}

$("wifi-switch").addEventListener("click", async () => {
  await toggleRadio("wifi");
  setTimeout(() => Wifi.scan(), 1500);
});
$("bt-switch").addEventListener("click", async () => {
  await toggleRadio("bluetooth");
  setTimeout(() => Bt.load(), 1500);
});

// ---------- Music ----------

let lastMediaAt = 0;

function renderMedia() {
  const m = state.media;
  if (!m || !m.title) return;
  const pos = m.playing ? m.position + (Date.now() - lastMediaAt) / 1000 : m.position;
  $("m-title").textContent = m.title;
  $("m-artist").textContent = m.artist || "";
  $("m-pos").textContent = fmtDuration(pos);
  $("m-left").textContent = "-" + fmtDuration(m.duration - pos);
  $("m-fill").style.width = m.duration ? `${Math.min(100, (pos / m.duration) * 100)}%` : "0";
  setIcon($("m-play"), m.playing ? "pause" : "play");
  $("m-prev").classList.toggle("off", !m.can_prev && !m.can_next);
  $("m-next").classList.toggle("off", !m.can_next);
  document.querySelectorAll(".music-controls .seek").forEach((b) => b.classList.toggle("off", !m.can_seek));
  for (const id of ["m-wave", "mini-wave"]) $(id).classList.toggle("paused", !m.playing);
  // A new track whose artwork hasn't arrived yet shows an empty cover, not the old one.
  const cover = m.cover || "";
  if ($("m-cover").getAttribute("src") !== cover) {
    $("m-cover").setAttribute("src", cover);
    $("mini-cover").setAttribute("src", cover);
    if (cover) tintFromCover(cover);
    else island.style.setProperty("--wave", "#ffffff");
  }
}

/**
 * Colour the wave after the cover's most prominent vivid colour (as in the sample):
 * pixels are grouped by hue, weighted by how saturated and bright they are, and the
 * strongest group wins. Greyish covers fall back to white.
 */
function tintFromCover(src) {
  const img = new Image();
  img.onload = () => {
    const N = 32;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);
    const px = ctx.getImageData(0, 0, N, N).data;
    const bins = Array.from({ length: 24 }, () => ({ w: 0, h: 0, s: 0 }));
    for (let i = 0; i < px.length; i += 4) {
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      if (s < 0.25 || l < 0.12 || l > 0.92) continue;
      const w = s * (1 - Math.abs(l - 0.55));
      const bin = bins[Math.floor(h * 24) % 24];
      bin.w += w;
      bin.h += h * w;
      bin.s += s * w;
    }
    const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
    const color = best.w < 2
      ? "#ffffff"
      : `hsl(${Math.round((best.h / best.w) * 360)}, ${Math.round(Math.min(0.9, Math.max(0.55, best.s / best.w)) * 100)}%, 64%)`;
    island.style.setProperty("--wave", color);
  };
  img.src = src;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

// Live wave: five frequency bands of what is playing (bass, low-mid, mid, high-mid, treble).
// Bass sits in the middle bar, the higher bands spread outwards.
const audio = { bars: [0, 0, 0, 0, 0], target: [0, 0, 0, 0, 0], at: 0 };
const BAND_FOR_BAR = [3, 1, 0, 2, 4];
window.__TAURI__.event.listen("audio-bands", (e) => {
  BAND_FOR_BAR.forEach((band, bar) => { audio.target[bar] = e.payload[band] || 0; });
  audio.at = performance.now();
});

function drawWave(now) {
  const live = state.media && state.media.playing && now - audio.at < 400;
  // Snap up on a beat, fall back more slowly, like a VU meter.
  audio.bars = audio.bars.map((v, i) => {
    const t = audio.target[i];
    return t > v ? v + (t - v) * 0.6 : v + (t - v) * 0.18;
  });
  for (const id of ["m-wave", "mini-wave"]) {
    const wave = $(id);
    wave.classList.toggle("live", live);
    if (!live) {
      // Hand the bars back to the CSS loop / paused state.
      for (const bar of wave.children) bar.style.height = "";
      continue;
    }
    const max = wave.clientHeight || 18;
    [...wave.children].forEach((bar, i) => {
      bar.style.height = `${(3 + audio.bars[i] * (max - 3)).toFixed(1)}px`;
    });
  }
}

document.querySelectorAll("[data-media]").forEach((b) =>
  b.addEventListener("click", async () => {
    try { await invoke("media_control", { action: b.dataset.media }); } catch {}
    setTimeout(pollMedia, 300);
  })
);

document.querySelectorAll("[data-skip]").forEach((b) =>
  b.addEventListener("click", async () => {
    const m = state.media;
    if (!m) return;
    const now = m.playing ? m.position + (Date.now() - lastMediaAt) / 1000 : m.position;
    const position = Math.max(0, Math.min(m.duration || Infinity, now + Number(b.dataset.skip)));
    try { await invoke("media_control", { action: "seek", position }); } catch {}
    setTimeout(pollMedia, 300);
  })
);

$("m-bar").addEventListener("click", async (e) => {
  const m = state.media;
  if (!m || !m.duration) return;
  const r = e.currentTarget.getBoundingClientRect();
  const position = ((e.clientX - r.left) / r.width) * m.duration;
  try { await invoke("media_control", { action: "seek", position }); } catch {}
  setTimeout(pollMedia, 300);
});

// ---------- Volume ----------

const DASHES = 22;
$("vol-dashes").innerHTML = "<i></i>".repeat(DASHES);

function renderVolume() {
  const v = state.volume;
  if (!v) return;
  const lit = Math.round(v.level * DASHES);
  [...$("vol-dashes").children].forEach((d, i) => d.classList.toggle("on", !v.muted && i < lit));
  setIcon($("vol-icon"), v.muted ? "volume-mute" : "volume");
}

async function setVolume(level) {
  state.volume = { ...(state.volume || {}), level, muted: false };
  renderVolume();
  try { await invoke("set_volume", { level, muted: false }); } catch {}
}

let dragging = false;
const dashLevel = (e) => {
  const r = $("vol-dashes").getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
};
$("vol-dashes").addEventListener("pointerdown", (e) => {
  dragging = true;
  e.currentTarget.setPointerCapture(e.pointerId);
  setVolume(dashLevel(e));
});
$("vol-dashes").addEventListener("pointermove", (e) => { if (dragging) setVolume(dashLevel(e)); });
$("vol-dashes").addEventListener("pointerup", () => { dragging = false; });
island.addEventListener("wheel", (e) => {
  if (state.view !== "volume" || !state.volume) return;
  setVolume(Math.min(1, Math.max(0, state.volume.level - Math.sign(e.deltaY) * 0.04)));
});
$("vol-mute").addEventListener("click", async () => {
  if (!state.volume) return;
  state.volume.muted = !state.volume.muted;
  renderVolume();
  try { await invoke("set_volume", { muted: state.volume.muted }); } catch {}
});

// ---------- Stopwatch ----------

const sw = { running: false, start: 0, elapsed: 0 };

function swNow() {
  return sw.running ? sw.elapsed + (performance.now() - sw.start) : sw.elapsed;
}

function renderStopwatch() {
  const ms = swNow();
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const main = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  $("sw-main").textContent = main;
  $("sw-cs").textContent = "." + pad(Math.floor((ms % 1000) / 10));
  $("mini-sw").textContent = main;
}

$("sw-toggle").addEventListener("click", () => {
  if (sw.running) {
    sw.elapsed = swNow();
    sw.running = false;
  } else {
    sw.start = performance.now();
    sw.running = true;
  }
  setIcon($("sw-icon"), sw.running ? "pause" : "play");
});
$("sw-reset").addEventListener("click", () => {
  sw.running = false;
  sw.elapsed = 0;
  setIcon($("sw-icon"), "play");
  renderStopwatch();
});

// ---------- Timer (countdown) ----------

let swMode = "sw";
const tm = { duration: 5 * 60000, left: 5 * 60000, endAt: 0, active: false, running: false };
const tmLeft = () => (tm.running ? Math.max(0, tm.endAt - Date.now()) : tm.left);

function fmtClock(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderTimer() {
  const text = fmtClock(tmLeft());
  $("tm-main").textContent = text;
  $("mini-tm").textContent = text;
  $("tl-time").textContent = text;
}

function renderTimerControls() {
  setIcon($("tm-icon"), tm.running ? "pause" : "play");
  setIcon($("tl-icon"), tm.running ? "pause" : "play");
  $("tm-presets").hidden = swMode !== "timer" || tm.active;
  renderTimer();
}

function setMode(mode) {
  swMode = mode;
  $("sw-seg").classList.toggle("timer", mode === "timer");
  $("sw-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  $("sw-pane").hidden = mode !== "sw";
  $("tm-pane").hidden = mode !== "timer";
  $("sw-title").textContent = mode === "timer" ? "Hẹn giờ" : "Bấm giờ";
  renderTimerControls();
  if (state.view === "stopwatch") setView("stopwatch");
}
$("sw-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

$("tm-presets").querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", () => {
    tm.duration = tm.left = Number(b.dataset.min) * 60000;
    $("tm-presets").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    renderTimer();
  })
);

function toggleTimer() {
  if (!tm.active) {
    tm.active = tm.running = true;
    tm.endAt = Date.now() + tm.left;
  } else if (tm.running) {
    tm.left = tmLeft();
    tm.running = false;
  } else {
    tm.running = true;
    tm.endAt = Date.now() + tm.left;
  }
  renderTimerControls();
  if (state.view === "stopwatch") setView("stopwatch");
}

function resetTimer() {
  tm.active = tm.running = false;
  tm.left = tm.duration;
  renderTimerControls();
}

$("tm-toggle").addEventListener("click", toggleTimer);
$("tl-toggle").addEventListener("click", toggleTimer);
$("tm-cancel").addEventListener("click", () => {
  resetTimer();
  if (state.view === "stopwatch") setView("stopwatch");
});
$("tl-cancel").addEventListener("click", () => {
  resetTimer();
  collapse();
});

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

function timerDone() {
  resetTimer();
  popup("pop-done", 15000);
  island.classList.remove("shake");
  void island.offsetWidth;
  island.classList.add("shake");
  beep();
}

function dismissDone() {
  endPopup();
}
$("done-ok").addEventListener("click", (e) => {
  e.stopPropagation();
  dismissDone();
});

(function tick(now) {
  if (tm.running) {
    if (tmLeft() <= 0) timerDone();
    else renderTimer();
  }
  if (sw.running || state.view === "stopwatch") renderStopwatch();
  if (state.media && state.media.playing && state.view === "music") renderMedia();
  if (state.view === "music" || state.view === "mini-music") drawWave(now || performance.now());
  requestAnimationFrame(tick);
})();

// ---------- Notes ----------

const NOTE = "island.note";
try { $("note").value = localStorage.getItem(NOTE) || ""; } catch {}
$("note").addEventListener("input", (e) => {
  try { localStorage.setItem(NOTE, e.target.value); } catch {}
});

// ---------- Calendar ----------

const Cal = {
  month: null,
  render() {
    const today = new Date();
    if (!this.month) this.month = new Date(today.getFullYear(), today.getMonth(), 1);
    const y = this.month.getFullYear(), mo = this.month.getMonth();
    $("cal-title").textContent = `Tháng ${mo + 1} ${y}`;

    const cells = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(
      (d, i) => `<span class="dow${i === 6 ? " sun" : ""}">${d}</span>`
    );
    const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) cells.push("<span></span>");
    const days = new Date(y, mo + 1, 0).getDate();
    const monthHolidays = [];
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, mo, d);
      const hol = Lunar.holidays(date);
      hol.forEach((h) => monthHolidays.push([d, h.name]));
      const cls = ["d"];
      if (date.getDay() === 0) cls.push("sun");
      if (hol.length) cls.push("hol");
      if (date.toDateString() === today.toDateString()) cls.push("today");
      cells.push(`<span class="${cls.join(" ")}">${d}</span>`);
    }
    $("cal-grid").innerHTML = cells.join("");

    const l = Lunar.toLunar(today.getDate(), today.getMonth() + 1, today.getFullYear());
    $("cal-lunar").textContent = `${l.day}/${l.month}${l.leap ? " nhuận" : ""} âm lịch · ${Lunar.yearName(l.year)}`;
    $("cal-date").textContent = `${today.getDate()} Tháng ${today.getMonth() + 1} ${today.getFullYear()}`;
    $("cal-weekday").textContent = WEEKDAY[today.getDay()];
    $("cal-holidays").innerHTML = monthHolidays.slice(0, 4).map(([d, n]) => `<li><b>${d}</b>${n}</li>`).join("")
      || '<li style="color:var(--dim)">Không có ngày lễ</li>';

    const next = Lunar.nextDayOff(today);
    if (next) {
      $("cal-next-name").textContent = next.name;
      $("cal-next-when").textContent = `${pad(next.date.getDate())}/${pad(next.date.getMonth() + 1)} · còn ${next.days} ngày`;
    }
  },
};
$("cal-prev").addEventListener("click", () => { Cal.month.setMonth(Cal.month.getMonth() - 1); Cal.render(); });
$("cal-next").addEventListener("click", () => { Cal.month.setMonth(Cal.month.getMonth() + 1); Cal.render(); });

// ---------- Weather ----------

let weather = null;

async function loadWeather(force = false) {
  if (state.view === "weather") holdBlur();
  const data = await Weather.get(invoke, force, {
    mode: settings.weatherMode,
    city: settings.city,
    unit: settings.unit,
  });
  $("wx-ask").classList.toggle("show", !data);
  blurHoldUntil = 0;
  if (data) {
    weather = data;
    renderWeather();
  }
}

function renderWeather() {
  if (!weather) return;
  const now = new Date();
  const a = Weather.arc(weather, now.getTime());
  $("wx-date").textContent = `${WD_SHORT[now.getDay()]}, ${now.getDate()} Thg ${now.getMonth() + 1}`;
  $("wx-clock").textContent = fmtTime(now);
  $("wx-temp").textContent = `${weather.temp}°${weather.unit === "f" ? "F" : "C"}`;
  $("wx-city").textContent = weather.city || "";
  $("wx-desc").textContent = Weather.describe(weather.code);
  $("wx-next").textContent = a.next.label;
  const mins = Math.max(0, Math.round((a.next.time - now) / 60000));
  $("wx-next-when").textContent = `${fmtTime(new Date(a.next.time))} · còn ${mins >= 60 ? `${Math.floor(mins / 60)} giờ ${mins % 60} phút` : `${mins} phút`}`;

  // Half-ellipse from (10,62) to (250,62), top at y=8.
  const pt = (t) => [130 - 120 * Math.cos(Math.PI * t), 62 - 54 * Math.sin(Math.PI * t)];
  const dots = a.marks.map((_, i) => {
    const [x, y] = pt(i / 4);
    return `<circle cx="${x}" cy="${y}" r="2.6" fill="#c7c7cc"/>`;
  }).join("");
  const [sx, sy] = pt(a.t);
  const body = a.day
    ? `<circle cx="${sx}" cy="${sy}" r="11" fill="#ffd24a" opacity=".18"/><circle cx="${sx}" cy="${sy}" r="7" fill="#ffd24a"/>`
    : `<g transform="translate(${sx - 9} ${sy - 9}) scale(.75)">${Icons.ICONS.moon.replace(/<\/?svg[^>]*>/g, "")}</g>`;
  $("wx-arc").innerHTML =
    `<path d="M10 62 A120 54 0 0 1 250 62" fill="none" stroke="#5a5a8a" stroke-width="1.5" stroke-dasharray="2 5" stroke-linecap="round"/>`
    + dots
    + `<circle cx="10" cy="62" r="7" fill="none" stroke="${a.day ? "#ffd24a" : "#8f86ff"}" stroke-width="2" opacity=".8"/>`
    + body;

  $("wx-marks").innerHTML = a.marks.map((m) =>
    `<span class="${m === a.next ? "now" : ""}">${m.label}<b>${fmtTime(new Date(m.time))}</b></span>`
  ).join("");
}

$("wx-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("wx-input").value.trim();
  if (!name) return;
  const city = await Weather.searchCity(name).catch(() => null);
  if (city) loadWeather(true);
});
$("wx-perm").addEventListener("click", () => invoke("open_settings", { page: "ms-settings:privacy-location" }));

// ---------- Wi-Fi ----------

const bars = (n) => `<span class="bars">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}" style="height:${i * 2.5}px"></i>`).join("")}</span>`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const Wifi = {
  networks: [],
  asking: null,
  status: "",
  scanning: false,
  async scan() {
    renderSwitches();
    if (state.radios.wifi === false) return this.render("Wi-Fi đang tắt");
    if (this.scanning) return;
    this.scanning = true;
    $("wifi-rescan").classList.add("spinning");
    if (!this.networks.length) this.render("Đang quét…");
    holdBlur();
    try {
      const r = await invoke("wifi_scan");
      if (!r.allowed) return this.render("perm");
      this.networks = r.networks;
      this.render(this.networks.length ? undefined : "Không thấy mạng nào");
    } catch (err) {
      this.render(`Không quét được mạng (${esc(String(err)).slice(0, 80)})`);
    } finally {
      blurHoldUntil = 0;
      this.scanning = false;
      $("wifi-rescan").classList.remove("spinning");
    }
  },
  render(message) {
    const list = $("wifi-list");
    if (message === "perm") {
      list.innerHTML = `<div class="row note">Cần bật quyền vị trí cho ứng dụng desktop để xem mạng Wi-Fi</div>
        <button class="row" data-settings="ms-settings:privacy-location">Mở cài đặt vị trí<span class="meta">›</span></button>`;
    } else if (message) {
      list.innerHTML = `<div class="row note">${message}</div>`;
    } else {
      list.innerHTML = this.networks.map((n) => {
        const meta = n.connected ? `Đã kết nối ${bars(n.bars)}` : `${n.secure ? `<span class="ic xs">${Icons.ICONS.lock}</span>` : ""}${bars(n.bars)}`;
        const row = `<button class="row${n.connected ? " current" : ""}" data-ssid="${esc(n.ssid)}"><span class="name">${esc(n.ssid)}</span><span class="meta">${meta}</span></button>`;
        const pw = this.asking === n.ssid
          ? `<form class="pw" data-pw="${esc(n.ssid)}"><input type="password" placeholder="Mật khẩu" autocomplete="off"><button>Kết nối</button></form>`
          : "";
        const status = this.status && this.asking === n.ssid ? `<div class="row note">${this.status}</div>` : "";
        return row + pw + status;
      }).join("") + `<button class="row" data-settings="ms-settings:network-wifi">Cài đặt Wi-Fi khác…<span class="meta">›</span></button>`;
    }
    list.querySelectorAll("[data-settings]").forEach((b) =>
      b.addEventListener("click", () => invoke("open_settings", { page: b.dataset.settings })));
    list.querySelectorAll("[data-ssid]").forEach((b) =>
      b.addEventListener("click", () => this.connect(b.dataset.ssid)));
    list.querySelectorAll("[data-pw]").forEach((f) => {
      const input = f.querySelector("input");
      setTimeout(() => input.focus(), 50);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (input.value) this.connect(f.dataset.pw, input.value);
      });
    });
  },
  async connect(ssid, password) {
    const net = this.networks.find((n) => n.ssid === ssid);
    if (net && net.connected) return;
    this.asking = ssid;
    this.status = "Đang kết nối…";
    this.render();
    let result = "failed";
    try { result = await invoke("wifi_connect", { ssid, password: password || null }); } catch {}
    if (result === "ok") {
      this.asking = null;
      this.status = "";
      setTimeout(() => { pollRadios(); this.scan(); }, 1000);
    } else {
      this.status = result === "password" ? (password ? "Sai mật khẩu" : "") : "Không kết nối được";
    }
    this.render();
  },
};
$("wifi-rescan").addEventListener("click", () => Wifi.scan());

// ---------- Bluetooth ----------

const Bt = {
  async load() {
    renderSwitches();
    const list = $("bt-list");
    if (state.radios.bluetooth === false) {
      list.innerHTML = '<div class="row note">Bluetooth đang tắt</div>';
      return;
    }
    if (!state.bt) list.innerHTML = '<div class="row note">Đang tải…</div>';
    await pollBluetooth();
    this.render();
  },
  render() {
    const list = $("bt-list");
    list.innerHTML = (state.bt || []).map((d) =>
      `<button class="row" data-settings="ms-settings:bluetooth"><span class="name">${esc(d.name)}</span><span class="meta">${d.connected ? `<span class="green">Đã kết nối${d.battery != null ? ` · ${d.battery}%` : ""}</span>` : "Đã ghép đôi"}</span></button>`
    ).join("") + '<button class="row" data-settings="ms-settings:bluetooth">Thêm / kết nối thiết bị…</button>';
    list.querySelectorAll("[data-settings]").forEach((b) =>
      b.addEventListener("click", () => invoke("open_settings", { page: b.dataset.settings })));
  },
};

// ---------- Polling ----------

async function pollMedia() {
  try { state.media = await invoke("media_info"); } catch { state.media = null; }
  lastMediaAt = Date.now();
  renderMedia();
  refreshCompact();
  if (state.view === "mini-timer" || state.view === "mini-stopwatch") updateBubble();
}

/** A new power reading, from Windows' push event or the fallback poll. */
function onBattery(b) {
  const prev = state.battery;
  state.battery = b;
  if (!prev || prev.charging !== b.charging) log(`power: charging=${b.charging} ${b.percent}%`);
  if (prev && !prev.charging && b.charging && b.percent != null) {
    $("pop-charge-pct").textContent = `${b.percent}%`;
    paintBattery($("pop-charge-bat"), b.percent, true);
    popup("pop-charge");
  }
}

async function pollBattery() {
  try { onBattery(await invoke("battery")); } catch (e) { log(`battery poll failed: ${e}`); }
}

window.__TAURI__.event.listen("power-changed", (e) => onBattery(e.payload));

const isAudio = (d) => d.audio || /airpods|buds|pods|headphone|headset|earphone|tai nghe|loa|speaker|jbl|sony|baseus|ap\d/i.test(d.name);

let btRevealToken = 0;

function showBtPopup(d) {
  $("pop-bt-state").textContent = d.connected ? "Đã kết nối" : "Đã ngắt kết nối";
  $("pop-bt-name").textContent = d.name.trim();
  const ring = $("pop-bt-ring");
  const token = ++btRevealToken;
  ring.classList.toggle("off", !d.connected);
  ring.textContent = "";
  ring.style.setProperty("--pct", 0);
  document.querySelector('[data-name="pop-bt"] .pop-ear').classList.toggle("off", !d.connected);
  // Long enough to see the check and the level fill in.
  popup("pop-bt", Math.max(settings.popSeconds, 4) * 1000);
  if (!d.connected) return;

  // Connected: spin while "checking", then sweep the arc to the level and count up.
  ring.classList.add("loading");
  const started = performance.now();
  (async () => {
    let level = d.battery;
    if (level == null) {
      // Windows reports the headset's battery a moment after it connects.
      for (let i = 0; i < 3 && level == null; i++) {
        await new Promise((r) => setTimeout(r, 700));
        await pollBluetooth();
        const fresh = (state.bt || []).find((x) => x.name.trim() === d.name.trim());
        level = fresh ? fresh.battery : null;
      }
    }
    const wait = Math.max(0, 900 - (performance.now() - started)); // spin at least ~1 turn
    await new Promise((r) => setTimeout(r, wait));
    if (token !== btRevealToken) return;
    revealBattery(ring, level);
  })();
}

function revealBattery(ring, level) {
  ring.classList.remove("loading");
  const target = level == null ? 100 : level;
  // Restart from 0 on the next frame so the transition runs.
  ring.style.setProperty("--pct", 0);
  requestAnimationFrame(() => ring.style.setProperty("--pct", target));
  if (level == null) return;
  const start = performance.now(), dur = 900;
  (function count(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    ring.textContent = Math.round(level * eased);
    if (t < 1) requestAnimationFrame(count);
  })(start);
}

// Windows signals a connection change immediately, but right after Bluetooth is switched
// on it briefly reports devices as connected while it is only trying to reach them.
// So an event only triggers a re-check a moment later; the popup comes from the real state.
const btAnnounced = new Map(); // device name → connected state last shown (or seen at start)
let btCheckTimer = 0;
window.__TAURI__.event.listen("bt-changed", (e) => {
  log(`bt event: ${e.payload.name}=${e.payload.connected ? 1 : 0}`);
  clearTimeout(btCheckTimer);
  btCheckTimer = setTimeout(pollBluetooth, 1500);
});

/** Announce devices whose real connection state differs from what was last shown. */
function announceBtChanges(list, first) {
  // Bluetooth off (empty list) or a device gone from it: count as disconnected, silently,
  // so its reconnection afterwards is announced.
  const present = new Set(list.map((d) => d.name.trim()));
  for (const key of btAnnounced.keys()) if (!present.has(key)) btAnnounced.set(key, false);
  for (const d of list) {
    const key = d.name.trim();
    const before = btAnnounced.get(key);
    btAnnounced.set(key, d.connected);
    if (first || before === undefined || before === d.connected) continue;
    if (isAudio(d)) {
      showBtPopup(d);
      break;
    }
  }
}

async function pollVolume() {
  try { state.volume = await invoke("volume"); } catch { return; }
  if (state.view === "volume" && !dragging) renderVolume();
}

async function pollRadios() {
  try { state.radios = await invoke("radios"); } catch {}
  state.wifiCurrent = state.radios.wifi_connected ? true : null;
  renderSwitches();
  if (state.view === "hub") renderHub();
}

async function pollBluetooth() {
  const prev = state.bt;
  try { state.bt = await invoke("bluetooth_devices"); } catch (e) { log(`bt poll failed: ${e}`); return; }
  const sig = state.bt.map((d) => `${d.name.trim()}=${d.connected ? 1 : 0}`).join(",");
  if (sig !== pollBluetooth.sig) log(`bt: ${sig}`);
  pollBluetooth.sig = sig;
  announceBtChanges(state.bt, !prev);
  if (state.view === "bluetooth") Bt.render();
}

async function pollClock() {
  if (state.view === "hub") renderHub();
  if (state.view === "weather") renderWeather();
}

// ---------- Settings ----------

function applySettings(next) {
  const prev = settings;
  settings = next;
  const root = document.documentElement.style;
  root.setProperty("--bg", settings.bg);
  root.setProperty("--tile-on", settings.accent);
  root.setProperty("--speed", settings.speed);
  document.body.dataset.anim = settings.anim ? "on" : "off";
  document.body.classList.toggle("no-gradient", !settings.gradient);
  root.setProperty("--z", settings.scale);
  root.setProperty("--t-island", `${0.6 * settings.speed}s`);
  island.style.top = settings.top + "px";
  $("back").style.top = settings.top + "px";
  buildTiles();
  if (state.view === "hub") renderHub();
  setView(state.view);
  const weatherChanged = !prev || prev.weatherMode !== settings.weatherMode
    || prev.city !== settings.city || prev.unit !== settings.unit;
  if (prev && weatherChanged) loadWeather(true);
}

window.__TAURI__.event.listen("settings-changed", (e) => applySettings(Settings.load()));

log("started");
renderTimerControls();
applySettings(settings);
invoke("set_monitor", { index: settings.monitor }).catch(() => {});
if (settings.hotkey) invoke("set_hotkey", { accelerator: settings.hotkey }).catch(() => {});

setView("idle");
pollMedia();
pollBattery();
pollVolume();
pollRadios();
pollBluetooth();
setInterval(pollMedia, 1000);
setInterval(pollBattery, 5000);
setInterval(pollVolume, 1000);
setInterval(pollRadios, 5000);
setInterval(pollBluetooth, 5000);
setInterval(pollClock, 1000);
setInterval(() => loadWeather(), 30 * 60 * 1000);
loadWeather();
