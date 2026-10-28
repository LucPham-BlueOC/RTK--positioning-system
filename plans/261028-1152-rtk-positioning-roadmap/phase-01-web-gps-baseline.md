# Giai đoạn 1: Web app GPS thường (baseline)

Trạng thái: **chưa bắt đầu** · Phụ thuộc: không

## Bối cảnh

Đây là mốc so sánh cho mọi giai đoạn sau. Dùng Geolocation API trên trình duyệt,
chạy được trên iPhone và Android không cần cài đặt. Thiết kế chi tiết nằm ở
[architecture.md](../../docs/architecture.md).

## Yêu cầu

1. **Ghép cặp**: một máy tạo phòng và nhận mã 4 ký tự (ví dụ `A7K2`) kèm QR; máy
   kia nhập mã hoặc quét QR. Mỗi máy đặt tên ngắn ("Máy A", "Máy B").
2. **Thu vị trí**: khoảng 1 mẫu/giây. Mỗi mẫu gồm thời gian, vĩ độ, kinh độ, độ
   cao, accuracy, nguồn (suy luận). Hiển thị trạng thái tín hiệu, sai số hiện tại,
   số mẫu đã thu của từng máy.
3. **Khoảng cách**: Haversine, độ bất định `sqrt(accA² + accB²)`, ghép mẫu theo
   thời gian chênh dưới 1 giây dựa trên đồng hồ server.
4. **Đo tĩnh**: thu 1–5 phút, lấy trung bình vị trí mỗi máy, hiển thị khoảng cách tĩnh.
5. **So sánh**: nhập khoảng cách thật; hiển thị bias, độ lệch chuẩn, RMSE, sai số
   lớn nhất và biểu đồ khoảng cách theo thời gian.
6. **Bản đồ và xuất dữ liệu**: hai điểm, vòng tròn sai số, đám mây điểm đã thu;
   biểu đồ phân tán ENU; xuất CSV.

## Không làm trong giai đoạn này

- Đăng nhập, tài khoản, lịch sử nhiều phòng theo người dùng.
- Phòng hơn 2 máy.
- App native, dữ liệu GNSS thô, UWB.
- Chạy nền khi tắt màn hình (Safari không cho phép).

## Các bước thực hiện

### Bước 1: Khung dự án

- pnpm workspaces với `apps/web`, `apps/server`, `packages/shared`.
- TypeScript strict, ESLint, Prettier, Vitest.
- GitHub Actions: lint, typecheck, test.

### Bước 2: `packages/shared` (làm trước, có test)

- Schema Zod cho mẫu vị trí và mọi message WebSocket.
- `geo`: Haversine, ENU cục bộ, đổi ngược ENU sang kinh/vĩ.
- `pairing`: ghép hai chuỗi mẫu bằng hai con trỏ, ngưỡng cấu hình.
- `stats`: mean, std, RMSE, max, CEP50.
- Test với đáp án biết trước, ví dụ hai điểm cách nhau đúng 20,00 m theo hướng
  bắc và hướng đông tại vĩ độ Hà Nội và TP.HCM.

### Bước 3: Server

- Fastify + `@fastify/websocket` + `better-sqlite3`, migration SQL đơn giản.
- Phòng: sinh mã, tối đa 2 máy, hết hạn 24 giờ, giới hạn thử mã theo IP.
- `clock.ping/pong`, nhận `sample.batch` có idempotency theo `(device_id, seq)`,
  phát `sample.broadcast`.
- Phiên đo: `session.start/stop/truth`, phát trạng thái cho cả hai máy.
- `GET /api/rooms/:code/export.csv`, `GET /healthz`.
- Phục vụ file build của web client.
- Job dọn dữ liệu quá 7 ngày.

### Bước 4: Web client

- Màn hình vào: tạo phòng / nhập mã / mở từ link `/r/:code`; nhập tên máy.
- Xin quyền vị trí kèm giải thích; màn hình hướng dẫn khi bị từ chối.
- `watchPosition`, chuẩn hóa mẫu, suy luận nguồn, Wake Lock.
- Kết nối WebSocket, tự kết nối lại, hàng đợi gửi lại, đồng bộ đồng hồ.
- Màn hình realtime: thẻ trạng thái hai máy, khoảng cách lớn ở giữa kèm `± σ_d`.
- Bản đồ Leaflet (OSM + vệ tinh tùy chọn) và biểu đồ phân tán ENU.
- Chế độ đo tĩnh: chọn thời lượng, đếm ngược đồng bộ trên hai máy, kết quả trung bình.
- Màn hình so sánh: nhập khoảng cách thật (chấp nhận cả `20,00` và `20.00`),
  bảng thống kê, biểu đồ theo thời gian.
- Nút tải CSV.

### Bước 5: Triển khai

Theo [deployment-guide.md](../../docs/deployment-guide.md): dev qua Cloudflare
Quick Tunnel, môi trường công khai bằng Docker + Caddy trên VPS.

### Bước 6: Đo thực địa

Theo [quy trình đo](./field-test-protocol.md). Lưu CSV và một bản tóm tắt kết quả
làm baseline.

## File sẽ tạo

```text
package.json, pnpm-workspace.yaml, tsconfig.base.json, .github/workflows/ci.yml
packages/shared/src/{schema,geo,pairing,stats}.ts (+ *.test.ts)
apps/server/src/{index,rooms,ws,clock,store,export}.ts, apps/server/migrations/001-init.sql
apps/web/src/features/{room,location,sync,live,static-session,compare,map,export}/
deploy/{Dockerfile,docker-compose.yml,Caddyfile}
```

## Kiểm chứng

| Loại | Nội dung |
|------|----------|
| Unit (Vitest) | Haversine, ENU, ghép mẫu (có mẫu lệch giờ, mẫu thiếu), thống kê |
| Server | Tạo/vào phòng, phòng đầy, gửi lại mẫu không bị trùng, CSV đúng cột |
| E2E (Playwright) | Hai context giả lập vị trí cách nhau 20 m; kiểm tra khoảng cách hiển thị ~20 m và CSV |
| Thiết bị thật | iPhone Safari + Android Chrome qua HTTPS; mất mạng rồi có lại; tắt màn hình |
| Thực địa | Quy trình đo ngoài trời ở 3 khoảng cách |

## Tiêu chí chấp nhận

1. Hai máy thật (một iPhone, một Android) vào cùng phòng bằng mã và bằng QR.
2. Mỗi máy thấy vị trí, trạng thái tín hiệu và số mẫu của cả hai máy, cập nhật
   khoảng 1 lần/giây.
3. Khoảng cách và `± σ_d` hiển thị trên cả hai máy, sai khác giữa hai màn hình
   không quá một lần cập nhật.
4. Phiên tĩnh 5 phút chạy đồng bộ trên hai máy và cho ra khoảng cách trung bình.
5. Nhập khoảng cách thật, thấy đủ bias, độ lệch chuẩn, RMSE, sai số lớn nhất và
   biểu đồ theo thời gian.
6. CSV đọc được bằng `pandas.read_csv` và thống kê tính lại từ CSV khớp màn hình
   (sai khác dưới 1 mm).
7. Mất mạng 30 giây rồi có lại: không mất mẫu và không trùng mẫu.
8. Tất cả test unit và e2e chạy xanh trong CI.

## Rủi ro và cách lùi

- Leaflet không đủ zoom ở thang vài mét: biểu đồ ENU đã là màn hình chính để đọc
  độ phân tán, bản đồ chỉ để định hướng.
- Nếu server riêng gây trở ngại vận hành, có thể thay lớp `sync` bằng Supabase
  Realtime mà không đổi `packages/shared` và giao diện.
