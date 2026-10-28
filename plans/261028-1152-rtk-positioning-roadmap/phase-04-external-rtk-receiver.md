# Giai đoạn 4: Máy thu RTK ngoài

Trạng thái: **chưa bắt đầu** · Phụ thuộc: Giai đoạn 1, nên có Giai đoạn 2 (app Android)

## Bối cảnh

Module u-blox ZED-F9P hoặc Unicore UM980 cho RTK chuẩn cấp cm. Điện thoại chỉ
làm nhiệm vụ kết nối, chuyển hiệu chỉnh và gửi kết quả lên phòng. Kết quả này là
"chuẩn tham chiếu" để đánh giá các giai đoạn trước.

## Yêu cầu

1. App Android kết nối module qua Bluetooth (SPP hoặc BLE), đọc NMEA (GGA, GST).
2. Hai cách lấy hiệu chỉnh, chọn khi bắt đầu phiên:
   - NTRIP client trong app, mỗi module nhận RTCM từ một trạm CORS.
   - Base cục bộ: một module làm base, RTCM chuyển qua server phòng
     (message `rtcm.relay`) tới module rover.
3. Mẫu gửi lên có `source = rtk-fixed` hoặc `rtk-float` và sai số từ GST.
4. Màn hình so sánh hiển thị RTK ngoài cạnh các nguồn khác.

## Các bước thực hiện

1. Chốt phần cứng: module, anten, bộ chuyển Bluetooth, nguồn điện.
2. Cấu hình module bằng u-center (F9P) hoặc UPrecise (UM980): tốc độ 1 Hz,
   bật GGA/GST, cấu hình base/rover.
3. Module Bluetooth trong app Android: kết nối, parse NMEA, gửi mẫu.
4. NTRIP client; sau đó chế độ base cục bộ qua `rtcm.relay`.
5. Giao diện và CSV cho nguồn mới.

## Kiểm chứng

- Đo cùng địa điểm và khoảng cách với Giai đoạn 1 và 2; khoảng cách RTK fixed
  phải khớp thước trong vài cm.

## Tiêu chí chấp nhận

1. Hai module đạt RTK fixed và hiển thị khoảng cách trên cả hai máy.
2. Báo cáo so sánh bốn nguồn (GPS thường, RTK điện thoại, UWB nếu có, RTK ngoài)
   tại cùng địa điểm.

## Rủi ro

- Không có trạm CORS miễn phí gần khu vực đo: dùng chế độ base cục bộ.
- Độ trễ RTCM qua server làm rover chậm đạt fix; kiểm tra độ trễ thực tế.
