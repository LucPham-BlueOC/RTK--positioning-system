# Phần 4: Web client

Trạng thái: **xong**

## Kết quả (`apps/web/src`)

| Tính năng yêu cầu | Nơi cài đặt |
|-------------------|-------------|
| 1. Ghép cặp: tạo phòng, nhập mã, QR, đặt tên máy | `features/home`, `features/room/share-panel.tsx` |
| 2. Thu vị trí ~1 Hz, trạng thái tín hiệu, sai số, số mẫu | `location/use-location-tracking.ts`, `features/room/device-card.tsx` |
| 3. Haversine, `± σ_d`, ghép mẫu < 1 giây theo đồng hồ server | `features/live`, `sync/clock-sync.ts`, `lib/use-dataset.ts` |
| 4. Đo tĩnh 1–5 phút, vị trí trung bình | `features/static-session` |
| 5. Khoảng cách thật, bias / độ lệch chuẩn / RMSE / max, biểu đồ | `features/compare` |
| 6. Bản đồ (vòng sai số, đám điểm), phân tán ENU, CSV | `features/map`, `features/export` |

Thêm: hàng đợi gửi lại khi mất mạng (`sync/room-connection.ts`), Wake Lock, báo
"Tạm dừng" khi trang bị ẩn, hướng dẫn bật quyền vị trí, nhập số kiểu `20,00`.

## Kiểm chứng

- `pnpm --filter @rtk/web test`: định dạng/parse số, đồng bộ đồng hồ (6 test).
- `pnpm test:e2e`: hai điện thoại giả lập cách nhau 20 m. Kiểm tra ghép bằng link,
  khoảng cách ~20 m và ± 5,66 m, nhập khoảng cách thật, thống kê, phiên tĩnh đồng bộ,
  CSV cặp khớp màn hình, máy thứ ba bị từ chối (2 test).

## Ghi chú

Bundle JS khoảng 266 KB gzip (Leaflet + Recharts). Chấp nhận được trên 4G; có thể
tách lazy-load nếu cần.
