# Performance Baseline — v3.2.x (Final Stabilization)

> Audit date: 2026-07-19 · Build: `3.2.0` + stabilization patches (pre-deploy)

## Methodology

Static code audit + lifecycle tracing across all production routes. Metrics marked **est.** are from architecture review (not live RUM). After deploy, validate with DevTools Network + `[perf]` console marks (dev builds only).

## Route ranking (before → after)

| Rank | Route | Before (cold est.) | After (warm est.) | Primary fix |
|------|-------|-------------------|-------------------|-------------|
| 1 | `#/dashboard` (admin) | 3–6 s | 1.5–2.5 s stats; scores deferred | Defer semester scores; reuse `data.summary` |
| 2 | `#/discipline-report` detail | 2–5 s | <1 s warm | Class-scoped query; overview row reuse; 4 min cache |
| 3 | `#/executive` | 2–4 s perceived reload | <800 ms warm | Sync cache paint; zero network within TTL |
| 4 | `#/reports` | 2–4 s | unchanged | No change (session cache deferred) |
| 5 | `#/check` | 1–3 s | <1 s warm roster | Existing roster cache preserved |
| 6 | `#/history` | 1.5–2.5 s | unchanged | Already scoped queries |
| 7 | `#/points-report` / `#/behavior` | 1.5–3 s | unchanged | Out of scope |
| 8 | `#/inspection` | 1–2 s | unchanged | Class-scoped |
| 9 | `#/settings` / `#/admin-*` | <1 s | unchanged | Settings memory cache |
| 10 | `#/login` | <800 ms | unchanged | Static import only |

## Per-route baseline (after stabilization)

| Route | Firestore reads (cold) | GAS (cold) | Writes on open | PDF chunk on nav |
|-------|------------------------|------------|----------------|------------------|
| Login | 0 | 0–1 login | 0 | No |
| Dashboard | 1 day + semester range | 0 | 0 | No |
| Check | 1 class/date | 0–1 roster | 0 | No |
| History | 1 scoped query | 0 | 0 | No |
| Reports | 1 range query | 0–1 roster | 0 | No (lazy on export) |
| School Overview | 1 school-wide day | 1 roster | 0 | No (lazy on export) |
| Discipline overview | 1 day (shared cache admin) | 0–N class opts | 0 | No |
| Discipline detail | 0–1 class (was school-wide) | 0–1 roster | 0 | No (lazy on export) |
| Inspection | 1 class/date | 0–1 roster | 0 | No |

## Cache policy (authoritative)

| Data | Storage | TTL | Key | Invalidate |
|------|---------|-----|-----|------------|
| Roster | memory + localStorage + IDB | 24 h | level\|room | Manual refresh; login clears all |
| School Overview | memory + sessionStorage | 3 min | yyyy-MM-dd | Attendance save (that date); manual refresh |
| Discipline report | memory + sessionStorage | 4 min | overview: YYYY-MM::scope; detail: class::date | Save (date + class); month change |
| App settings | memory + localStorage | Until Firestore refresh | global | Admin settings save |
| Reports | none | — | — | Always fresh fetch |

## Known external dependencies

- GAS cold start (500 ms–3 s) on first roster fetch per session
- Firestore latency under morning concurrency
- OneDrive sync can slow local dev builds (not production)

## Remaining risks

- Admin dashboard still loads semester scores (deferred, not removed)
- Reports / monthly PDF still re-fetch on export click
- School Overview 3 min TTL may show stale counts until save invalidates or manual refresh
- `fetchAllStudents()` for executive cold load remains single large GAS call

## Rollback

Revert stabilization commit(s): discipline cache, executive sync paint, dashboard defer, main.js cache invalidation, studentsService TTL check. No schema or GAS changes.
