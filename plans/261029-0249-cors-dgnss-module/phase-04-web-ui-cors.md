---
title: "Phase 4: web UI - page /cors"
status: done
---

# Phase 4: web UI — page `/cors`

## Overview

Page CORS độc lập tại `/cors` (không cần vào phòng), nhận dữ liệu qua
WebSocket `/ws` sẵn có (Q4). 4 khối: (1) cấu hình + chẩn đoán, (2) vị trí
trạm + bản đồ, (3) sai số từng vệ tinh theo thời gian, (4) quick-test 1 fix
của máy đang mở page. **Màn phòng không đổi** (không sửa `device-card.tsx`,
`live-distance.tsx`, `compare-panel.tsx`, `distance-chart.tsx`, `room-screen.tsx`).

Nhãn UI: "Sai số trạm theo vệ tinh" / "sai số tổng (gồm khí quyển, đã trừ
đồng hồ máy thu)". Không dùng "DGNSS", "đã khử sai số" hay "mốc CORS" cho
giá trị điện thoại.

## Context

- `apps/web/src/app.tsx` — routing theo store; thêm nhánh `location.pathname === '/cors'` → `CorsPage`.
- `apps/web/src/sync/room-connection.ts` — thêm chế độ chỉ xem CORS: mở `/ws`
  không gửi `room.create/join`, vẫn dùng reconnect hiện có; xử lý `cors.state`,
  `cors.epoch` (nối vào history, cắt theo giới hạn), `cors.history` (thay thế).
  Trong phòng cũng nhận các message này nhưng màn phòng không dùng.
- `apps/web/src/sync/room-store.ts` — thêm `cors: CorsState | null`, `corsEpochs: CorsEpoch[]`.
- `apps/web/src/features/map/position-map.tsx`, `compare/distance-chart.tsx` — pattern Leaflet / recharts để tái dùng.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `apps/web/src/features/cors/cors-page.tsx` | Khung page + nút "Về màn chính"; `status === 'off'` → hướng dẫn env |
| create | `apps/web/src/features/cors/cors-config-card.tsx` | Trạng thái kết nối (mock/thật), host/port/mountpoint, mã đang nhận + tần suất, số quỹ đạo mỗi hệ, chẩn đoán (`no-station-position`, `no-ephemeris`, `too-few-sats`, lỗi auth/mountpoint/timeout), danh sách mountpoint có phát quỹ đạo từ sourcetable |
| create | `apps/web/src/features/cors/cors-station-map.tsx` | Marker ARP, lat/lon/alt, chiều cao anten, máy thu/anten (1033), nút copy tọa độ |
| create | `apps/web/src/features/cors/cors-residual-chart.tsx` | recharts: mỗi vệ tinh 1 đường `residualM` theo thời gian, nhóm/lọc theo hệ (G/E/C), kèm đường RMS; bảng epoch mới nhất (PRN, góc ngẩng, CNR, sai số); trống → nêu lý do từ `diagnosis` |
| create | `apps/web/src/features/cors/cors-quick-test.tsx` | `watchPosition` vài giây: raw WGS84 + accuracy của máy; khoảng cách và E/N tới trạm qua `ecefToEnu` (chính xác ở mọi khoảng cách); RMS sai số trạm hiện tại để so |
| modify | `apps/web/src/sync/room-connection.ts` | Chế độ chỉ xem CORS + 3 case message |
| modify | `apps/web/src/sync/room-store.ts` | Field `cors`, `corsEpochs` |
| modify | `apps/web/src/app.tsx` | Route `/cors` |

## Acceptance

- [x] `CORS_MOCK=1`: `/cors` (không vào phòng) hiện "Đã kết nối (mock)", marker trạm đúng tọa độ mock, biểu đồ có đường cho vệ tinh GPS/Galileo/BeiDou, quick-test ra raw + E/N + RMS.
- [x] `CORS_MOCK=no-ephemeris`: khối 3 ghi "Trạm không phát quỹ đạo vệ tinh, không tính được sai số" + danh sách gợi ý (nếu có sourcetable).
- [x] CORS off: `/cors` hiện hướng dẫn env; màn phòng y hệt hiện tại.
- [x] Biểu đồ không lag với 600 epoch × ~25 vệ tinh (giới hạn điểm vẽ, tắt animation).
- [x] `pnpm --filter @rtk/web build` + typecheck xanh.

## Rollback

Xóa `features/cors/`, revert `app.tsx`, `room-connection.ts`, `room-store.ts`.
