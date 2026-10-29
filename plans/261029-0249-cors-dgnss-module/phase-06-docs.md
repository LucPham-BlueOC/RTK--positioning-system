---
title: "Phase 6: docs"
status: todo
---

# Phase 6: Docs

## Overview

Cập nhật tài liệu ảnh hưởng tới vận hành và kiến trúc: module CORS (NTRIP →
RTCM3 → engine sai số trạm → WebSocket `/ws` → page `/cors`), env mới, cách
chọn mountpoint, và giới hạn (không apply correction cho điện thoại, không
GLONASS, chỉ dùng quỹ đạo trong stream).

## Files

| Action | Path | Change |
|--------|------|--------|
| modify | `docs/architecture.md` | Mục "Module CORS": sơ đồ luồng, message `cors.state`/`cors.epoch`/`cors.history`, công thức sai số tổng (link tới `apps/server/src/cors/residual.ts`), giới hạn; ghi rõ phần lõi tính sai số đã kéo từ giai đoạn 2 lên; giai đoạn 2 còn lại: apply correction qua receiver/RTKLIB |
| modify | `docs/deployment-guide.md` | Bảng env `CORS_*`; cách chọn mountpoint qua sourcetable (cần `1005/1006` + MSM + `1019/1046/1042`); RTK2go dùng email thật, 1 kết nối/mountpoint |

## Acceptance

- [ ] Env trong docs khớp `apps/server/src/config.ts`.
- [ ] Docs không dùng các mã sai cũ (1004/1033 làm ARP, 3040–3044, "GGA" của trạm).
- [ ] Link tới source thay vì copy code; link artifact đối chiếu chuẩn.

## Rollback

Revert 2 file docs.
