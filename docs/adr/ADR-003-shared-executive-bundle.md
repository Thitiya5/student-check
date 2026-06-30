# ADR-003: Shared Executive Bundle Reduces Firestore Reads

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-06-20 |
| **Sprint** | 2.5 |

---

## Context

Sprint 2 initially loaded executive data via parallel calls (`getTodaySummary`, `getGradeSummary`, `getAttendanceRate`), each fetching roster and Firestore independently — up to **3× duplicate reads** per page refresh. Firebase Spark plan and production scale require minimal Firestore usage.

---

## Decision

Introduce a **shared executive day context** and a **single bundle loader**:

1. `fetchExecutiveDayContext(session, opts)` — one `fetchAllStudents()` + one `queryAttendanceByDateForSession()`
2. `getExecutiveDashboardBundle(session, opts)` — derives summary, grades, insights, completion, and charts in memory
3. Individual service functions may accept optional `ctx` to avoid re-fetching
4. Sprint 3 charts **must** use bundle data only — no additional queries

---

## Consequences

### Positive

- 1 Firestore read + 1 roster read per executive refresh
- Spark-plan friendly
- Consistent data snapshot across all dashboard sections

### Negative

- Slightly larger in-memory processing per refresh (negligible for school scale)
- Bundle API must be extended carefully when adding sections (e.g. charts in Sprint 3)

---

## Compliance

Verified Sprint 2.5–3: single bundle load; charts add zero Firestore reads.
