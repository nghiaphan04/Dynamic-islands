const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Tắt tăng tốc GPU để bỏ process GPU, giảm đáng kể bộ nhớ (đảo nhỏ, ít animation nên OK)
app.disableHardwareAcceleration();

// Giảm bộ nhớ renderer: giới hạn heap V8 (app rất nhẹ), tắt các tiến trình/tính năng không cần
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --max-semi-space-size=4');
app.commandLine.appendSwitch('disable-features', 'BackgroundTracing,SpareRendererForSitePerProcess,CalculateNativeWinOcclusion');

let mainWindow;
let islandExpanded = false;
let lastFollowDisplayId = null;

const WINDOW_WIDTH = 480;
const WINDOW_HEIGHT = 250;

function moveWindowToDisplay(display) {
  if (!mainWindow || !display) return;
  const { x, y, width } = display.workArea;
  mainWindow.setPosition(Math.round(x + (width - WINDOW_WIDTH) / 2), y + 10);
}

// Theo màn hình đang dùng (theo vị trí chuột) khi đảo đang thu gọn
function followCursorDisplay() {
  if (!mainWindow || islandExpanded) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  if (display.id !== lastFollowDisplayId) {
    lastFollowDisplayId = display.id;
    moveWindowToDisplay(display);
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  
  // Kích thước cố định tối đa cho cả lúc mở rộng, tránh việc thay đổi kích thước gây nháy hình
  const windowWidth = WINDOW_WIDTH;
  const windowHeight = WINDOW_HEIGHT;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((width - windowWidth) / 2),
    y: 10,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');

  // Chuyển hướng console từ Renderer sang Terminal để debug
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE] ${message} (at ${sourceId}:${line})`);
  });

  // Đưa cửa sổ lên trên cùng
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Không nhận focus: click ra ngoài sẽ không làm cửa sổ mất focus
  // → tránh flicker đen (window trong suốt render phần mềm) khi click ngoài
  mainWindow.setFocusable(false);

  // Bắt đầu chế độ click xuyên qua các phần trong suốt
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Nhận tín hiệu đổi chế độ chuột (hover vào đảo thì nhận tương tác, ra ngoài thì click xuyên qua)
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  });

  // Lấy vị trí chuột toàn màn hình (đơn vị DIP, khớp CSS pixel)
  ipcMain.handle('get-cursor-pos', () => {
    return screen.getCursorScreenPoint();
  });

  // Renderer báo trạng thái mở/thu gọn để quyết định có theo màn hình không
  ipcMain.on('set-island-expanded', (event, expanded) => {
    islandExpanded = !!expanded;
    if (!expanded) {
      const cursor = screen.getCursorScreenPoint();
      lastFollowDisplayId = screen.getDisplayNearestPoint(cursor).id;
    }
  });

  // Tự động khởi động cùng Windows
  ipcMain.on('set-autostart', (event, enable) => {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: app.getPath('exe')
    });
  });

  ipcMain.handle('get-autostart', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  // Lấy ngôn ngữ hệ thống để bản địa hóa giao diện
  ipcMain.handle('get-locale', () => {
    return app.getLocale();
  });

  // Đóng ứng dụng
  ipcMain.on('close-app', () => {
    app.quit();
  });

  // Khởi động lại app (giải phóng process decode video cũ khi đổi video → ảnh)
  ipcMain.on('restart-app', () => {
    app.relaunch();
    app.exit(0);
  });

  // Mở Task Manager (tách riêng process, không block)
  ipcMain.on('open-task-manager', () => {
    const { spawn } = require('child_process');
    spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' }).unref();
  });

  // Kiểm tra xem có trình gỡ cài đặt không (chỉ bản đã cài NSIS mới có)
  ipcMain.handle('can-uninstall', () => {
    if (!app.isPackaged) return false;
    return fs.existsSync(uninstallerPath());
  });

  // Gỡ cài đặt: chạy uninstaller NSIS rồi thoát app
  ipcMain.on('uninstall-app', () => {
    const { spawn } = require('child_process');
    const uninstaller = uninstallerPath();
    if (fs.existsSync(uninstaller)) {
      spawn(uninstaller, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    }
  });

  // === DOCK APP (thêm ứng dụng vào Dynamic Island) ===
  const appsFile = () => path.join(app.getPath('userData'), 'dock-apps.json');

  // Mở hộp thoại chọn file .exe, lấy icon ứng dụng
  ipcMain.handle('pick-app', async () => {
    const isVi = /^vi/i.test(app.getLocale());
    const res = await dialog.showOpenDialog(mainWindow, {
      title: isVi ? 'Chọn ứng dụng' : 'Select an application',
      properties: ['openFile'],
      filters: [{ name: isVi ? 'Ứng dụng' : 'Applications', extensions: ['exe'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    const exePath = res.filePaths[0];
    let icon = null;
    try {
      icon = (await app.getFileIcon(exePath)).toDataURL();
    } catch (err) { /* bỏ qua nếu không lấy được icon */ }
    return { path: exePath, name: path.basename(exePath, '.exe'), icon };
  });

  // Chạy ứng dụng từ dock
  ipcMain.handle('launch-app', (event, exePath) => {
    const { spawn } = require('child_process');
    try {
      spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (err) {
      return false;
    }
  });

  // Đọc danh sách app đã lưu
  ipcMain.handle('get-apps', () => {
    try {
      return JSON.parse(fs.readFileSync(appsFile(), 'utf8'));
    } catch (err) {
      return [];
    }
  });

  // Lưu danh sách app
  ipcMain.on('save-apps', (event, apps) => {
    try {
      fs.writeFileSync(appsFile(), JSON.stringify(apps));
    } catch (err) {
      console.error('Save apps error:', err);
    }
  });

  // === TÙY CHỈNH NỀN & THEME ===
  const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

  ipcMain.handle('get-settings', () => {
    try {
      return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    } catch (err) {
      return {};
    }
  });

  ipcMain.on('save-settings', (event, settings) => {
    try {
      fs.writeFileSync(settingsFile(), JSON.stringify(settings));
    } catch (err) {
      console.error('Save settings error:', err);
    }
  });

  // Chọn ảnh/video nền
  ipcMain.handle('pick-bg', async () => {
    const isVi = /^vi/i.test(app.getLocale());
    const res = await dialog.showOpenDialog(mainWindow, {
      title: isVi ? 'Chọn ảnh/video nền' : 'Choose background image/video',
      properties: ['openFile'],
      filters: [{
        name: isVi ? 'Hình ảnh & video' : 'Images & videos',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'mp4', 'webm', 'mov', 'm4v', 'mkv']
      }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    const ext = path.extname(file).toLowerCase().replace('.', '') || 'png';
    const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', 'mkv'];
    if (VIDEO_EXTS.includes(ext)) {
      return { type: 'video', src: pathToFileURL(file).href };
    }
    try {
      const buf = fs.readFileSync(file);
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' }[ext] || 'image/png';
      return { type: 'image', src: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (err) {
      return null;
    }
  });
}

function uninstallerPath() {
  return path.join(path.dirname(process.execPath), 'Uninstall Dynamic Island.exe');
}

app.whenReady().then(() => {
  createWindow();

  // Cắm thêm màn hình → đưa đảo sang màn hình mới; rút màn hình → quay về màn hình chính
  screen.on('display-added', (event, display) => {
    lastFollowDisplayId = display.id;
    moveWindowToDisplay(display);
  });
  screen.on('display-removed', (event, display) => {
    lastFollowDisplayId = screen.getPrimaryDisplay().id;
    moveWindowToDisplay(screen.getPrimaryDisplay());
  });

  // Theo dõi màn hình đang dùng theo vị trí chuột
  lastFollowDisplayId = screen.getPrimaryDisplay().id;
  setInterval(followCursorDisplay, 500);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
