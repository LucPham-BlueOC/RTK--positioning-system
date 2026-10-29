---
title: "cors-dgnss-module"
description: "Module CORS: server kết nối caster NTRIP (RTK2go), parse RTCM3 chuẩn (ARP 1005/1006/1032, MSM, quỹ đạo 1019/1042/1046), tự tính sai số tổng từng vệ tinh của trạm (GPS + Galileo + BeiDou) theo thời gian, đẩy qua WebSocket /ws sẵn có lên page /cors. Màn phòng không đổi."
status: pending
priority: P1
effort: 46h
tags: [feature, backend, frontend, gnss]
created: 2026-10-29
---

# cors-dgnss-module

Nguồn kỹ thuật đã kiểm chứng cho mọi mã RTCM, bố cục bit và quyết định Q1–Q6:
[Đối chiếu chuẩn RTCM3](https://claude.ai/artifact/GuW4jvH3N7sUKT1rySAkL8)
(gọi tắt "artifact" bên dưới). Plan này thay thế bản cũ dùng mã 1004/1033 làm
ARP và 3040–3044/3151 làm "GGA" — các mã đó sai hoặc không tồn tại.

## Outcome

- Server tự kết nối caster NTRIP của trạm CORS (RTK2go), parse RTCM3 chuẩn:
  vị trí trạm (ARP từ 1005/1006/1032), thiết bị trạm (1033), dữ liệu đo MSM
  và quỹ đạo vệ tinh (1019 GPS, 1046 Galileo, 1042 BeiDou).
- Server **tự tính sai số tổng của từng vệ tinh tại trạm** theo từng epoch:
  `pseudorange đo − khoảng cách hình học(ARP, vệ tinh) + c·đồng hồ vệ tinh −
  độ lệch đồng hồ máy thu (ước lượng riêng mỗi hệ)`. Giữ nguyên phần khí
  quyển (Q5). Hệ vệ tinh: GPS + Galileo + BeiDou (Q6); GLONASS làm sau.
- Mục đích: số liệu sai số trạm này là đầu vào để giảm sai số DGNSS ở giai
  đoạn 2 (receiver nhận correction). Giai đoạn 1 = kết nối + đo sai số trạm.
- Page **`/cors`** riêng (không cần vào phòng), 4 khối: (1) cấu hình + chẩn
  đoán (gồm danh sách mountpoint có phát quỹ đạo, lọc từ sourcetable), (2) vị
  trí trạm + bản đồ, (3) biểu đồ sai số từng vệ tinh theo thời gian, (4)
  quick-test 1 fix của máy đang mở page so với sai số trạm.
- **Màn phòng KHÔNG đổi** (không dòng "mốc CORS", quyết định 261029-1110).

## Constraints

- Trình duyệt không mở được TCP thô tới caster (R1) → NTRIP client + parser
  + tính toán chạy trên server Node; dữ liệu đẩy lên web qua **WebSocket
  `/ws` sẵn có** (Q4) bằng message mới, gửi cho mọi socket kể cả chưa vào
  phòng. Không thêm SSE/REST.
- Trình duyệt chỉ có vị trí đã giải (Geolocation API), không có phép đo thô →
  không apply được correction cho điện thoại. Module chỉ **đo và hiển thị**
  sai số trạm.
- Nguồn quỹ đạo (Q3): chỉ dùng quỹ đạo trong chính stream của trạm. Trạm
  không phát 1019/1042/1046 → UI ghi rõ "trạm không phát quỹ đạo, không tính
  được sai số" và gợi ý mountpoint có phát (lọc qua sourcetable). Stream quỹ
  đạo IGS để sau.
- RTCM3: khung `0xD3` + 6 bit dự trữ + 10 bit độ dài + payload + CRC-24Q
  (`0x1864CFB`, init 0, trên header + payload). Mã message = 12 bit đầu payload.
- Chuẩn RTCM 10403.x là tài liệu trả phí (R2) → bố cục bit theo RTKLIB
  `rtcm3.c` và pyrtcm; mọi decoder có test đối chiếu với stream thật đã ghi.
- Chính sách RTK2go (R5): email thật, mỗi mountpoint đúng 1 kết nối dùng
  chung, backoff kết nối lại 5 s → 10 s → … tối đa 5 phút.
- Toán dùng chung (geodesy, quỹ đạo) nằm trong `packages/shared` (qui tắc repo).
- CEP50 bất biến với phép tịnh tiến gốc (đã chứng minh với `stats.ts`) →
  không thêm dòng nào theo "mốc CORS"; không sửa `stats.ts`.

## Non-goals

- Không chạy RTKLIB, không thêm receiver Android/Bluetooth (giai đoạn 2, R6).
- Không xử lý GLONASS (1020, 108x, R4), QZSS, SBAS, NavIC ở giai đoạn 1 —
  các mã này chỉ được đếm trong khối chẩn đoán.
- Không tách sai số thành phần (điện ly, đối lưu) — chỉ sai số tổng (Q5).
- Không parse 1030/1031 (độ lệch chuẩn mạng, trạm đơn không phát).
- Không thêm stream quỹ đạo IGS/BKG (để sau, Q3).
- Không thêm dòng "mốc CORS" vào màn phòng; không thêm cột vào CSV export.
- Không đổi message phòng hiện có; chỉ **thêm** message CORS.
- Không lưu DB: trạng thái CORS là toàn cục, trong bộ nhớ.

## Acceptance criteria

1. Framer RTCM3 (CRC-24Q, resync) và decoder 1005/1006/1032/1033, MSM4–7
   (GPS/Galileo/BeiDou), 1019/1042/1046 có unit test; kết quả decode của một
   stream thật đã ghi khớp pyrtcm (cùng trường, cùng giá trị).
2. Vị trí vệ tinh từ quỹ đạo khớp giá trị tham chiếu độc lập (< 1 m vị trí,
   < 1 ns đồng hồ); với mock feed có sai số tiêm vào đã biết, engine tính lại
   được sai số đó (sai lệch < 1 cm sau khi trừ đồng hồ chung).
3. Server: mock feed → `cors.state` + `cors.epoch` gửi cho **mọi socket**
   (kể cả chưa vào phòng), socket mới nhận `cors.history`; tự kết nối lại với
   backoff; stream thiếu quỹ đạo hoặc thiếu ARP → chẩn đoán rõ, không crash.
4. UI: page `/cors` render 4 khối; màn phòng không đổi; e2e hiện có vẫn xanh.
5. Không cấu hình CORS → ứng dụng hoạt động y hệt hiện tại (không TCP connect,
   không message CORS).

## Quyết định (artifact mục 0)

| # | Câu hỏi | Chốt |
|---|---------|------|
| Q1 | Nguồn dữ liệu "sai số trạm" | **D** — tự tính từ MSM + quỹ đạo + ARP ở giai đoạn 1 |
| Q2 | Mức decode MSM | Đầy đủ (pseudorange, phase, CNR) — bắt buộc theo Q1 |
| Q3 | Trạm không phát quỹ đạo | Chỉ dùng trạm có phát (lọc sourcetable); IGS thêm sau |
| Q4 | Kênh đẩy lên web | WebSocket `/ws` sẵn có (`@fastify/websocket` + `room-connection.ts`) |
| Q5 | Sai số tổng hay tách | Sai số tổng mỗi vệ tinh (trừ đồng hồ chung, giữ khí quyển) |
| Q6 | Hệ vệ tinh | GPS + Galileo + BeiDou; GLONASS sau |

## Phases

| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 1 | [Shared: types, geodesy, toán quỹ đạo, mock feed](./phase-01-start.md) | 10h | Pending |
| 2 | [Server: NTRIP client, framer + decoder RTCM3, sourcetable](./phase-02-server-ntrip-cors.md) | 12h | Pending |
| 3 | [Server: engine sai số trạm + CORS hub + WebSocket](./phase-03-residual-engine.md) | 10h | Pending |
| 4 | [Web UI: page `/cors`](./phase-04-web-ui-cors.md) | 7h | Pending |
| 5 | [Tests & validation với stream thật](./phase-05-tests-validation.md) | 5h | Pending |
| 6 | [Docs](./phase-06-docs.md) | 2h | Pending |

Phụ thuộc: 1 → 2 → 3 → 4; 5 chạy theo từng phase và chốt cuối; 6 sau cùng.

## Dependencies & risks

- Cần 1 mountpoint RTK2go có phát 1005/1006 + MSM + ít nhất 1019 (hoặc
  1046/1042). Bước đầu khi chạy thật: tải sourcetable, chọn mountpoint gần
  Việt Nam có các mã này, ghi 5–10 phút stream làm fixture đối chiếu.
- Rủi ro bố cục bit (R2): giảm bằng test đối chiếu pyrtcm trên stream thật.
- Rủi ro BeiDou: vệ tinh GEO (PRN 1–5, 59–63) cần phép quay riêng; thời gian
  BDT = GPST − 14 s; hằng số CGCS2000 khác GPS. Có test riêng.
- Rủi ro trạm ít vệ tinh: < 4 vệ tinh một hệ → không ước lượng đồng hồ hệ đó,
  epoch đánh dấu "không đủ vệ tinh".

## Validation Log

### Session 1–3 (giữ lịch sử)

- Session 1: mountpoint chưa biết → mock trước; NTRIP v1 mặc định (`CORS_NTRIP_V2=1` cho v2).
- Session 2: (đã bị Session 3 thay thế) đổi nhãn CEP50.
- Session 3 (261029-1110): CEP50 bất biến gốc → cắt sạch "mốc CORS" khỏi màn
  phòng; module = kết nối + đo sai số trạm làm đầu vào DGNSS giai đoạn 2.

### Session 4 (261029, đối chiếu chuẩn — thay thế phần giao thức cũ)

- Đối chiếu với RTCM 10403.x qua pyrtcm, RTKLIB, NovAtel, Emlid, Racelogic,
  Swift (chi tiết + nguồn trong artifact):
  - 1004 là quan sát GPS L1/L2, không phải ARP. 1033 là chuỗi mô tả thiết bị,
    không có tọa độ. 1007 là tên anten. 1076/1077 là GPS MSM6/7.
  - Dải 2000–3999 không có mã nào → 3040–3044/3151 không tồn tại; "GGA" là câu
    NMEA rover gửi lên caster VRS, không phải thứ trạm phát.
  - ARP chuẩn: 1005/1006 (trạm đơn), 1032 (mạng VRS).
  - Mã message nằm ở 12 bit đầu payload, không nằm trong header.
- Quyết định Q1–Q6 như bảng trên. Q4 chốt theo bằng chứng trong repo:
  `apps/server/src/app.ts` đã có `/ws`, `apps/web/src/sync/room-connection.ts`
  đã giữ 1 WebSocket có reconnect.
- Hệ quả: lõi tính sai số của giai đoạn 2 được kéo lên giai đoạn 1 → thêm
  phase 3 (engine), effort 16h → 46h.

## Success Criteria

- [ ] Framer + decoder có unit test và khớp pyrtcm trên stream thật.
- [ ] Engine tái tạo đúng sai số tiêm vào mock feed; vị trí vệ tinh khớp tham chiếu.
- [ ] Server broadcast `cors.state`/`cors.epoch`/`cors.history` cho mọi socket; reconnect; chẩn đoán thiếu quỹ đạo/ARP.
- [ ] Page `/cors` 4 khối; màn phòng không đổi; e2e hiện có xanh.
- [ ] Không cấu hình CORS → không regression.

<!-- slug: cors-dgnss-module -->
