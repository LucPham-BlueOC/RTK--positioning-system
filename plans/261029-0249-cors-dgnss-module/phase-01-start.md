---
title: "Phase 1: shared - schema va toan moc CORS"
status: todo
---

# Phase 1: shared — types CORS + toán ECEF/ENU trạm + mock feed

## Overview

Nền tảng dùng chung server/web (chạy được ở cả hai phía — qui tắc
`packages/shared` của repo): (1) type `CorsState` mô tả trạm CORS (vị trí
ARP, mã RTCM đang nhận, sai số trạm theo thời gian nếu stream có GGA),
(2) toán chuyển ECEF → WGS84 (vị trí trạm) và ENU gốc tại trạm (dùng cho
quick-test vị trí máy trong frame trạm, **chỉ trên page `/cors`** — không
đưa vào màn phòng), (3) mock feed RTCM3 hợp lệ (CRC đúng) để test + mock
mode, (4) config env từ nghiên cứu đã kiểm chứng (RTK2go:
`rtk2go.com:2101`, user = email tùy ý, pass = `none`).

**Mục đích module (chốt 261029-1110): thử nghiệm kết nối NTRIP + đo sai số
trạm (GGA/RTD) làm đầu vào giảm sai số DGNSS ở phase 2. Không có dòng giá
trị "mốc CORS" trên màn phòng** (kết quả quyết định này ghi ở `plan.md`).

## Context — sự thật giao thức (đã kiểm chứng, thay thế thiết kế cũ)

- **1005 KHÔNG phải GGA** — là GLONASS Stationary ARP (XYZ ECEF). Dải
  Stationary: 1004 (GPS ARP), 1005 (GLONASS ARP), 1006/1007 (RTK XYZ/GLL),
  1032/1033 (ARP XYZ/GLL), 1076/1077 (RTK).
- **GGA DGNSS** trong RTCM3 là 3040–3044 / 3151 (RTD residual per SV,
  đơn vị 0.01 m). Stream RTK2go típ (theo ví dụ Quectel) thường chỉ có
  `1005/1033 + MSM4` → **không có GGA** → UI phải hiện rõ trạng thái này.
- **Không có phép toán nào "hiệu chỉnh" vị trí trình duyệt bằng stream CORS**
  (Geolocation API không có phép đo thô). Quyết định chốt: **module CORS =
  thử nghiệm kết nối + quan sát sai số trạm (GGA/RTD)**; sai số trạm là đầu
  vào để giảm sai số DGNSS ở giai đoạn 2 (receiver nhận correction). Không
  claim DGNSS, không có dòng giá trị "mốc CORS" trên màn phòng.

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `packages/shared/src/cors.ts` | Types + toán (dưới), mock feed generator |
| create | `packages/shared/src/cors.test.ts` | Unit test |
| modify | `packages/shared/src/schema.ts` | `serverMessageSchema` + union member `{ type: 'cors.state', cors: CorsState }` (gửi MỌI socket, không cần room) |
| modify | `packages/shared/src/index.ts` | export cors |
| modify | `apps/server/src/config.ts` | env CORS mới |

## Types & math (design)

```ts
export interface CorsBase {
  lat: number; lon: number; alt: number;      // ARP WGS84, m (geodetic)
  msgType: number;                              // mã RTCM đã decode (1004/1032/...)
  at: number;
}

/** Sai số trạm theo thời gian — chỉ có khi stream phát mã GGA (3040..3044/3151). */
export interface CorsGga {
  at: number;
  msgType: number;
  maxRtdM: number;      // max |RTD| trên 12 SV
  rmsRtdM: number;      // sqrt(mean(RTD²))
}

export interface CorsState {
  status: 'off' | 'connecting' | 'connected' | 'reconnecting';
  mountpoint: string;
  base?: CorsBase;
  gga?: CorsGga;
  /** Bounded (vd 1800 điểm), cho biểu đồ sai số trạm theo thời gian. */
  ggaHistory: CorsGga[];
  /** Các mã RTCM đã quan sát + số lần, cho khối chẩn đoán /cors. */
  observedMsgTypes: { msgType: number; count: number; lastAt: number }[];
  error?: string; // 'auth-thua' | 'mountpoint-khong-ton-tai' | 'stream-khong-gia-ma-GGA' | ...
}

/** ECEF XYZ (m, WGS84) → geodetic (độ, m) — cho vị trí trạm. */
export function ecefToWgs84(x: number, y: number, z: number): { lat: number; lon: number; alt: number };

/** Vị trí sample trong ENU gốc tại ARP trạm (m) — chỉ dùng cho quick-test trên page /cors. */
export function enuToCorsBase(sample: { lat: number; lon: number; alt: number | null }, base: CorsBase): { e: number; n: number; u: number | null };
```

- `enuToCorsBase`: tái dùng ENU có sẵn trong `geo.ts` (`toEnu`, R = 6 371
  008.8 m, xấp xỉ phẳng < 1 km) — **không thêm `distanceToBase`** (kết quả
  "cắt sạch mốc CORS" 261029-1110: không dòng khoảng cách mốc CORS trên màn
  phòng; quick-test chỉ cần E/N của máy trong frame trạm để so với RTD).
- "Sai số (raw)" của một mẫu = `accuracy` (GPS WGS84, hiện có).

### CEP50 — ngoài scope module, không code

Module này **không viết CEP50 ở đâu cả**. CEP50 (độ lặp lại) là thuộc tính
của chính điện thoại và bất biến với gốc (tâm đám mây tính cùng frame nên
gốc triệt tiêu) — trạm CORS không đóng góp gì vào nó, nên "CEP50 (mốc
CORS)" vô nghĩa về mặt toán. `pointCloudStats` đo tĩnh hiện có giữ nguyên
chính, **không sửa, không thêm comment**. Lý do đầy đủ ghi ở `plan.md`
(Validation Session 3) — code chỉ cần biết: đừng tạo dòng CEP50/mốc CORS
mới, đừng đụng `stats.ts`.

### Mock feed

`corsMockFeed()` — generator byte stream RTCM3 hợp lệ: frame 1032 (ARP XYZ
cố định, ví dụ 10.7662, 106.6844 → ECEF) + frame 3040 (12 SV, RTD dạng sin
chậm, có chế độ `withGga: false` để mô phỏng stream không GGA). CRC tính
bằng đúng thuật toán BKG (xem phase 2), fixture này dùng cho test parser
và mock mode server.

### Config (env) — giá trị mặc định theo caster RTK2go công cộng

| Env | Mặc định | Ý nghĩa |
|-----|----------|---------|
| `CORS_NTRIP_HOST` | unset → module OFF | ví dụ `rtk2go.com` |
| `CORS_NTRIP_PORT` | `2101` | 2102 = TLS chỉ v2 |
| `CORS_NTRIP_MOUNTPOINT` | — | tìm trong source table của caster |
| `CORS_NTRIP_USER` | — | RTK2go: email tùy ý |
| `CORS_NTRIP_PASS` | `none` | mật khẩu caster RTK2go |
| `CORS_NTRIP_V2` | `0` | `1` → handshake HTTP/1.1 + chunked; `0` → HTTP/1.0 raw (mặc định, đơn giản) |
| `CORS_MOCK` | `0` | `1` → feed mock thay caster |
| `CORS_GGA_ONLY` | `0` | nếu `1` thì khi stream không phát GGA, status báo `error: stream-khong-gia-ma-GGA` |

## Acceptance

- [ ] `pnpm --filter @rtk/shared test` + `pnpm typecheck` xanh.
- [ ] `ecefToWgs84` đối chiếu giá trị tính tay (1 điểm Hanoi) sai < 1e-6 m.
- [ ] `enuToCorsBase` đúng số học (đối chiếu `toEnu` hiện có trong `geo.ts`);
      chỉ dùng cho quick-test page `/cors`, **không** được dùng để thêm dòng
      vào màn phòng.
- [ ] `corsMockFeed()` sinh byte qua được CRC check (mô tả trong phase 2).
- [ ] CORS off → `Config.cors.enabled === false`, server không đổi hành vi.

## Rollback

Xóa `cors.ts`/test, revert `schema.ts`, `index.ts`, `config.ts`. Không DB.
