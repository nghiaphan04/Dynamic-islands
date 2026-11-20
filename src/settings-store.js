// Settings shared by the island and the settings window (same origin, same localStorage).
(function () {
  const KEY = "island.settings";
  const TILES = {
    weather: "Thời tiết",
    calendar: "Lịch",
    stopwatch: "Bấm giờ",
    notes: "Ghi chú",
    wifi: "Wi-Fi",
    bluetooth: "Bluetooth",
    airplane: "Máy bay",
    volume: "Âm lượng",
  };
  const DEFAULTS = {
    monitor: 0,
    top: 6,
    scale: 1,
    bg: "#000000",
    accent: "#4f9fd0",
    radius: 1,
    borderWidth: 1,
    borderColor: "#ffffff",
    borderAlpha: 0.14,
    gradient: true,
    tiles: Object.keys(TILES),
    hidden: [],
    popCharge: true,
    popBt: true,
    popSeconds: 3,
    anim: true,
    speed: 1,
    openOn: "click",
    autostart: false,
    hotkey: "Ctrl+Alt+I",
    weatherMode: "auto",
    city: "",
    unit: "c",
  };

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    const s = { ...DEFAULTS, ...saved };
    // Keep every known tile exactly once, in the saved order.
    s.tiles = [...s.tiles.filter((t) => TILES[t]), ...Object.keys(TILES).filter((t) => !s.tiles.includes(t))];
    return s;
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
    try { window.__TAURI__.event.emit("settings-changed", s); } catch {}
  }

  window.Settings = { load, save, DEFAULTS, TILES };
})();
