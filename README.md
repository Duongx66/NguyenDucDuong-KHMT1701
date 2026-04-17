# Bắn Ruồi — Demo

Một game bắn ruồi (shooter) nhỏ viết bằng HTML/CSS/JavaScript. Game dùng webcam (MediaPipe Hands) để điều khiển tàu hoặc có thể điều khiển bằng phím mũi tên.

Tính năng
- Điều khiển bằng bàn tay (MediaPipe Hands) hoặc phím mũi tên.
- Ruồi là kẻ địch, boss là ruồi lớn kèm ruồi con.
- Power-ups: shield, tăng HP, thêm đạn, tăng tốc bắn.
- Hiệu ứng hạt, phóng nổ, SFX cơ bản.
- Lưu kỉ lục (high-score) cục bộ bằng `localStorage`.
- Nền vũ trụ với Trái Đất và phi thuyền bảo vệ.

Tệp chính
- `index.html` — giao diện và DOM
- `style.css` — kiểu
- `game.js` — logic game (spawn, render, CV, input, SFX)

Yêu cầu
- Trình duyệt hiện đại (Chrome/Edge/Firefox).
- Cho phép truy cập webcam khi sử dụng điều khiển bằng tay.
- Kết nối internet để tải MediaPipe CDN (nếu dùng hand tracking).

Chạy trên máy (localhost)

Sử dụng Python (Port 8000):

```bash
python -m http.server 8000
# Mở http://localhost:8000/ trong trình duyệt
```

Hoặc dùng `serve` (Node):

```bash
npx serve .
# Mở địa chỉ mà serve thông báo (thường http://localhost:3000/)
```

Lưu ý: Không mở file trực tiếp (`file://`) nếu muốn truy cập webcam; dùng `http://localhost`.

Điều khiển
- Bàn tay: bật `Dùng bàn tay`, di chuyển cổ tay để điều khiển tàu (X/Y).
- Bàn phím: `←` `→` `↑` `↓` để di chuyển. Tự động bắn theo `fireRate` của tàu.
- Nút `Bắt đầu` / `Chơi lại` để bắt đầu hoặc reset.

Cơ chế level
- Level tăng dần vô hạn; boss xuất hiện ở level chia hết cho 3.
- Level 1 được làm dễ hơn: ít ruồi, ít bắn, tỉ lệ rớt powerup cao hơn.

High-score
- Lưu vào `localStorage` với khóa `bannuoi_highscore`.
- Để xóa kỉ lục, mở Console trình duyệt và chạy:

```js
localStorage.removeItem('bannuoi_highscore')
```

Gợi ý tùy chỉnh
- Thay đổi spawn, tốc độ, màu sắc ở `game.js`.
- Thêm hoặc tắt MediaPipe trong `index.html` nếu muốn chơi chỉ bằng phím.

Khắc phục sự cố
- Nếu MediaPipe không tải: kiểm tra kết nối Internet và console (CDN).
- Nếu không thấy webcam: cho phép quyền camera cho trang, tải lại trang và dùng `http://localhost`.

Muốn mình thêm gì vào README (hướng dẫn đóng gói, tối ưu, hay build nhỏ để chia sẻ) không?
