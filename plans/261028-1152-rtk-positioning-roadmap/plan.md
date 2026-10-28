# Lộ trình: Hệ thống đo khoảng cách giữa hai điện thoại

Trạng thái: **chưa bắt đầu** · Tạo: 2026-10-28

## Mục tiêu

Hai điện thoại vào cùng một phòng. App hiển thị vị trí hai máy, khoảng cách giữa
chúng và độ bất định, rồi so với khoảng cách thật đo bằng thước. Mỗi giai đoạn
thêm một nguồn định vị chính xác hơn và so với baseline của Giai đoạn 1.

Tài liệu liên quan: [tech-stack.md](../../docs/tech-stack.md),
[architecture.md](../../docs/architecture.md),
[deployment-guide.md](../../docs/deployment-guide.md).

## Các giai đoạn

| # | Giai đoạn | Trạng thái | Phụ thuộc | Kết quả mong đợi | Chi tiết |
|---|-----------|-----------|-----------|------------------|----------|
| 1 | Web app GPS thường | Chưa bắt đầu | — | Chạy trên mọi điện thoại, sai số vài mét | [phase-01](./phase-01-web-gps-baseline.md) |
| 2 | GNSS thô trên Android + RTKLIB | Chưa bắt đầu | 1 | Sai số cấp dm nếu điện thoại tốt | [phase-02](./phase-02-android-raw-gnss.md) |
| 3 | UWB | Chưa bắt đầu | 1 | Trong nhà, sai số 10–30 cm | [phase-03](./phase-03-uwb-ranging.md) |
| 4 | Máy thu RTK ngoài | Chưa bắt đầu | 1, nên có 2 | Sai số cấp cm | [phase-04](./phase-04-external-rtk-receiver.md) |

Giai đoạn 3 chỉ phụ thuộc Giai đoạn 1 (cần phòng và kênh trao đổi), nên có thể
làm song song với Giai đoạn 2 nếu đủ người.

## Tiêu chí chấp nhận chung

1. Mỗi giai đoạn có ít nhất một bộ dữ liệu thực địa theo
   [quy trình đo](./field-test-protocol.md), xuất CSV và lưu trong `data/field-tests/`.
2. Kết quả mỗi giai đoạn được so với baseline Giai đoạn 1 tại cùng địa điểm và
   cùng khoảng cách thật.
3. Thống kê (bias, độ lệch chuẩn, RMSE, sai số lớn nhất) tính bằng chung một mã
   trong `packages/shared`.

## Định nghĩa hoàn thành

Giai đoạn 1 hoàn thành khi app chạy trên HTTPS công khai, hai điện thoại thật
(một iPhone, một Android) đo được trọn một phiên tĩnh 5 phút ngoài trời, và file
CSV mở được bằng pandas với số liệu khớp màn hình.

## Rủi ro chính

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|--------|-----------|------------|
| Safari dừng cập nhật vị trí khi tắt màn hình | Mất mẫu | Wake Lock, cảnh báo rõ, đánh dấu khoảng trống |
| Điện thoại không có pha sóng mang | Giai đoạn 2 không đạt cấp dm | Kiểm tra thiết bị trước bằng GnssLogger |
| UWB giữa iPhone và Android không khả thi | Giai đoạn 3 chỉ chạy cặp cùng nền tảng | Spike nghiên cứu ở đầu giai đoạn 3 |
| `accuracy` của hệ điều hành không phản ánh sai số thật | Đánh giá sai | Luôn so với khoảng cách thước |

## Câu hỏi chưa giải quyết

1. Nhà cung cấp VPS và tên miền dùng cho môi trường công khai.
2. Danh sách điện thoại thật sẽ dùng để thử (quyết định khả năng của Giai đoạn 2 và 3).
3. Ở Giai đoạn 4 dùng trạm NTRIP/CORS nào, hay tự làm base cục bộ.
