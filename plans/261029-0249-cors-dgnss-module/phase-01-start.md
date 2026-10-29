---
title: "Phase 1: shared - types, geodesy, toan quy dao, mock feed"
status: todo
---

# Phase 1: shared — types, geodesy, toán quỹ đạo, mock feed

## Overview

Nền tảng dùng chung server/web (qui tắc `packages/shared`): (1) schema zod cho
các message CORS mới, (2) geodesy WGS84 chuẩn (ECEF ↔ geodetic, ENU tại
trạm, góc ngẩng), (3) toán quỹ đạo Kepler + đồng hồ vệ tinh cho GPS, Galileo,
BeiDou, (4) mock feed RTCM3 hợp lệ sinh từ quỹ đạo thật về mặt hình học, có
sai số tiêm vào đã biết để test engine ở phase 3, (5) config env.

Tham chiếu chuẩn: artifact mục 6 (ARP), 9 (ECEF → WGS84), 7 (sai số trạm).

## Files

| Action | Path | Change |
|--------|------|--------|
| create | `packages/shared/src/cors.ts` | Schema zod + type `CorsState`, `CorsEpoch`, `CorsSatResidual` |
| create | `packages/shared/src/ecef.ts` | `ecefToGeodetic`, `geodeticToEcef`, `ecefToEnu`, `elevationAzimuth` (WGS84) |
| create | `packages/shared/src/orbit.ts` | `keplerSatPos` (GPS/GAL/BDS, kể cả BDS GEO), `satClockBias`, hằng số từng hệ |
| create | `packages/shared/src/rtcm3-mock.ts` | `corsMockFeed()` — encoder khung RTCM3 + bộ sinh epoch |
| create | `packages/shared/src/{cors,ecef,orbit,rtcm3-mock}.test.ts` | Unit test |
| modify | `packages/shared/src/schema.ts` | Thêm `cors.state`, `cors.epoch`, `cors.history` vào `serverMessageSchema` |
| modify | `packages/shared/src/index.ts` | Export các module mới |
| modify | `apps/server/src/config.ts` | `cors: {...}` từ env |

Không sửa `geo.ts` (`toEnu` xấp xỉ phẳng vẫn dùng cho màn phòng) và không sửa `stats.ts`.

## Types (design)

```ts
type GnssSystem = 'G' | 'E' | 'C'; // GPS, Galileo, BeiDou (GLONASS sau)

interface CorsStation {
  ecef: { x: number; y: number; z: number };   // m, từ 1005/1006/1032
  lat: number; lon: number; alt: number;        // WGS84, tính bằng ecefToGeodetic
  antennaHeightM: number | null;                 // 1006
  msgType: 1005 | 1006 | 1032;
  stationId: number;
  receiver?: string; antenna?: string; firmware?: string; // 1033
  at: number;
}

interface CorsSatResidual {
  sys: GnssSystem; prn: number;
  residualM: number;      // sai số tổng (đã trừ đồng hồ chung của hệ, giữ khí quyển)
  elevationDeg: number;
  cn0: number | null;     // dB-Hz từ MSM
}

interface CorsEpoch {
  at: number;             // epoch thời gian GPS → ms Unix
  sats: CorsSatResidual[];
  clockBiasM: Partial<Record<GnssSystem, number>>; // độ lệch đồng hồ máy thu ước lượng mỗi hệ
  rmsM: number; maxAbsM: number;
  skipped: { sys: GnssSystem; prn: number; reason: 'no-ephemeris' | 'low-elevation' | 'no-signal' }[];
}

interface CorsState {
  status: 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  mock: boolean;
  host: string; port: number; mountpoint: string;   // không bao giờ gửi password
  station?: CorsStation;
  observedMsgTypes: { msgType: number; count: number; lastAt: number }[];
  ephemerisCount: Partial<Record<GnssSystem, number>>;
  /** Từ sourcetable: mã mountpoint quảng cáo + danh sách mountpoint có phát quỹ đạo. */
  sourcetable?: { advertised: string | null; withEphemeris: { mountpoint: string; lat: number; lon: number; formatDetails: string }[] };
  diagnosis: ('no-station-position' | 'no-ephemeris' | 'no-msm' | 'too-few-sats')[];
  error?: 'auth-failed' | 'mountpoint-not-found' | 'connect-failed' | 'stream-timeout';
}
```

Message mới (chỉ **thêm** vào `serverMessageSchema`):

- `{ type: 'cors.state', cors: CorsState }` — khi trạng thái đổi, tối đa 1 lần/giây.
- `{ type: 'cors.epoch', epoch: CorsEpoch }` — mỗi epoch MSM tính xong.
- `{ type: 'cors.history', epochs: CorsEpoch[] }` — 1 lần khi socket mở (tối đa 600 epoch ≈ 10 phút).

## Geodesy (`ecef.ts`)

- WGS84: `a = 6378137`, `f = 1/298.257223563`, `e² = f(2 − f)`.
- `ecefToGeodetic`: lặp 5 vòng như artifact mục 9 (sai < 1 mm); nhánh `p ≈ 0`.
- `ecefToEnu(target, originEcef)`: ma trận quay theo lat/lon gốc — chính xác ở
  mọi khoảng cách (thay cho `toEnu` phẳng khi cách trạm xa, R7).
- `elevationAzimuth(satEcef, stationEcef)`.

## Toán quỹ đạo (`orbit.ts`)

- Hằng số:
  - GPS: GM = 3.986005e14, Ω̇e = 7.2921151467e-5.
  - Galileo: GM = 3.986004418e14, Ω̇e = 7.2921151467e-5.
  - BeiDou (CGCS2000): GM = 3.986004418e14, Ω̇e = 7.292115e-5.
  - c = 299792458, F = −4.442807633e-10.
- `keplerSatPos(eph, tTx)`: thuật toán IS-GPS-200 (giải Kepler lặp, hiệu chỉnh
  điều hòa Cuc/Cus/Crc/Crs/Cic/Cis). BeiDou GEO (PRN 1–5, 59–63): tính trong
  hệ quán tính rồi quay −5° quanh X và theo Ω̇e·tk quanh Z (theo BDS-SIS-ICD).
- `satClockBias(eph, t)`: `af0 + af1·dt + af2·dt²` + hiệu ứng tương đối
  `F·e·√A·sinE`, trừ group delay theo tín hiệu dùng (GPS TGD cho L1 C/A,
  Galileo BGD E1/E5a, BeiDou TGD1 cho B1I).
- Thời gian: Galileo GST ≡ GPST; BDT = GPST − 14 s; xử lý vượt tuần (±302400 s).

## Mock feed (`rtcm3-mock.ts`)

- Encoder: `encodeFrame(payloadBits)` (+ CRC-24Q) và encoder 1005, 1006, 1033,
  MSM4 (GPS 1074, Galileo 1094, BeiDou 1124), 1019, 1046, 1042.
- Bộ sinh: trạm cố định (10.7662, 106.6844, 10 m → ECEF), một bộ quỹ đạo cố
  định hợp lệ cho ~8 GPS + ~6 Galileo + ~8 BeiDou (gồm ≥ 1 GEO); mỗi epoch 1 s:
  `pseudorange = ρ + Sagnac − c·dts + c·dtr_sys + injected(sys, prn, t)` với
  `injected` = sin chậm biên độ đã biết. Test phase 3 dùng giá trị này.
- Tùy chọn: `{ ephemeris: false }` (mô phỏng trạm không phát quỹ đạo),
  `{ station: false }` (thiếu ARP), `{ systems: [...] }`.

## Config (env)

| Env | Mặc định | Ý nghĩa |
|-----|----------|---------|
| `CORS_NTRIP_HOST` | unset → module OFF | ví dụ `rtk2go.com` |
| `CORS_NTRIP_PORT` | `2101` | |
| `CORS_NTRIP_MOUNTPOINT` | — | chọn từ sourcetable (mountpoint có 1019/1046/1042) |
| `CORS_NTRIP_USER` | — | RTK2go: email thật |
| `CORS_NTRIP_PASS` | `none` | |
| `CORS_NTRIP_V2` | `0` | `1` → HTTP/1.1 + chunked |
| `CORS_MOCK` | `0` | `1` → mock feed đầy đủ; `no-ephemeris`, `no-station` → các biến thể chẩn đoán |
| `CORS_MIN_ELEVATION_DEG` | `10` | bỏ vệ tinh thấp hơn ngưỡng |
| `CORS_HISTORY_EPOCHS` | `600` | số epoch giữ trong bộ nhớ và gửi khi socket mở |

## Acceptance

- [ ] `pnpm --filter @rtk/shared test` + `pnpm typecheck` xanh.
- [ ] `ecefToGeodetic(geodeticToEcef(p)) ≈ p` (< 1e-9°, < 1 mm) cho Hà Nội, TP.HCM; điểm (0,0,0) ↔ (6378137,0,0).
- [ ] `keplerSatPos` khớp vector tham chiếu (1 bộ quỹ đạo GPS, 1 Galileo, 1 BeiDou MEO, 1 BeiDou GEO lấy từ RINEX nav thật, so với RTKLIB/georinex) < 1 m; đồng hồ < 1 ns.
- [ ] Mọi khung `corsMockFeed()` qua CRC-24Q.
- [ ] Không env CORS → `config.cors.enabled === false`.

## Rollback

Xóa các file mới, revert `schema.ts`, `index.ts`, `config.ts`. Không DB.
