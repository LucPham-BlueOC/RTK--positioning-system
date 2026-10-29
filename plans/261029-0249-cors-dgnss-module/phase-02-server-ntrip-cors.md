---
title: "Phase 2: server - NTRIP client va CORS hub"
status: todo
---

# Phase 2: server — NTRIP client + CORS hub

## Overview

Server tự mở kết nối NTRIP tới caster (RTK2go: `rtk2go.com:2101`, hoặc mock
feed khi `CORS_MOCK=1`), parse RTCM3, giữ `CorsState` (vị trí ARP trạm, các mã
đang nhận, sai số GGA theo thời gian nếu có) và broadcast `cors.state` cho **mọi**
WebSocket client (kể cả người chưa vào phòng — page `/cors` hoạt động độc
lập). Module tắt yên lặng khi chưa cấu hình; không ảnh hưởng luồng hiện có.

## Context — giao thức (đã kiểm chứng bởi user, thay thế thiết kế cũ)

- **NTRIP v1**: request HTTP/1.0 — `GET /<mountpoint> HTTP/1.0` +
  `User-Agent: NTRIP/1.0`, kèm `Authorization: Basic base64(user:pass)` nếu có.
  Caster trả header ICY-style rồi là **binary RTCM stream thô** trên cùng
  socket TCP. Không có `Expect: 100-continue`.
- **NTRIP v2**: HTTP/1.1 với `Transfer-Encoding: chunked` +
  `Ntrip-Version: Ntrip/2.0`. Mặc định dùng **v1** (đơn giản, `CORS_NTRIP_V2=1`
  để bật v2).
- **RTK2go**: caster công cộng, port `2101` (plain TCP, v1+v2), `2102` (TLS,
  chỉ v2). Username: email bất kỳ, password: `none`.
- **CRC-24Q** (theo BKG rtcm-ntrip source): đa thức `0x01864CFB`, init `0`,
  shift-register MSB-first trên (word0, word1, payload). Frame: `0xD3` +
  16 bit word0 (msgType 10 bit, 6 bit dự trữ, 10 bit độ dài) + 16 bit word1
  + payload (độ dài từ 2 bit cao nhất của word1) + CRC 3 byte.
- **Mã parse** (parser in-house, ~250 dòng, không phụ thuộc package ngoài):
  - `1004` GPS stationary ARP (ECEF XYZ, ±0.001 m), `1005` GLONASS
    stationary ARP, `1032`/`1033` stationary receiver ARP (ECEF XYZ / GLL
    lat/lon/alt) → **vị trí absolute trạm**;
  - `3040`–`3044` (GPS SV1-12 … SV61-72) và `3151` (GLONASS): **RTD
    residual per SV, unit 0.01 m, SGN** → sai số trạm theo thời gian
    (max/|RTD|, rms) — stream RTK2go có thể **không phát GGA** (típ:
    1033+MSM4), nên UI hiển thị trạng thái "không có mã GGA" thay vì crash.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `apps/server/src/cors/rtcm3.ts` | Parser: tách frame 0xD3 trong raw stream, tính CRC-24Q (BKG), decode mã stationary (1004/1005/1032/1033) → base, mã GGA (3040–3044/3151) → RTD; log mọi mã quan sát được (kể cả MSM) cho chẩn đoán |
| create | `apps/server/src/cors/rtcm3.test.ts` | CRC-24Q vector; parse 1032/1033 + 3040 từ `corsMockFeed` phase 1 + 1 fixture byte cứng |
| create | `apps/server/src/cors/ntrip.ts` | NTRIP v1 client (`net.connect`, request line HTTP/1.0 + Basic auth, đọc header tới dòng trống, sau đó stream RTCM) + chế độ v2 (HTTP/1.1, un-chunk khi `CORS_NTRIP_V2=1`); trả EventEmitter feed |
| create | `apps/server/src/cors/hub.ts` | `CorsHub`: `CorsState` + bounded `ggaHistory`, reconnect backoff 1s→5s cap, đếm `observedMsgTypes`; feed source inject (ntrip / mock) cho test |
| modify | `apps/server/src/config.ts` | (phase 1) `cors: { enabled, host, port, mountpoint, user, pass, ntripV2, mock }` |
| modify | `apps/server/src/app.ts` | `CorsHub.onState` → gửi `cors.state` cho **mọi socket đang mở** (map socket riêng; không chỉ room member) + gửi 1 lần khi socket open; `corsHub.shutdown()` trong `onClose` |
| modify | `apps/server/src/index.ts` | `corsHub.start()` khi `cors.enabled` (host thật hoặc mock) |

## Design

```
caster RTK2go (TCP 2101) / mockFeed
        │ NTRIP: HTTP/1.0 request → header → RTCM3 binary
        ▼
  ntrip.ts → rtcm3.ts parser
        │ event: base (1032/1033), gga (3040…/3151), msgTypeSeen
        ▼
  hub.ts (CORS hub): state + ggaHistory bounded + backoff reconnect
        │ onState(CorsState)
        ▼
  app.ts: { type: 'cors.state', cors } → MỌI socket + 1 lần khi socket open
```

- `CorsState.gga` = điểm (at, msgType, maxRtdM, rmsRtdM); history giữ
  `CORS_HISTORY_POINTS` (mặc định 1800) điểm — biểu đồ "sai số trạm theo
  thời gian" trên page `/cors`.
- Khi stream không có GGA (stream RTK2go típ): `gga`/`ggaHistory` rỗng,
  `observedMsgTypes` đầy đủ → UI page CORS hiện "Trạm phát các mã: 1033,
  1074, … — không có GGA; không có sai số trạm để vẽ".
- CORS state **toàn cục, không theo phòng, không lưu DB**.

## Acceptance

- [ ] `pnpm --filter @rtk/server test` xanh:
      - CRC-24Q: frame mock 1032/3040 qua check.
      - Parser: fixture 1033 (GLL) → đúng lat/lon/alt base (tolerance < 1e-6°);
        fixture 3040 → đúng max/rms RTD (đơn vị 0.01 m).
      - Hub: mock feed → `connected` + base; cắt stream giả lập →
        `reconnecting` → khôi phục (fake timers); history bounded đúng giới hạn.
      - NTRIP handshake: mock TCP caster local (`net.createServer`) → client
        gửi đúng request line `GET /mp HTTP/1.0` + `Authorization: Basic`;
        mã mountpoint sai / 401 → `error` text rõ trong `CorsState`.
- [ ] CORS off (không env, không mock) → server y hệt hiện tại: không TCP
      connect, không log.
- [ ] Client chưa vào phòng (mở `/ws` trần như page `/cors` sẽ làm) nhận
      được `cors.state` khi connect và khi state đổi.

## Rollback

Xóa `apps/server/src/cors/`, revert 2 file `app.ts`/`index.ts`.
