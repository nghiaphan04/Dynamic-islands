# 🏝️ Dynamic Island

A **Dynamic Island** widget for Windows that mimics the iPhone's Dynamic Island UI, built with **Electron**.

The island always floats at the top-center of your screen. It auto-collapses/expands on hover or click and shows live CPU, RAM, and the currently playing media across your system.

![Electron](https://img.shields.io/badge/Electron-31.x-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **Compact mode** — a slim 170×30 bar showing CPU and RAM right on the island.
- **Expanded mode** — click the island to open a 440×200 panel containing:
  - **Media Player widget**: current track title, artist, album-art visualizer and media controls (Play/Pause, Next, Prev).
  - **System widget**: CPU & RAM progress bars with color warnings (yellow ≥ 60%, red ≥ 85%).
- **Now playing detection** — automatically detects the playing track from any app (Spotify, YouTube, browsers...) via the Windows 10/11 WinRT API.
- **Media controls** — press Play/Pause, Next, Prev straight from the island.
- **Marquee effect** — long track titles scroll continuously.
- **Music visualizer** — animated equalizer bars while music is playing.
- **Smart click-through** — only the island receives mouse input; the surrounding transparent area never blocks your clicks.
- **Launch at startup** — toggle right from the UI.
- **Always on top** — floats above every other window.

---

## 📋 Requirements

- Windows 10 or Windows 11
- [Node.js](https://nodejs.org/) ≥ 18
- PowerShell (built into Windows)

---

## 🚀 Installation & Usage

```bash
# 1. Clone the repository
git clone https://github.com/nghiaphan04/Dynamic-islands.git
cd Dynamic-islands

# 2. Install dependencies
npm install

# 3. Run the app
npm start
```

> Tip: run `npm start` at logon and enable **"Launch at startup"** from the island for a true Dynamic Island experience.

---

## 🗂️ Project Structure

```
dynamic-island/
├── main.js            # Electron main process (window, IPC, autostart, media control)
├── preload.js         # Secure bridge between Renderer and Node (CPU/RAM, calls PowerShell)
├── renderer.js        # UI logic (expand/collapse, stats & media updates, visualizer)
├── index.html         # Dynamic Island UI (compact & expanded)
├── style.css          # All styling & animations
├── get-media.ps1      # PowerShell script to fetch the now-playing track (WinRT)
├── package.json       # Project config & dependencies
└── README.md
```

---

## 🧩 How It Works

| Component | Role |
|---|---|
| `main.js` | Creates a transparent frameless 480×250 Electron window that is always on top. Handles IPC for closing the app, autostart, and sending media keys. |
| `preload.js` | Computes CPU % (from `os.cpus()`) and RAM % (from `os.totalmem()`), and runs `get-media.ps1` to fetch media info. |
| `get-media.ps1` | Uses the WinRT API `GlobalSystemMediaTransportControlsSessionManager` to fetch the title, artist, album and artwork of the currently playing track system-wide. |
| `renderer.js` | Refreshes the UI every 2s (stats) and 1.5s (media), handles hover/click to expand or collapse the island, runs the visualizer and marquee effects. |

---

## ⌨️ Controls

| Action | Result |
|---|---|
| **Hover** the island | Keeps the island open / cancels the collapse countdown |
| **Click** the island | Expands the island |
| **Move mouse away** | Auto-collapses after 2 seconds |
| **✕** | Quits the app completely |

---

## 🛠️ Troubleshooting

- **Media is not detected** — make sure the app playing music is running on Windows (Spotify, browsers and media-notification apps are supported). Some apps need system media notifications enabled.
- **Island blocks your clicks** — if the transparent area around the island blocks clicks, make sure `main.js` calls `setIgnoreMouseEvents(true, { forward: true })`.
- **CPU always shows 0%** — CPU is sampled over a 2-second interval, so it needs a moment to update.

---

## 📄 License

This project is distributed under the [MIT](LICENSE) license.

---

---

# 🏝️ Dynamic Island

Widget **Dynamic Island** cho Windows, mô phỏng giao diện Dynamic Island của iPhone, được xây dựng bằng **Electron**.

Đảo luôn nằm nổi ở giữa mép trên màn hình, tự động thu gọn/mở rộng khi hover hoặc click, hiển thị thông tin CPU, RAM và trình phát nhạc đang chạy trên hệ thống.

![Electron](https://img.shields.io/badge/Electron-31.x-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Tính năng

- **Trạng thái thu gọn (Compact)** — thanh nhỏ gọn 170×30 hiển thị CPU và RAM trực tiếp trên đảo.
- **Trạng thái mở rộng (Expanded)** — click vào đảo để mở panel 440×200 chứa:
  - Widget **Media Player**: hiển thị tên bài hát, ca sĩ, album art dạng visualizer và các nút điều khiển (Play/Pause, Next, Prev).
  - Widget **Hệ thống**: thanh tiến trình CPU & RAM với cảnh báo màu (vàng ≥ 60%, đỏ ≥ 85%).
- **Nhận diện nhạc đang phát** — tự động phát hiện bài hát từ mọi ứng dụng (Spotify, YouTube, trình duyệt...) qua API WinRT của Windows 10/11.
- **Điều khiển nhạc** — bấm Play/Pause, Next, Prev ngay trên đảo.
- **Hiệu ứng marquee** — tiêu đề bài hát chạy chữ liên tục khi quá dài.
- **Music visualizer** — thanh đập theo nhạc giả lập khi có bài đang phát.
- **Click xuyên thấu thông minh** — chỉ nhận tương tác chuột khi hover vào đảo, phần ngoài trong suốt không chặn thao tác của bạn.
- **Tự khởi động cùng Windows** — bật/tắt ngay trong giao diện.
- **Cửa sổ luôn trên cùng** — nổi trên mọi ứng dụng khác.

---

## 📋 Yêu cầu hệ thống

- Windows 10 hoặc Windows 11
- [Node.js](https://nodejs.org/) ≥ 18
- PowerShell (có sẵn trên Windows)

---

## 🚀 Cài đặt & chạy

```bash
# 1. Clone repository
git clone https://github.com/nghiaphan04/Dynamic-islands.git
cd Dynamic-islands

# 2. Cài đặt dependencies
npm install

# 3. Chạy ứng dụng
npm start
```

> Mẹo: chạy `npm start` ngay khi máy bật và bật tùy chọn **"Tự khởi động cùng Windows"** trong đảo để có trải nghiệm giống Dynamic Island thật.

---

## 🗂️ Cấu trúc dự án

```
dynamic-island/
├── main.js            # Process chính Electron (tạo cửa sổ, IPC, autostart, media control)
├── preload.js         # Bridge an toàn giữa Renderer và Node (CPU/RAM, gọi PowerShell)
├── renderer.js        # Logic giao diện (expand/collapse, cập nhật stats & media, visualizer)
├── index.html         # Giao diện Dynamic Island (compact & expanded)
├── style.css          # Toàn bộ styling, hiệu ứng chuyển động
├── get-media.ps1      # Script PowerShell lấy thông tin bài hát đang phát (WinRT)
├── package.json       # Cấu hình dự án & dependencies
└── README.md
```

---

## 🧩 Cách hoạt động

| Thành phần | Vai trò |
|---|---|
| `main.js` | Tạo cửa sổ Electron trong suốt 480×250, luôn trên cùng, không khung. Nhận lệnh IPC để đóng app, bật autostart, gửi phím điều khiển nhạc. |
| `preload.js` | Tính toán % CPU (từ `os.cpus()`) và % RAM (từ `os.totalmem()`), thực thi `get-media.ps1` để lấy thông tin nhạc. |
| `get-media.ps1` | Dùng API WinRT `GlobalSystemMediaTransportControlsSessionManager` để lấy title, artist, album và ảnh bìa của bài hát đang phát trên toàn hệ thống. |
| `renderer.js` | Cập nhật UI mỗi 2s (stats) và 1.5s (media), xử lý hover/click để mở rộng hoặc thu gọn đảo, chạy visualizer và hiệu ứng marquee. |

---

## ⌨️ Điều khiển

| Thao tác | Kết quả |
|---|---|
| **Hover** vào đảo | Giữ đảo mở / hủy đếm ngược thu gọn |
| **Click** vào đảo | Mở rộng (expanded) |
| **Di chuột ra ngoài** | Tự động thu gọn sau 2 giây |
| **✕** | Đóng hoàn toàn ứng dụng |

---

## 🛠️ Các vấn đề thường gặp

- **Không nhận diện được nhạc** — đảm bảo ứng dụng phát nhạc đang chạy trên Windows (hỗ trợ Spotify, trình duyệt, các app hỗ trợ hệ thống media). Một số ứng dụng cần bật media notification.
- **Đảo bị chặn thao tác** — nếu phần trong suốt quanh đảo chặn click, hãy chắc chắn `main.js` đã gọi `setIgnoreMouseEvents(true, { forward: true })`.
- **CPU hiển thị 0%** — chỉ số CPU tính theo khoảng thời gian lấy mẫu (2 giây), cần có thời gian để cập nhật.

---

## 📄 Giấy phép

Dự án được phân phối dưới giấy phép [MIT](LICENSE).
