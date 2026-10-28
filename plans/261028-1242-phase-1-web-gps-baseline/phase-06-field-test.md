# Phần 6: Đo thực địa

Trạng thái: **chưa làm** (cần hai điện thoại thật và người đo)

Kết quả của phần này là baseline để so với các giai đoạn sau.

## Chuẩn bị

- Laptop: tắt chế độ ngủ, cắm sạc, có mạng; chạy `pnpm build && pnpm start` và
  `pnpm tunnel` theo [deployment-guide.md](../../docs/deployment-guide.md).
- Thước dây (tối thiểu 50 m), cọc hoặc vật đánh dấu, sạc dự phòng.
- Một iPhone (Safari) và một Android (Chrome): sạc đầy, tắt tiết kiệm pin, bật vị
  trí chính xác cao, độ sáng màn hình tối đa, tắt tự khóa màn hình.
- Địa điểm ngoài trời bầu trời thoáng, cách nhà cao và cây lớn ít nhất 20 m.

## Các bước

1. Đánh dấu điểm A, đo bằng thước các điểm B ở 10 m, 20 m và 50 m. Ghi khoảng cách
   đến hai chữ số thập phân.
2. Đặt hai máy nằm ngửa trên giá hoặc mặt phẳng cùng độ cao, màn hình hướng lên.
3. Vào cùng phòng (máy A tạo, máy B quét QR), chờ 30 giây để vị trí ổn định.
4. Với mỗi khoảng cách: nhập khoảng cách thật ở tab **So sánh**, rồi chạy một phiên
   **Đo tĩnh** 5 phút.
5. Thử mất mạng: bật chế độ máy bay trên một máy khoảng 30 giây rồi tắt; kiểm tra số
   mẫu tiếp tục tăng, không có mẫu trùng trong CSV.
6. Ghi chú: thời gian, thời tiết, mẫu máy, phiên bản hệ điều hành và trình duyệt.
7. Với từng phiên: chọn phiên ở ô **Dữ liệu**, tải **CSV mẫu vị trí** và **CSV cặp
   khoảng cách**, lưu vào `data/field-tests/<ngày>-<địa-điểm>-<khoảng-cách>-{samples,pairs}.csv`.

## Báo cáo kết quả

Viết một báo cáo ngắn trong `plans/reports/` gồm bảng: sai số trung bình, độ lệch
chuẩn, RMSE, sai số lớn nhất, sai số của khoảng cách trung bình đo tĩnh, và tỉ lệ
nằm trong `± σ_d`, cho từng khoảng cách.

## Tiêu chí hoàn thành

- Có đủ 3 phiên tĩnh 5 phút (10, 20, 50 m) với một iPhone và một Android.
- CSV đọc được bằng `pandas.read_csv`, thống kê tính lại từ CSV cặp khớp màn hình.
- Bước thử mất mạng không làm mất hoặc trùng mẫu.
