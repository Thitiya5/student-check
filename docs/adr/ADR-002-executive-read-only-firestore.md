# ADR-002: Executive Uses Read-Only Firestore Services

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-06-20 |
| **Sprint** | 2 |

---

## Context

Executive analytics require attendance data stored in Firestore. Production teachers write attendance via `saveClassAttendance()` in `attendanceService.js`. Executive features must not introduce writes, schema changes, or new collections that could affect production data integrity.

---

## Decision

All Executive data access **must be read-only**:

- Executive services live under `src/services/executive/`
- They **import** existing `attendanceService` query functions (e.g. `queryAttendanceByDateForSession`)
- They **must not** call `setDoc`, `deleteDoc`, or modify `attendanceService.js`
- No new Firestore collections or indexes for Executive-only data (Sprints 1–3)
- Roster denominators use existing `studentsService.fetchAllStudents()` (GAS read)

---

## Consequences

### Positive

- Production attendance workflow untouched
- Firestore rules and indexes unchanged
- Executive can be rolled back without data migration

### Negative

- Cannot store executive-specific aggregates in Firestore without a future ADR
- Depends on existing query patterns and GAS availability

---

## Compliance

Verified Sprints 2–3: no writes, no schema changes, no new collections.
