# Phase 01: Đổi mặc định bộ lọc + trung bình gia quyền theo 1/accuracy²

Trạng thái: **đang thực hiện** (phần bộ lọc mới đã xong; phần gia quyền còn mở) · Ước lượng: 1.5h · Phụ thuộc: không

## Bối cảnh

- `DEFAULT_STATIC_FILTER` (packages/shared/src/stats.ts:60) đang là
  `{ maxAccuracyM: 30, warmupS: 5 }` — thay bằng bộ lọc mới có cửa sổ +
  fallback: `{ warmupS: 3, maxAccuracyM: 30, timeoutS: 20 }`, dùng mẫu trong
  cửa sổ 3–20 s và accuracy ≤ 30 m; hết cửa sổ mà chưa có mẫu đạt chuẩn thì
  fallback lấy fix tốt nhất đã thấy (cảnh báo UI).
- `pointCloudStats` (stats.ts:81) và `staticResult` (stats.ts:100) hiện trung
  bình không gia quyền các điểm `LatLon`; muốn gia quyền `w = 1/acc²` cho
  trung bình, còn std/CEP50 giữ độ phân tán thật.
- Call site: `apps/web/src/features/map/enu-scatter.tsx:29` và
  `apps/web/src/features/static-session/static-panel.tsx:52` — cả hai truyền
  `Sample[]` (có `accuracy`), nên thu hẹp loại đầu vào là an toàn về type.
- E2E `apps/web/e2e/two-phones.spec.ts:96` chờ 8 s rồi dừng phiên — với
  warmup 3 s + cửa sổ 20 s, 8 s vẫn có mẫu hợp lệ, không đổi thời gian.

## Yêu cầu

1. `DEFAULT_STATIC_FILTER = { warmupS: 3, maxAccuracyM: 30, timeoutS: 20 }`;
   `filterForStatic` trả `{ samples, fellBack }`: giữ mẫu nằm trong cửa sổ
   `[sessionStart + warmupS, sessionStart + timeoutS)` có accuracy ≤ ngưỡng;
   không có mẫu nào thì fallback fix có accuracy tốt nhất trong
   `[sessionStart + warmupS, sessionStart + timeoutS]`, `fellBack: true`.
2. `pointCloudStats`/`staticResult` nhận điểm kèm `accuracy` (giao diện mới
   `WeightedLatLon extends LatLon { accuracy: number }`), trung bình gia quyền
   `w = 1 / Math.max(accuracy, 1) ** 2` (guard acc ≤ 1; acc 0 → w = 1 thay vì
   vô cực).
3. `stdEast`/`stdNorth` dùng **std mẫu không gia quyền** của các điểm (độ
   phân tán thật, giữ ý nghĩa UI "lệch chuẩn Đ/B"); `cep50` = trung vị bán
   kính quanh **trung bình gia quyền** (không đổi cách tính, chỉ đổi tâm).
4. Cập nhật tests, e2e (chỉ comment), docs theo hành vi mới.

## Các bước

### 1. `packages/shared/src/stats.ts`

- Đổi bộ lọc:
  ```ts
  export interface StaticFilter {
    warmupS: number;
    maxAccuracyM: number;
    timeoutS: number;
  }
  export const DEFAULT_STATIC_FILTER: StaticFilter = {
    warmupS: 3,
    maxAccuracyM: 30,
    timeoutS: 20,
  };
  export function filterForStatic<T extends PairableSample>(
    samples: readonly T[],
    sessionStart: number,
    filter: StaticFilter = DEFAULT_STATIC_FILTER,
  ): { samples: T[]; fellBack: boolean }
  ```
  Cửa sổ dùng: mẫu hợp lệ khi `tServer >= from && tServer < until &&
  accuracy <= maxAccuracyM` (từ `from = sessionStart + warmupS*1000`,
  `until = sessionStart + timeoutS*1000`); không có thì fallback mẫu có
  `accuracy` nhỏ nhất trong `[from, until]`, `fellBack: true`.
- Thêm `export interface WeightedLatLon extends LatLon { accuracy: number }`
  và đổi chữ ký: `pointCloudStats(points: readonly WeightedLatLon[], ...)`,
  `staticResult(pointsA: readonly WeightedLatLon[], pointsB: readonly WeightedLatLon[])`.
- Trong `pointCloudStats`:
  ```ts
  const w = points.map((p) => 1 / Math.max(p.accuracy, 1) ** 2);
  const sumW = w.reduce((s, x) => s + x, 0);
  const c: Enu = {
    east: enu.reduce((s, p, i) => s + p.east * w[i]!, 0) / sumW,
    north: enu.reduce((s, p, i) => s + p.north * w[i]!, 0) / sumW,
  };
  ```
  `stdEast: std(...)`, `stdNorth: std(...)` giữ nguyên; `cep50` dùng `c`
  (trung bình gia quyền).
- Call site không phải sửa (mẫu `Sample` có `accuracy`, thỏa
  `WeightedLatLon`).

### 2. `packages/shared/src/stats.test.ts`

- `ring()` hiện trả `LatLon` — cho mỗi điểm thêm `accuracy: 1` (đều) để thỏa
  `WeightedLatLon`; kết quả cùng accuracy phải khớp giá trị cũ
  (trọng số đều ≡ không gia quyền).
- "keeps in-window samples that fit the accuracy ceiling" (thay test cũ "drops
  warm-up samples and poor fixes"): `{tServer: 1000, acc 3}` (warm-up, loại),
  `{tServer: 4000, acc 3}` (giữ), `{tServer: 4000, acc 45}` (acc > 30, loại)
  → kỳ vọng `[4000]`, `fellBack: false`.
- Test mới "falls back to the best seen fix": trong cửa sổ không có mẫu nào
  acc ≤ 30 → giữ mẫu acc tốt nhất (vd acc 40 thay vì 45), `fellBack: true`.
- Test mới "empty when nothing seen by the timeout": mẫu duy nhất đến sau
  cửa sổ → `samples: []`, `fellBack: true`.
- Test "defaults to warm-up 3 s, 30 m ceiling and a 20 s window" khóa
  `DEFAULT_STATIC_FILTER`.
- Test mới "accuracy weights the mean":
  điểm `{east: 0, acc: 1}` (w = 1) và `{east: 10, acc: 10}` (w = 0.01) →
  east ≈ `10·0.01/1.01 ≈ 0.099`; kiểm tra cả north.
- std không gia quyền: vòng 4 điểm cùng accuracy → `stdEast`/`stdNorth` đúng
  `std([2,0,-2,0])`/`std([0,2,0,-2])` như test cũ (giữ nguyên, chỉ thêm
  accuracy).

### 3. `apps/web/e2e/two-phones.spec.ts`

- Chỉ cập nhật comment dòng 96: "past the 3 s warm-up so samples count".
  Với warmup 3 s + cửa sổ 20 s, 8 s chờ (hiện có) vẫn có mẫu hợp lệ, không
  đổi thời gian chờ.

### 4. `apps/web/src/features/static-session/static-panel.tsx`

- `filterForStatic` giờ trả `{ samples, fellBack }` — cập nhật call site:
  truyền `filtered.a.samples` / `filtered.b.samples` cho `staticResult`.
- Thêm cảnh báo (màu amber) khi `fellBack`: "Chưa có mẫu nào đạt chuẩn …
  kết quả dùng fix tốt nhất đã thấy."
- Copy mô tả: nội suy `DEFAULT_STATIC_FILTER.warmupS/maxAccuracyM/timeoutS`,
  nêu rõ hành vi cửa sổ + fallback.

### 5. `docs/architecture.md` (đoạn "Chế độ đo tĩnh", dòng ~273–274)

- "5 giây đầu" → "3 giây đầu"; nêu thêm: chỉ dùng mẫu trong 20 s đầu phiên,
  hết thời gian mà chưa có mẫu đạt chuẩn accuracy → dùng fix tốt nhất đã
  thấy (UI cảnh báo).
- Nêu thêm: vị trí trung bình lấy theo trọng số 1/accuracy² (mục "Tính vị trí
  trung bình mỗi máy trong ENU").

### 6. Không sửa

- `enu-scatter.tsx`: mẫu `Sample` thỏa loại mới → không sửa.

## Thử nghiệm / xác minh

```bash
pnpm --filter @rtk/shared test            # unit: bộ lọc mới, gia quyền
pnpm --filter @rtk/shared typecheck
pnpm --filter @rtk/web typecheck
pnpm --filter @rtk/web test:e2e           # two-phones: phiên tĩnh ~20 m
pnpm lint
```

## Rủi ro

- Fallback "fix tốt nhất" có thể đưa mẫu accuracy xấu (vd 45 m) vào trung
  bình nếu cả phiên không có mẫu đạt chuẩn; UI phải cảnh báo rõ để người
  dùng nhận ra kết quả kém tin cậy.
- Jitter ticker 1 s trong e2e: cửa sổ 3–20 s cho ~16–17 mẫu hợp lệ, đủ để
  CEP50/khoảng cách khớp `toBeCloseTo(20, 1)` như trước.

## Hoàn tác

Xong khi: các lệnh xanh, docs khớp code, plan này chuyển "đã thực hiện".
