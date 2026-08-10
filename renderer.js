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
const visualizerBars = document.querySelectorAll('.visualizer-bar');

const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnClose = document.getElementById('btn-close');
const chkAutostart = document.getElementById('chk-autostart');

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
  if (e.target.closest('.header-actions') || e.target.closest('.expanded-footer')) {
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

// Cập nhật thông số CPU/RAM
function updateStats() {
  const stats = window.api.getSystemStats();
  
  // View thu gọn - CPU% thay thế giờ, RAM bên phải
  compactTime.textContent = `CPU ${stats.cpu}%`;
  compactRam.textContent = `RAM ${stats.ram}%`;
  compactRamMedia.textContent = `${stats.ram}%`;
  
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

let visualizerInterval = null;

function startVisualizer() {
  if (visualizerInterval) return;
  visualizerInterval = setInterval(() => {
    visualizerBars.forEach((bar) => {
      // Chiều cao ngẫu nhiên từ 3px tới 18px tạo hiệu ứng đập theo nhạc nhẹ nhàng, gọn gàng
      const height = Math.floor(Math.random() * 16) + 3;
      bar.style.height = `${height}px`;
    });
  }, 100);
}

function stopVisualizer() {
  if (visualizerInterval) {
    clearInterval(visualizerInterval);
    visualizerInterval = null;
  }
  visualizerBars.forEach((bar) => {
    bar.style.height = '3px';
  });
}

const PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

const COMPACT_PLAY_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5v14l11-7z"/></svg>`;
const COMPACT_PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function updateMedia() {
  window.api.getMediaStats().then((media) => {
    console.log("[MEDIA DEBUG]", JSON.stringify(media));
    if (media && (media.status === 'playing' || media.status === 'paused')) {
      island.classList.add('has-media');
      
      // Hiển thị phần nhạc thu gọn
      compactNormal.style.display = 'none';
      compactMedia.style.display = 'flex';
      compactMediaTitle.textContent = media.title || 'Không có tiêu đề';
      compactMediaTitle2.textContent = media.title || 'Không có tiêu đề';
      compactMediaStatusBtn.innerHTML = media.status === 'playing' ? COMPACT_PAUSE_SVG : COMPACT_PLAY_SVG;
      
      if (media.status === 'paused') {
        island.classList.add('media-paused');
        btnPlay.innerHTML = PLAY_SVG;
        stopVisualizer();
      } else {
        island.classList.remove('media-paused');
        btnPlay.innerHTML = PAUSE_SVG;
        startVisualizer();
      }
      
      mediaTitle.textContent = media.title || 'Không có tiêu đề';
      mediaArtist.textContent = media.artist || 'Không rõ ca sĩ';
    } else {
      island.classList.remove('has-media');
      island.classList.remove('media-paused');
      
      // Hiển thị lại giờ + RAM bình thường khi thu gọn
      compactNormal.style.display = 'flex';
      compactMedia.style.display = 'none';
      
      btnPlay.innerHTML = PLAY_SVG;
      mediaTitle.textContent = 'Không có nhạc';
      mediaArtist.textContent = 'Dừng';
      stopVisualizer();
    }
  }).catch(() => {
    island.classList.remove('has-media');
    island.classList.remove('media-paused');
    
    compactNormal.style.display = 'flex';
    compactMedia.style.display = 'none';
    
    btnPlay.innerHTML = PLAY_SVG;
    mediaTitle.textContent = 'Không có nhạc';
    mediaArtist.textContent = 'Dừng';
    stopVisualizer();
  });
}

// Chạy vòng lặp cập nhật
updateTime();
setInterval(updateTime, 1000);

updateStats();
setInterval(updateStats, 2000);

updateMedia();
setInterval(updateMedia, 1500);




// ==========================================
// 5. CÁC TÍNH NĂNG KHÁC (CLOSE, AUTO-START, MEDIA CONTROLS)
// ==========================================
btnClose.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.closeApp();
});

// Load trạng thái tự khởi động ban đầu
window.api.getAutostart().then((enabled) => {
  chkAutostart.checked = enabled;
});

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
