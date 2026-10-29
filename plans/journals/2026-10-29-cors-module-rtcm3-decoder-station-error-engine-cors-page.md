---
title: "CORS module: RTCM3 decoder, station error engine, /cors page"
date: 2026-10-29
summary: "Implemented the CORS station-error module end to end; verified against pyrtcm, cssrlib and a real stream"
---

# CORS module: RTCM3 decoder, station error engine, /cors page

## What happened
- Implemented plan `plans/261029-0249-cors-dgnss-module` (6 phases):
  - shared: `cors.ts`, `ecef.ts`, `orbit.ts`, `rtcm3.ts`, `rtcm3-mock.ts`
  - server: `apps/server/src/cors/` (ntrip, framer, decoder, residual engine, hub, mock feed)
  - web: `/cors` page under `apps/web/src/features/cors/`
- The server pushes `cors.state`, `cors.epoch` and `cors.history` over the existing `/ws` to every socket. The room screen is unchanged.

## Verification
- Bit layouts written from memory were cross-checked against the pyrtcm source before trusting them; all matched.
- pyrtcm independently decodes every mock frame (1006, 1033, 1019/1046/1042, MSM4/7).
- Orbit vectors from IGS BRDC 2026-298 match cssrlib `eph2pos` within 1 m and 1 ns, including a BeiDou GEO.
- Real fixture: 120 s from the Centipede caster, mountpoint `1CEN` (guest login).
  - Decode matches pyrtcm.
  - Satellite positions match cssrlib.
  - Engine gives RMS 3.6 m, max 8.9 m over 24 satellites.
- The mock's injected error is recovered within 1 cm.
- Results: 128 unit/server tests and 7 e2e tests green; typecheck and lint green.

## Decisions
- Used Centipede rather than RTK2go for the fixture, because RTK2go requires the user's real email.
- The mock defaults to MSM7. MSM4's 1.8 cm pseudorange step is too coarse for the 1 cm acceptance criterion.
- Satellites are selected by ephemeris age only, not IODE matching, because MSM carries no IODE.

## Next steps
- Run against a real RTK2go mountpoint with the user's email.
- Do a manual network-drop run to observe the backoff in practice.
- GLONASS support is deferred.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
