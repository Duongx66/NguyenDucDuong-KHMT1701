# Bắn Gà — Demo

Hướng dẫn nhanh để chạy bản demo trên máy tính:

- Mở `index.html` bằng trình duyệt (Chrome/Edge/Firefox). Nếu dùng VS Code, có thể mở bằng extension Live Server.
- Cho phép webcam khi trình duyệt yêu cầu.
- Nhấn `Lấy màu` rồi click vào video nhỏ (góc phải) để chọn màu điều khiển (ví dụ găng tay/tấm màu sáng).
- Nhấn `Bắt đầu` để chơi. Có thể dùng phím ← → làm phương án dự phòng.

Ghi chú kỹ thuật:
- Dùng một thuật toán đơn giản: lấy centroid các pixel gần màu đã chọn (HSV) để điều khiển trục X của chiến cơ.
- Power-ups xuất hiện ngẫu nhiên (màu):
	- Xanh dương: `shield` — bảo vệ một lần (tiêu thụ khi bị trúng).
	- Đỏ: `maxHealth` — tăng máu tối đa (tối đa 5 máu).
	- Vàng: `extraBullets` — tăng số đạn đồng thời (tối đa 3 viên mỗi lần bắn).
	- Xanh lá: `rate` — tăng tốc độ bắn.
- Nếu muốn nâng cấp sang giải pháp chính xác hơn, mình có thể tích hợp MediaPipe Hands hoặc TensorFlow.js handpose.
