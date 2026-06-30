# Sprint 2 — Executive Read Services

| Field | Value |
|-------|--------|
| **Sprint** | 2 |
| **Governance version** | v1.1.0-beta (incremental) |
| **Review status** | ✅ **APPROVED** |
| **Date completed** | 2026-06-20 |

---

## Objective

Introduce a dedicated Executive service layer with **Firestore read-only** access to existing production attendance data. Wire live KPIs; keep charts mock and PDF disabled.

---

## Architecture Decisions

- Executive services **import** `attendanceService` — do not modify it
- Roster totals via existing `fetchAllStudents()` (GAS) for denominators
- `queryAttendanceByDateForSession()` for admin school-wide day query
- Navigation consolidated into `navbar.js` with `showExecutive` flag
- Removed duplicate `executiveBottomNav` and `executiveSidebar`

---

## Files Created

| Path |
|------|
| `src/services/executive/executiveAttendanceService.js` |
| `src/utils/executive/executiveAggregates.js` |

---

## Files Modified

| Path | Change |
|------|--------|
| `src/components/navbar.js` | `showExecutive` option |
| `src/main.js` | Unified bottom nav |
| `src/pages/executive/executiveDashboard.js` | Async live data load |
| `src/components/executive/executiveHeader.js` | Logo, meta, last updated |
| `src/components/executive/executiveExportBar.js` | Disabled + “เร็ว ๆ นี้” |
| `src/components/executive/executiveInsights.js` | Live insights |
| `src/styles/executive-dashboard.css` | Header/export styles |
| `src/i18n/translations.js` | New keys |

## Files Deleted

| Path |
|------|
| `src/components/executive/executiveBottomNav.js` |
| `src/components/executive/executiveSidebar.js` |

---

## Firestore Impact

**Read-only.** Uses existing `attendance` collection via `queryAttendanceByDateForSession()`. No schema changes, no writes, no new collections.

---

## Performance Notes

- Initial implementation: up to 3 parallel context loads (roster + Firestore each) — **addressed in Sprint 2.5**
- Admin day query: single `attendanceDate == date` query (school-wide)

---

## Regression Risk

| Risk | Level |
|------|-------|
| `navbar.js` change affects teachers | **Low** — `showExecutive` defaults false |
| Duplicate Firestore reads | **Medium** — fixed in Sprint 2.5 |
| KPI treats unsubmitted as absent | **Low** — documented; completion logic separate |

---

## Rollback Plan

1. Revert executive service files and dashboard wiring
2. Restore `navbar.js` without `showExecutive` if needed
3. `npm run build` && redeploy hosting
4. No Firestore rollback required

---

## Review Status

✅ **APPROVED** — Read-only services, no production module modification.
