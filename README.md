# Dynamic Islands

Một "dynamic island" cho Windows 10/11: viên đen ở giữa đỉnh màn hình, co giãn bằng animation lò xo để hiện nhạc, hẹn giờ, thông báo và bảng điều khiển nhanh. Viết bằng Tauri 2 (Rust + HTML/CSS/JS).

## Tính năng

- **Nhạc đang phát** (Spotify, YouTube, trình duyệt… qua Windows Media Session): ảnh bìa, tên bài, thanh thời gian, ⏮ ⏯ ⏭, tua ±10 giây. Sóng nhạc nhảy theo 5 dải tần số thật (WASAPI loopback + FFT) và đổi màu theo ảnh bìa.
- **Island tách đôi** khi có hai hoạt động: hẹn giờ/bấm giờ giữ viên chính, nhạc tách thành bong bóng tròn.
- **Bảng điều khiển** (chuột phải): Thời tiết, Lịch, Bấm giờ, Ghi chú, Wi-Fi, Bluetooth, Chế độ máy bay, Âm lượng.
- **Lịch** có âm lịch, ngày lễ Việt Nam và đếm ngược ngày nghỉ tiếp theo.
- **Thời tiết** theo vị trí Windows (hoặc thành phố tự nhập), đường đi của mặt trời/mặt trăng trong ngày.
- **Bấm giờ** và **hẹn giờ đếm ngược** (báo rung + âm thanh khi hết giờ).
- **Wi-Fi**: danh sách mạng, kết nối, nhập mật khẩu. **Bluetooth**: thiết bị đã ghép đôi kèm % pin.
- **Popup** khi cắm sạc và khi tai nghe kết nối/ngắt (vòng pin xoay rồi lấp tới % pin), xong quay lại màn hình đang dùng.
- Tự **né sang bên** khi rê chuột vào mà phía sau có cửa sổ (giữ Ctrl để không né).
- **Tuỳ chỉnh** (chuột phải icon khay hệ thống): vị trí, kích thước, màu, ô chức năng, popup, animation, phím tắt, khởi động cùng Windows, thời tiết.

## Chạy

Cần: Node 20+, Rust (MSVC), Visual Studio Build Tools (C++), WebView2.

```powershell
npm install
npx tauri dev      # chạy thử
npx tauri build    # đóng gói bộ cài NSIS (src-tauri/target/release/bundle)
```

## Thao tác

- Chuột trái vào island: mở nội dung đang hiện (nhạc, hẹn giờ…).
- Chuột phải: bảng điều khiển. Esc hoặc nút ‹ để quay lại, bấm ra ngoài để thu gọn.
- Ctrl+Alt+I (mặc định): ẩn/hiện island.

## Nguồn và giấy phép bên thứ ba

- Thuật toán âm lịch: Hồ Ngọc Đức.
- Thời tiết và tìm thành phố: [Open-Meteo](https://open-meteo.com) (CC BY 4.0). Tên thành phố từ toạ độ: BigDataCloud reverse geocoding (client API miễn phí).
- Icon tai nghe: "AirPods Pro" từ [SVG Repo](https://www.svgrepo.com) (`airpods-pro-svgrepo-com.svg`); xem giấy phép trên trang của icon.
- Các icon khác vẽ riêng cho dự án.
