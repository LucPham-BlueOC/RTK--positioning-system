---
title: "Chặt bộ lọc đo tĩnh và trung bình gia quyền theo 1/accuracy²"
description: "Bộ lọc tĩnh mới (cửa sổ 3 s – 20 s, accuracy ≤ 30 m, fallback fix tốt nhất); điểm cloud lấy trung bình gia quyền 1/accuracy² với std/CEP50 ổn định"
status: pending
priority: P2
effort: 1.5h
branch: main
tags: [shared, web, e2e]
blockedBy: []
blocks: []
created: 2026-10-28
---

# Chặt bộ lọc đo tĩnh + trung bình gia quyền theo độ chính xác

Tạo: 2026-10-28 · Trạng thái: **chờ thực hiện** · Chi tiết: [phase-01](./phase-01-static-filter-and-weighted-mean.md)

## Kết quả mong muốn

Hai thay đổi hành vi đo tĩnh:

1. Bộ lọc tĩnh mới, không "bỏ qua hết": mẫu chỉ dùng trong **cửa sổ
   `warmupS`–`timeoutS`** (mặc định 3 s – 20 s) và phải có accuracy ≤ 30 m;
   nếu hết cửa sổ mà chưa có mẫu nào đạt chuẩn, **fallback lấy fix tốt nhất
   đã thấy** (đi kèm cảnh báo UI). Thay vì mặc định cũ `warmupS: 5,
   maxAccuracyM: 30`.
2. Vị trí trung bình của mỗi máy tính theo **trung bình gia quyền 1/accuracy²**
   (mẫu chính xác hơn kéo trung bình về phía nó), trong khi `stdEast`,
   `stdNorth`, `cep50` vẫn phản ánh độ phân tán thật của các mẫu.

## Ràng buộc

- `pointCloudStats`/`staticResult` là API public của `@rtk/shared` — đổi chữ
  ký loại (thêm `accuracy`) có chủ đích, cập nhật mọi call site.
- `filterForStatic` đổi kết quả từ `T[]` sang `{ samples, fellBack }` — cập
  nhật call site `static-panel.tsx` (cảnh báo fallback).
- UI copy trong `static-panel.tsx` đã nội suy `DEFAULT_STATIC_FILTER` nên tự
  cập nhật, không cần sửa.
- Docs: `docs/architecture.md` nêu giá trị cũ (30 m / 5 s) — phải cập nhật
  (hành vi người dùng thấy được thay đổi).
- E2E `two-phones.spec.ts` chờ 8 s rồi dừng phiên — với warmup 3 s + cửa sổ 20
  s, 8 s vẫn có mẫu hợp lệ, không cần đổi thời gian chờ.

## Không làm

- Không thêm UI để cấu hình bộ lọc (chỉ đổi hành vi mặc định).
- Fallback chỉ theo một chế độ `best`; không thêm chế độ khác.
- Không đổi `errorStats`/ghép mẫu cặp (chỉ chữ ký `pointCloudStats` đổi).
- Không thay đổi khoảng thời gian cho phép của phiên tĩnh.

## Tiêu chí chấp nhận

| # | Tiêu chí | Bằng chứng |
|---|----------|------------|
| 1 | `DEFAULT_STATIC_FILTER = { warmupS: 3, maxAccuracyM: 30, timeoutS: 20 }`; fallback fix tốt nhất khi không có mẫu đạt chuẩn | Unit test `filterForStatic` |
| 2 | `pointCloudStats`/`staticResult` nhận điểm kèm `accuracy`; cùng accuracy → cùng giá trị như trước (trọng số đều) | Unit test (vòng đều) + test mới: điểm acc tốt kéo trung bình |
| 3 | UI copy, cảnh báo fallback, docs đúng hành vi mới | `static-panel.tsx`, `docs/architecture.md` |
| 4 | E2E hai máy đo: phiên tĩnh vẫn ra ~20 m | `pnpm --filter @rtk/web test:e2e` |
| 5 | `pnpm lint && pnpm typecheck && pnpm test` xanh | Lệnh |
