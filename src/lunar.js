// Vietnamese lunar calendar (Ho Ngoc Duc's algorithm, UTC+7) and public holidays.
(function () {
  const TZ = 7;
  const INT = Math.floor;

  function jdFromDate(dd, mm, yy) {
    const a = INT((14 - mm) / 12);
    const y = yy + 4800 - a;
    const m = mm + 12 * a - 3;
    let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
    if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
    return jd;
  }

  function newMoonDay(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = Math.PI / 180;
    let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    const deltat = T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return INT(jd1 + C1 - deltat + 0.5 + TZ / 24);
  }

  function sunLongitude(jdn) {
    const T = (jdn - 2451545.5 - TZ / 24) / 36525, T2 = T * T, dr = Math.PI / 180;
    const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
    let L = (L0 + DL) * dr;
    L -= Math.PI * 2 * INT(L / (Math.PI * 2));
    return INT((L / Math.PI) * 6);
  }

  function lunarMonth11(yy) {
    const k = INT((jdFromDate(31, 12, yy) - 2415021) / 29.530588853);
    let nm = newMoonDay(k);
    if (sunLongitude(nm) >= 9) nm = newMoonDay(k - 1);
    return nm;
  }

  function leapMonthOffset(a11) {
    const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last, i = 1, arc = sunLongitude(newMoonDay(k + i));
    do {
      last = arc;
      i++;
      arc = sunLongitude(newMoonDay(k + i));
    } while (arc !== last && i < 14);
    return i - 1;
  }

  /** Solar date -> { day, month, year, leap } in the Vietnamese lunar calendar. */
  function toLunar(dd, mm, yy) {
    const dayNumber = jdFromDate(dd, mm, yy);
    const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = newMoonDay(k + 1);
    if (monthStart > dayNumber) monthStart = newMoonDay(k);
    let a11 = lunarMonth11(yy), b11 = a11, year;
    if (a11 >= monthStart) {
      year = yy;
      a11 = lunarMonth11(yy - 1);
    } else {
      year = yy + 1;
      b11 = lunarMonth11(yy + 1);
    }
    const day = dayNumber - monthStart + 1;
    const diff = INT((monthStart - a11) / 29);
    let leap = false, month = diff + 11;
    if (b11 - a11 > 365) {
      const leapDiff = leapMonthOffset(a11);
      if (diff >= leapDiff) {
        month = diff + 10;
        if (diff === leapDiff) leap = true;
      }
    }
    if (month > 12) month -= 12;
    if (month >= 11 && diff < 4) year -= 1;
    return { day, month, year, leap };
  }

  const CAN = ["Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ"];
  const CHI = ["Thân", "Dậu", "Tuất", "Hợi", "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi"];
  const yearName = (y) => `${CAN[y % 10]} ${CHI[y % 12]}`;

  // [day, month, name, dayOff]
  const SOLAR = [
    [1, 1, "Tết Dương lịch", true],
    [3, 2, "Thành lập Đảng CSVN"],
    [14, 2, "Lễ Tình nhân"],
    [8, 3, "Quốc tế Phụ nữ"],
    [30, 4, "Giải phóng miền Nam", true],
    [1, 5, "Quốc tế Lao động", true],
    [19, 5, "Sinh nhật Bác Hồ"],
    [1, 6, "Quốc tế Thiếu nhi"],
    [27, 7, "Thương binh Liệt sĩ"],
    [2, 9, "Quốc khánh", true],
    [20, 10, "Phụ nữ Việt Nam"],
    [20, 11, "Nhà giáo Việt Nam"],
    [22, 12, "Quân đội Nhân dân"],
    [24, 12, "Giáng sinh"],
  ];
  const LUNAR = [
    [1, 1, "Tết Nguyên đán", true],
    [2, 1, "Mùng 2 Tết", true],
    [3, 1, "Mùng 3 Tết", true],
    [15, 1, "Rằm tháng Giêng"],
    [10, 3, "Giỗ Tổ Hùng Vương", true],
    [15, 4, "Phật đản"],
    [5, 5, "Tết Đoan ngọ"],
    [15, 7, "Vu Lan"],
    [15, 8, "Tết Trung thu"],
    [23, 12, "Ông Công Ông Táo"],
  ];

  /** Holidays falling on a solar date: [{ name, off }]. */
  function holidays(date) {
    const d = date.getDate(), m = date.getMonth() + 1;
    const lunar = toLunar(d, m, date.getFullYear());
    const list = [];
    for (const [hd, hm, name, off] of SOLAR) if (hd === d && hm === m) list.push({ name, off: !!off });
    if (!lunar.leap) {
      for (const [hd, hm, name, off] of LUNAR) {
        if (hd === lunar.day && hm === lunar.month) list.push({ name, off: !!off });
      }
    }
    return list;
  }

  /** The next day off after today (not counting today): { date, name, days }. */
  function nextDayOff(from) {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let i = 1; i <= 400; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const off = holidays(date).find((h) => h.off);
      if (off) return { date, name: off.name, days: i };
    }
    return null;
  }

  window.Lunar = { toLunar, yearName, holidays, nextDayOff };
})();
