---
title: "Phase 2: server - NTRIP client, framer + decoder RTCM3, sourcetable"
status: todo
---

# Phase 2: server — NTRIP client, framer + decoder RTCM3, sourcetable

## Overview

Server mở kết nối NTRIP tới caster (RTK2go `rtk2go.com:2101`, hoặc mock feed
khi `CORS_MOCK` bật), tách khung RTCM3 từ stream TCP, và decode các mã cần cho
engine phase 3. Server cũng tải sourcetable để chẩn đoán và gợi ý mountpoint
có phát quỹ đạo (Q3). Phase này chỉ sản xuất sự kiện đã decode; tính sai số
và broadcast nằm ở phase 3.

Tham chiếu: artifact mục 4 (khung), 5 (danh mục mã), 6 (ARP), 10 (NTRIP).
Bố cục bit theo RTKLIB `src/rtcm3.c` và pyrtcm (R2) — không copy chuẩn trả phí.

## NTRIP (`ntrip.ts`)

- **v1** (mặc định): `net.connect`, gửi
  `GET /<mp> HTTP/1.0\r\nUser-Agent: NTRIP rtk-cors/1.0\r\nAuthorization: Basic base64(user:pass)\r\n\r\n`.
  Đọc dòng đầu tới `\r\n\r\n`: `ICY 200 OK` → stream; `HTTP/1.x 401` →
  `auth-failed`; `SOURCETABLE 200 OK` → `mountpoint-not-found`.
- **v2** (`CORS_NTRIP_V2=1`): HTTP/1.1, `Host`, `Ntrip-Version: Ntrip/2.0`;
  un-chunk `Transfer-Encoding: chunked` trước khi đưa byte vào framer.
- Không có byte nào trong 30 s → `stream-timeout`, đóng socket để hub reconnect.
- **Sourcetable**: `GET / HTTP/1.0` một lần khi khởi động và mỗi 1 giờ. Parse
  dòng `STR;mountpoint;identifier;format;format-details;...;lat;lon;...`.
  Trả về format-details của mountpoint đang dùng và danh sách mountpoint có
  `1019`, `1046` hoặc `1042` trong format-details (sắp theo khoảng cách tới
  mountpoint đang dùng nếu có tọa độ).
- Không bao giờ log hoặc gửi password lên client.

## Framer (`rtcm3-framer.ts`)

- Bộ đệm byte; tìm `0xD3`, đọc độ dài 10 bit tại bit 14, chờ đủ `3 + N + 3`
  byte, kiểm tra CRC-24Q trên `3 + N` byte. Sai CRC → bỏ 1 byte, tìm `0xD3`
  kế tiếp. Mã message = `getbitu(payload, 0, 12)`.
- Đếm mọi mã quan sát được (`observedMsgTypes`), kể cả mã không decode.
- Helper `getbitu`/`getbits` (đến 38 bit có dấu — dùng arithmetic số thực,
  không dùng bitwise 32 bit của JS).

## Decoder (`rtcm3-decode.ts`)

| Mã | Ra | Ghi chú |
|----|----|---------|
| 1005 / 1006 | ECEF ARP (+ chiều cao anten 1006) | X tại bit 34, Y 74, Z 114, 38 bit có dấu × 0.0001 m; DF028 tại 152 (16 bit) |
| 1032 | ECEF ARP trạm vật lý | X/Y/Z tại 42/80/118 |
| 1033 | Chuỗi anten, serial, máy thu, firmware, serial máy thu | Mỗi chuỗi: 8 bit đếm + ký tự |
| 1019 | Quỹ đạo GPS | Theo `decode_type1019` RTKLIB |
| 1046 | Quỹ đạo Galileo I/NAV | Theo `decode_type1046` |
| 1042 | Quỹ đạo BeiDou | Theo `decode_type1042`; lưu cờ GEO theo PRN |
| 1074–1077, 1094–1097, 1124–1127 | Epoch MSM: thời gian, mỗi vệ tinh × tín hiệu: pseudorange, phase, CNR, lock | Header + mask chung cho mọi hệ |
| 108x, 1020, 1230, khác | — | Chỉ đếm (GLONASS làm sau, Q6) |

### MSM (artifact Q2)

- Header: DF002 (12), DF003 (12), epoch time (30, ms trong tuần; BeiDou theo
  BDT), multiple-message bit (1), IODS (3), dự trữ (7), clock steering (2),
  external clock (2), smoothing (1), smoothing interval (3), satellite mask
  (64), signal mask (32), cell mask (Nsat × Nsig ≤ 64).
- Dữ liệu vệ tinh: rough range số ms nguyên DF397 (8) + phần dư DF398 (10,
  2⁻¹⁰ ms); MSM5/7 thêm extended info (4) và rough rate DF399 (14).
- Dữ liệu tín hiệu: MSM4 fine pseudorange DF400 (15, 2⁻²⁴ ms), fine phase
  DF401 (22), lock DF402 (4), half-cycle (1), CNR DF403 (6). MSM7 dùng DF405
  (20, 2⁻²⁹ ms), DF406 (24), DF407 (10), half-cycle (1), DF408 (10, 2⁻⁴ dB-Hz),
  fine rate DF404 (15).
- Pseudorange (m) = `(rough_ms + fine_ms) × 299792.458`. Giá trị fine bằng mã
  "không hợp lệ" (bit cao nhất = 1, còn lại = 0) → bỏ ô đó.
- Gom các message cùng epoch theo multiple-message bit; phát sự kiện `epoch`
  khi message cuối của epoch tới.
- Tín hiệu dùng cho engine: GPS L1 C/A (`1C`), Galileo E1 (`1C`/`1X`), BeiDou
  B1I (`2I`). Bảng mã tín hiệu theo signal mask từ RTKLIB `msm_sig_*`.
- Số bit trong mục này lấy từ RTKLIB/pyrtcm theo trí nhớ; test đối chiếu
  pyrtcm trên stream thật (phase 5) là điều kiện bắt buộc trước khi tin số.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `apps/server/src/cors/ntrip.ts` | Client v1/v2, sourcetable |
| create | `apps/server/src/cors/rtcm3-framer.ts` | Tách khung + CRC + bit reader |
| create | `apps/server/src/cors/rtcm3-decode.ts` | Decoder bảng trên |
| create | `apps/server/src/cors/{ntrip,rtcm3-framer,rtcm3-decode}.test.ts` | Unit test |
| create | `apps/server/test/fixtures/` | Stream thật đã ghi (phase 5) + JSON kỳ vọng sinh bằng pyrtcm |

## Acceptance

- [ ] Framer: khung mock qua CRC; byte rác chen giữa → resync, không mất khung sau; khung bị cắt đôi qua 2 chunk TCP vẫn ghép đúng.
- [ ] Decode mock 1005/1006/1033/1019/1046/1042/MSM4 → đúng giá trị đã encode ở phase 1.
- [ ] NTRIP với `net.createServer` giả caster: request line + Basic auth đúng; `401` → `auth-failed`; `SOURCETABLE 200 OK` → `mountpoint-not-found`; v2 un-chunk đúng; sourcetable parse ra danh sách có quỹ đạo.
- [ ] CORS off → không TCP connect, không log.

## Rollback

Xóa `apps/server/src/cors/` và fixtures.
