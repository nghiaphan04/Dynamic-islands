const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  
  // Kích thước cố định tối đa cho cả lúc mở rộng, tránh việc thay đổi kích thước gây nháy hình
  const windowWidth = 480;
  const windowHeight = 250;

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

  // Bắt đầu chế độ click xuyên qua các phần trong suốt
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Nhận tín hiệu đổi chế độ chuột (hover vào đảo thì nhận tương tác, ra ngoài thì click xuyên qua)
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    mainWindow.setIgnoreMouseEvents(ignore, options);
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

  // Đóng ứng dụng
  ipcMain.on('close-app', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
