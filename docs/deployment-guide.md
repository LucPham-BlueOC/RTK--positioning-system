# Hướng dẫn triển khai

Trạng thái: **đề xuất** cho Giai đoạn 1 (chưa có code). Cập nhật khi các file
trong `deploy/` được tạo. Lý do chọn công nghệ nằm ở [tech-stack.md](./tech-stack.md).

## Yêu cầu bắt buộc

Geolocation API chỉ chạy trên HTTPS (hoặc `localhost`). Điện thoại truy cập máy
dev qua IP LAN dạng `http://192.168...` sẽ **không** lấy được vị trí, nên mọi môi
trường thử trên điện thoại đều cần HTTPS.

## Môi trường

| Môi trường | Cách chạy | URL |
|------------|-----------|-----|
| Local | `pnpm dev` (Vite + server) | `http://localhost:5173` (chỉ máy tính) |
| Dev trên điện thoại | `pnpm dev` + Cloudflare Quick Tunnel | `https://<ngẫu-nhiên>.trycloudflare.com` |
| Công khai | Docker Compose + Caddy trên VPS | `https://<tên-miền>` (chưa chọn) |

## Dev trên điện thoại

1. Chạy `pnpm dev`. Vite chạy cổng 5173 và chuyển tiếp `/api` và `/ws` sang server
   ở cổng 8787.
2. Chạy `cloudflared tunnel --url http://localhost:5173`.
3. Mở URL `trycloudflare.com` trên cả hai điện thoại.

Vite chặn host lạ theo mặc định; cấu hình `server.allowedHosts` cho phép
`.trycloudflare.com`. URL Quick Tunnel đổi mỗi lần chạy và không có cam kết sẵn
sàng, chỉ dùng để thử.

## Môi trường công khai

### Thành phần

- Một VPS Linux nhỏ (1 vCPU, 1 GB RAM đủ cho Giai đoạn 1).
- Tên miền trỏ bản ghi A/AAAA về VPS.
- Docker Compose chạy hai container:
  - `app`: image Node build từ `deploy/Dockerfile` (multi-stage: build web và
    server, chạy server, server phục vụ file web tĩnh).
  - `caddy`: tự lấy và gia hạn chứng chỉ Let's Encrypt, chuyển tiếp HTTPS và WSS
    sang `app:8787`.
- Volume `data/` chứa file SQLite.

### Biến môi trường

| Biến | Ý nghĩa | Mặc định |
|------|---------|----------|
| `PORT` | Cổng server | `8787` |
| `DATABASE_PATH` | Đường dẫn file SQLite | `/data/app.db` |
| `ROOM_TTL_HOURS` | Thời gian sống của phòng | `24` |
| `DATA_RETENTION_DAYS` | Thời gian giữ mẫu | `7` |
| `PAIRING_WINDOW_MS` | Ngưỡng ghép mẫu | `1000` |
| `PUBLIC_ORIGIN` | Origin được phép kết nối WebSocket | — (bắt buộc) |

Không có secret nào ở Giai đoạn 1. Nếu sau này có (ví dụ tài khoản NTRIP ở Giai
đoạn 4), lưu trong file `.env` trên VPS và trong GitHub Actions secrets, không commit.

### Quy trình phát hành

1. Merge vào `main`; CI chạy lint, typecheck, test, build image.
2. CI đẩy image lên GitHub Container Registry với tag commit.
3. Trên VPS: `docker compose pull && docker compose up -d`.
4. Kiểm tra: `curl https://<tên-miền>/healthz` trả `200`, rồi mở trên hai điện
   thoại thật, vào cùng phòng, thấy vị trí của nhau.

### Sao lưu và khôi phục

- Sao lưu: chạy `sqlite3 /data/app.db ".backup /data/backup-<ngày>.db"` theo cron hằng ngày.
- Lùi phiên bản: `docker compose up -d` với tag image trước đó. Migration chỉ
  thêm cột/bảng để phiên bản cũ vẫn đọc được cơ sở dữ liệu mới.

## Giai đoạn sau

| Giai đoạn | Thay đổi triển khai |
|-----------|---------------------|
| 2 | Thêm container `rtk-worker` (Python + RTKLIB `demo5` build từ source), volume chung cho file thô. APK Android phân phối nội bộ (cài trực tiếp hoặc Google Play internal testing). |
| 3 | App iOS qua TestFlight (cần tài khoản Apple Developer). |
| 4 | Biến môi trường cho NTRIP caster nếu dùng CORS. |
