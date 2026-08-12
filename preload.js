const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Khi đóng gói, media-helper.exe được giải nén ra resources/app.asar.unpacked/
// (không spawn trực tiếp được file nằm trong app.asar)
function getMediaHelperPath() {
  const direct = path.join(__dirname, 'media-helper.exe');
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'media-helper.exe');
  if (fs.existsSync(unpacked)) return unpacked;
  return direct;
}

const MEDIA_HELPER = getMediaHelperPath();

// Hàm tính toán % CPU sử dụng
let prevCpuInfo = getCpuAverage();

function getCpuAverage() {
  const cpus = os.cpus();
  let idleMs = 0;
  let totalMs = 0;

  cpus.forEach((core) => {
    for (let type in core.times) {
      totalMs += core.times[type];
    }
    idleMs += core.times.idle;
  });

  return { idle: idleMs / cpus.length, total: totalMs / cpus.length };
}

function getCpuUsage() {
  const startCpuInfo = prevCpuInfo;
  const endCpuInfo = getCpuAverage();
  prevCpuInfo = endCpuInfo;

  const idleDifference = endCpuInfo.idle - startCpuInfo.idle;
  const totalDifference = endCpuInfo.total - startCpuInfo.total;

  if (totalDifference === 0) return 0;
  const percentage = 100 - Math.round((100 * idleDifference) / totalDifference);
  return percentage;
}

// Chạy media-helper.exe một lần dưới dạng daemon nền, gửi lệnh qua stdin để tránh
// chi phí khởi động process mới mỗi lần poll (giảm delay đáng kể)
let mediaProc = null;
let pendingResolvers = [];
let lineBuffer = '';

function spawnMediaDaemon() {
  mediaProc = spawn(MEDIA_HELPER, ['daemon'], { stdio: ['pipe', 'pipe', 'pipe'] });
  mediaProc.on('error', () => { mediaProc = null; });
  mediaProc.on('exit', () => { mediaProc = null; });
  mediaProc.stderr.on('data', () => {});
  mediaProc.stdout.setEncoding('utf8');
  mediaProc.stdout.on('data', (chunk) => {
    lineBuffer += chunk;
    let idx;
    while ((idx = lineBuffer.indexOf('\n')) >= 0) {
      const line = lineBuffer.slice(0, idx).trim();
      lineBuffer = lineBuffer.slice(idx + 1);
      const resolve = pendingResolvers.shift();
      if (resolve && line) {
        try { resolve(JSON.parse(line)); }
        catch { resolve({ status: 'stopped' }); }
      }
    }
  });
}

function sendMediaCommand(cmd) {
  return new Promise((resolve) => {
    if (!mediaProc || mediaProc.exitCode !== null) spawnMediaDaemon();
    const resolver = (value) => resolve(value);
    pendingResolvers.push(resolver);
    mediaProc.stdin.write(cmd + '\n');
    // An toàn: nếu không có phản hồi sau 3s thì coi như dừng
    setTimeout(() => {
      const i = pendingResolvers.indexOf(resolver);
      if (i >= 0) {
        pendingResolvers.splice(i, 1);
        resolve({ status: 'stopped' });
      }
    }, 3000);
  });
}

function getMediaStats() {
  return sendMediaCommand('get');
}

contextBridge.exposeInMainWorld('api', {
  // Quản lý tương tác chuột
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),

  // Cấu hình khởi động cùng win
  setAutostart: (enable) => ipcRenderer.send('set-autostart', enable),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),

  // Ngôn ngữ hệ thống
  getLocale: () => ipcRenderer.invoke('get-locale'),

  // Dock app
  pickApp: () => ipcRenderer.invoke('pick-app'),
  launchApp: (exePath) => ipcRenderer.invoke('launch-app', exePath),
  getApps: () => ipcRenderer.invoke('get-apps'),
  saveApps: (apps) => ipcRenderer.send('save-apps', apps),

  // Đóng app
  closeApp: () => ipcRenderer.send('close-app'),

  // Mở Task Manager
  openTaskManager: () => ipcRenderer.send('open-task-manager'),

  // Gỡ cài đặt
  canUninstall: () => ipcRenderer.invoke('can-uninstall'),
  uninstallApp: () => ipcRenderer.send('uninstall-app'),

  // Lấy dữ liệu phần cứng
  getSystemStats: () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramUsage = Math.round((usedMem / totalMem) * 100);

    return {
      cpu: getCpuUsage(),
      ram: ramUsage
    };
  },

  // Lấy thông tin media đang phát
  getMediaStats: () => getMediaStats(),

  // Gửi lệnh điều khiển nhạc qua daemon (không cần qua main process)
  sendMediaControl: (action) => {
    sendMediaCommand(action);
  },

  // Tua bài hát đến vị trí (ms)
  sendMediaSeek: (ms) => {
    sendMediaCommand('seek ' + Math.round(ms));
  },

  // Trạng thái mic/camera đang dùng
  getPrivacy: () => sendMediaCommand('privacy')
});
