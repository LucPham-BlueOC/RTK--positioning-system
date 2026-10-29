---
title: "Phase 3: server - engine sai so tram, CORS hub, WebSocket"
status: done
---

# Phase 3: server — engine sai số trạm + CORS hub + WebSocket

## Overview

Từ sự kiện đã decode ở phase 2 (ARP, quỹ đạo, epoch MSM), tính **sai số tổng
của từng vệ tinh** tại trạm cho GPS, Galileo, BeiDou (Q1 = D, Q5, Q6), giữ
trạng thái CORS toàn cục, kết nối lại có backoff, và đẩy dữ liệu qua
WebSocket `/ws` sẵn có cho mọi socket (Q4).

Tham chiếu: artifact Q1, Q5, Q6, rào cản R3, R5, R8, mục 7.

## Engine (`residual.ts`)

Với mỗi epoch MSM, mỗi vệ tinh có pseudorange `P` trên tín hiệu đã chọn:

1. Thời điểm phát: `tTx = tRx − P/c − dts` (lặp 2 vòng), `tRx` theo thời gian
   của hệ (BDT cho BeiDou).
2. Vị trí vệ tinh `keplerSatPos(eph, tTx)`; quay Trái Đất trong thời gian
   truyền (Sagnac): quay vị trí vệ tinh quanh Z một góc `Ω̇e · τ`.
3. `ρ = |satPos − ARP|`.
4. Sai số thô: `r = P − ρ + c·dts` (dts từ `satClockBias`, đã gồm tương đối
   và group delay).
5. Đồng hồ máy thu (R8): mỗi hệ `b_sys = median(r)` trên các vệ tinh của hệ
   (cần ≥ 4 vệ tinh; thiếu → bỏ hệ đó, ghi `too-few-sats`).
6. Sai số tổng: `residual = r − b_sys`. Giữ nguyên khí quyển (Q5) — đây là
   giá trị tương đương "hiệu chỉnh pseudorange" kiểu DGPS (đổi dấu).
7. Bỏ vệ tinh: không có quỹ đạo hợp lệ (IODE khớp, |t − toe| < 4 h GPS /
   4 h Galileo / 1 h BeiDou), góc ngẩng < `CORS_MIN_ELEVATION_DEG`, quỹ đạo
   báo không khỏe (health ≠ 0). Ghi lý do vào `skipped`.
8. `rmsM`, `maxAbsM` trên các vệ tinh còn lại.

Không có ARP → không tính, `diagnosis: no-station-position`. Không có quỹ
đạo của hệ nào → `no-ephemeris` (Q3: UI gợi ý mountpoint có phát).

## Hub (`hub.ts`)

- Nguồn feed inject: NTRIP thật hoặc `corsMockFeed` (cho test và `CORS_MOCK`).
- Giữ `CorsState`, kho quỹ đạo mới nhất mỗi `(sys, prn)`, vòng đệm
  `CORS_HISTORY_EPOCHS` epoch.
- Kết nối lại (R5): backoff 5 s → 10 s → 20 s … tối đa 5 phút; reset khi nhận
  được khung hợp lệ. Đúng **1** kết nối mỗi mountpoint, dùng chung mọi người xem.
- Phát `onState` (gộp, tối đa 1 lần/giây) và `onEpoch`.
- `shutdown()` đóng socket và timer.

## WebSocket (`app.ts`, `index.ts`)

- `app.ts`: giữ tập socket đang mở (riêng với `RoomHub`). Khi socket mở và
  CORS bật: gửi `cors.state` + `cors.history`. `hub.onState` → `cors.state`
  cho mọi socket; `hub.onEpoch` → `cors.epoch` cho mọi socket. Không đổi luồng
  message phòng hiện có.
- `onClose`: `corsHub.shutdown()`.
- `index.ts`: tạo và `start()` hub chỉ khi `config.cors.enabled`.
- CORS tắt → không gửi bất kỳ message CORS nào (không regression).

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `apps/server/src/cors/residual.ts` | Engine trên |
| create | `apps/server/src/cors/hub.ts` | `CorsHub` |
| create | `apps/server/src/cors/{residual,hub}.test.ts` | Unit test |
| modify | `apps/server/src/app.ts` | Broadcast CORS cho mọi socket |
| modify | `apps/server/src/index.ts` | Start hub khi bật |

## Acceptance

- [x] Mock feed có sai số tiêm vào `injected(sys, prn, t)`: engine trả
      `residual ≈ injected − median_sys(injected)` sai < 1 cm cho mọi vệ tinh
      GPS/Galileo/BeiDou (kể cả BeiDou GEO).
- [x] `clockBiasM[sys]` ≈ `c·dtr_sys + median_sys(injected)` của mock (< 1 cm).
- [x] Mock `no-ephemeris` → `diagnosis` có `no-ephemeris`, không có epoch sai số, không crash; `no-station` → `no-station-position`.
- [x] Hub (fake timers): connecting → connected → mất stream → reconnecting với backoff đúng chuỗi → connected; vòng đệm giữ đúng giới hạn.
- [x] Socket `/ws` trần (không vào phòng) nhận `cors.state` + `cors.history` khi mở và `cors.epoch` mỗi epoch; test phòng hiện có trong `apps/server/test/server.test.ts` vẫn xanh.
- [x] CORS off → không message CORS nào.

## Rollback

Xóa `residual.ts`, `hub.ts`, test; revert `app.ts`, `index.ts`.
