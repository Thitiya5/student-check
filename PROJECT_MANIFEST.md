# Student Check — Project Manifest

> **Project home page** for governance, version tracking, and sprint status.  
> Application code: [`README.md`](README.md) · Architecture: [`docs/architecture/Overview.md`](docs/architecture/Overview.md)

---

## Current Version

| Field | Value |
|-------|--------|
| **Governance version** | `v1.1.0-beta` |
| **package.json** | `3.1.0` (legacy internal; align with governance version in a future housekeeping sprint) |
| **Recommended next stable** | `v1.1.0` (after Executive PDF + Sprint 4 approval) |

---

## Current Sprint

| Field | Value |
|-------|--------|
| **Last completed** | Sprint 3 — Real executive charts (bundle-only data) |
| **Status** | ✅ Architecture Review **APPROVED** |
| **Next** | Sprint 4 — *pending governance approval* (PDF export / period reports TBD) |

---

## Project Status

| Area | Status |
|------|--------|
| **Production app** | Live — https://student-check-th.web.app |
| **Active users** | Teachers (daily attendance) |
| **Executive module** | Beta — admin-only, read-only analytics |
| **Governance docs** | Initialized (this manifest + CHANGELOG + ADRs + sprint reports) |

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
| Executive `#/executive` | In codebase; deploy with next hosting release |

---

## Latest Release

| Release | Date | Notes |
|---------|------|-------|
| **v1.0.0** | 2025 baseline | Core attendance system |
| **v1.1.0-beta** | 2026-06-20 | Executive Dashboard Sprints 1–3 (governance tag recommended) |

See [`docs/releases/`](docs/releases/).

---

## Next Planned Sprint

**Sprint 4** (scope TBD after governance approval):

- Executive PDF export and/or period-based reporting
- Must continue ADR constraints (no attendance workflow changes unless explicitly approved)

---

## Known Risks

| Risk | Mitigation |
|------|------------|
| `package.json` version (`3.1.0`) ≠ governance version (`v1.1.0-beta`) | Documented here; align in housekeeping sprint |
| Open Firestore rules (if still test mode) | Review `firestore.rules` before wider executive rollout |
| Large school roster via GAS on every executive load | Single fetch per refresh; cached in `studentsService` session |
| Executive summary KPIs count unsubmitted students as absent | Completion/charts use separate rules; document for admins |
| GAS roster failure blocks executive page | Dedicated error state + Retry (Sprint 3) |

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
v1.1.0-beta     Sprint 1  — Executive UI foundation (mock)
                Sprint 2  — Read-only services + live KPIs
                Sprint 2.5 — Completion command center
                Sprint 3  — Real charts (bundle-only)
    │
    ▼
v1.1.0          Sprint 4+ — PDF export, stable executive release (planned)
    │
    ▼
v1.2.0+         Period analytics, trend reports (future)
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

*Last updated: 2026-06-20 — Governance initialization (post Sprint 3 approval)*
