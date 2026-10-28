# Phần 5: Chạy trên laptop

Trạng thái: **xong (đã kiểm tra local)**

## Kết quả

- `pnpm build && pnpm start` chạy giao diện + server ở `127.0.0.1:8787`.
- `pnpm tunnel` mở Cloudflare Quick Tunnel tới cổng đó và in địa chỉ HTTPS công khai.
- Hướng dẫn đầy đủ: [deployment-guide.md](../../docs/deployment-guide.md).

## Kiểm chứng

Đã chạy `pnpm start` trên laptop: `/healthz` trả `{"ok":true}`, `/r/A7K2` trả trang
HTML, CSV phòng không tồn tại trả 404, server chỉ nghe `127.0.0.1`.

Chưa kiểm tra qua tunnel: lệnh mở tunnel công khai cần người dùng tự chạy.
