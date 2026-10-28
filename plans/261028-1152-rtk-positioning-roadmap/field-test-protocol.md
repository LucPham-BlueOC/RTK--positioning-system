# Quy trình đo thực địa

Dùng chung cho mọi giai đoạn để kết quả so sánh được với nhau.

## Chuẩn bị

- Thước dây (tối thiểu 50 m), cọc hoặc vật đánh dấu, sạc dự phòng.
- Điện thoại sạc đầy, tắt tiết kiệm pin, bật vị trí chính xác cao, độ sáng
  màn hình tối đa.
- Địa điểm ngoài trời bầu trời thoáng, cách nhà cao và cây lớn ít nhất 20 m
  (trừ Giai đoạn 3 đo trong nhà).

## Các bước

1. Đánh dấu điểm A, đo bằng thước các điểm B ở 10 m, 20 m và 50 m. Ghi khoảng
   cách đến hai chữ số thập phân.
2. Đặt hai máy nằm ngửa trên giá hoặc mặt phẳng cùng độ cao, màn hình hướng lên.
3. Vào cùng phòng, chờ 30 giây để vị trí ổn định.
4. Với mỗi khoảng cách: chạy một phiên đo tĩnh 5 phút, nhập khoảng cách thật.
5. Ghi chú: thời gian, thời tiết, mẫu máy, phiên bản hệ điều hành, trình duyệt
   hoặc phiên bản app.
6. Xuất CSV, lưu vào `data/field-tests/<ngày>-<địa-điểm>-<khoảng-cách>.csv`.

## Báo cáo kết quả

Mỗi lần đo viết một báo cáo ngắn trong `plans/reports/` gồm bảng bias, độ lệch
chuẩn, RMSE, sai số lớn nhất, sai số đo tĩnh và tỉ lệ nằm trong `± σ_d`, cho từng
khoảng cách và từng nguồn định vị.
