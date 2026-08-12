const island = document.getElementById('island');
const compactTime = document.getElementById('compact-time');
const compactRam = document.getElementById('compact-ram');
const compactNormal = document.getElementById('compact-normal');
const compactMedia = document.getElementById('compact-media');
const compactMediaTitle = document.getElementById('compact-media-title');
const compactMediaTitle2 = document.getElementById('compact-media-title-2');
const compactMediaStatusBtn = document.getElementById('compact-media-status-btn');
const compactRamMedia = document.getElementById('compact-ram-media');

const cpuBar = document.getElementById('cpu-bar');
const cpuVal = document.getElementById('cpu-val');
const ramBar = document.getElementById('ram-bar');
const ramVal = document.getElementById('ram-val');
const mediaTitle = document.getElementById('media-title');
const mediaArtist = document.getElementById('media-artist');
const mediaArt = document.getElementById('media-art');
const mediaProgressFill = document.getElementById('media-progress-fill');
const mediaProgressThumb = document.getElementById('media-progress-thumb');
const mediaTime = document.getElementById('media-time');

function formatTime(ms) {
  if (!ms || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Vị trí phát hiện tại: một số app (trình duyệt, TikTok web...) không đẩy vị trí liên tục
// lên Windows (LastUpdatedTime bị cũ). Khi đang phát, ngoại suy bằng đồng hồ thực rồi
// tự đồng bộ lại mỗi lần poll.
let mediaState = { playing: false, position: 0, duration: 0, lastUpdated: 0, syncAt: 0 };

function currentPosition() {
  const s = mediaState;
  if (!s.duration) return 0;
  let pos = s.position || 0;
  if (s.playing) {
    const base = s.lastUpdated || s.syncAt;
    const delta = Date.now() - base;
    if (delta > 0) pos += delta;
  }
  return Math.min(s.duration, pos);
}

function renderProgress() {
  const s = mediaState;
  const pos = currentPosition();
  const percent = s.duration > 0 ? Math.min(100, (pos / s.duration) * 100) : 0;
  mediaProgressFill.style.width = `${percent}%`;
  mediaProgressThumb.style.left = `${percent}%`;
  mediaTime.textContent = `${formatTime(pos)} / ${formatTime(s.duration)}`;
}

function updateMediaProgress(media) {
  mediaState = {
    playing: media.status === 'playing',
    position: media.position || 0,
    duration: media.duration || 0,
    lastUpdated: media.lastUpdated || 0,
    syncAt: Date.now()
  };
  // Không render đè lên vị trí đang kéo (tránh bị nhảy về chỗ nhạc đang phát)
  if (!isSeeking) renderProgress();
}

// Chạy mượt giữa các lần poll (500ms) khi đang phát
setInterval(() => {
  if (mediaState.playing && mediaState.duration && !isSeeking) renderProgress();
}, 500);

// ===== TUA (SEEK) thanh tiến trình =====
const mediaProgress = document.getElementById('media-progress');
const mediaProgressTrack = document.getElementById('media-progress-track');
let isSeeking = false;
let seekPos = 0;

function seekToEvent(e) {
  if (!mediaState.duration) return;
  const rect = mediaProgressTrack.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  seekPos = ratio * mediaState.duration;
  mediaProgressFill.style.width = `${ratio * 100}%`;
  mediaProgressThumb.style.left = `${ratio * 100}%`;
  mediaTime.textContent = `${formatTime(seekPos)} / ${formatTime(mediaState.duration)}`;
}

function onSeekMove(e) {
  if (isSeeking) seekToEvent(e);
}

function onSeekEnd(e) {
  if (!isSeeking) return;
  isSeeking = false;
  mediaProgress.classList.remove('seeking');
  try {
    mediaProgressTrack.releasePointerCapture(e.pointerId);
  } catch (err) { /* ignore */ }
  mediaProgressTrack.removeEventListener('pointermove', onSeekMove);
  mediaProgressTrack.removeEventListener('pointerup', onSeekEnd);
  mediaProgressTrack.removeEventListener('pointercancel', onSeekEnd);
  if (mediaState.duration > 0) {
    // Tiếp tục từ vị trí vừa tua để thanh không bị giật lại trước lần poll sau
    mediaState.position = seekPos;
    mediaState.lastUpdated = Date.now();
    window.api.sendMediaSeek(seekPos);
  }
}

// Dùng Pointer Events + capture để kéo mượt, không bị tuột khi ra ngoài cửa sổ
mediaProgressTrack.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!mediaState.duration) return;
  isSeeking = true;
  mediaProgress.classList.add('seeking');
  seekToEvent(e);
  mediaProgressTrack.setPointerCapture(e.pointerId);
  mediaProgressTrack.addEventListener('pointermove', onSeekMove);
  mediaProgressTrack.addEventListener('pointerup', onSeekEnd);
  mediaProgressTrack.addEventListener('pointercancel', onSeekEnd);
});

const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnClose = document.getElementById('btn-close');
const btnTaskmgr = document.getElementById('btn-taskmgr');
const chkAutostart = document.getElementById('chk-autostart');
const autostartLabel = document.getElementById('switch-label');
const btnBg = document.getElementById('btn-bg');

// ==========================================
// TÙY CHỈNH ẢNH NỀN
// ==========================================
let settings = { background: null };

function applyBackground(bgUrl) {
  settings.background = bgUrl || null;
  if (bgUrl) {
    island.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${bgUrl})`;
    island.style.backgroundSize = 'cover';
    island.style.backgroundPosition = 'center';
    island.style.backgroundColor = 'transparent';
  } else {
    island.style.backgroundImage = 'none';
    island.style.backgroundColor = 'rgba(5, 5, 5, 0.96)';
  }
}

function saveSettings() {
  window.api.saveSettings(settings);
}

function loadSettings() {
  window.api.getSettings().then((s) => {
    settings = Object.assign({ background: null }, s || {});
    if (settings.background) applyBackground(settings.background);
  }).catch(() => {});
}

btnBg.addEventListener('click', async (e) => {
  e.stopPropagation();
  const bg = await window.api.pickBg();
  if (bg) {
    applyBackground(bg);
    saveSettings();
  }
});

// ==========================================
// BẢN ĐỊA HÓA THEO NGÔN NGỮ HỆ THỐNG
// ==========================================
const I18N = {
  vi: {
    playTitle: 'Phát/Tạm dừng',
    prevTitle: 'Bài trước',
    nextTitle: 'Bài tiếp theo',
    taskmgrTitle: 'Mở Task Manager',
    uninstallTitle: 'Gỡ cài đặt Dynamic Island',
    autostartLabel: 'Tự khởi động cùng Windows',
    islandTitle: 'Nhấp chuột để mở rộng',
    noMusic: 'Không có nhạc',
    stopped: 'Dừng',
    noTitle: 'Không có tiêu đề',
    noArtist: 'Không rõ ca sĩ',
    uninstallConfirm: 'Gỡ cài đặt Dynamic Island khỏi máy này?',
    addAppTitle: 'Thêm ứng dụng',
    removeAppTitle: 'Xóa khỏi dock',
    privacyMic: 'Đang sử dụng micro',
    privacyCam: 'Đang sử dụng camera',
    privacyBoth: 'Đang sử dụng micro & camera',
    bgTitle: 'Chọn ảnh nền'
  },
  en: {
    playTitle: 'Play / Pause',
    prevTitle: 'Previous',
    nextTitle: 'Next',
    taskmgrTitle: 'Open Task Manager',
    uninstallTitle: 'Uninstall Dynamic Island',
    autostartLabel: 'Launch at startup',
    islandTitle: 'Click to expand',
    noMusic: 'No music',
    stopped: 'Stopped',
    noTitle: 'No title',
    noArtist: 'Unknown artist',
    uninstallConfirm: 'Uninstall Dynamic Island from this machine?',
    addAppTitle: 'Add application',
    removeAppTitle: 'Remove from dock',
    privacyMic: 'Microphone in use',
    privacyCam: 'Camera in use',
    privacyBoth: 'Microphone & camera in use',
    bgTitle: 'Choose background image'
  }
};

let t = /^vi/i.test(navigator.language || '') ? I18N.vi : I18N.en;

function applyI18n() {
  btnPlay.title = t.playTitle;
  btnPrev.title = t.prevTitle;
  btnNext.title = t.nextTitle;
  btnTaskmgr.title = t.taskmgrTitle;
  btnUninstall.title = t.uninstallTitle;
  btnAddApp.title = t.addAppTitle;
  btnBg.title = t.bgTitle;
  autostartLabel.textContent = t.autostartLabel;
  island.title = t.islandTitle;
  mediaTitle.textContent = t.noMusic;
  mediaArtist.textContent = t.stopped;
  compactMediaTitle.textContent = t.noMusic;
  compactMediaTitle2.textContent = t.noMusic;
}

window.api.getLocale().then((locale) => {
  t = /^vi/i.test(locale || '') ? I18N.vi : I18N.en;
  applyI18n();
  loadDockApps();
  loadSettings();
  updateMedia();
});

let isExpanded = false;
let collapseTimeout = null;

// ==========================================
// 1. QUẢN LÝ TƯƠNG TÁC CHUỘT XUYÊN THẤU (CLICK-THROUGH) VÀ HOVER
// ==========================================
// Kiểm tra vị trí chuột liên tục trên màn hình để bật/tắt click xuyên thấu
document.addEventListener('mousemove', (e) => {
  const rect = island.getBoundingClientRect();
  
  // Thêm 6px biên an toàn cho bóng đổ (box-shadow) để tránh bị mất tương tác
  const isOverIsland = (
    e.clientX >= rect.left - 6 &&
    e.clientX <= rect.right + 6 &&
    e.clientY >= rect.top - 6 &&
    e.clientY <= rect.bottom + 6
  );

  if (isOverIsland) {
    window.api.setIgnoreMouseEvents(false);
  } else {
    // Cho phép click xuyên qua nếu di chuột ra ngoài hòn đảo thực tế
    window.api.setIgnoreMouseEvents(true, { forward: true });
  }
});

island.addEventListener('mouseenter', () => {
  // Hủy đếm ngược thu nhỏ nếu người dùng hover lại vào đảo
  if (collapseTimeout) {
    clearTimeout(collapseTimeout);
    collapseTimeout = null;
  }
});

island.addEventListener('mouseleave', () => {
  // Tự động thu nhỏ sau 2 giây nếu đang mở rộng
  if (isExpanded) {
    collapseTimeout = setTimeout(() => {
      collapseIsland();
    }, 2000);
  }
});


// ==========================================
// 2. CO GIÃN ĐẢO (EXPAND / COLLAPSE)
// ==========================================
function expandIsland() {
  isExpanded = true;
  
  // Chỉ chuyển đổi class CSS, không thay đổi kích thước cửa sổ Electron thực tế
  island.classList.remove('compact');
  island.classList.add('expanded');
}

function collapseIsland() {
  isExpanded = false;
  
  // Chỉ chuyển đổi class CSS, không thay đổi kích thước cửa sổ Electron thực tế
  island.classList.remove('expanded');
  island.classList.add('compact');
}

// Bấm vào đảo để mở rộng
island.addEventListener('click', (e) => {
  // Tránh việc click vào các nút bấm bên trong cũng kích hoạt toggle
  if (e.target.closest('.header-actions') || e.target.closest('.header-left') || e.target.closest('.expanded-footer') || e.target.closest('.app-dock')) {
    return;
  }
  
  if (!isExpanded) {
    expandIsland();
  }
});


// ==========================================
// 4. CẬP NHẬT THỜI GIAN VÀ HỆ THỐNG
// ==========================================
function updateTime() {
  // Giờ hiện tại chỉ dùng cho expanded mode (nếu có)
  // Compact mode đã dùng CPU% thay cho giờ
}

// ==========================================
// MIC / CAMERA ĐANG DÙNG - hiển thị thay chỗ CPU ở đảo thu gọn
// ==========================================
let privacyState = { mic: false, cam: false };

function privacyColor() {
  const { mic, cam } = privacyState;
  if (mic && cam) return '#ff453a';
  if (mic) return '#ff9f0a';
  if (cam) return '#ffd60a';
  return null;
}

function privacyTooltip() {
  const { mic, cam } = privacyState;
  if (mic && cam) return t.privacyBoth;
  return mic ? t.privacyMic : t.privacyCam;
}

function updatePrivacy() {
  window.api.getPrivacy().then((p) => {
    const wasActive = !!privacyColor();
    privacyState = { mic: !!p.mic, cam: !!p.cam };
    const color = privacyColor();
    const isActive = !!color;
    if (isActive) {
      compactTime.innerHTML = `<span class="privacy-dot" style="background:${color};box-shadow:0 0 6px ${color}"></span>`;
      compactTime.title = privacyTooltip();
      compactTime.classList.add('privacy-active');
    } else if (wasActive) {
      compactTime.classList.remove('privacy-active');
      compactTime.innerHTML = '';
      compactTime.title = '';
      updateStats();
    }
  }).catch(() => {});
}

// Cập nhật thông số CPU/RAM
function updateStats() {
  const stats = window.api.getSystemStats();
  
  // View thu gọn - CPU% thay thế giờ, RAM bên phải
  if (!privacyColor()) {
    compactTime.textContent = `CPU ${stats.cpu}%`;
  }
  compactRamMedia.textContent = `${stats.ram}%`;
  compactRam.textContent = `RAM ${stats.ram}%`;

  // Đổi màu RAM ở chế độ thu gọn đang phát nhạc (xám → cam ≥60% → đỏ ≥85%)
  compactRamMedia.classList.remove('warning', 'danger');
  if (stats.ram >= 85) {
    compactRamMedia.classList.add('danger');
  } else if (stats.ram >= 60) {
    compactRamMedia.classList.add('warning');
  }
  
  // View mở rộng - CPU
  cpuVal.textContent = `${stats.cpu}%`;
  cpuBar.style.width = `${stats.cpu}%`;
  setBarColorClass(cpuBar, stats.cpu);

  // View mở rộng - RAM
  ramVal.textContent = `${stats.ram}%`;
  ramBar.style.width = `${stats.ram}%`;
  setBarColorClass(ramBar, stats.ram);
}



function setBarColorClass(barElement, value) {
  barElement.classList.remove('warning', 'danger');
  if (value >= 85) {
    barElement.classList.add('danger');
  } else if (value >= 60) {
    barElement.classList.add('warning');
  }
}

const PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

const COMPACT_PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5v14l11-7z"/></svg>`;
const COMPACT_PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

let lastMediaImage = null;

function updateMedia() {
  window.api.getMediaStats().then((media) => {
    console.log("[MEDIA DEBUG]", JSON.stringify(media));
    if (media && (media.status === 'playing' || media.status === 'paused')) {
      island.classList.add('has-media');
      
      // Hiển thị phần nhạc thu gọn
      compactNormal.style.display = 'none';
      compactMedia.style.display = 'flex';
      compactMediaTitle.textContent = media.title || t.noTitle;
      compactMediaTitle2.textContent = media.title || t.noTitle;
      compactMediaStatusBtn.innerHTML = media.status === 'playing' ? COMPACT_PAUSE_SVG : COMPACT_PLAY_SVG;
      
      if (media.status === 'paused') {
        island.classList.add('media-paused');
        btnPlay.innerHTML = PLAY_SVG;
      } else {
        island.classList.remove('media-paused');
        btnPlay.innerHTML = PAUSE_SVG;
      }
      
      mediaTitle.textContent = media.title || t.noTitle;
      mediaArtist.textContent = media.artist || t.noArtist;
      updateMediaProgress(media);
      // Chỉ cập nhật ảnh bìa khi thực sự đổi bài, tránh tốn memory/CPU decode lại
      const img = media.image || null;
      if (img !== lastMediaImage) {
        lastMediaImage = img;
        if (img) {
          mediaArt.src = img;
        } else {
          mediaArt.removeAttribute('src');
        }
      }
    } else {
      island.classList.remove('has-media');
      island.classList.remove('media-paused');
      
      // Hiển thị lại giờ + RAM bình thường khi thu gọn
      compactNormal.style.display = 'flex';
      compactMedia.style.display = 'none';
      
      btnPlay.innerHTML = PLAY_SVG;
      mediaTitle.textContent = t.noMusic;
      mediaArtist.textContent = t.stopped;
      lastMediaImage = null;
      mediaArt.removeAttribute('src');
      mediaState = { playing: false, position: 0, duration: 0, lastUpdated: 0, syncAt: Date.now() };
      renderProgress();
    }
  }).catch(() => {
    island.classList.remove('has-media');
    island.classList.remove('media-paused');
    
    compactNormal.style.display = 'flex';
    compactMedia.style.display = 'none';
    
    btnPlay.innerHTML = PLAY_SVG;
    mediaTitle.textContent = t.noMusic;
    mediaArtist.textContent = t.stopped;
    lastMediaImage = null;
    mediaArt.removeAttribute('src');
    mediaState = { playing: false, position: 0, duration: 0, lastUpdated: 0, syncAt: Date.now() };
    renderProgress();
  });
}

// Chạy vòng lặp cập nhật
updateTime();
setInterval(updateTime, 1000);

function refreshStats() {
  updateStats();
  updatePrivacy();
}

refreshStats();
setInterval(refreshStats, 2000);

updateMedia();
setInterval(updateMedia, 1500);




// ==========================================
// 5. CÁC TÍNH NĂNG KHÁC (CLOSE, AUTO-START, MEDIA CONTROLS)
// ==========================================
btnClose.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.closeApp();
});

// Mở Task Manager
btnTaskmgr.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.openTaskManager();
});

// Gỡ cài đặt (chỉ hiện nút khi bản đã cài NSIS)
const btnUninstall = document.getElementById('btn-uninstall');
window.api.canUninstall().then((ok) => {
  if (ok) btnUninstall.style.display = 'flex';
});

btnUninstall.addEventListener('click', (e) => {
  e.stopPropagation();
  // NSIS uninstaller tự hiện hộp thoại xác nhận, không cần confirm() của trình duyệt
  window.api.uninstallApp();
});

// Load trạng thái tự khởi động ban đầu
window.api.getAutostart().then((enabled) => {
  chkAutostart.checked = enabled;
});

// ==========================================
// DOCK APP - thêm ứng dụng vào Dynamic Island
// ==========================================
const appDock = document.getElementById('app-dock');
const sepApps = document.getElementById('sep-apps');
const MAX_DOCK_APPS = 13;
let dockApps = [];

function updateAddButtonState() {
  const full = dockApps.length >= MAX_DOCK_APPS;
  btnAddApp.disabled = full;
  btnAddApp.classList.toggle('disabled', full);
}

async function loadDockApps() {
  try {
    dockApps = (await window.api.getApps()) || [];
  } catch (err) {
    dockApps = [];
  }
  renderDock();
}

function renderDock() {
  appDock.innerHTML = '';
  sepApps.style.display = dockApps.length ? 'block' : 'none';
  updateAddButtonState();
  dockApps.forEach((app, idx) => {
    const btn = document.createElement('div');
    btn.className = 'dock-app';
    btn.title = app.name;
    if (app.icon) {
      const img = document.createElement('img');
      img.src = app.icon;
      img.draggable = false;
      btn.appendChild(img);
    } else {
      btn.textContent = (app.name || '?').charAt(0).toUpperCase();
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.launchApp(app.path);
    });
    const rm = document.createElement('span');
    rm.className = 'dock-app-remove';
    rm.textContent = '✕';
    rm.title = t.removeAppTitle;
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      dockApps.splice(idx, 1);
      saveDockApps();
    });
    btn.appendChild(rm);
    appDock.appendChild(btn);
  });
}

// Nút "Thêm ứng dụng" ở header (cạnh nút thùng rác)
const btnAddApp = document.getElementById('btn-add-app');
btnAddApp.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (dockApps.length >= MAX_DOCK_APPS) return;
  const app = await window.api.pickApp();
  if (app) {
    // Không thêm trùng (so sánh path không phân biệt hoa thường)
    const exists = dockApps.some((a) => a.path.toLowerCase() === app.path.toLowerCase());
    if (!exists) {
      dockApps.unshift(app);
      saveDockApps();
    }
  }
});

function saveDockApps() {
  window.api.saveApps(dockApps);
  renderDock();
}

// Xử lý bật tắt tự khởi động
chkAutostart.addEventListener('change', () => {
  window.api.setAutostart(chkAutostart.checked);
});

// Xử lý sự kiện click các nút điều khiển nhạc
btnPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.sendMediaControl('prev');
  setTimeout(updateMedia, 500);
});

btnPlay.addEventListener('click', (e) => {
  e.stopPropagation();
  // Cập nhật icon ngay lập tức (optimistic UI) để tránh cảm giác delay
  const isCurrentlyPaused = btnPlay.innerHTML === PLAY_SVG.replace(/"/g, '"');
  if (btnPlay.innerHTML.includes('M8 5v14l11-7z')) {
    // Đang là icon Play → chuyển sang Pause
    btnPlay.innerHTML = PAUSE_SVG;
    compactMediaStatusBtn.innerHTML = COMPACT_PAUSE_SVG;
  } else {
    // Đang là icon Pause → chuyển sang Play
    btnPlay.innerHTML = PLAY_SVG;
    compactMediaStatusBtn.innerHTML = COMPACT_PLAY_SVG;
  }
  window.api.sendMediaControl('play');
  // Poll lại sau 500ms để đồng bộ trạng thái thực
  setTimeout(updateMedia, 500);
});

btnNext.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.sendMediaControl('next');
  setTimeout(updateMedia, 500);
});

// Click nút Play/Pause từ chế độ thu gọn
compactMediaStatusBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // Cập nhật icon ngay lập tức
  if (btnPlay.innerHTML.includes('M8 5v14l11-7z')) {
    btnPlay.innerHTML = PAUSE_SVG;
    compactMediaStatusBtn.innerHTML = COMPACT_PAUSE_SVG;
  } else {
    btnPlay.innerHTML = PLAY_SVG;
    compactMediaStatusBtn.innerHTML = COMPACT_PLAY_SVG;
  }
  window.api.sendMediaControl('play');
  setTimeout(updateMedia, 500);
});
