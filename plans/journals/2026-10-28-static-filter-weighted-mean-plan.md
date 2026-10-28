---
title: static-filter-weighted-mean-plan
date: 2026-10-28
summary: Plan for tightening static default filter to 15 m/30 s and weighting static averaging by 1/accuracy²
---

# static-filter-weighted-mean-plan

## What happened
- User resumed a session whose notes already contained a 3-change design:
  1. `DEFAULT_STATIC_FILTER` → `{ maxAccuracyM: 15, warmupS: 30 }`
  2. `pointCloudStats`/`staticResult` weighted mean by `w = 1/acc²` with
     unweighted sample std and CEP50 around the weighted mean
  3. ripple: unit tests, e2e wait 8 s → 35 s, docs values 30 m/5 s
- Claude began scouting/reading code before writing a plan; user flagged the
  process miss with `/ak-plan`. Plan created (fast mode, single phase) at
  `plans/261028-1643-static-filter-and-weighted-mean/`.

## Decisions
- Change was already specified in the handoff notes, so fast mode was
  appropriate: one phase, no red-team, scope fixed by the notes.
- Type migration: `WeightedLatLon extends LatLon { accuracy }` narrows the
  public `@rtk/shared` contract deliberately; both web call sites pass
  `Sample[]` which already carries accuracy, so they need no edits.
- stdEast/stdNorth stay **unweighted sample std** (true scatter, UI "lệch
  chuẩn Đ/B" keeps its meaning); mean and CEP50 centre use weights.
- Accuracy 0 guard: `w = 1 / Math.max(acc, 1) ** 2` (acc 0 → w 1, no
  infinite weights).
- e2e: 60 s test timeout already covers the new 35 s wait; no
  `test.setTimeout` needed.

## Next steps
- Execute phase-01 via `/ak:cook` (stats.ts → stats.test.ts → e2e → docs),
  verify with shared unit tests, both typechecks, lint, and `two-phones` e2e.
- `static-panel.tsx` copy interpolates `DEFAULT_STATIC_FILTER`, so it is
  covered by existing UI — no copy edits planned.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
