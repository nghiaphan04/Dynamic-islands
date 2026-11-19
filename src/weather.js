// Weather: location from Windows (or a typed city), forecast from Open-Meteo.
(function () {
  const STORE = "island.weather";
  const CITY = "island.city";

  const CODES = {
    0: "Trời quang", 1: "Ít mây", 2: "Có mây", 3: "Nhiều mây",
    45: "Sương mù", 48: "Sương mù",
    51: "Mưa phùn", 53: "Mưa phùn", 55: "Mưa phùn", 56: "Mưa phùn", 57: "Mưa phùn",
    61: "Mưa nhỏ", 63: "Mưa", 65: "Mưa to", 66: "Mưa lạnh", 67: "Mưa lạnh",
    71: "Tuyết", 73: "Tuyết", 75: "Tuyết", 77: "Tuyết",
    80: "Mưa rào", 81: "Mưa rào", 82: "Mưa rào to",
    95: "Dông", 96: "Dông kèm mưa đá", 99: "Dông kèm mưa đá",
  };

  const load = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

  async function cityName(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=vi`);
      const j = await r.json();
      return j.city || j.locality || j.principalSubdivision || "";
    } catch {
      return "";
    }
  }

  /** Resolve a typed city to coordinates via Open-Meteo's geocoder. */
  async function searchCity(name) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=vi&name=${encodeURIComponent(name)}`);
    const j = await r.json();
    const hit = j.results && j.results[0];
    if (!hit) return null;
    const city = { lat: hit.latitude, lon: hit.longitude, name: hit.name };
    save(CITY, city);
    return city;
  }

  async function place(invoke) {
    let coords = null;
    try { coords = await invoke("location"); } catch {}
    if (coords) {
      const [lat, lon] = coords;
      const cached = load(CITY);
      const name = cached && cached.auto && Math.abs(cached.lat - lat) < 0.05 && Math.abs(cached.lon - lon) < 0.05
        ? cached.name
        : await cityName(lat, lon);
      save(CITY, { lat, lon, name, auto: true });
      return { lat, lon, name };
    }
    return load(CITY);
  }

  async function fetchForecast(p, unit) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}`
      + "&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=2&past_days=1"
      + (unit === "f" ? "&temperature_unit=fahrenheit" : "");
    const r = await fetch(url);
    if (!r.ok) throw new Error("weather " + r.status);
    const j = await r.json();
    const data = {
      city: p.name,
      temp: Math.round(j.current.temperature_2m),
      code: j.current.weather_code,
      sunrise: j.daily.sunrise.map((s) => new Date(s).getTime()),
      sunset: j.daily.sunset.map((s) => new Date(s).getTime()),
      unit,
      at: Date.now(),
    };
    save(STORE, data);
    return data;
  }

  async function fixedCity(name) {
    const cached = load(CITY);
    if (cached && !cached.auto && cached.query === name) return cached;
    const city = await searchCity(name);
    if (city) save(CITY, { ...city, query: name });
    return city;
  }

  /**
   * Returns cached data if fresh, else fetches. null = no location available.
   * opts: { mode: "auto" | "city", city, unit: "c" | "f" }
   */
  async function get(invoke, force = false, opts = {}) {
    const cached = load(STORE);
    if (!force && cached && cached.unit === opts.unit && Date.now() - cached.at < 30 * 60 * 1000) return cached;
    const p = opts.mode === "city" && opts.city
      ? await fixedCity(opts.city).catch(() => null)
      : await place(invoke);
    if (!p) return null;
    try {
      return await fetchForecast(p, opts.unit);
    } catch {
      return cached;
    }
  }

  /**
   * The current arc: daytime (sunrise→sunset) or night (sunset→next sunrise),
   * with five marks and where "now" sits on it (0..1).
   */
  function arc(data, now = Date.now()) {
    const rises = data.sunrise, sets = data.sunset;
    let start, end, day;
    for (let i = 0; i < rises.length; i++) {
      if (now >= rises[i] && now < sets[i]) { start = rises[i]; end = sets[i]; day = true; break; }
      if (i + 1 < rises.length && now >= sets[i] && now < rises[i + 1]) { start = sets[i]; end = rises[i + 1]; day = false; break; }
    }
    if (start == null) { start = sets[0]; end = rises[1] || sets[0] + 12 * 3600e3; day = false; }
    const span = end - start;
    const labels = day
      ? ["Bình minh", "Buổi sáng", "Trưa", "Buổi chiều", "Hoàng hôn"]
      : ["Hoàng hôn", "Buổi tối", "Nửa đêm", "Rạng sáng", "Bình minh"];
    const marks = labels.map((label, i) => ({ label, time: start + (span * i) / 4 }));
    const t = Math.min(1, Math.max(0, (now - start) / span));
    const next = marks.find((m) => m.time > now) || marks[4];
    return { day, marks, t, next };
  }

  window.Weather = { get, searchCity, arc, describe: (code) => CODES[code] || "" };
})();
