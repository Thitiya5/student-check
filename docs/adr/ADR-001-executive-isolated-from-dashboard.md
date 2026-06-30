# ADR-001: Executive Dashboard Must Remain Isolated from Production Dashboard

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Date** | 2026-06-20 |
| **Sprint** | 1 (enforced through Sprint 3) |

---

## Context

Student Check is a live production system used daily by teachers. A new Executive Dashboard is being added for school administrators. The existing teacher Dashboard (`src/pages/dashboard.js`) is optimized for homeroom workflows and must not be altered by executive analytics work.

---

## Decision

The Executive Dashboard **must remain a separate module**:

- Route: `#/executive` (not merged into `/dashboard`)
- Code: `src/pages/executive/`, `src/components/executive/`, `src/services/executive/`, `src/hooks/executive/`, `src/utils/executive/`
- Styles: `src/styles/executive-dashboard.css`
- No edits to `dashboard.js` or dashboard-specific services for executive features

Admin navigation exposes Executive via an optional flag on the shared bottom nav (`showExecutive`), not by changing dashboard behavior.

---

## Consequences

### Positive

- Zero regression risk to teacher daily workflow
- Executive features can evolve independently
- Clear ownership and code review boundaries

### Negative

- Some UI patterns duplicated (KPI cards, nav item) — acceptable trade-off
- Admins use a separate route from teachers

---

## Compliance

Verified Sprints 1–3: `dashboard.js` unchanged.
