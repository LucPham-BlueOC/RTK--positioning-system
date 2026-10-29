---
title: "Phase 3: web UI - page /cors (ket noi + sai so tram)"
status: todo
---

# Phase 3: web UI — page `/cors` (kết nối + sai số trạm)

## Overview

Một **page CORS độc lập** tại route `/cors` để check config và thử nghiệm,
gồm 4 khối: (1) trạng thái config + chẩn đoán lỗi stream, (2) vị trí absolute
trạm CORS + bản đồ, (3) sai số trạm theo thời gian (biểu đồ từ `ggaHistory`),
(4) thử nghiệm nhanh 1 máy. **Màn phòng không đổi** — theo quyết định "cắt
sạch mốc CORS" (261029-1110) không thêm dòng nào vào `DeviceCard`,
`LiveDistance`, `ComparePanel`.

**Định nghĩa module (chốt 261029-1110 — thử nghiệm kết nối + quan sát sai số
trạm):**
- *raw GPS* = vị trí WGS84 hiện tại + `accuracy` máy báo.
- *Sai số trạm (RTD)* = max/rms RTD residual của stream CORS từ `ggaHistory`
  (độ sai số **bên trạm**, không phải độ bất định của máy).
- *Quick-test* = 1 fix của máy đang mở page: hiện raw (WGS84 + accuracy) và
  (nếu CORS có base) E/N của máy trong frame trạm qua `enuToCorsBase`, kèm
  RTD trạm để so. **Không** gọi đây là "giá trị mốc CORS" hay "đã khử
  sai số".

UI **không dùng chữ "DGNSS" hay "đã khử sai số GPS"** cho giá trị điện
thoại (giới hạn: trình duyệt không có phép đo thô, đã chứng minh ở phase 1)
và **không dùng cụm "mốc CORS"** cho CEP50 hay khoảng cách (vô nghĩa toán
học, xem ghi chú phase 1).

## Context

- `apps/web/src/app.tsx` — routing state-based qua `useRoomStore`; thêm đọc
  `location.pathname === '/cors'` → render `CorsPage` (độc lập, không cần vào
  phòng — server gửi `cors.state` cho mọi socket, phase 2).
- `apps/web/src/sync/room-connection.ts` — thêm chế độ **cors-only**: mở
  `/ws` không gửi `room.create/join`, chỉ xử lý `cors.state`; 1 WS duy nhất.
- `apps/web/src/sync/room-store.ts` — thêm `cors: CorsState | null`.
- `apps/web/src/features/map/position-map.tsx` — pattern Leaflet reuse cho
  bản đồ marker ARP.
- `packages/shared/src/cors.ts` (phase 1): `enuToCorsBase`, `CorsState`.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `apps/web/src/features/cors/cors-page.tsx` | Page `/cors`: 4 khối + nút "Về màn chính"; khi `cors.status === 'off'` hiện rõ "Chưa cấu hình trạm CORS" + gợi ý env |
| create | `apps/web/src/features/cors/cors-config-card.tsx` | Trạng thái (chưa cấu hình / đang kết nối / đã kết nối / reconnect), host/port/mountpoint (pass che), chẩn đoán: auth lỗi, mountpoint không tồn tại, "stream không phát mã GGA (các mã đang nhận: …)" từ `observedMsgTypes` |
| create | `apps/web/src/features/cors/cors-base-map.tsx` | Map Leaflet: marker ARP (từ `cors.base`, lat/lon/alt + độ chính xác đã khảo sát), nút copy toạ độ |
| create | `apps/web/src/features/cors/cors-gga-chart.tsx` | Biểu đồ "sai số trạm theo thời gian" (recharts, pattern `distance-chart.tsx`): max & rms RTD (m) theo thời gian từ `ggaHistory`; rỗng → dòng "Trạm không phát mã GGA — chỉ có vị trí base + MSM" |
| create | `apps/web/src/features/cors/cors-quick-test.tsx` | "Đo thử 1 máy": `watchPosition` vài giây lấy fix hiện tại → hiện raw (WGS84 + accuracy), E/N của máy trong frame trạm (`enuToCorsBase`, chỉ khi có `cors.base`), và RTD trạm hiện tại để so — không nhãn "mốc CORS" |
| modify | `apps/web/src/sync/room-connection.ts` | Chế độ cors-only + `case 'cors.state'` → store |
| modify | `apps/web/src/sync/room-store.ts` | `cors` field |
| modify | `apps/web/src/app.tsx` | Route `/cors` |

## Design quyết định

- **Màn phòng không đổi**: không sửa `device-card.tsx`, `live-distance.tsx`,
  `compare-panel.tsx`, `distance-chart.tsx`, `room-screen.tsx`. CEP50 /
  khoảng cách "mốc CORS" bị loại (quyết định 261029-1110).
- `CorsPage` là trang duy nhất mở rộng; khi CORS `off` nó hiện hướng dẫn
  env, không ảnh hưởng các màn khác (không regression).
- Nút vào `/cors` có thể đặt ở header room (tuỳ chọn, không bắt buộc ở
  phase này vì page độc lập qua URL).

## Acceptance

- [ ] `/cors` (không vào phòng): 4 khối render; mock mode → config card
      "Đã kết nối (mock)", map marker ARP đúng toạ độ, chart GGA chạy (hoặc
      dòng "không phát GGA" đúng khi mock với `withGga: false`), quick-test ra
      raw + E/N frame trạm + RTD trạm.
- [ ] `cors.status === 'off'`: page CORS hiện hướng dẫn env; **màn phòng
      y hệt hiện tại** (không dòng CORS — đã cut).
- [ ] Số "E/N frame trạm" của quick-test khớp `enuToCorsBase` (kiểm tra manual
      với mock: fixed base, fix giả).
- [ ] `pnpm --filter @rtk/web build` + typecheck xanh.

## Rollback

Xóa `features/cors/`, revert `app.tsx`, `room-connection.ts`, `room-store.ts`.
