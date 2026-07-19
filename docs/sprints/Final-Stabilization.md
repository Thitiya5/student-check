# Sprint — Final Stabilization (Performance)

**Status:** ✅ Deployed v3.2.1

## Goal

Safe, system-wide performance pass for production handover — no feature changes, no business rule changes.

## Scope delivered

### Discipline Report
- [x] Class-scoped attendance query (`getAttendanceForClassOnDate`) — was school-wide re-read
- [x] Reuse overview `allRows` when drilling into class (zero extra Firestore)
- [x] Admin reuses School Overview attendance cache when same inspection date
- [x] Memory + sessionStorage cache (4 min), keyed by month/scope and class/date
- [x] Skip blocking spinner when cache warm
- [x] Parallel roster + attendance fetch

### School Overview
- [x] Synchronous paint from cache before async refresh (`tryGetExecutiveDashboardBundleFromCache`)
- [x] Filter changes remain client-side on cached payload
- [x] Invalidate cache on successful attendance save (saved date)

### Dashboard
- [x] Reuse precomputed `data.summary` from API
- [x] Defer semester scores section to next animation frame (stats paint first)

### Roster
- [x] Memory cache respects 24 h localStorage TTL

### Observability
- [x] Dev-only `[perf]` route timing (`src/utils/perfTrace.js`)

## Out of scope (documented, not changed)

- Reports session cache
- Monthly PDF re-fetch elimination
- main.js global loading spinner removal
- GAS / Firestore schema changes

## Regression checklist

See [PERFORMANCE_BASELINE-v3.2.x.md](../performance/PERFORMANCE_BASELINE-v3.2.x.md) and Final Report in Architecture Review packet.

## Deploy gate

1. Architecture Review approval
2. Manual teacher + admin regression (check save, PDF export gates, read-only writes = 0)
3. `npm run build` pass
4. Tag `v3.2.1` or `v3.3.0` per governance
