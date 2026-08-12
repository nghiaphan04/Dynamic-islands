# 🏝️ Dynamic Island

A **Dynamic Island** widget for Windows that mimics the iPhone's Dynamic Island UI, built with **Electron**.

The island always floats at the top-center of your screen. It auto-collapses/expands on hover or click and shows live CPU, RAM, the currently playing media, plus a quick app dock and device-status indicators.

![Electron](https://img.shields.io/badge/Electron-31.x-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **Compact mode** — a slim bar showing live **CPU** and **RAM**.
- **Expanded mode** — click the island to open a 440×220 panel containing:
  - **Media Player widget**: current track title, artist, album artwork, a seekable **progress bar** with time, and Play/Pause/Next/Prev controls.
  - **System widget**: CPU & RAM progress bars with color warnings (yellow ≥ 60%, red ≥ 85%).
- **Now playing detection** — automatically detects the playing track from any app (Spotify, YouTube, browsers...) via the Windows WinRT API.
- **App dock** — add up to **13 apps** (pick any `.exe`, icon auto-fetched); click to launch, hover to remove. Persisted across restarts.
- **Custom background** — set an **image or video** as the island background (auto-darkened so text stays readable).
- **Mic/Camera indicator** — a colored dot replaces the CPU readout while the microphone/camera is in use (orange = mic, yellow = camera, red = both).
- **Smart click-through** — only the island receives mouse input; surrounding transparent area never blocks your clicks.
- **Auto-collapse** — expands on hover, auto-collapses 2 seconds after the cursor leaves.
- **Always on top** — floats above every other window.
- **Launch at startup** — toggle right from the UI.
- **Task Manager button** — open Task Manager directly from the island.
- **Uninstall button** — one-click uninstall (NSIS), shown only in the installed build.
- **Localized UI** — automatically follows the system language (Vietnamese / English).

---

## 📋 Requirements

- Windows 10 or Windows 11
- [Node.js](https://nodejs.org/) ≥ 18

> No PowerShell needed. Media detection & control use a small compiled C# helper
> (`media-helper.exe`) that talks to Windows directly via the WinRT API.

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

### 📦 Build installer (.exe)

```bash
npm run dist
```

Creates `dist/Dynamic Island Setup 1.0.0.exe` (NSIS installer). No code-signing
certificate is used, so Windows SmartScreen may show a warning on first run
(click *More info → Run anyway*). The build requires an elevated (admin) shell.

---

## 🗂️ Project Structure

```
dynamic-island/
├── main.js            # Electron main process (window, IPC, autostart, dock, settings)
├── preload.js         # Secure bridge between Renderer and Node (CPU/RAM, calls media-helper)
├── renderer.js        # UI logic (expand/collapse, stats & media updates, dock, i18n)
├── index.html         # Dynamic Island UI (compact & expanded)
├── style.css          # All styling & animations
├── media-helper.cs    # C# helper (WinRT): now-playing track, media controls, privacy
├── media-helper.exe   # Pre-built helper binary (used at runtime)
├── build-helper.cmd   # Rebuild media-helper.exe with the built-in csc.exe
├── build-dist.cmd     # Build the NSIS installer (run elevated)
├── package.json       # Project config & dependencies
└── README.md
```

> `media-helper.exe` is pre-built and committed, so the app runs out of the box.
> Rebuild it any time with `build-helper.cmd` (uses the .NET Framework `csc.exe`
> that ships with Windows — no SDK, no PowerShell).

---

## 🧩 How It Works

| Component | Role |
|---|---|
| `main.js` | Creates a transparent frameless 480×250 Electron window that is always on top and never steals focus. Handles IPC for autostart, app dock, background picker, settings, cursor polling, and uninstall. |
| `preload.js` | Computes CPU % (from `os.cpus()`) and RAM % (from `os.totalmem()`), and talks to the `media-helper` daemon for media info, seeking and privacy state. |
| `media-helper.cs` / `media-helper.exe` | A persistent daemon using WinRT: `GlobalSystemMediaTransportControlsSessionManager` for the now-playing track and playback controls, and the Windows privacy ConsentStore for mic/camera-in-use detection. |
| `renderer.js` | Refreshes the UI every 2s (stats & privacy) and 1.5s (media), handles hover/click expand/collapse via real cursor polling, runs the visualizer-free artwork + progress UI and i18n. |

---

## ⌨️ Controls

| Action | Result |
|---|---|
| **Hover** the island | Keeps it open / cancels the collapse countdown |
| **Click** the island | Expands the island |
| **Move cursor away** | Auto-collapses after 2 seconds |
| **✕** | Quits the app completely |
| **Progress bar** | Click or drag to seek within the current track |
| **➕** | Add an app to the dock |
| **🖼** | Choose an image/video as the island background |
| **🗑 (footer)** | Uninstall the app (installed build only) |

---

## 🛠️ Troubleshooting

- **Media is not detected** — make sure the app playing music supports system media notifications (Spotify, browsers...).
- **Media position doesn't move** — some apps (browsers, TikTok web) don't push position continuously; the island extrapolates using the wall clock and re-syncs on each poll.
- **Camera indicator doesn't appear** — some apps use the camera through non-tracked paths (e.g., virtual cameras via OBS). Standard apps (Windows Camera, Chrome, Zalo, Zoom) are detected.
- **High memory with video background** — a looping video adds a software decoder process (~40 MB). Switch back to an image or restart the app to free it (the app auto-restarts when you switch video → image).
- **Island blocks your clicks** — the surrounding transparent area is click-through by design; only the island itself captures the mouse.

---

## 📄 License

This project is distributed under the [MIT](LICENSE) license.

---

---

# 🏝️ Dynamic Island

Widget **Dynamic Island** cho Windows, mô phỏng giao diện Dynamic Island của iPhone, được xây dựng bằng **Electron**.

Đảo luôn nằm nổi ở giữa mép trên màn hình, tự động thu gọn/mở rộng khi hover hoặc click, hiển thị CPU, RAM, bài nhạc đang phát, kèm dock ứng dụng nhanh và chỉ báo trạng thái thiết bị.

![Electron](https://img.shields.io/badge/Electron-31.x-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Tính năng

- **Chế độ thu gọn** — thanh nhỏ gọn hiển thị **CPU** và **RAM** trực tiếp.
- **Chế độ mở rộng** — click vào đảo để mở panel 440×220 gồm:
  - **Widget Media Player**: tên bài hát, ca sĩ, ảnh bìa, **thanh tiến trình có thể tua** kèm thời gian, các nút Play/Pause/Next/Prev.
  - **Widget Hệ thống**: thanh tiến trình CPU & RAM với cảnh báo màu (vàng ≥ 60%, đỏ ≥ 85%).
- **Nhận diện nhạc đang phát** — tự động phát hiện bài hát từ mọi ứng dụng (Spotify, YouTube, trình duyệt...) qua API WinRT của Windows.
- **Dock ứng dụng** — thêm tối đa **13 app** (chọn file `.exe`, tự lấy icon); click để mở, hover để xóa. Lưu vĩnh viễn qua mỗi lần khởi động lại.
- **Nền tùy chỉnh** — đặt **ảnh hoặc video** làm nền đảo (tự làm tối để chữ dễ đọc).
- **Chỉ báo Mic/Camera** — chấm màu thay chỗ CPU khi micro/camera đang dùng (cam = mic, vàng = camera, đỏ = cả hai).
- **Click xuyên thấu thông minh** — chỉ nhận tương tác chuột khi hover vào đảo, phần trong suốt không chặn thao tác.
- **Tự thu nhỏ** — mở rộng khi hover, tự thu nhỏ sau 2 giây khi chuột rời đi.
- **Luôn trên cùng** — nổi trên mọi ứng dụng khác.
- **Tự khởi động cùng Windows** — bật/tắt ngay trong giao diện.
- **Nút Task Manager** — mở Task Manager trực tiếp từ đảo.
- **Nút gỡ cài đặt** — gỡ app chỉ với 1 click (NSIS), chỉ hiện ở bản đã cài đặt.
- **Đa ngôn ngữ** — tự động theo ngôn ngữ hệ thống (Tiếng Việt / English).

---

## 📋 Yêu cầu hệ thống

- Windows 10 hoặc Windows 11
- [Node.js](https://nodejs.org/) ≥ 18

> Không cần PowerShell. Việc nhận diện & điều khiển nhạc dùng helper C# đã biên dịch
> (`media-helper.exe`), giao tiếp trực tiếp với Windows qua API WinRT.

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

### 📦 Đóng gói file cài đặt (.exe)

```bash
npm run dist
```

Tạo ra `dist/Dynamic Island Setup 1.0.0.exe` (trình cài NSIS). Vì không dùng chứng chỉ
ký số nên Windows SmartScreen có thể cảnh báo lần đầu (bấm *More info → Run anyway*).
Lưu ý: cần chạy build với quyền **admin**.

---

## 🗂️ Cấu trúc dự án

```
dynamic-island/
├── main.js            # Process chính Electron (cửa sổ, IPC, autostart, dock, settings)
├── preload.js         # Bridge an toàn giữa Renderer và Node (CPU/RAM, gọi media-helper)
├── renderer.js        # Logic giao diện (expand/collapse, stats & media, dock, i18n)
├── index.html         # Giao diện Dynamic Island (compact & expanded)
├── style.css          # Toàn bộ styling, hiệu ứng chuyển động
├── media-helper.cs    # Helper C# (WinRT): bài hát đang phát, điều khiển nhạc, quyền riêng tư
├── media-helper.exe   # File helper đã biên dịch sẵn (dùng lúc chạy)
├── build-helper.cmd   # Rebuild media-helper.exe bằng csc.exe có sẵn trên Windows
├── build-dist.cmd     # Build installer NSIS (chạy với quyền admin)
├── package.json       # Cấu hình dự án & dependencies
└── README.md
```

> `media-helper.exe` đã được biên dịch sẵn và commit kèm, nên app chạy ngay không cần build.
> Muốn rebuild bất cứ lúc nào: chạy `build-helper.cmd` (dùng `csc.exe` của .NET Framework
> có sẵn trên Windows — không cần SDK, không cần PowerShell).

---

## 🧩 Cách hoạt động

| Thành phần | Vai trò |
|---|---|
| `main.js` | Tạo cửa sổ Electron trong suốt 480×250, luôn trên cùng, không nhận focus. Xử lý IPC: autostart, dock app, chọn nền, settings, poll chuột, gỡ cài đặt. |
| `preload.js` | Tính % CPU (từ `os.cpus()`) và % RAM (từ `os.totalmem()`), giao tiếp với daemon `media-helper` để lấy media, tua và trạng thái quyền riêng tư. |
| `media-helper.cs` / `media-helper.exe` | Daemon chạy nền dùng WinRT: `GlobalSystemMediaTransportControlsSessionManager` cho bài hát đang phát + điều khiển, và privacy ConsentStore để phát hiện mic/camera đang dùng. |
| `renderer.js` | Cập nhật UI mỗi 2s (stats & privacy) và 1.5s (media), hover/click mở-thu gọn qua poll vị trí chuột thật, hiển thị ảnh bìa + thanh progress và i18n. |

---

## ⌨️ Điều khiển

| Thao tác | Kết quả |
|---|---|
| **Hover** vào đảo | Giữ đảo mở / hủy đếm ngược thu gọn |
| **Click** vào đảo | Mở rộng (expanded) |
| **Di chuột ra ngoài** | Tự động thu gọn sau 2 giây |
| **✕** | Đóng hoàn toàn ứng dụng |
| **Thanh progress** | Click hoặc kéo để tua bài hát |
| **➕** | Thêm ứng dụng vào dock |
| **🖼** | Chọn ảnh/video làm nền đảo |
| **🗑 (footer)** | Gỡ cài đặt (chỉ bản đã cài) |

---

## 🛠️ Các vấn đề thường gặp

- **Không nhận diện được nhạc** — đảm bảo app phát nhạc hỗ trợ system media notification (Spotify, trình duyệt...).
- **Vị trí nhạc không chạy** — một số app (trình duyệt, TikTok web) không đẩy vị trí liên tục; đảo tự ngoại suy theo đồng hồ và đồng bộ lại mỗi lần poll.
- **Không thấy chỉ báo camera** — một số app dùng camera qua đường không được theo dõi (ví dụ virtual cam qua OBS). Các app chuẩn (Windows Camera, Chrome, Zalo, Zoom) đều phát hiện được.
- **RAM cao khi dùng video nền** — video chạy loop thêm 1 process decode phần mềm (~40MB). Đổi sang ảnh hoặc khởi động lại app để giải phóng (app tự restart khi đổi video → ảnh).
- **Đảo chặn thao tác** — phần trong suốt quanh đảo vốn click xuyên qua; chỉ đảo mới nhận chuột.

---

## 📄 Giấy phép

Dự án được phân phối dưới giấy phép [MIT](LICENSE).
