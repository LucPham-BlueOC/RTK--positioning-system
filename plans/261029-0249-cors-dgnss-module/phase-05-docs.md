---
title: "Phase 5: docs"
status: todo
---

# Phase 5: Docs

## Overview

Cập nhật tài liệu ảnh hưởng đến hành vi người dùng / vận hành: hướng dẫn
cấu hình trạm CORS (env + thông số RTK2go), mô tả module NTRIP/RTCM3 trong
kiến trúc (mục đích: thử nghiệm kết nối + quan sát sai số trạm GGA/RTD làm
đầu vào giảm sai số DGNSS giai đoạn 2), và ghi rõ module **không** thay đổi
màn phòng (không có dòng "giá trị mốc CORS" — CEP50 là độ lặp lại, bất
biến với gốc, không phải "sai số đã khử").

## Context

- `docs/architecture.md` — bảng component server + "Mở rộng cho các giai
  đoạn sau"; module này đứng giữa giai đoạn 1 và 2: đo sai số trạm, không
  cần RTKLIB, không đổi UI phòng.
- `docs/deployment-guide.md` — nơi đặt env khi vận hành.

## Files

| Action | Path | Change |
|--------|------|--------|
| modify | `docs/architecture.md` | Mục "Module CORS": sơ đồ (caster → NTRIP v1 TCP → RTCM3 parser → CorsState → UI page `/cors`), bảng env, mục đích module (thử nghiệm kết nối + sai số trạm GGA/RTD; dữ liệu phục vụ DGNSS phase 2), giới hạn: trình duyệt không có phép đo thô nên không apply correction được, CEP50 là độ lặp lại bất biến gốc (không gọi là "mốc CORS"), DGNSS/RTK thật = giai đoạn 2 (RTKLIB + receiver) |
| modify | `docs/deployment-guide.md` | Khối env `CORS_NTRIP_*` (host `rtk2go.com`, port `2101`, pass `none` cho RTK2go), `CORS_MOCK`, `CORS_NTRIP_V2`; ghi chú cách kiểm tra stream có phát GGA không (các mã hiển thị trên page `/cors`) |

## Acceptance

- [ ] Env mới liệt kê đúng tên/tham số, khớp code.
- [ ] Mục đích module (kết nối + sai số trạm) và giới hạn (không DGNSS,
      không dòng mốc CORS trên màn phòng, CEP50 bất biến gốc) nhất quán
      trong docs và UI.
- [ ] Không copy code chi tiết vào docs (rule: link tới source).

## Rollback

Revert 2 file docs.
