# Phần 3: Server realtime

Trạng thái: **xong**

## Kết quả (`apps/server`)

- Fastify 5 + `@fastify/websocket`, chạy bằng `tsx`, nghe `127.0.0.1:8787`.
- SQLite qua `node:sqlite`; migration `migrations/001-init.sql`, theo dõi bằng `PRAGMA user_version`.
- Phòng: mã 4 ký tự, tối đa 2 máy, hết hạn vào sau 24 giờ, xóa dữ liệu sau 7 ngày,
  giới hạn 20 lần nhập sai mã / 10 phút / IP.
- Đồng hồ: `clock.ping` → `clock.pong` với giờ server.
- Mẫu: lưu không trùng theo `(phòng, máy, seq)`, xác nhận bằng `sample.ack`, chỉ phát mẫu mới cho máy kia,
  gửi lịch sử khi vào phòng.
- Phiên đo tĩnh: một phiên một lúc, tự kết thúc theo giờ, gán mẫu theo khoảng thời gian.
- `GET /api/rooms/:code/export.csv?kind=samples|pairs&session=<id>`, `GET /healthz`.
- Phục vụ giao diện đã build, chuyển `/r/:code` về `index.html`.
- Giới hạn message 512 KB và 20 message/giây mỗi kết nối.

## Kiểm chứng

`pnpm --filter @rtk/server test`: 11 test qua WebSocket thật (`injectWS`) gồm tạo/vào
phòng, phòng đầy, máy cũ vào lại, message sai, ping, gửi lại không trùng, lịch sử khi
vào lại, phiên tĩnh + CSV cặp có cột sai số, chặn phiên thứ hai, xóa phòng.

## Ghi chú

`trustProxy` của Fastify không dùng: sau Cloudflare Tunnel mọi request đến từ
localhost, nên IP thật lấy từ header `cf-connecting-ip`.
