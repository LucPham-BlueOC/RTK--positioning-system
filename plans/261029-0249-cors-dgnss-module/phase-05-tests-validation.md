---
title: "Phase 5: tests va validation voi stream that"
status: done
---

# Phase 5: Tests & validation với stream thật

## Overview

Unit test được viết cùng từng phase. Phase này thêm hai lớp kiểm chứng mà
unit test không thay được: (1) **đối chiếu với stream thật** để xác nhận bố
cục bit lấy từ RTKLIB/pyrtcm (R2), (2) e2e page `/cors` và bảo đảm luồng phòng
không đổi.

## Ghi fixture thật

1. Tải sourcetable RTK2go, chọn 1 mountpoint gần Việt Nam có `1005|1006`,
   MSM (107x, 109x hoặc 112x) và `1019|1046|1042` trong format-details.
2. Ghi 5–10 phút byte thô vào `apps/server/test/fixtures/<mp>.rtcm3`
   (script nhỏ dùng chính `ntrip.ts`; không commit email/password).
3. Sinh JSON kỳ vọng bằng pyrtcm (`<mp>.expected.json`: ARP, quỹ đạo, một số
   ô MSM). Ghi lệnh tạo vào README của thư mục fixtures.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `apps/server/test/fixtures/README.md` | Nguồn, mountpoint, thời điểm ghi, lệnh pyrtcm |
| create | `apps/server/src/cors/real-stream.test.ts` | Decode fixture thật → so `expected.json` (ARP < 1 mm, quỹ đạo khớp từng trường, pseudorange MSM < 1 mm) |
| create | `apps/server/src/cors/residual-real.test.ts` | Chạy engine trên fixture: mọi vệ tinh dùng được có |residual| < 30 m, RMS ổn định; vị trí vệ tinh khớp tham chiếu RINEX nav (sinh bằng RTKLIB `convbin` từ cùng fixture) < 1 m |
| create | `apps/web/e2e/cors.spec.ts` | Server `CORS_MOCK=1` và `CORS_MOCK=no-ephemeris` → `/cors` đủ 4 khối; mở `/r/<code>` trên cùng server → không có chữ "CORS" trên màn phòng |
| modify | `apps/web/playwright.config.ts` | Thêm webServer cổng riêng cho 2 chế độ mock (không đổi server hiện có của `two-phones.spec.ts`) |

`two-phones.spec.ts` và `apps/server/test/server.test.ts` không sửa.

## Acceptance (chạy thật)

- [x] `pnpm test` + `pnpm typecheck` + `pnpm lint` toàn repo xanh.
- [x] `pnpm test:e2e` (two-phones + cors) xanh.
- [x] Fixture thật khớp pyrtcm; engine trên fixture cho sai số hợp lý (< 30 m, phần lớn vài mét). Fixture từ Centipede `1CEN`, không phải RTK2go.
- [ ] Chạy tay (chưa làm với RTK2go thật — cần email của người dùng; CORS off và `CORS_MOCK=1` đã kiểm qua e2e):
  - không env CORS → `/healthz` OK, không TCP connect, màn phòng y hệt.
  - `CORS_MOCK=1` → `/cors` đúng 4 khối.
  - thật: `CORS_NTRIP_HOST=rtk2go.com CORS_NTRIP_MOUNTPOINT=<mp> CORS_NTRIP_USER=<email>` → kết nối, có sai số mỗi giây, rút mạng → reconnect với backoff.

## Rollback

Chỉ thêm test, fixture và cấu hình e2e; rollback = xóa.
