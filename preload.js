const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const MEDIA_HELPER = path.join(__dirname, 'media-helper.exe');

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

function getMediaStats() {
  return new Promise((resolve) => {
    // Gọi helper C# đã biên dịch (media-helper.exe) để lấy thông tin nhạc đang phát (WinRT)
    exec(`"${MEDIA_HELPER}" get`, (err, stdout) => {
      if (err) {
        resolve({ status: 'stopped' });
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        resolve({ status: 'stopped' });
      }
    });
  });
}

contextBridge.exposeInMainWorld('api', {
  // Quản lý tương tác chuột
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),

  // Cấu hình khởi động cùng win
  setAutostart: (enable) => ipcRenderer.send('set-autostart', enable),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),

  // Đóng app
  closeApp: () => ipcRenderer.send('close-app'),

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

  // Gửi lệnh điều khiển nhạc
  sendMediaControl: (action) => ipcRenderer.send('media-control', action)
});
