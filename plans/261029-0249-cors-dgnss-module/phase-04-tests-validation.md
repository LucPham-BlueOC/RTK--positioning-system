---
title: "Phase 4: tests va validation"
status: todo
---

# Phase 4: Tests & validation

## Overview

Trọn vòng kiểm tra toàn bộ module CORS ở mọi tầng, đảm bảo không regression
với luồng hiện có (2 điện thoại đo khoảng cách GPS thường), và chứng minh
pipeline `RTCM3 (1032/3040) → CorsState → page /cors` bằng fixture có giá
trị đã biết. Màn phòng không đổi (đã cut dòng mốc CORS 261029-1110) nên e2e
phòng hiện có (`two-phones.spec.ts`) giữ nguyên, không thêm e2e CORS cho
màn phòng.

## Context

- `apps/server/test/server.test.ts` — test server hiện có (phòng, mẫu, phiên);
  giữ nguyên không đụng, chỉ thêm file test mới.
- `packages/shared/src/*.test.ts` — pattern vitest thuần số học.
- `apps/web/e2e/two-phones.spec.ts` — e2e Playwright 2 máy giả lập; xem
  trước khi thêm e2e CORS; file này không sửa.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `packages/shared/src/cors.test.ts` | (phase 1, đầy đủ: ECEF↔WGS84, ENU gốc trạm qua `enuToCorsBase`, mock feed; không có `distanceToBase` — đã cut) |
| create | `apps/server/src/cors/rtcm3.test.ts` | (phase 2: CRC-24Q + decode 1032/1033/3040 từ fixture) |
| create | `apps/server/src/cors/hub.test.ts` | Fake timers + mock feed: connecting→connected→reconnecting; `ggaHistory` bounded; stream không GGA → state đúng (không crash, `observedMsgTypes` đầy đủ); NTRIP 401 → `error: auth-thua` |
| create | `apps/server/src/cors/ntrip.test.ts` | TCP server local giả lập caster (net.createServer): request line `GET /mp HTTP/1.0` + Basic auth đúng; v2: un-chunk `Transfer-Encoding: chunked` |
| create | `apps/web/e2e/cors.spec.ts` | E2E mới (không sửa `two-phones.spec.ts`): mock mode server (`CORS_MOCK=1`) → mở `/cors` (không cần vào phòng) → verify 4 khối (config "Đã kết nối (mock)", map marker base, chart GGA hoặc dòng "không phát GGA", quick-test raw + E/N frame trạm + RTD trạm); 2 chế độ mock: có GGA và không GGA. **Và assert màn phòng không có dòng "mốc CORS"** (mở `/r/<code>` cùng server mock → `DeviceCard`/`LiveDistance` không đổi so hiện tại) |

## Acceptance (checklist chạy thật)

- [ ] `pnpm test` + `pnpm typecheck` toàn repo xanh.
- [ ] Fixture số học: base (10.7662, 106.6844, 10 m), fix giả định →
      `enuToCorsBase` khớp tính tay (sai < 1e-6 m).
- [ ] `pnpm test:e2e` (two-phones + cors) xanh; `two-phones.spec.ts` không
      sửa.
- [ ] Chạy server bằng tay:
      - không env CORS nào → `/healthz` OK, không TCP connect (log trống);
        màn phòng y hệt hiện tại.
      - `CORS_MOCK=1` → mở `/cors`: 4 khối đúng; màn phòng không đổi.
      - thật (khi có thông số trạm): `CORS_NTRIP_HOST=rtk2go.com
        CORS_NTRIP_PORT=2101 CORS_NTRIP_MOUNTPOINT=<mp> CORS_NTRIP_USER=<email>
        CORS_NTRIP_PASS=none` → connect thật được, reconnect hoạt động;
        ghi nhận các mã stream thật (so với giả định GGA).

## Rollback

Phase này chỉ thêm test; rollback = xóa các file test thêm vào.
