# Architecture Overview — Student Check

> High-level system design. Detailed reference: [`SYSTEM_DOCUMENTATION.md`](../../SYSTEM_DOCUMENTATION.md) · Routes: [`SITEMAP.md`](../../SITEMAP.md)

---

## System Summary

**Student Check** is a Progressive Web App for school attendance and behavior tracking.

| Layer | Technology |
|-------|------------|
| Frontend | Vite + Vanilla JavaScript (ES modules) |
| Hosting | Firebase Hosting |
| Attendance data | Cloud Firestore (`attendance` collection) |
| Roster / teachers | Google Apps Script → Google Sheets |
| Offline | Service Worker (PWA) + IndexedDB cache |

**Production URL:** https://student-check-th.web.app

---

## Routing

Hash-based client routing in `src/main.js`:

| Pattern | Handler |
|---------|---------|
| `#/login` | Unauthenticated entry |
| `#/dashboard` | Teacher home (default when logged in) |
| `#/check` | Attendance |
| `#/history`, `#/reports`, … | Feature pages |
| `#/executive` | **Admin-only** Executive Dashboard |

Route guards declared in `src/config/routeGuards.js` and enforced before page render.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  #/login    │────▶│  main.js     │────▶│  pages/*.js     │
└─────────────┘     │  routeGuards │     │  renderXxxPage  │
                    └──────────────┘     └─────────────────┘
```

---

## Modules

### Core production modules (v1.0.0)

| Module | Path | Purpose |
|--------|------|---------|
| Dashboard | `pages/dashboard.js` | Teacher today summary |
| Attendance | `pages/check.js` | Class check + save |
| History | `pages/history.js` | Past attendance lookup |
| Reports | `pages/reports.js` | Daily/weekly/monthly/semester |
| Students | `pages/students.js` | Class roster view |
| Student profile | `pages/studentProfile.js` | Per-student detail |
| Admin | `pages/admin*.js` | Roster management |
| Behavior / points | `pages/behavior.js`, `pointsReport.js` | Discipline scoring |

### Executive module (v1.1.0-beta)

| Layer | Path | Purpose |
|-------|------|---------|
| Page | `pages/executive/executiveDashboard.js` | Orchestrator |
| Components | `components/executive/*` | UI sections |
| Services | `services/executive/*` | Read-only analytics |
| Hooks | `hooks/executive/*` | Filter state |
| Utils | `utils/executive/*` | Aggregations, labels, charts |
| Styles | `styles/executive-dashboard.css` | Executive-only CSS |

**Isolation:** See [ADR-001](../adr/ADR-001-executive-isolated-from-dashboard.md).

---

## Shared Services

| Service | Role |
|---------|------|
| `attendanceService.js` | Firestore attendance CRUD + queries |
| `studentsService.js` | GAS roster fetch + cache |
| `teacherAuth.js` | Session, roles, class access |
| `googleAppsScript.js` | GAS HTTP client |
| `offlineSync.js` / `offlineDb.js` | PWA offline queue |
| `pdfExport.js` | Teacher report PDFs (not executive) |

Executive services **import** shared services; they do not replace them.

---

## Firestore Structure

### Collection: `attendance`

One document per **student + class + date**.

| Field | Type | Notes |
|-------|------|-------|
| `student_id` | string | Roster ID |
| `student_name` | string | Display name |
| `class` | string | e.g. `M1/3` |
| `status` | string | present, absent, late, sick, … |
| `teacherName` | string | Who saved |
| `attendanceDate` | string | `yyyy-MM-dd` |
| `createdAt` | timestamp | Last save time (merge updates) |
| `discipline*` | various | Behavior flags on same doc |

**Executive access:** Read-only day query by `attendanceDate`. No schema changes in Sprints 1–3.

---

## Authentication

1. Teacher enters name + PIN on `#/login`
2. Validated against TEACHERS sheet via GAS
3. Session stored in `localStorage` / `appState`
4. `teacherAuth.js` exposes `isAdminSession()`, `canAccessClass()`, etc.

Session re-verified against sheet on bootstrap when online.

---

## Role Model

| Role | Capabilities |
|------|--------------|
| **Teacher** | Assigned homeroom classes; check, history, reports for own scope |
| **Admin** | School-wide view; admin pages; **Executive Dashboard** |
| **Points / discipline** | Additional flags on session (`canViewPointsReportSession`, etc.) |

Executive route `#/executive` requires `isAdminSession()`.

Teachers **never** see the Executive bottom-nav item (`showExecutive: false`).

---

## Executive Data Flow (Sprints 2–3)

```
fetchExecutiveDayContext()
    ├── fetchAllStudents()          [GAS — roster]
    └── queryAttendanceByDateForSession()  [Firestore — 1 read]
            │
            ▼
getExecutiveDashboardBundle()
    ├── summary, comparisonTable, insights
    ├── completion (roomStates)
    └── charts (in-memory only)
```

See [ADR-003](../adr/ADR-003-shared-executive-bundle.md).

---

## Related Documents

- [PROJECT_MANIFEST.md](../../PROJECT_MANIFEST.md)
- [CHANGELOG.md](../../CHANGELOG.md)
- [Architecture Decision Records](../adr/)
- [Sprint Reports](../sprints/)
