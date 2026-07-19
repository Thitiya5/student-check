# Changelog

All notable changes to **Student Check** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for governance releases documented in [`PROJECT_MANIFEST.md`](PROJECT_MANIFEST.md).

> **Append-only rule:** New entries are added at the top under `[Unreleased]` or a new version heading. Do not rewrite historical entries except to fix factual errors.

---

## [Unreleased]

### Planned

- Summary / Analytics Layer (weekly & monthly overview via summary layer)
- Health Dashboard (operational monitoring)
- Load testing (school-wide concurrent usage)
- Executive PDF export and period-based reporting (Sprint 4 scope)

---

## [3.2.1] — 2026-07-19

Performance stabilization — faster School Overview and Discipline Report without business rule changes.

### Performance

- Discipline Report: class-scoped Firestore reads; overview row reuse; 4 min memory/session cache; parallel roster+attendance
- School Overview: synchronous warm-cache paint; cache invalidation on attendance save and offline queue flush
- Dashboard: defer semester scores load; reuse API summary object
- Roster: memory cache honors 24 h localStorage TTL
- Dev-only route performance tracing (`perfTrace.js`)

---

## [3.2.0] — 2026-06-20

Stabilization release: attendance save reliability, School Overview for teachers, bulk discipline restore.

### Fixed — P0 Attendance save reliability

- Batched Firestore writes (`writeBatch`, ≤450 docs) with 45s save timeout
- Background point sync after attendance save (non-blocking UI)
- Submission markers on attendance (`attendanceSubmitted`, `submittedBy`, `submittedAt`)
- Removed auto point resync on class open; save button lock during submit

### Added — P1 School Overview (ภาพรวมโรงเรียน)

- Read-only School Overview for all logged-in teachers (feature flag `VITE_ENABLE_EXECUTIVE`)
- School-wide attendance query for overview data
- Client cache (memory + sessionStorage, 3 min TTL, keyed by date) to reduce repeated reads
- Manual refresh button; PDF export remains admin-only
- Dashboard cleanup: removed at-risk alerts and redundant “ห้องที่เช็ควันนี้” section

### Added — P2 Bulk Discipline Restore

- Admin-only tool at `/admin-discipline`: **คืนคะแนนระเบียบทั้งโรงเรียน**
- Preview with KPI summary, category/level/room breakdown, sample students
- Operation ID format `BR-YYYYMMDD-xxxx` with audit collection `bulk_discipline_restores`
- PIN verification via existing `verifyBehaviorWritePin` (no text phrase confirmation)
- Idempotent restore: attendance waive + system point sync (inspection categories only: ชุด, ทรงผม, เล็บ, เครื่องประดับ)

### Changed

- Login footer credit text updated
- Bulk restore UI polish: compact layout, single warning in confirm modal, collapsible room details

### Performance

- School Overview: ~1 school-wide Firestore query per teacher per date per 3 min (vs every navigation)
- Bulk restore: one attendance save + point sync per class (not per student)

### Security

- Bulk restore: admin session only; pastoral teachers retain per-row restore only
- Attendance save flow unchanged (ADR-004)

---

## [1.1.0-beta] — 2026-06-20

Executive Dashboard module (Sprints 1–3). Production attendance workflow unchanged.

### Added — Sprint 3

- Real chart UI replacing mock placeholders:
  - Attendance by Grade
  - Status Distribution (saved records only)
  - Checked vs Pending Rooms (donut)
  - Top / Attention Rooms (submitted classrooms only)
- `executiveChartAggregates.js` — in-memory chart payloads from bundle
- `executiveErrorState.js` — roster/load error UI with Retry
- `charts` property on `getExecutiveDashboardBundle()`

### Changed — Sprint 3

- Executive dashboard uses bundle chart data only (no additional Firestore reads)
- Roster load failures surface dedicated error state (no mock/partial completion data)
- Zero-student rooms excluded from completion totals

### Added — Sprint 2.5

- **Today's Attendance Progress** command-center section (4 cards):
  - Attendance Completion (progress bar)
  - Pending Classrooms (max 10 + “and X more”)
  - Recently Completed (room, teacher, time)
  - Today's Operational Status
- Read-only completion services:
  - `getCompletionStatus()`
  - `getPendingRooms()`
  - `getLastCompletedRoom()`
- `executiveDayContext.js` — shared single-load context
- `executiveCompletionService.js` / `executiveCompletionAggregates.js`
- Classroom **submitted** vs **not submitted** distinction (missing ≠ absent for completion)

### Changed — Sprint 2.5

- `getExecutiveDashboardBundle()` — single roster + single Firestore read per refresh
- Consolidated parallel Sprint 2 loads into one bundle call

### Added — Sprint 2

- Executive Firestore read service layer:
  - `getTodaySummary()`
  - `getGradeSummary()`
  - `getAttendanceRate()`
- `executiveAttendanceService.js`, `executiveAggregates.js`
- Live summary cards, comparison table, and insights (charts remained mock)
- Admin-only route guard for `#/executive`
- Enhanced executive header (logo, academic year, semester, last updated)

### Changed — Sprint 2

- `navbar.js` — optional `showExecutive` flag (admin-only); removed duplicate `executiveBottomNav`
- Removed redundant `executiveSidebar` (single-link duplicate of bottom nav)
- Export PDF button disabled with “เร็ว ๆ นี้” / “Coming soon” label

### Added — Sprint 1

- Isolated Executive Dashboard at `#/executive` (admin-only)
- Folder structure: `pages/executive`, `components/executive`, `services/executive`, `hooks/executive`, `utils/executive`
- Mock-data UI foundation: header, filters, KPI cards, chart placeholders, comparison table, insights, export bar
- `executive-dashboard.css`, executive i18n keys (TH/EN)
- `routeGuards.js` — `/executive` admin guard

### Security

- Teachers never see Executive menu item; route blocked for non-admin sessions.

---

## [1.0.0] — 2025 (baseline)

Original production attendance system for Yangtaladwittayakarn School.

### Added

- Teacher login (PIN) with session persistence
- Dashboard — today's attendance summary
- Attendance (`/check`) — class roster check and Firestore save
- History — date-scoped attendance lookup
- Reports — daily, weekly, monthly, semester views
- Student profile and class student list
- Google Apps Script + Sheets roster (students, teachers, class options)
- Firestore `attendance` collection (per student / class / date)
- Offline PWA support, Firebase Hosting deployment
- Behavior points, discipline, inspection, admin roster management
- Thai / English i18n, light/dark theme

### Infrastructure

- Vite + Vanilla JS PWA
- Firebase Firestore + Hosting
- Production: https://student-check-th.web.app

---

[3.2.0]: https://github.com/your-org/student-check/compare/v1.1.0-beta...v3.2.0
[1.1.0-beta]: https://github.com/your-org/student-check/compare/v1.0.0...v1.1.0-beta
[1.0.0]: https://github.com/your-org/student-check/releases/tag/v1.0.0
