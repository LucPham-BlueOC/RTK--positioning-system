---
title: "cors-dgnss-module"
description: "Module CORS: server kết nối caster NTRIP RTK2go, parse RTCM3 (vị trí ARP trạm + sai số trạm GGA/RTD theo thời gian), UI page /cors. Mục đích hiện tại: thử nghiệm kết nối + đo sai số từng trạm; dữ liệu phục vụ giảm sai số DGNSS ở giai đoạn 2. Không có dòng giá trị mốc CORS trên màn phòng."
status: pending
priority: P1
effort: 16h
tags: [feature, backend, frontend, gnss]
created: 2026-10-29
---

# cors-dgnss-module

## Outcome

- Server tự kết nối caster NTRIP của trạm CORS (RTK2go), parse RTCM3: vị trí
  absolute (ARP) của trạm + sai số trạm theo thời gian (RTD residual nếu stream
  có mã GGA). **Mục đích module (chốt phiên 261029-1110): sau khi đo được
  sai số (GGA/RTD) của từng trạm, dùng làm đầu vào để giảm sai số DGNSS ở
  giai đoạn 2. Hiện tại chỉ thử nghiệm cách kết nối** — mock feed cho test +
  caster thật khi có mountpoint.
- Giao diện có **page `/cors` riêng** (không cần vào phòng) để check config và
  thử nghiệm, gồm 4 khối: (1) trạng thái config + chẩn đoán lỗi, (2) vị trí
  absolute trạm CORS + bản đồ, (3) sai số trạm theo thời gian, (4) thử nghiệm
  nhanh với 1 fix của chính máy đang mở page (raw + accuracy của máy, so với
  RTD trạm).
- **Màn phòng KHÔNG thêm dòng mốc CORS** (raw GPS, CEP50, distance-to-base,
  "Khoảng cách theo mốc CORS" đều không đưa vào) — những đại lượng này không
  dùng được thông tin trạm để giảm sai số, ngoài mục đích module.

## Constraints

- **Giới hạn đã chốt**: trình duyệt chỉ trả vị trí đã giải qua Geolocation
  API, không có phép đo thô → **không có phép toán hợp lệ để "khử sai số
  DGNSS" cho điện thoại**. "Giảm sai số" thật sự = receiver nhận được
  correction DGNSS (phase 2, RTKLIB); module này chỉ **đo sai số trạm** làm
  đầu vào.
- **Ghi chú toán học (đã kiểm chứng `stats.ts` phiên 261029-1110)**: CEP50 là
  **bất biến với phép tịnh tiến gốc** — `pointCloudStats` tính trung tâm `c`
  cùng frame ENU với các mẫu nên gốc O triệt tiêu. Gốc ARP (đặt xa đám mây)
  chỉ làm xấp xỉ phẳng `toEnu` (hệ số `cos(O.lat)`) kém chính xác hơn, không
  tốt hơn. → CEP50 là độ lặp lại của chính máy; **không có dòng nào tính theo
  mốc CORS** được đưa vào module (không đóng góp thông tin trạm).
- NTRIP tới caster: port 2101 RTK2go (v1 HTTP/1.0 raw / v2 HTTP/1.1 chunked),
  credentials email + pass `none` (caster công cộng, bất kỳ email nào).
- CRC-24Q theo BKG: đa thức `0x01864CFB`, init `0` — khớp code reference
  `rtcm3.c` của RTKLIB.
- Số toán chung nằm trong `packages/shared` (qui tắc repo).

## Non-goals

- Không chạy RTKLIB, không thêm receiver Android/Bluetooth (đây chính là
  giai đoạn 2 "GNSS thô" trong `docs/architecture.md` — dùng khi cần RTK
  cm-level thật sự).
- **Không thêm dòng "giá trị mốc CORS" vào màn phòng** (đo tĩnh CEP50,
  distance-to-base, "Khoảng cách theo mốc CORS" đều loại) — cắt theo quyết
  định user phiên 261029-1110: module chỉ thử nghiệm kết nối + quan sát sai
  số trạm; màn phòng giữ nguyên hiện trạng.
- Không thêm cột corrected vào CSV export.
- Không thay đổi giao thức phòng hiện có; chỉ **thêm** message.
- Không "khử sai số" theo nghĩa DGNSS — sai số trạm (RTD) đo được nhưng
  chưa apply vào vị trí máy (phase 2).

## Acceptance criteria

1. Parser RTCM3 (CRC-24Q, mã stationary 1032/1033/1004 + GGA 3040 nếu có) có
   unit test với fixture hợp lệ.
2. Server: mock feed → `cors.state` broadcast cho **mọi socket** (kể cả chưa
   vào phòng), reconnect tự động; stream không phát GGA → chẩn đoán rõ,
   không crash.
3. UI: page `/cors` render 4 khối (config + chẩn đoán, base + map, chart GGA,
   quick-test raw + RTD trạm); màn phòng **không đổi** (không dòng mốc CORS);
   e2e hiện có vẫn xanh.
4. Không cấu hình CORS → ứng dụng hoạt động y hệt hiện tại (không
   regression).

## Trade-offs (định nghĩa nhãn UI — đã so với user)

- *Module = kết nối + đo sai số trạm (chọn)*: sai số trạm (GGA/RTD) là deliverable
  thật, đúng mục đích "đo sai số từng trạm làm đầu vào giảm sai số phase 2";
  phụ thuộc "ARP trạm + stream có phát GGA" — fail sớm = không có mã →
  chẩn đoán, không crash.
- *Dòng giá trị mốc CORS trên màn phòng (loại)*: CEP50 bất biến gốc nên "mốc
  CORS" là nhãn sai (chứng minh `stats.ts`); E-N offset / distance-to-base
  chỉ đặt máy vào frame trạm, không giảm được sai số → không phục vụ mục
  đích; chi phí: mất hiển thị vị trí máy trong frame trạm (không cần cho
  scope hiện tại).
- *Trị sai DGNSS qua mã GGA cho từng điện thoại*: không hợp lệ về mặt số
  học (cần phép đo thô) → loại, dù user ban đầu chọn "DGNSS GGA".
- *Chỉ hiển thị base + trạng thái (tối giản)*: loại vì bỏ mất quan sát sai
  số trạm (RTD/GGA) theo thời gian — giá trị thật của module.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Shared: types CORS + toán ECEF/ENU trạm + mock feed](./phase-01-start.md) | Pending |
| 2 | [Server: NTRIP client + CORS hub](./phase-02-server-ntrip-cors.md) | Pending |
| 3 | [Web UI: page `/cors` (kết nối + sai số trạm)](./phase-03-web-ui-cors.md) | Pending |
| 4 | [Tests & validation](./phase-04-tests-validation.md) | Pending |
| 5 | [Docs](./phase-05-docs.md) | Pending |

## Dependencies

- Mountpoint của trạm CORS cụ thể chưa có → config-driven + mock mode; khi có
  chỉ cần đặt env. RTK2go là caster công cộng: username = bất kỳ email, pass
  = `none`.
- Giả định: stream trạm có mã stationary (1032/1033/1004…). Nếu caster chỉ
  phát MSM/RTK (1074/1075…), không có mốc absolute → UI hiện chẩn đoán,
  không crash (đã kiểm tra trạng thái này trong test).
- Không đổi giao thức phòng hiện có; chỉ thêm message.

## Validation Log

### Verification Results

- Claims checked: 5 (`packages/shared/src/stats.ts::pointCloudStats`, `packages/shared/src/geo.ts::toEnu/haversine`, `apps/web/e2e/two-phones.spec.ts` (Playwright + setGeolocation), `apps/web/src/features/room/device-card.tsx` (vị trí "Sai số" row hiện có), `apps/web/src/features/live/live-distance.tsx`). Verified: 5 | Failed: 0 | Unverified: 0
- Tier: Standard (5 phases, but codebase claims are small and directly confirmed).
- Notes: `pointCloudStats` (CEP50/std ENU) and `toEnu`/`fromEnu` in `packages/shared/src/{stats,geo}.ts` confirmed present. E2E pattern (Playwright + `setGeolocation`) confirmed in `two-phones.spec.ts`. (Note 261029-1110: dòng "CEP50 (mốc CORS)" trên màn phòng đã cut — CEP50 bất biến gốc; `pointCloudStats` chỉ còn dùng trong static-session hiện có.)
- Giao thức NTRIP/RTCM3 (2101, v1/v2, CRC-24Q, mã 1005 = ARP) do user kiểm chứng từ nguồn chính thức (BKG rtcm-ntrip, EPN CB, NovAtel, SBG, Emlid, RTK2go docs) — ghi nguyên văn trong phase 1/2; không re-verify.

### Validation Session 1 (questions + decisions)

- Q: Bảng 2 giá trị đặt ở đâu trên màn phòng? → **Thẻ máy (DeviceCard) + card khoảng cách (LiveDistance)**, không phải tab So sánh.
- Q: Mountpoint đã biết? → **Chưa — mock trước**, bước đầu khi chạy thật là chụp stream 30–60 s (parser log `observedMsgTypes`) để chọn mountpoint có mã stationary.
- Q: NTRIP v1 hay v2 mặc định? → **v1** (HTTP/1.0 + stream raw; `CORS_NTRIP_V2=1` cho v2).

### Validation Session 2 (label decision)

- Q: Nhãn "Sai số sau hiệu chỉnh" dễ bị hiểu nhầm là trạm đã khử sai số cho
  máy (CEP50 là độ lặp lại, không trừ bias). → **Đổi nhãn UI**: "Sai số sau
  hiệu chỉnh" → **"Độ lặp lại (CEP50, mốc CORS)"**; giữ nguyên dòng
  **"Khoảng cách theo mốc CORS"** (khoảng cách thực giữa 2 mean ENU trong
  frame chuẩn).

### Validation Session 3 (pivot — phiên 261029-1110, thay thế Session 2)

- User chứng minh (khớp `stats.ts`): CEP50 bất biến với phép tịnh tiến gốc
  (gốc O triệt tiêu vì tâm `c` cùng frame ENU), nên **"CEP50 (mốc CORS)" là
  vô nghĩa về mặt toán**; đặt gốc ở trạm xa chỉ làm xấp xỉ phẳng tệ hơn.
- Q: Mục đích thật của module CORS? → **Đo sai số (GGA/RTD) từng trạm làm
  đầu vào giảm sai số DGNSS; hiện tại chỉ thử nghiệm cách kết nối.**
- Q: Xử lý phần "theo mốc CORS" trong màn phòng? → **Cắt sạch** (quyết định
  user 261029-1110): không dòng mốc CORS trên `DeviceCard`/`LiveDistance`/
  `ComparePanel`/`DistanceChart`; CEP50 đo tĩnh hiện có giữ nguyên, không gắn
  nhãn "mốc CORS". Module tập trung: NTRIP client + parser + page `/cors`
  (config, base + map, chart sai số trạm, quick-test raw + RTD trạm).

### Whole-Plan Consistency Sweep

- Đã đồng nhất (sau pivot 261029-1110): module = kết nối NTRIP + quan sát
  sai số trạm; page `/cors` giữ 4 khối; màn phòng không đổi (không dòng mốc
  CORS). Thuật ngữ "sai số sau hiệu chỉnh" đã loại; "CEP50 (mốc CORS)" /
  "Khoảng cách theo mốc CORS" / "Mốc CORS" trên màn phòng đã xóa khỏi mọi
  file phase (đã sweep). Định nghĩa CEP50 đo tĩnh (`pointCloudStats`,
  `static-session`) giữ nguyên, không gắn mốc CORS.
- Mâu thuẫn còn lại: chưa có.

## Success Criteria

- [ ] Parser RTCM3 (CRC-24Q, mã stationary + GGA) có unit test với fixture hợp lệ.
- [ ] Server: mock feed → `cors.state` broadcast mọi socket (connected, base
      position, GGA history nếu có), tự reconnect; stream không GGA → chẩn đoán.
- [ ] UI: page `/cors` render 4 khối (config + chẩn đoán, vị trí base + map,
      biểu đồ sai số trạm theo thời gian, quick-test raw + RTD trạm); màn
      phòng không đổi (không dòng mốc CORS); e2e hiện có vẫn xanh.
- [ ] Chưa cấu hình CORS → ứng dụng chạy đúng như hiện tại (không regression).

<!-- slug: cors-dgnss-module -->
