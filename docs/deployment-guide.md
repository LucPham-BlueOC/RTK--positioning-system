# Hướng dẫn triển khai (laptop)

App chạy trên laptop của bạn. Điện thoại vào qua một địa chỉ HTTPS công khai do
Cloudflare Tunnel tạo ra, nên điện thoại ở ngoài trời dùng 4G vẫn vào được,
miễn là laptop đang bật và có mạng. Lý do chọn công nghệ nằm ở
[tech-stack.md](./tech-stack.md).

## Vì sao cần HTTPS

Geolocation API chỉ chạy trên HTTPS (hoặc `localhost`). Điện thoại mở
`http://192.168.x.x` sẽ **không** lấy được vị trí. Cloudflare Tunnel cấp sẵn
HTTPS mà không cần tên miền, chứng chỉ hay mở cổng router.

## Cài đặt một lần

| Công cụ | Phiên bản | Kiểm tra |
|---------|-----------|----------|
| Node.js | 22.13 trở lên (đã thử với 24) | `node -v` |
| pnpm | 10 trở lên | `pnpm -v` |
| cloudflared | bản bất kỳ gần đây | `cloudflared --version` |

```bash
pnpm install
```

Không cần cơ sở dữ liệu riêng: server dùng SQLite tích hợp sẵn trong Node
(`node:sqlite`), file nằm ở `data/app.db`.

## Chạy để đo (chế độ chính)

Mở hai terminal ở thư mục gốc repo:

```bash
# Terminal 1: build giao diện rồi chạy server ở 127.0.0.1:8787
pnpm build && pnpm start

# Terminal 2: mở đường hầm HTTPS tới server
pnpm tunnel
```

`pnpm tunnel` in ra một địa chỉ dạng `https://<từ-ngẫu-nhiên>.trycloudflare.com`.

1. Mở địa chỉ đó trên **laptop**: app chọn sẵn **Chỉ xem**, bấm **Tạo phòng mới**.
   Màn hình hiện mã phòng và mã QR. (Cũng có thể tạo phòng ngay trên điện thoại A.)
2. **Hai điện thoại** quét mã QR bằng camera, để chế độ **Máy đo**, đặt tên rồi bấm **Vào**.
3. Cho phép truy cập vị trí trên điện thoại khi trình duyệt hỏi.

Mỗi phòng có 2 chỗ cho máy đo; laptop ở chế độ xem không chiếm chỗ. Nếu lỡ vào
bằng laptop như một máy đo, bấm **Rời phòng** (hoặc vào lại bằng **Chỉ xem**) để
nhường chỗ cho điện thoại.

Kiểm tra nhanh trên laptop: `curl http://127.0.0.1:8787/healthz` trả `{"ok":true}`.

Dừng: `Ctrl+C` ở cả hai terminal.

### Lưu ý về Quick Tunnel

- Địa chỉ đổi mỗi lần chạy `pnpm tunnel`. Mã QR luôn lấy địa chỉ hiện tại nên
  không ảnh hưởng tới việc ghép máy, nhưng các link cũ sẽ không mở được nữa.
- Quick Tunnel không có cam kết về độ ổn định; đủ cho buổi đo thử nghiệm.
- Nếu muốn địa chỉ cố định, tạo Named Tunnel với tên miền của bạn trên
  Cloudflare (cần tài khoản), trỏ tới `http://localhost:8787`.

## Chạy khi phát triển

```bash
# Terminal 1: Vite (5173) và server (8787) cùng lúc, tự tải lại khi sửa code
pnpm dev

# Terminal 2 (nếu muốn thử trên điện thoại)
pnpm tunnel:dev
```

Vite chuyển `/api`, `/ws`, `/healthz` sang server và đã cho phép host
`.trycloudflare.com`.

## Biến môi trường

Tất cả đều có giá trị mặc định; chỉ đặt khi cần thay đổi.

| Biến | Ý nghĩa | Mặc định |
|------|---------|----------|
| `HOST` | Địa chỉ server lắng nghe | `127.0.0.1` |
| `PORT` | Cổng server | `8787` |
| `DATABASE_PATH` | File SQLite | `data/app.db` |
| `WEB_DIST_PATH` | Thư mục build giao diện | `apps/web/dist` |
| `ROOM_TTL_HOURS` | Sau bao lâu thì không vào phòng được nữa | `24` |
| `DATA_RETENTION_DAYS` | Sau bao lâu thì xóa phòng và dữ liệu | `7` |
| `PAIRING_WINDOW_MS` | Ngưỡng ghép mẫu khi xuất CSV | `1000` |
| `PUBLIC_ORIGIN` | Nếu đặt, chỉ nhận WebSocket từ origin này | trống (nhận mọi origin) |

Server mặc định chỉ nghe trên `127.0.0.1`, nên máy khác trong mạng LAN không gọi
thẳng vào được; chỉ Cloudflare Tunnel trên chính laptop mới tới được server. Giới
hạn thử mã phòng dựa vào header `cf-connecting-ip` mà tunnel gắn vào request. Nếu
đổi `HOST` thành `0.0.0.0`, máy trong LAN có thể giả header này.

Không có secret nào ở giai đoạn 1.

## Dữ liệu, sao lưu và xóa

- Dữ liệu nằm ở `data/app.db` (kèm `app.db-wal`, `app.db-shm` khi server đang chạy).
  Thư mục `data/` không được commit.
- Sao lưu khi server đang chạy: `sqlite3 data/app.db ".backup data/backup-$(date +%F).db"`.
- Server tự xóa phòng cũ hơn `DATA_RETENTION_DAYS` mỗi giờ. Nút **Xóa phòng** trong
  app xóa ngay một phòng.
- Muốn xóa sạch: dừng server rồi xóa `data/app.db*`.

## Kiểm thử

```bash
pnpm lint
pnpm typecheck
pnpm test        # unit + server
pnpm test:e2e    # Playwright: 2 điện thoại giả lập; lần đầu chạy:
                 # pnpm --filter @rtk/web exec playwright install chromium
```

CI (`.github/workflows/ci.yml`) chạy cùng các lệnh này khi push lên `main` hoặc mở PR.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|------------|------------------------|------------|
| `pnpm start` báo cổng 8787 đang dùng | Server cũ chưa tắt | `ss -ltnp \| grep 8787` để tìm PID rồi dừng nó |
| Điện thoại báo "Định vị chỉ chạy qua HTTPS" | Mở bằng địa chỉ `http://` | Dùng địa chỉ `https://…trycloudflare.com` |
| Trang mở được nhưng "Đang kết nối lại…" mãi | Server đã tắt hoặc tunnel trỏ sai cổng | Kiểm tra terminal 1; `pnpm tunnel` trỏ tới 8787, `pnpm tunnel:dev` tới 5173 |
| Giao diện trống khi chạy `pnpm start` | Chưa build | Chạy `pnpm build` trước |
| iPhone ngừng gửi vị trí | Màn hình tắt hoặc chuyển app | Giữ màn hình sáng, không rời trang khi đo |
