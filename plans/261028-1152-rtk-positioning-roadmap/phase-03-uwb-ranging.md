# Giai đoạn 3: Đo khoảng cách bằng UWB

Trạng thái: **chưa bắt đầu** · Phụ thuộc: Giai đoạn 1

## Bối cảnh

UWB đo trực tiếp khoảng cách giữa hai máy bằng thời gian truyền sóng, không qua
vị trí tuyệt đối, và hoạt động trong nhà. Cần app native trên cả hai nền tảng.

## Yêu cầu

1. iPhone: Nearby Interaction, trao đổi `NIDiscoveryToken` qua server phòng
   (message `uwb.token`).
2. Android: `androidx.core.uwb`, trao đổi tham số phiên qua server phòng.
3. Mẫu khoảng cách UWB (thời gian, khoảng cách, góc nếu có) gửi lên server, lưu
   bảng `range_sample`, hiện trên màn hình so sánh và trong CSV.

## Không làm trong giai đoạn này

- Cam kết đo giữa iPhone và Android trước khi spike xác nhận khả thi.

## Các bước thực hiện

1. **Spike khả năng tương thích (làm đầu tiên)**: xác nhận danh sách máy có UWB
   sẵn có; thử iPhone–iPhone và Android–Android; nghiên cứu iPhone–Android (iOS
   chỉ hỗ trợ phụ kiện bên thứ ba theo chuẩn FiRa; điện thoại Android đóng vai phụ
   kiện chưa được xác nhận). Kết luận phạm vi hỗ trợ.
2. App iOS (Swift + SwiftUI): vào phòng, trao đổi token, chạy phiên NI, gửi mẫu.
3. Module UWB trong app Android: trao đổi tham số, chạy phiên ranging, gửi mẫu.
4. Server: message `uwb.token`, bảng `range_sample`, mở rộng CSV.
5. Giao diện so sánh: cột UWB cạnh GPS thường.

## Kiểm chứng

- Đo trong nhà ở 1, 3, 5, 10 m có tầm nhìn thẳng, và một lần có vật cản.
- So với khoảng cách thước theo cùng bộ chỉ số thống kê.

## Tiêu chí chấp nhận

1. Ít nhất một cặp cùng nền tảng đo UWB thành công và lưu được dữ liệu.
2. Báo cáo thực địa trong nhà với bias, độ lệch chuẩn, RMSE ở các khoảng cách trên.
3. Báo cáo spike nêu rõ cặp thiết bị nào được hỗ trợ.

## Rủi ro

- Phần cứng UWB hạn chế ở một số dòng máy cao cấp; cần mượn hoặc mua thiết bị.
- iOS yêu cầu app ở foreground khi chạy Nearby Interaction giữa hai iPhone.
