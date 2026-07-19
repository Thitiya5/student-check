# Student Check — Project Manifest

> **Project home page** for governance, version tracking, and sprint status.  
> Application code: [`README.md`](README.md) · Architecture: [`docs/architecture/Overview.md`](docs/architecture/Overview.md)

---

## Current Version

| Field | Value |
|-------|--------|
| **Governance version** | `v3.2.1` |
| **package.json** | `3.2.1` |
| **Recommended next** | `v3.3.0` (Summary Layer + Health Dashboard) |

---

## Current Sprint

| Field | Value |
|-------|--------|
| **Last completed** | v3.2.1 — Final Stabilization (performance) |
| **Status** | ✅ Deployed to production |
| **Next** | Summary / Analytics Layer, Health Dashboard, Load testing |

---

## Project Status

| Area | Status |
|------|--------|
| **Production app** | Live — https://student-check-th.web.app |
| **Active users** | Teachers (daily attendance) |
| School Overview | All teachers — read-only; 3 min cache; warm paint on revisit |
| Discipline report | Cached reads (4 min); class-scoped detail queries |
| **Bulk discipline restore** | Admin only — `/admin-discipline` |
| **Governance docs** | Updated for v3.2.0 |

---

## Architecture Status

| Principle | Status |
|-----------|--------|
| Executive module isolated from production Dashboard | ✅ Enforced — [ADR-001](docs/adr/ADR-001-executive-isolated-from-dashboard.md) |
| Executive Firestore access read-only | ✅ Enforced — [ADR-002](docs/adr/ADR-002-executive-read-only-firestore.md) |
| Single bundle load per executive refresh | ✅ Enforced — [ADR-003](docs/adr/ADR-003-shared-executive-bundle.md) |
| No changes to production attendance flow | ✅ Enforced — [ADR-004](docs/adr/ADR-004-no-attendance-flow-changes.md) |
| Spark-plan friendly queries | ✅ 1 Firestore + 1 roster read per executive refresh |

---

## Production Status

| Component | Status |
|-----------|--------|
| Firebase Hosting | Deployed |
| Firestore `attendance` | Production data — schema unchanged by Executive sprints |
| Google Apps Script (roster) | Production — deploy new GAS version after `Code.gs` changes |
| Executive `#/executive` (School Overview) | Deployed — all teachers read-only; admin PDF |
| Bulk discipline restore | Deployed — admin `/admin-discipline` |

---

## Latest Release

| Release | Date | Notes |
|---------|------|-------|
| **v3.2.1** | 2026-07-19 | Performance: School Overview warm cache, Discipline Report scoped reads |
| **v3.2.0** | 2026-06-20 | Attendance reliability, School Overview cache, bulk restore |
| **v1.1.0-beta** | 2026-06-20 | Executive Dashboard Sprints 1–3 |
| **v1.0.0** | 2025 baseline | Core attendance system |

See [`docs/releases/`](docs/releases/).

---

## Next Planned Sprint

**Post v3.2.0** (pending governance approval):

- Summary / Analytics Layer (weekly & monthly overview)
- Health Dashboard (operational monitoring)
- Load testing (concurrent teacher usage)
- Sprint 4 — Executive PDF export and/or period-based reporting

---

## Known Risks

| Risk | Mitigation |
|------|------------|
| School Overview cache may show stale data up to 3 min | Manual refresh button; TTL documented |
| Bulk restore is not auto-reversible | PIN + preview + audit doc; per-student re-apply documented |
| Open Firestore rules (if still test mode) | Review `firestore.rules` before wider rollout |
| Large school roster via GAS on executive/bulk preview | Cached reads; class-scoped point fan-out |
| GAS roster failure blocks executive/bulk preview | Error state + Retry |

---

## Known Technical Debt

| Item | Priority |
|------|----------|
| Align `package.json` version with governance semver | Medium |
| Executive `summarizeExecutiveDay` still treats missing students as absent for KPI cards | Low — by design until Sprint 4+ |
| `updatedAt` not in `attendanceService` mapper — executive uses `createdAt` fallback | Low |
| Mock data file `mockExecutiveData.js` unused by dashboard but retained | Low — remove when safe |
| Monthly/semester executive filters UI-only | Expected until post-Sprint 4 |

---

## Roadmap Summary

```
v1.0.0          Core attendance (production)
    │
    ▼
v1.1.0-beta     Sprint 1–3 — Executive / School Overview foundation
    │
    ▼
v3.2.0          P0 attendance reliability
                P1 School Overview (teachers + cache)
                P2 Bulk discipline restore
    │
    ▼
v3.3.0+         Summary Layer, Health Dashboard, Load testing (planned)
    │
    ▼
v4.0.0+         Executive PDF, period analytics (Sprint 4+)
```

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [CHANGELOG.md](CHANGELOG.md) | Append-only version history |
| [docs/architecture/Overview.md](docs/architecture/Overview.md) | System architecture |
| [docs/adr/](docs/adr/) | Architecture Decision Records |
| [docs/sprints/](docs/sprints/) | Per-sprint reports |
| [docs/releases/](docs/releases/) | Release notes |
| [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md) | Detailed technical reference |
| [SITEMAP.md](SITEMAP.md) | Routes and permissions |

---

## Governance Rule (post-sprint)

After **every completed sprint**, update:

1. `CHANGELOG.md` (append entry)
2. `PROJECT_MANIFEST.md` (version, sprint, risks)
3. `docs/sprints/Sprint-N.md` (new report)
4. `docs/adr/` (new ADRs if decisions were made)
5. `docs/releases/` (if shipping a tagged release)
6. Version + Git tag recommendation in sprint handoff

---

*Last updated: 2026-06-20 — v3.2.0 production closeout*
