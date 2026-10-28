# Giai đoạn 1: Web app GPS thường (baseline)

Trạng thái: **đã cài đặt, chờ đo thực địa** · Tạo: 2026-10-28

Phạm vi chỉ gồm Giai đoạn 1. Các giai đoạn 2–4 (GNSS thô, UWB, RTK ngoài) chưa
có kế hoạch; định hướng công nghệ của chúng nằm cuối
[tech-stack.md](../../docs/tech-stack.md).

## Mục tiêu

Hai điện thoại (iPhone và Android) mở cùng một trang web, vào chung một phòng,
và thấy vị trí, khoảng cách, độ bất định của cả hai máy. Người dùng nhập khoảng
cách đo bằng thước để có thống kê sai số, làm mốc so sánh cho các giai đoạn sau.

## Ràng buộc

- Chạy trên laptop của người dùng (thay cho VPS), điện thoại vào qua Cloudflare
  Quick Tunnel để có HTTPS.
- Không đăng nhập; tối đa 2 máy một phòng.
- Giao diện tiếng Việt.

## Không làm

Đăng nhập, phòng hơn 2 máy, app native, dữ liệu GNSS thô, UWB, chạy nền khi tắt
màn hình (Safari không cho phép), máy chủ thuê.

## Các phần

| # | Phần | Trạng thái | Chi tiết |
|---|------|-----------|----------|
| 1 | Khung monorepo, lint, CI | Xong | [phase-01](./phase-01-workspace-setup.md) |
| 2 | Thư viện dùng chung: schema, geo, ghép mẫu, thống kê, CSV | Xong | [phase-02](./phase-02-shared-geo-math.md) |
| 3 | Server realtime + SQLite + CSV | Xong | [phase-03](./phase-03-realtime-server.md) |
| 4 | Web client: ghép cặp, thu vị trí, khoảng cách, đo tĩnh, so sánh, bản đồ, xuất CSV | Xong | [phase-04](./phase-04-web-client.md) |
| 5 | Chạy trên laptop qua Cloudflare Tunnel | Xong (kiểm tra local) | [phase-05](./phase-05-laptop-hosting.md) |
| 6 | Đo thực địa với hai điện thoại thật | Chưa làm | [phase-06](./phase-06-field-test.md) |

## Tiêu chí chấp nhận

| # | Tiêu chí | Bằng chứng |
|---|----------|------------|
| 1 | Hai máy vào cùng phòng bằng mã và bằng link QR | e2e `two-phones.spec.ts` (giả lập) |
| 1b | Laptop ở chế độ "Chỉ xem" không chiếm chỗ; hai điện thoại đo; "Rời phòng" nhường chỗ | e2e "a laptop watches while two phones measure"; test server "viewers and leaving" |
| 2 | Mỗi máy thấy vị trí, trạng thái tín hiệu, số mẫu của cả hai máy, khoảng 1 lần/giây | e2e (giả lập) |
| 3 | Khoảng cách và `± σ_d` hiển thị trên cả hai máy | e2e: 20 m, ± 5,66 m |
| 4 | Phiên tĩnh chạy đồng bộ trên hai máy, cho khoảng cách trung bình | e2e: bắt đầu trên A, B thấy đếm ngược, kết quả ~20 m |
| 5 | Nhập khoảng cách thật, thấy bias, độ lệch chuẩn, RMSE, sai số lớn nhất, biểu đồ | e2e: nhập trên B, A thấy thống kê |
| 6 | CSV đọc được và số liệu khớp màn hình | e2e đọc CSV cặp; test server kiểm tra cột và giá trị |
| 7 | Mất mạng rồi có lại: không mất, không trùng mẫu | Test server (gửi lại không trùng); hàng đợi phía client; **cần thử thật trên điện thoại** |
| 8 | Lint, typecheck, unit, e2e đều xanh | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` |
| 9 | Một iPhone và một Android thật đo trọn phiên tĩnh 5 phút ngoài trời qua tunnel | Phần 6, chưa làm |

## Định nghĩa hoàn thành

Giai đoạn 1 xong khi tiêu chí 1–9 đều đạt, trong đó tiêu chí 9 cần đo thật với
hai điện thoại theo [phase-06](./phase-06-field-test.md) và lưu CSV làm baseline.

## Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| Safari dừng gửi vị trí khi tắt màn hình | Wake Lock, cảnh báo trên màn hình, máy kia thấy trạng thái "Tạm dừng" |
| Laptop ngủ hoặc mất mạng giữa buổi đo | Tắt chế độ ngủ khi đo; client giữ hàng đợi và gửi lại khi server có lại |
| Địa chỉ Quick Tunnel đổi mỗi lần chạy | QR luôn lấy địa chỉ hiện tại; dùng Named Tunnel nếu cần địa chỉ cố định |
| `accuracy` của hệ điều hành không phản ánh sai số thật | Luôn so với khoảng cách thước |
