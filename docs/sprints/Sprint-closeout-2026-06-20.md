# Sprint Closeout — 2026-06-20

| Field | Value |
|-------|--------|
| **Release** | v3.2.0 |
| **Type** | Production stabilization (P0 + P1 + P2) |
| **Deploy** | Firebase Hosting `student-check-th` |

---

## Deliverables

### P0 — Attendance save reliability ✅

- Root cause: sequential `setDoc` + blocking point sync + auto-resync on class open
- Fix: `writeBatch`, background sync, save timeout, submission markers
- Deployed to production before this closeout

### P1 — School Overview ✅

- Renamed Executive → ภาพรวมโรงเรียน; teachers read-only access
- `schoolOverviewCache.js` — 3 min TTL, memory + sessionStorage
- Manual refresh; admin-only PDF
- Dashboard cleanup

### P2 — Bulk Discipline Restore ✅

- `bulkDisciplineRestoreService.js` + admin UI panel
- Operation ID `BR-YYYYMMDD-xxxx`, audit collection
- PIN confirmation modal; UI polish in closeout

---

## Architecture constraints (held)

| ADR | Status |
|-----|--------|
| ADR-004 No attendance flow changes | ✅ Save path not modified in P1/P2 |
| ADR-002 Executive read-only | ✅ School Overview remains read-only |
| Spark-plan queries | ✅ Class-scoped point fan-out; date-scoped overview cache |

---

## Files (high level)

| Area | Key files |
|------|-----------|
| P0 | `attendanceService.js`, `main.js`, `check.js`, `offlineSync.js` |
| P1 | `schoolOverviewCache.js`, `executiveDayContext.js`, `executiveDashboard.js`, `dashboard.js` |
| P2 | `bulkDisciplineRestoreService.js`, `bulkDisciplineRestorePanel.js`, `disciplineReturnService.js` |

---

## Test status

| Test | Result |
|------|--------|
| `npm run build` | ✅ Pass |
| Production deploy | ✅ `firebase deploy --only hosting:app` |
| Manual smoke | Checklist in release notes (admin bulk restore on staging date recommended) |

---

## Next (governance)

1. Summary / Analytics Layer
2. Health Dashboard
3. Load testing
4. Sprint 4 — Executive PDF + period reports

---

*Sprint closeout approved for tag `v3.2.0`.*
