# Tech Stack

Tài liệu này ghi lại các lựa chọn công nghệ và lý do. Kiến trúc tổng thể nằm ở
[architecture.md](./architecture.md); kế hoạch và trạng thái Giai đoạn 1 nằm ở
[plans/261028-1242-phase-1-web-gps-baseline/plan.md](../plans/261028-1242-phase-1-web-gps-baseline/plan.md);
cách chạy nằm ở [deployment-guide.md](./deployment-guide.md).

Trạng thái: Giai đoạn 1 **đã cài đặt** theo các lựa chọn dưới đây. Các mục cho
Giai đoạn 2–4 chỉ là định hướng, chưa nằm trong phạm vi hiện tại.

## Tóm tắt lựa chọn

| Lớp | Lựa chọn | Giai đoạn |
|-----|----------|-----------|
| Ngôn ngữ chung | TypeScript (strict) | 1+ |
| Quản lý monorepo | pnpm workspaces | 1+ |
| Web client | React 19 + Vite + TypeScript | 1+ |
| Style | Tailwind CSS 4 | 1+ |
| State phía client | Zustand | 1+ |
| Bản đồ | Leaflet (react-leaflet), nền OSM + ảnh vệ tinh Esri | 1+ |
| Biểu đồ | Recharts (khoảng cách theo thời gian); SVG tự vẽ (phân tán ENU) | 1+ |
| QR | `qrcode` (tạo mã); quét bằng camera hệ thống | 1+ |
| Server realtime | Node.js 22.13+ + Fastify 5 + `@fastify/websocket`, chạy bằng `tsx` | 1+ |
| Kiểm tra schema | Zod (dùng chung client/server) | 1+ |
| Lưu trữ | SQLite tích hợp sẵn trong Node (`node:sqlite`) | 1+ |
| Test | Vitest (unit, server), Playwright (e2e, giả lập vị trí) | 1+ |
| Lint & format | ESLint + typescript-eslint + react-hooks, Prettier | 1+ |
| Nơi chạy | Laptop của người dùng | 1 |
| HTTPS cho điện thoại | Cloudflare Quick Tunnel (`cloudflared`) | 1 |
| CI | GitHub Actions | 1+ |
| App Android | Kotlin + Jetpack Compose | 2, 3, 4 |
| Xử lý GNSS thô | RTKLIB bản `demo5` (rtklibexplorer), `rnx2rtkp` | 2 |
| Worker xử lý | Python 3.12 gọi RTKLIB CLI | 2 |
| App iOS | Swift + SwiftUI (Nearby Interaction) | 3 |
| UWB Android | `androidx.core.uwb` | 3 |
| Máy thu ngoài | u-blox ZED-F9P hoặc Unicore UM980, Bluetooth SPP | 4 |

## Giai đoạn 1: Web app

### Vì sao web app trước

Một trang web qua HTTPS chạy được trên cả iPhone (Safari) lẫn Android (Chrome)
mà không cần cài đặt hay ký app. Đây là cách nhanh nhất để có số liệu baseline.

### Client: React + Vite + TypeScript

- Vite cho dev server nhanh và build tĩnh nhỏ; build ra file tĩnh để server phục vụ.
- React vì hệ sinh thái bản đồ và biểu đồ đầy đủ (react-leaflet, Recharts).
- Zustand giữ state realtime (mẫu vị trí, trạng thái 2 máy) mà không cần boilerplate.
- Tailwind cho giao diện đơn giản, đọc tốt ngoài trời (tương phản cao).

Các Web API được dùng:

| API | Mục đích | Ghi chú |
|-----|----------|---------|
| `navigator.geolocation.watchPosition` | Thu vị trí | `enableHighAccuracy: true`, `maximumAge: 0`. Tần suất do hệ điều hành quyết định, thường khoảng 1 Hz. |
| Screen Wake Lock API | Giữ màn hình sáng khi đo | Safari hỗ trợ từ iOS 16.4. Nếu không có thì hiện cảnh báo. |
| WebSocket | Đồng bộ realtime | Tự kết nối lại khi mất mạng. |

**Giới hạn đã biết của Geolocation API:**

- Không cho biết nguồn vị trí (GPS hay mạng). App chỉ có thể **suy luận**:
  có `altitude` khác `null` và `accuracy` nhỏ (ví dụ dưới 20 m) thường là
  GNSS; ngược lại có thể là mạng/Wi‑Fi. Trường `source` vì vậy lưu giá trị
  `gnss-inferred` hoặc `network-inferred`, không phải giá trị chắc chắn.
- `accuracy` là ước tính của hệ điều hành. Android mô tả đây là bán kính với độ
  tin cậy 68%; iOS không công bố định nghĩa chính xác.
- Không có dữ liệu vệ tinh, SNR hay pha sóng mang. Những thứ này cần app native
  (Giai đoạn 2).

### Bản đồ: Leaflet

- Nhẹ, ổn định, hỗ trợ vẽ marker, vòng tròn sai số và hàng trăm điểm mẫu.
- Lớp nền OSM chỉ có tới zoom 19. Với khoảng cách 5–50 m cần zoom sâu hơn,
  nên dùng `maxNativeZoom: 19` và `maxZoom: 22`, kèm một lớp ảnh vệ tinh tùy chọn.
- Song song với bản đồ có một **biểu đồ phân tán theo mét (ENU cục bộ)**, không
  phụ thuộc tile. Ở thang vài mét, biểu đồ này dễ đọc hơn bản đồ.

Phương án đã cân nhắc: MapLibre GL (đẹp hơn nhưng nặng hơn và cần nguồn vector
tile). Không cần cho Giai đoạn 1.

### Server realtime: Node.js + Fastify + WebSocket

So sánh ba phương án trong yêu cầu:

| Tiêu chí | Firebase | Supabase | Server WebSocket riêng (chọn) |
|----------|----------|----------|-------------------------------|
| Thời gian dựng ban đầu | Nhanh nhất | Nhanh | Trung bình |
| Đồng hồ server để ghép mẫu | Có `serverTimestamp`, nhưng không đo được độ lệch đồng hồ từng máy | Tương tự | Tự đo độ lệch bằng ping (kiểu NTP), kiểm soát hoàn toàn |
| Chạy RTKLIB ở Giai đoạn 2 | Cần thêm máy chủ riêng | Cần thêm máy chủ riêng | Cùng hạ tầng, thêm một worker |
| Trao đổi token UWB ở Giai đoạn 3 | Được | Được | Được, dùng lại kênh phòng |
| Phụ thuộc nhà cung cấp | Cao | Trung bình | Thấp |
| Chi phí | Theo lượt đọc/ghi | Theo gói | Không (chạy trên laptop) |

Lý do chọn server riêng: Giai đoạn 2 bắt buộc có máy chủ chạy RTKLIB, và việc
ghép mẫu theo thời gian cần đo độ lệch đồng hồ của từng máy. Một server
TypeScript nhỏ giải quyết cả hai và dùng chung kiểu dữ liệu với client.

- Fastify: nhanh, có plugin WebSocket chính thức, phục vụ luôn file tĩnh của web
  client (một origin, không cần CORS).
- Zod: schema message dùng chung trong `packages/shared`, kiểm tra ở cả hai đầu.
- `tsx` chạy thẳng mã TypeScript, không có bước build riêng cho server.

### Lưu trữ: SQLite tích hợp trong Node

- Lượng dữ liệu nhỏ: 2 máy × 1 mẫu/giây × 5 phút = 600 mẫu một lần đo.
- `node:sqlite` có sẵn từ Node 22.13, không cần biên dịch module native như
  `better-sqlite3`, nên `pnpm install` trên laptop không phụ thuộc trình biên dịch C++.
- Một file, sao lưu bằng `sqlite3 .backup`, không cần dịch vụ cơ sở dữ liệu riêng.
- Migration là các file SQL đánh số trong `apps/server/migrations/`, theo dõi bằng
  `PRAGMA user_version`.

### Nơi chạy: laptop + Cloudflare Tunnel

Thay cho VPS. Server chạy trên laptop, chỉ nghe `127.0.0.1`; `cloudflared` mở một
đường hầm ra ngoài và cấp địa chỉ `https://….trycloudflare.com`.

| Tiêu chí | Laptop + Quick Tunnel (chọn) | VPS |
|----------|------------------------------|-----|
| Chi phí | Không | Thuê theo tháng |
| HTTPS | Có sẵn | Phải cấu hình Caddy/Let's Encrypt và tên miền |
| Điện thoại ngoài trời dùng 4G | Vào được | Vào được |
| Địa chỉ cố định | Không (đổi mỗi lần chạy) | Có |
| Luôn sẵn sàng | Chỉ khi laptop bật | Có |

Địa chỉ thay đổi không ảnh hưởng tới việc đo vì mã QR luôn lấy địa chỉ hiện tại.
Cách chạy chi tiết ở [deployment-guide.md](./deployment-guide.md).

### QR code

Mã QR chứa URL đầy đủ, ví dụ `https://<domain>/r/A7K2`. Máy thứ hai quét bằng
camera hệ thống (iOS và Android đều đọc được QR) và mở thẳng trang phòng. Không
cần viết trình quét QR trong app.

### Test

- Vitest cho phần tính toán dùng chung: Haversine, ENU, ghép mẫu, thống kê.
  Đây là phần cần đúng nhất nên có test với số liệu đã biết đáp án.
- Playwright cho luồng 2 máy: hai browser context, mỗi context được giả lập vị
  trí bằng `context.setGeolocation`, kiểm tra khoảng cách hiển thị.

## Định hướng cho các giai đoạn sau (ngoài phạm vi hiện tại)

Các mục dưới đây chưa có kế hoạch triển khai; chúng được giữ để Giai đoạn 1 không
chặn đường mở rộng.

## Giai đoạn 2: Dữ liệu GNSS thô (Android)

- **App Android (Kotlin + Jetpack Compose)**: dùng `GnssMeasurementsEvent`,
  `GnssNavigationMessage` (API 24+). Ghi file theo định dạng GnssLogger hoặc
  RINEX, tải lên server.
- **Yêu cầu thiết bị**: điện thoại có báo cáo pha sóng mang (accumulated delta
  range); tốt nhất là máy hai tần số L1/L5. Cần bật "Force full GNSS
  measurements" trong Developer options để tắt duty cycling.
- **RTKLIB bản `demo5`** (fork của rtklibexplorer, tối ưu cho máy thu giá rẻ và
  điện thoại). Chạy `rnx2rtkp` ở chế độ hậu xử lý (post-processing): một máy làm
  base, máy kia làm rover, kết quả là vector cơ sở giữa hai máy.
- **Chuyển đổi định dạng**: dùng công cụ chuyển log GnssLogger sang RINEX của
  rtklibexplorer, hoặc để app ghi thẳng RINEX. Cần kiểm chứng công cụ cụ thể khi
  bắt đầu giai đoạn này.
- **Worker Python** nhận file, chạy chuyển đổi và `rnx2rtkp`, đọc file `.pos`,
  ghi kết quả vào cơ sở dữ liệu. Python vì các công cụ chuyển đổi GNSS phổ biến
  viết bằng Python.

## Giai đoạn 3: UWB

- **iPhone**: Nearby Interaction (iPhone 11 trở lên có chip U1/U2). Hai iPhone
  cần trao đổi `NIDiscoveryToken`; server phòng dùng làm kênh trao đổi này.
- **Android**: `androidx.core.uwb` trên máy có UWB (ví dụ một số Pixel Pro và
  Galaxy Ultra). Tham số phiên cũng trao đổi qua server phòng.
- **Giới hạn**: cặp cùng nền tảng (iPhone–iPhone, Android–Android) là đường chắc
  chắn. Đo UWB giữa iPhone và Android chưa được xác nhận là khả thi với API công
  khai; xem đây là hạng mục nghiên cứu, không phải cam kết.
- Giai đoạn này bắt buộc có app native trên cả hai nền tảng; web không truy cập
  được UWB.

## Giai đoạn 4: Máy thu RTK ngoài

- **Module**: u-blox ZED-F9P hoặc Unicore UM980.
- **Kết nối**: Bluetooth Classic SPP (ví dụ module HC-05) hoặc BLE (ESP32 làm cầu
  nối). Web Bluetooth chỉ hỗ trợ BLE và không có trên Safari iOS, nên client là
  app Android native (mở rộng từ Giai đoạn 2).
- **Cách tính khoảng cách**: hai lựa chọn.
  1. Mỗi module nhận hiệu chỉnh RTCM từ một trạm NTRIP/CORS, mỗi module ra vị trí
     tuyệt đối cấp cm.
  2. Một module làm base cục bộ, gửi RTCM sang module kia qua server phòng. Khoảng
     cách tương đối đạt cấp cm mà không cần trạm CORS.
- Parse NMEA (GGA, GST) để lấy vị trí, trạng thái fix (RTK fixed/float) và sai số.

## Công cụ phát triển

| Công cụ | Mục đích |
|---------|----------|
| ESLint + Prettier | Lint và format |
| GitHub Actions | CI: lint, typecheck, test, e2e |
| `cloudflared` | Cấp địa chỉ HTTPS công khai cho server trên laptop |

## Giả định đã chọn

1. Chọn server WebSocket riêng thay vì Firebase hoặc Supabase (lý do ở bảng so sánh).
2. Không có đăng nhập. Ai có mã phòng thì vào được; phòng hết hạn vào sau 24 giờ,
   dữ liệu bị xóa sau 7 ngày.
3. Một phòng tối đa 2 máy ở Giai đoạn 1.
4. Giao diện tiếng Việt.
5. Chạy trên laptop của người dùng qua Cloudflare Quick Tunnel (theo yêu cầu, thay cho VPS).
