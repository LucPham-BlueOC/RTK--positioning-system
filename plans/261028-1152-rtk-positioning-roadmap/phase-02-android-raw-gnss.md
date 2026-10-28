# Giai đoạn 2: Dữ liệu GNSS thô trên Android + RTKLIB

Trạng thái: **chưa bắt đầu** · Phụ thuộc: Giai đoạn 1

## Bối cảnh

Geolocation API chỉ trả vị trí đã xử lý. Android (API 24+) cho đọc phép đo thô
(pseudorange, Doppler, và trên một số máy là pha sóng mang). Với hai điện thoại
ghi cùng lúc, có thể xử lý tương đối (một máy làm base, máy kia làm rover) để
tính vector giữa hai máy chính xác hơn nhiều so với hai vị trí độc lập.

## Yêu cầu

1. App Android vào phòng bằng cùng giao thức WebSocket với web, vẫn gửi mẫu vị trí
   thường (để so trực tiếp với baseline).
2. Ghi `GnssMeasurementsEvent`, `GnssNavigationMessage`, `GnssClock` trong suốt
   phiên đo; tải file lên server khi kết thúc phiên.
3. Server chạy worker: chuyển sang RINEX, chạy RTKLIB `rnx2rtkp` (bản `demo5`),
   lấy vector base→rover theo thời gian và trạng thái fix/float.
4. Màn hình so sánh hiển thị cả kết quả GPS thường và kết quả RTK cùng một phiên.

## Không làm trong giai đoạn này

- RTK thời gian thực (để sau khi hậu xử lý đã cho kết quả tốt).
- Hỗ trợ iPhone (iOS không cho đọc GNSS thô).

## Các bước thực hiện

1. **Spike thiết bị (làm đầu tiên)**: cài app GnssLogger của Google trên các máy
   dự kiến dùng; kiểm tra có `AccumulatedDeltaRange` hợp lệ không, có L5/E5a không.
   Bật "Force full GNSS measurements". Ghi kết quả vào báo cáo.
2. **Spike xử lý**: lấy hai file log thật, chuyển sang RINEX bằng công cụ của
   rtklibexplorer, chạy `rnx2rtkp` bằng tay, xác nhận ra được vector hợp lý.
   Chốt công cụ chuyển đổi và file cấu hình RTKLIB ở bước này.
3. App Android (Kotlin + Compose): vào phòng, gửi vị trí, ghi log thô ra file,
   tải lên `POST /api/sessions/:id/raw`.
4. Worker Python trong `workers/rtk`: hàng đợi job đơn giản (bảng SQLite), chạy
   chuyển đổi và `rnx2rtkp`, parse file `.pos`, ghi bảng `rtk_solution`.
5. Vị trí base: dùng vị trí trung bình đo tĩnh của máy base. Với baseline ngắn,
   sai số vài mét ở vị trí base ảnh hưởng không đáng kể tới vector tương đối.
6. Giao diện: thêm cột RTK vào bảng thống kê, tách fix và float.

## Kiểm chứng

- Unit test parser `.pos` và mapping kết quả.
- Bộ dữ liệu mẫu cố định (hai file log thật) chạy qua worker trong CI, so với kết
  quả đã chốt ở spike.
- Đo thực địa cùng địa điểm và khoảng cách với Giai đoạn 1.

## Tiêu chí chấp nhận

1. Một phiên đo tĩnh 5 phút với hai máy Android cho ra vector RTK và trạng thái fix/float.
2. Bảng so sánh hiển thị GPS thường và RTK cạnh nhau cho cùng phiên.
3. Có báo cáo thực địa nêu rõ mức cải thiện so với baseline, kể cả khi không đạt cấp dm.

## Rủi ro

- Nhiều điện thoại không có pha sóng mang hoặc pha bị gián đoạn: chỉ đạt cải
  thiện nhỏ. Spike thiết bị quyết định có tiếp tục hay không.
- Thu ngoài trời có vật cản gây đa đường; quy trình đo yêu cầu bầu trời thoáng.
