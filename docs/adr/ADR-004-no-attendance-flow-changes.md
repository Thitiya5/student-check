# ADR-004: No Executive Feature May Modify Production Attendance Flow

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-06-20 |
| **Sprint** | 1 (enforced through Sprint 3) |

---

## Context

Attendance checking (`src/pages/check.js`) and persistence (`attendanceService.saveClassAttendance`) are the core production workflow. Executive analytics, completion tracking, and reporting must observe attendance state without changing how teachers save or default statuses.

---

## Decision

Executive sprints **must not modify**:

- `src/pages/check.js` (Attendance page)
- `src/pages/history.js`
- `src/pages/reports.js`
- `src/pages/studentProfile.js`
- `src/services/attendanceService.js` (read imports allowed)
- Firestore document shape or save semantics
- Scoring / discipline / points systems

Executive **may**:

- Read attendance via existing query APIs
- Define separate completion rules (submitted vs not submitted) for admin command center
- Display analytics that interpret saved data differently from teacher check defaults

---

## Consequences

### Positive

- Teachers experience no behavior change
- Executive rollout is low-risk
- Clear audit boundary for code review

### Negative

- Executive KPI summary may count unsubmitted students as absent while completion section does not — documented technical debt
- Cannot auto-submit or correct attendance from executive UI without a new ADR

---

## Compliance

Verified Sprints 1–3: listed production modules unchanged.
