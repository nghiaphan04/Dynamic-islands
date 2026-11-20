const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);
let s = Settings.load();

const FIELDS = ["top", "scale", "bg", "accent", "radius", "borderWidth", "borderColor", "borderAlpha", "gradient", "popCharge", "popBt", "popSeconds", "anim", "speed", "openOn", "weatherMode", "city", "unit"];
const NUMBERS = new Set(["top", "scale", "radius", "borderWidth", "borderAlpha", "popSeconds", "speed"]);
const FORMAT = {
  top: (v) => `${v}px`, radius: (v) => `${Math.round(v * 100)}%`, popSeconds: (v) => `${v}s`,
  borderWidth: (v) => (v ? `${v}px` : "Tắt"), borderAlpha: (v) => `${Math.round(v * 100)}%`,
};

function commit() {
  Settings.save(s);
}

function fill() {
  for (const id of FIELDS) {
    const el = $(id);
    if (el.type === "checkbox") el.checked = !!s[id];
    else el.value = String(s[id]);
    showOutput(id);
  }
  $("hotkey").value = s.hotkey;
  $("city-row").style.display = s.weatherMode === "city" ? "" : "none";
  renderTiles();
}

function showOutput(id) {
  const out = $(id).parentElement.querySelector("output");
  if (out) out.textContent = FORMAT[id] ? FORMAT[id](s[id]) : s[id];
}

for (const id of FIELDS) {
  const el = $(id);
  const event = el.type === "range" || el.type === "color" || el.type === "text" ? "input" : "change";
  el.addEventListener(event, () => {
    s[id] = el.type === "checkbox" ? el.checked : NUMBERS.has(id) ? Number(el.value) : el.value;
    showOutput(id);
    if (id === "weatherMode") $("city-row").style.display = s.weatherMode === "city" ? "" : "none";
    commit();
  });
}

// ---------- Monitors ----------

async function loadMonitors() {
  let names = [];
  try { names = await invoke("monitors"); } catch {}
  $("monitor").innerHTML = names.map((n, i) => `<option value="${i}">${i + 1}. ${n}</option>`).join("")
    || '<option value="0">Màn hình chính</option>';
  $("monitor").value = String(Math.min(s.monitor, Math.max(0, names.length - 1)));
}
$("monitor").addEventListener("change", async () => {
  s.monitor = Number($("monitor").value);
  commit();
  try { await invoke("set_monitor", { index: s.monitor }); } catch {}
});

// ---------- Tiles ----------

function renderTiles() {
  $("tiles").innerHTML = s.tiles.map((t, i) => {
    const on = !s.hidden.includes(t);
    return `<li class="${on ? "" : "off"}" data-tile="${t}">
      <input type="checkbox" ${on ? "checked" : ""}>
      <span>${Settings.TILES[t]}</span>
      <button data-move="-1" ${i === 0 ? "disabled" : ""}>▲</button>
      <button data-move="1" ${i === s.tiles.length - 1 ? "disabled" : ""}>▼</button>
    </li>`;
  }).join("");
}

$("tiles").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const tile = li.dataset.tile;
  if (e.target.matches("input")) {
    s.hidden = e.target.checked ? s.hidden.filter((t) => t !== tile) : [...s.hidden, tile];
  } else if (e.target.dataset.move) {
    const i = s.tiles.indexOf(tile), j = i + Number(e.target.dataset.move);
    [s.tiles[i], s.tiles[j]] = [s.tiles[j], s.tiles[i]];
  } else {
    return;
  }
  renderTiles();
  commit();
});

// ---------- Autostart ----------

$("autostart").addEventListener("change", async () => {
  const on = $("autostart").checked;
  try {
    await invoke("set_autostart", { on });
    s.autostart = on;
    commit();
  } catch {
    $("autostart").checked = !on;
  }
});

// ---------- Hotkey ----------

const KEY_NAMES = { " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };

$("hotkey").addEventListener("keydown", async (e) => {
  e.preventDefault();
  if (e.key === "Escape" || e.key === "Backspace") {
    s.hotkey = "";
  } else {
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
    if (!mods.length) {
      $("hotkey-msg").textContent = "Cần ít nhất một phím Ctrl, Alt, Shift hoặc Win.";
      return;
    }
    const key = KEY_NAMES[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    s.hotkey = [...mods, key].join("+");
  }
  $("hotkey").value = s.hotkey;
  try {
    await invoke("set_hotkey", { accelerator: s.hotkey });
    $("hotkey-msg").textContent = s.hotkey ? "" : "Đã tắt phím tắt.";
    commit();
  } catch (err) {
    $("hotkey-msg").textContent = "Không dùng được tổ hợp này (có thể app khác đang dùng).";
  }
});

// ---------- Reset ----------

$("reset").addEventListener("click", async () => {
  s = { ...Settings.DEFAULTS, tiles: [...Settings.DEFAULTS.tiles], hidden: [] };
  fill();
  commit();
  try { await invoke("set_monitor", { index: 0 }); } catch {}
  try { await invoke("set_hotkey", { accelerator: s.hotkey }); } catch {}
  try { await invoke("set_autostart", { on: false }); } catch {}
});

(async () => {
  try { s.autostart = await invoke("get_autostart"); } catch {}
  fill();
  $("autostart").checked = s.autostart;
  loadMonitors();
})();
