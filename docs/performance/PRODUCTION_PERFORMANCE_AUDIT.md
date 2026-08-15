# Production Performance Audit — Student Check TH

**Audit date:** 2026-07-26  
**App version:** 3.2.1 (`release/v3.1.0` branch)  
**Method:** Static code-path analysis + lifecycle tracing. **No browser RUM timings were measured.** All read volumes are **query counts** and **document transfer estimates** from code structure, not live Firestore billing.  
**Scope:** Read-only audit. No code, schema, deploy, or behavior changes were made.

**Health check (audit only):**
- `npm run test:holidays` — passed
- `npm run build` — passed

---

## 1. Executive Summary

Production slowness (“โหลดช้ามาก”) is **not** primarily caused by the holiday reminder, app settings, or the `<60%` filter itself. The dominant cost is **repeated, uncached, school-wide Firestore + GAS work on the Dashboard (admin/pastoral roles)** and **full page remounts on every hash navigation**, which discard in-memory work and re-run expensive loaders.

### Top findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | **Admin/Pastoral Dashboard** runs `loadSemesterScoreReportsForSession` on every mount: ~5 semester attendance chunk queries + **1 Firestore query per class** for `student_points`, plus GAS class enumeration — **no cache** | **P0** |
| 2 | **Admin Dashboard stats** block on `getDashboardDataForSession` → school-wide `attendance` query for today — **blocking first paint**, **no cache**, duplicates Executive / Discipline paths | **P0** |
| 3 | **`hashchange` → `renderApp()`** destroys and recreates the active page; Dashboard scores/stats always cold on return navigation | **P0** |
| 4 | **`<60%` community service list** adds **zero extra Firestore reads**; it is a client filter on data already loaded by the semester score pipeline — expensive because of **#1**, not because of the threshold | **P0 (indirect)** |
| 5 | **Executive cold load**: `fetchAllStudents()` (full-school GAS) + school-wide attendance; warm path is well optimized (3 min cache) | **P1** |
| 6 | **Bootstrap** runs `initAppSettings`, Firestore ping, `pingGas`, and **`refreshTeacherSessionFromSheet` → uncached `fetchTeachers()`**; can trigger extra GAS + full re-render | **P1** |
| 7 | **Check page** is the best optimized route (roster cache-first, scoped attendance) | Low risk |
| 8 | **No `onSnapshot` / `collectionGroup`** — all reads are one-shot `getDocs`/`getDoc` | Architectural note |

### Direct answers to audit questions

1. **Why is the system actually slow?**  
   Admin/pastoral users pay for school-wide semester score aggregation and today’s school-wide attendance on Dashboard mount, with no session-level cache and full remount on every route change. Network concurrency (many parallel class point queries) amplifies latency.

2. **Which page/query is the biggest problem?**  
   **`#/dashboard` for admin/pastoral** — specifically `loadSemesterScoreReportsForSession` + blocking `getDashboardDataForSession`.

3. **Is the `<60%` behavior calculation a major cause?**  
   **No as a separate feature.** It is `filterCommunityServiceReports()` over reports already built by the semester loader. Removing only the filter would **not** meaningfully improve performance; deferring/caching/removing the **semester score pipeline** for school-wide roles would.

4. **What can safely be removed/deferred from Dashboard?**  
   For **admin/pastoral**: entire semester scores section (including `<60%` tab and alert), or load only on explicit user action / Admin hub. For **homeroom teachers**: keep scoped scores; optional short TTL cache. Today’s stats for admin could reuse School Overview cache.

5. **What should be fixed first?**  
   Phase 1: stop school-wide semester score auto-load on Dashboard for admin/pastoral; cache or share today’s attendance with School Overview; add in-memory semester-score cache keyed by session+semester. Phase 2: reduce N-class point queries; teachers GAS cache.

6. **What should NOT be touched?**  
   Attendance save pipeline, `offlineSync`, `historyPointSync`, Firestore schema, holiday guards, School Overview cache architecture, discipline cache, roster logic, report calculation logic.

---

## 2. Route Performance Map

**Legend:** Cold = first visit or empty cache. Warm = return visit with cache still valid. Timings are **code-path labels**, not measured ms.

| Route | Role | Cold operations | Warm operations | Firestore reads (queries) | GAS calls | Main bottleneck |
|-------|------|-----------------|-----------------|---------------------------|-----------|-----------------|
| **Login** | All | `fetchTeachers`; admin/pastoral PIN verify actions | Same on each login | 0 | 1–2 | Uncached teachers roster |
| **Dashboard** | Homeroom teacher | Blocking: today attendance (1–N class queries). Deferred: semester attendance + points for assigned classes | **Same as cold** (no dashboard cache) | ~2–4 queries + docs | 0 (uses session class keys) | Semester load on every mount |
| **Dashboard** | Admin / Pastoral | Blocking: **school-wide today attendance**. Deferred: **~5 semester chunks + C class point queries** | **Same as cold** | **1 + ~5 + C** (C ≈ class count) | **1** (`listSessionClassKeys` → level/room options) | Semester score pipeline + no cache |
| **Check** | Teacher | Class roster (GAS if cache miss), 1 class/date attendance | Roster from memory/LS/IDB; attendance 1 query | 1 | 0–1 | GAS on first class open |
| **History** | Teacher | 1 scoped day query; filter UI loads level/room via GAS if needed | Roster opts cached 24h | 1 | 0–1 | Low |
| **History** | Admin | School-wide or filtered day query | Same | 1 | 0–1 | School-wide doc volume |
| **Reports** | Teacher | 1 range query (scoped) | Same (no cache) | 1 | 0–1 | Range size |
| **Reports** | Admin | Range query; semester tab = long range / chunks | Same | 1–5+ | 0–1 | Unscoped semester |
| **School Overview / Executive** | All logged-in | `fetchAllStudents` + school-wide day attendance | **Cache hit** → sync paint, 0 network | 1 (cold) | 1 full roster (cold) | Cold GAS full roster |
| **Discipline Report** | Admin | Overview: 1 day attendance (+ GAS class list); detail: roster + class attendance | Overview/detail **4 min cache** | 1 overview; 0–1 detail | 0–1 + per-class roster | Detail roster GAS |
| **Discipline Records** | Pastoral | Scoped attendance/points | Same | Varies | 0–1 | Moderate |
| **Student Profile** | All | Student attendance range + `student_points` queries | Same | 2–4 | 0 | Per-student scope (OK) |
| **Points Report** | School-wide | `queryPointsInRangeForSession` → **C parallel class queries**; optional attendance range | Same | **C+** | 1 class enum | N-class point queries |
| **Behavior** | Teacher | Roster + class attendance + points for day/range | Roster warm | 2–3 | 0–1 | Moderate |
| **Students** | Teacher | Roster + semester attendance for class | Roster warm | 1–2 | 0–1 | Scoped OK |
| **Settings** | All | Sync read from memory/localStorage | Same | 0 | 0 | None |
| **Settings Admin** | Admin | `getDoc(app_settings/school)` if not loaded | Memory cache | 0–1 | 0 | Low |
| **Admin hub / Teachers / Students** | Admin | Static or action-driven GAS | Teachers list uncached | 0 on open | On CRUD | GAS on admin actions |

**Global lifecycle note:** Every `#/…` navigation calls `renderApp()` → `runPageCleanup()` → new page mount → loaders run again. There is **no React**; “mount” = page render function invoked once per navigation.

---

## 3. Dashboard Query Map

### Load sequence (`src/pages/dashboard.js`)

```
paintHolidayReminder()     → sync, 0 reads (getAppSettings memory)
load()
  ├─ getDashboardDataForSession     → BLOCKS stats paint
  ├─ requestAnimationFrame → loadScores()  → DEFERRED (not blocking stats)
  └─ loadAlerts()           → sync inspection cache; CS alert needs scoresCache (race)
```

### Dashboard component cost table

| Dashboard component | Data source | Query scope | Read volume (queries / notes) | Cached? | Blocking? | Recommendation |
|---------------------|-------------|-------------|--------------------------------|---------|-----------|----------------|
| **Today stats** (present/late/…) | `getDashboardDataForSession` → `queryAttendanceByDateForSession` | Admin: **entire school today**; Teacher: homeroom classes | **1 query**; docs = records submitted today | **No** | **Yes** | Reuse `schoolOverviewCache` for admin; short TTL |
| **Holiday reminder** | `getDashboardHolidayReminder(getAppSettings())` | Settings memory | **0** | Yes (settings) | No (sync) | Keep |
| **Quick actions** | Static | — | 0 | — | No | Keep |
| **Inspection alert** | `isInspectionDayCached` | Settings memory | **0** | Yes | No | Keep |
| **Scores hub** (rooms / deducted / **`<60%` tab**) | `loadSemesterScoreReportsForSession` | Admin/pastoral: **full semester school-wide**; Teacher: homeroom | **~5 attendance chunks + C point queries** (admin) | **No** | Deferred only (still loads every mount) | **Remove auto-load for school-wide roles** |
| **Community service alert** | Derived from `byClassDeducted.communityServiceCount` | Same as scores hub | **0 extra** | No | No (but waits on scores) | Move with scores section |
| **`<60%` student list** | `filterCommunityServiceReports` in `summarizeDeductedReportsByClass` | Client filter on loaded reports | **0 extra Firestore** | No | No | Not the root cause; move to Admin if scores move |
| **Risk students (`loadAtRiskReportsForSession`)** | — | — | — | — | — | **Dead code** (exported, never called) |
| **Executive summary on dashboard** | None | — | 0 | — | — | N/A (not on dashboard) |

### Duplicate retrieval on Dashboard day

Same school-wide today query can also run from:
- `#/executive` → `fetchSchoolOverviewWithCache` (cached 3 min)
- `#/discipline-report` overview (admin) → `peekSchoolOverviewCache` or duplicate `queryAttendanceByDateSchoolWide`

Dashboard **does not** participate in School Overview cache today.

---

## 4. Firestore Query Audit

**Collections touched:** `attendance`, `student_points`, `app_settings`  
**Patterns:** `getDocs` + `query` + `where`; **no** `onSnapshot`, **no** `collectionGroup`, **no** callable functions.

### Route → Service → Query → Collection → Scope

| Route | Service | Query helper | Collection | Scope |
|-------|---------|--------------|------------|-------|
| Dashboard stats | `attendanceService.getDashboardDataForSession` | `where attendanceDate == today` (+ class in for teachers) | `attendance` | School-wide (admin) or homeroom |
| Dashboard scores | `studentScoreService.loadSemesterScoreReportsForSession` | `querySemesterAttendanceForSession` | `attendance` | Semester range; admin = 35-day chunks, all classes |
| Dashboard scores | `studentPointsService.queryPointsInRangeForSession` | `where class == X AND transactionDate range` | `student_points` | **One query per class** |
| Check | `attendanceService.getAttendanceForClassOnDate` | class + date | `attendance` | Single class |
| History | `attendanceService.queryAttendanceRecordsForSession` | date + optional class | `attendance` | Scoped |
| Reports | `attendanceService.queryAttendanceInRangeForSession` | date range + class/level | `attendance` | Scoped; admin unscoped limited 35d/chunk |
| Executive | `executiveDayContext.fetchExecutiveDayContext` | `queryAttendanceByDateSchoolWide` | `attendance` | School-wide single day |
| Discipline overview | `disciplineReportService.loadAttendanceRowsForDiscipline` | same as executive day or session | `attendance` | School-wide (admin) |
| Discipline detail | `getAttendanceForClassOnDate` | class + date | `attendance` | Single class |
| Student profile | `queryStudentAttendanceInRange`, `queryStudentTransactions` | student + range | both | Single student |
| Points report | `queryPointsInRangeForSession` | per-class range | `student_points` | N classes |
| Bootstrap | `appSettingsService.initAppSettings` | `getDoc(app_settings/school)` | `app_settings` | 1 doc |
| Bootstrap | `firebaseClient.verifyFirestoreConnection` | `attendance limit(1)` | `attendance` | 1 doc |

### Flagged anti-patterns

| Flag | Location | Detail |
|------|----------|--------|
| School-wide unnecessary | Dashboard admin stats | Same data available via School Overview cache |
| Full semester | Dashboard `loadSemesterScoreReportsForSession` | Runs for admin/pastoral on every dashboard visit |
| N+1 queries | `queryPointsInRangeForSession` | `Promise.all(classKeys.map(queryClassPointsInRange))` |
| Bypass cache | Dashboard stats + scores | No TTL layer |
| Repeated on navigation | All routes via `hashchange` | Page remount reruns loaders |
| Runs before paint | Dashboard stats | `await getDashboardDataForSession` before `paintStats` |
| Dead duplicate path | `loadAtRiskReportsForSession` | Would duplicate semester attendance if wired |

---

## 5. GAS Request Audit

| Action | Caller | When | Cached? | Blocks UI? | Duplicated? |
|--------|--------|------|---------|------------|-------------|
| `ping` | `main.js` bootstrap | Once after idle | No | No (deferred) | — |
| `getTeachers` | Login, `refreshTeacherSessionFromSheet`, admin teacher pages | Login + every session bootstrap | **No** | Login yes; bootstrap may re-render | Bootstrap + login |
| `teacherRequiresPin` | Login blur | On name entry | No | Partial | — |
| `verifyAdminLoginByName` / `verifyPastoralPinByName` | Login | Admin/pastoral login | No | Yes | — |
| `getStudents` (by class) | Check, behavior, students, discipline detail | Class open | **24h** memory+LS+IDB | Check: cache-first | Per class |
| `getStudents` (all) | `fetchAllStudents` → Executive cold | Executive cold | No | Yes | Large payload |
| `getClassOptions` | `ensureClassOptions`, points/scores class enumeration | Cache miss or admin enum | **24h** LS | During score/report load | With `fetchRoomOptions` loops |
| Admin CRUD actions | adminTeachers/adminStudents | On save | No | Yes | — |

**GAS cold start:** Affects first `getStudents` / `getTeachers` in a session—not every page equally. **Check** often avoids cold GAS when roster is cached. **Executive cold** and **login** are the most sensitive.

---

## 6. Cache Audit

| Cache | TTL | Storage | Invalidation | Callers use it? | Gap |
|-------|-----|---------|--------------|-----------------|-----|
| **School Overview** | 3 min | memory + sessionStorage | Attendance save (date), manual refresh | Executive, Discipline admin overview | **Dashboard does not use it** |
| **Discipline report** | 4 min | memory + sessionStorage | Save, month change | Discipline page peeks + fetches | Working |
| **Roster per class** | 24 h | memory + LS + IDB | Login clears all; manual invalidate | Check, students, detail | Working |
| **Class options** | 24 h | LS | Login clear | Level/room pickers | Working |
| **App settings** | Until refresh | memory + LS | Admin save | Sync `getAppSettings()` everywhere | Working |
| **Dashboard stats/scores** | — | — | — | **No cache** | **Cache exists elsewhere but not wired** |
| **Semester scores** | — | — | — | — | **Missing entirely** |
| **Teachers roster** | — | — | — | — | **Every login/bootstrap hits GAS** |
| **Reports page** | — | — | — | Always fresh | By design (baseline doc) |

### “Cache exists but doesn’t help” patterns

1. **School Overview cache** populated by Executive does **not** accelerate Dashboard admin stats (same `attendance` day query).
2. **Discipline overview** can reuse School Overview rows for admin, but Dashboard never primes that cache.
3. **`loadSemesterScoreReportsForSession`** always hits Firestore on dashboard mount even if user just visited Points Report (same semester data).

---

## 7. Duplicate Query Findings

| Data | Consumers | Same query? | Cache shared? |
|------|-----------|-------------|---------------|
| Today school-wide attendance | Dashboard admin, Executive, Discipline overview | Yes | Executive/discipline only |
| Semester attendance + points | Dashboard scores, Points Report, Students summary | Same services | **No** |
| Class roster | Check, Discipline detail, Behavior | Per-class GAS | Roster cache shared |
| Class keys enumeration | Points report, Dashboard scores, Discipline overview | `listReportClassKeys` / `listSessionClassKeys` | Class options cache only |
| App settings | All pages | `getAppSettings()` | Shared memory |
| Teachers list | Login + bootstrap session refresh | `fetchTeachers()` | Not cached |

**Navigation duplicate:** User path Dashboard → Check → Dashboard triggers **two full dashboard loads** (stats + semester pipeline for admin).

---

## 8. `<60%` Behavior Score Analysis

### Where data comes from

| Step | Function | File |
|------|----------|------|
| 1 | `loadSemesterScoreReportsForSession(session, today)` | `src/services/studentScoreService.js` |
| 2 | `querySemesterAttendanceForSession` | `src/services/attendanceService.js` |
| 3 | `queryPointsInRangeForSession` → `loadSemesterPointTransactions` | `src/services/studentPointsService.js` |
| 4 | `buildClassScoreReports(attRows, txnRows)` — score per student | `studentScoreService.js` |
| 5 | `summarizeDeductedReportsByClass(reports, txnByClass)` | `studentScoreService.js` |
| 6 | `filterCommunityServiceReports(deductedStudents)` — threshold from `getCommunityServiceThreshold()` | `studentScoreService.js` / `appSettingsDefaults.js` |
| 7 | UI: scores tab `service`, alert in `loadAlerts()` | `src/pages/dashboard.js` |

### Collections read

- **`attendance`**: semester range (chunked school-wide for admin/pastoral).
- **`student_points`**: one range query **per class** in scope.
- **`app_settings`**: threshold read from **memory only** (no extra Firestore for `<60%`).

### Does it load the entire school?

| Role | Entire school? |
|------|----------------|
| Admin / Pastoral | **Yes** — semester attendance chunks are school-wide; points queries enumerate **all classes** via GAS |
| Homeroom teacher | **No** — scoped to assigned class keys only |

### Does it load attendance + discipline + behavior + points?

- **Attendance rows** from Firestore (includes embedded discipline fields on attendance docs).
- **Point transactions** from `student_points` (discipline, behavior, attendance categories).
- Score is computed client-side in `buildStudentScoreReport` — not separate Firestore collections.

### Does it calculate scores for every student?

**Yes** — for every student ID appearing in semester attendance rows and/or point transactions (see `buildClassScoreReports` name map loop). School-wide admin can mean **all students with any semester activity**.

### Does it run every Dashboard mount?

**Yes**, when `canViewDashboardScores(session)` is true (admin, pastoral, or homeroom with classes). Invoked via `requestAnimationFrame(() => loadScores())` on every `renderDashboardPage`.

### Does it bypass cache?

**Yes.** No semester-score cache layer exists.

### Blocking?

- **Not blocking first paint** of stats cards (deferred via rAF).
- **Still blocks perceived dashboard completion** and consumes network/CPU while user interacts with quick actions.
- **`loadAlerts()` race:** community service alert runs before `loadScores()` finishes; alert may be missing on first pass (UX bug, minor).

### Duplicate reads with other dashboard cards?

- **Stats card** uses a **different** query (today only) — not duplicate of semester data.
- **Same semester pipeline** duplicates Points Report if user opens both in one session.

### Recommendation: **Option C (school-wide) / Option A (homeroom)**

| Audience | Recommendation |
|----------|----------------|
| **Admin / Pastoral** | **C** — Remove school-wide semester scores + `<60%` list from default Dashboard; expose via Admin hub / Points Report / dedicated “Community service” admin view. Feature **retained**, not deleted. |
| **Homeroom teacher** | **A** — Keep on Dashboard; cost is scoped (few queries). Optional semester cache for warm navigation. |

The `<60%` threshold filter itself is **negligible CPU**; the **semester load** is the cost driver.

---

## 9. Root Causes Ranked

### P0 — Fix first

1. **Uncached school-wide semester score pipeline on Dashboard mount** (`loadSemesterScoreReportsForSession`) — largest Firestore + parallel query fan-out.
2. **Uncached blocking school-wide today attendance for admin stats** — delays first meaningful paint; duplicates cached Executive path.
3. **Full page remount on every hash route change** — prevents warm in-memory reuse of dashboard data within a session.

### P1 — High impact follow-up

4. **N-class `student_points` queries** (`queryPointsInRangeForSession`) — scales with class count (~20–40+ queries).
5. **GAS class enumeration on every admin score load** (`listSessionClassKeys` → all levels/rooms).
6. **Executive cold: `fetchAllStudents()`** — single large GAS payload.
7. **Bootstrap `refreshTeacherSessionFromSheet` + uncached `fetchTeachers()`** — extra GAS and possible `renderApp()` churn.
8. **Points Report / Behavior school-wide** — same N-class pattern when those pages open.

### P2 — Lower priority

9. Login `fetchTeachers` uncached.
10. `verifyFirestoreConnection` on every app boot.
11. `loadAtRiskReportsForSession` dead code (future duplicate risk).
12. Client-side `buildClassScoreReports` CPU for large schools (secondary to network).
13. Large JS chunks (`pdfDocumentHeader` ~1.4MB) — affects first load, not Firestore slowness.

---

## 10. Recommended Fixes

*(Audit recommendations only — not implemented.)*

1. **Admin/pastoral Dashboard:** Do not auto-call `loadSemesterScoreReportsForSession` on mount; link to Points Report / Admin community-service view.
2. **Wire Dashboard admin stats to `peekSchoolOverviewCache(today)`** when fresh; fall back to query only on miss.
3. **Add semester score cache** (memory, 5–10 min, key: `sessionScope + semester.from-to`) shared by Dashboard and Points Report.
4. **Batch or aggregate point reads** for school-wide views (single query with `class in` batches if index allows, or Cloud Function — schema change out of scope for Phase 1).
5. **Cache `fetchTeachers()`** in sessionStorage with short TTL; skip bootstrap refresh if session recently verified.
6. **Homeroom teachers:** Keep scores; apply semester cache only.
7. **Fix `loadAlerts` ordering** — await scores or subscribe to scores completion for CS alert (UX).

---

## 11. Estimated Impact

| Change | Expected effect | Confidence |
|--------|-----------------|------------|
| Remove auto semester load (admin dashboard) | **Large** — eliminates majority of admin dashboard Firestore/GAS | High (code-path) |
| Reuse School Overview cache for admin stats | **Medium** — removes 1 school-wide query on warm executive visit | High |
| Semester score session cache | **Medium** — warm Dashboard ↔ Points Report navigation | Medium |
| Teachers GAS cache | **Small–medium** — login/bootstrap | Medium |
| Remove `<60%` filter only | **Negligible** | High |

*Exact seconds require DevTools Network + Firestore metrics in production; not measured in this audit.*

---

## 12. Risk Assessment

| Proposed change | Risk |
|-----------------|------|
| Defer/remove admin dashboard scores | **Low** — data remains in Points Report; user education needed |
| Share School Overview cache with Dashboard | **Low** — same 3 min staleness as Executive |
| Semester score cache | **Medium** — stale points until TTL or save invalidation; must not affect save pipeline |
| Batch point queries | **Medium–high** — may need indexes or backend aggregation |
| Cache teachers GAS | **Low** — stale role assignment until TTL |

---

## 13. What MUST NOT Be Changed

- Attendance **save** pipeline (`saveClassAttendance`, `submitAttendance`, holiday/weekend guards)
- **`offlineSync`** / offline queue behavior
- **`historyPointSync`** / background point sync after edits
- Firestore **schema** and document shapes
- **Holiday functionality** (`schoolHolidays`, dashboard reminder display-only)
- **School Overview cache** architecture (TTL, invalidation semantics)
- **Discipline report cache** architecture
- **Roster cache** logic (24h, login clear)
- **Report calculation logic** (aggregations, PDF math)

---

## 14. Proposed Phase 1 Optimization

**Goal:** Largest user-visible win with minimal risk; no schema changes.

1. **Dashboard (admin/pastoral only):** Remove automatic `loadScores()` on mount; show link/card “ดูรายงานคะแนน / นักเรียนต้องทำกิจกรรม” → `/points-report` or Admin section.
2. **Dashboard admin stats:** Try `peekSchoolOverviewCache(today)` before `getDashboardDataForSession`.
3. **In-memory semester score cache** (5 min) keyed by scope + semester — read-only, invalidate on point-changing saves if feasible without touching save pipeline hooks beyond existing cache invalidation patterns.
4. **Bootstrap:** Skip `refreshTeacherSessionFromSheet` when session age < 5 min (configurable).
5. **Document** for admins: Executive warms School Overview cache for 3 min.

**Out of scope Phase 1:** N-query consolidation, Cloud Functions, UI redesign.

---

## 15. Proposed Phase 2 Optimization

1. **Consolidate school-wide point reads** — batched `in` queries or pre-aggregated admin snapshot (requires design + possible index).
2. **Cache full class-key list** from GAS separately from roster (avoid re-enumeration per page).
3. **Route-level keep-alive** or shared data store for Dashboard stats (avoid remount cold start).
4. **Lazy-load PDF chunks** — reduce initial bundle (separate from Firestore slowness).
5. **Production RUM** — `[perf]` marks + Firestore read logging in admin sessions to validate estimates.

---

## Appendix A — Code references

Dashboard load order:

```426:448:src/pages/dashboard.js
  async function load() {
    ...
      const data = await getDashboardDataForSession(session, today);
      paintStats(data.summary);
      requestAnimationFrame(() => {
        void loadScores();
      });
      await loadAlerts();
    ...
  }
```

Semester score pipeline (includes `<60%` aggregation):

```363:391:src/services/studentScoreService.js
export async function loadSemesterScoreReportsForSession(session, refDate = getTodayDate()) {
  ...
  attRows = await querySemesterAttendanceForSession(session, range);
  const txnRows = await loadSemesterPointTransactions(session, range, attRows);
  const reports = buildClassScoreReports(attRows, txnRows);
  ...
  const byClassDeducted = summarizeDeductedReportsByClass(reports, txnByClass);
  return { reports, transactions: txnRows, range, byClass, byClassDeducted };
}
```

N-class point queries:

```318:340:src/services/studentPointsService.js
export async function queryPointsInRangeForSession(session, opts = {}) {
  ...
  classKeys = await listSessionClassKeys(session, { level: opts.level, room: opts.room });
  ...
  const chunks = await Promise.all(
    classKeys.map((k) => queryClassPointsInRange(k, from, to).catch(() => []))
  );
```

Community service filter (client-only):

```134:137:src/services/studentScoreService.js
export function filterCommunityServiceReports(reports, threshold = getCommunityServiceThreshold()) {
  return reports.filter((r) => r.totalScore < threshold);
}
```

---

## Appendix B — Related docs

- Prior baseline: [`PERFORMANCE_BASELINE-v3.2.x.md`](./PERFORMANCE_BASELINE-v3.2.x.md) (2026-07-19 estimates; this audit verifies current code paths post–holiday reminder v3.2.1)

---

## Phase 1 Implementation Result

**Implemented:** 2026-07-26 · **Version:** 3.2.1 (uncommitted)

### Files changed

| File | Change |
|------|--------|
| `src/pages/dashboard.js` | Admin/pastoral: no auto semester scores; stats reuse School Overview cache |
| `src/services/studentScoreService.js` | 5 min in-memory read-only semester score cache (homeroom callers) |
| `src/services/teachersService.js` | 5 min `fetchTeachers` cache; skip bootstrap re-verify after recent login |
| `src/main.js` | Bootstrap respects `shouldSkipSessionRefresh()` |
| `docs/performance/PRODUCTION_PERFORMANCE_AUDIT.md` | This section |

### Queries removed / deferred (Admin/Pastoral Dashboard)

| Operation | Before (every mount) | After |
|-----------|----------------------|-------|
| Blocking Firestore | 1 school-wide today attendance | 0 if School Overview cache hit; else 1 |
| Deferred Firestore | ~5 semester attendance chunks + C class `student_points` queries | **0** (not loaded on Dashboard) |
| GAS | 1 class enumeration (`listSessionClassKeys`) | **0** on Dashboard |
| Semester score CPU | Full-school `buildClassScoreReports` + `<60%` filter | **0** on Dashboard |

### Cache reused / added

| Cache | Action |
|-------|--------|
| School Overview (`peekSchoolOverviewCache`) | Admin/pastoral today stats read from existing 3 min cache when available; no new cache layer |
| Semester scores (new, in-memory, 5 min TTL) | Homeroom Dashboard only; dedupes navigate-away-and-return |
| Teachers GAS (new, in-memory, 5 min TTL) | Reuses roster across login + bootstrap when within TTL |

### GAS calls reduced

- **Login → Dashboard:** bootstrap skips `refreshTeacherSessionFromSheet` when login just called `markSessionVerifiedFromSheet()` (5 min window).
- **`fetchTeachers()`:** served from memory when fetched within 5 min (login + bootstrap deduped).
- **Admin Dashboard:** no `listSessionClassKeys` / class enumeration from score pipeline.

### Admin Dashboard behavior

- Today statistics still load (cache-first, then Firestore fallback).
- Holiday reminder unchanged (sync, 0 reads).
- Inspection alert unchanged.
- **No** scores section, **no** community-service alert, **no** semester pipeline on mount.
- Points Report quick action unchanged — full scores + `<60%` / community service remain there.

### Teacher (homeroom) Dashboard behavior

- Today stats: unchanged scoped Firestore query.
- Semester scores section: still auto-loads (scoped to homeroom classes).
- Community-service tab/alert: unchanged when scores load.
- Warm return within 5 min uses semester score memory cache (fewer repeat queries).

### Before / after code-path comparison

**Admin/Pastoral — cold Dashboard (no School Overview cache)**

| | Before | After |
|---|--------|-------|
| Blocking Firestore queries | 1 | 1 |
| Deferred Firestore queries | ~5 + C | 0 |
| GAS calls | 1 | 0 |
| Semester score operations | Full pipeline | None |

**Admin/Pastoral — warm Dashboard (School Overview cache valid, e.g. after Executive)**

| | Before | After |
|---|--------|-------|
| Blocking Firestore queries | 1 | **0** |
| Deferred Firestore queries | ~5 + C | 0 |
| GAS calls | 1 | 0 |
| Semester score operations | Full pipeline | None |

**Admin/Pastoral — navigate away → return Dashboard**

Same as cold/warm above per cache state; no semester reload in either case.

**Admin/Pastoral — attendance save → Dashboard**

School Overview cache invalidation unchanged; Dashboard falls back to 1 Firestore query for today stats.

**Homeroom teacher — Dashboard**

| | Before | After |
|---|--------|-------|
| Blocking Firestore | 1 (scoped) | 1 (scoped) |
| Deferred Firestore | ~2–4 (scoped) | ~2–4 cold; **0 network** if semester cache hit within 5 min |
| GAS | 0 | 0 |

*No browser timing measurements were taken.*

### Test results

| Command | Result |
|---------|--------|
| `npm run test:holidays` | Passed |
| `npm run build` | Passed |
| `npm test` | Not defined in package.json |
| `npm run typecheck` | Not defined |
| `npm run lint` | Not defined |
| `npm run test:rules` | Not defined |
| `npm run test:integration` | Not defined |

### Remaining bottlenecks (unchanged by Phase 1)

1. Admin cold Dashboard still needs 1 school-wide attendance query when School Overview cache empty.
2. Full page remount on every hash navigation (no route keep-alive).
3. Points Report / Executive cold paths still school-wide heavy.
4. N-class `student_points` queries on Points Report and homeroom Dashboard (scoped but multi-query).
5. `fetchAllStudents()` on Executive cold load.

### Production review safety

- **Safe for review:** Changes are limited to Dashboard load gating, read-only caches, and bootstrap dedup.
- **Not modified:** save pipeline, offline sync, point sync, schema, holiday/discipline/roster cache architecture, score calculation rules.
- **Not deployed / not committed** per implementation stop point.

---

**Phase 1 implementation complete. Awaiting commit/deploy approval.**

---

## Unexpected Discipline Score Popup — Audit & Fix

**Investigated:** 2026-07-26

### 1. Exact source

| Item | Detail |
|------|--------|
| Component | `showSaveResultBadge()` in `src/components/saveResultBadge.js` |
| CSS class | `.save-result-badge` (floating top-right toast, **not** a Dashboard widget) |
| Trigger | Attendance save on **Check** page (`src/pages/check.js`) and Behavior page |
| "และอีก 135 คน" | `t('behavior.saveMore')` when `items.length > 6` |

### 2. Why it appears on Dashboard

- Badge is appended to `document.body`, not the page container.
- Check save uses `navigateAfterSave: true` → hash `#/dashboard` after save.
- Badge duration = 12s; **was not dismissed on route change**, so it overlaid Dashboard.
- **Not** loaded by Dashboard bootstrap, semester scores, discipline cache, or Firestore reads on Dashboard mount.

### 3. Why `-5` became `+5` and total `+705`

- Discipline rules correctly deduct via `getDisciplineDeductionPoints()` → **-5**.
- `summarizeDisciplineChanges()` reports **+5** when a flag is **removed** vs baseline (`pts = -getDisciplineDeductionPoints(id)`).
- **Root cause:** `baselineDiscipline` was snapshotted at class open; changing status **absent → present** clears flags in `discipline` but **did not update baseline**. Save then interpreted all cleared flags as restorations (+5 each).
- `705 = 141 × 5` matches ~141 students × one +5 restoration line in the save badge list.
- **Not** a global scoring engine sign bug; Points Report / Profile use the same `formatDisciplineScore()` correctly.

### 4. Performance connection

- **Zero Firestore reads** on Dashboard from this popup.
- Does **not** contribute to Dashboard slowness; it is a post-save UI artifact persisting across navigation.

### 5. Changes made (safe fix pass)

| File | Fix |
|------|-----|
| `src/main.js` | `dismissSaveResultBadge()` on every `runPageCleanup()` / route change |
| `src/pages/check.js` | Sync `baselineDiscipline` on status change; fix **Mark all present** to clear flags in data model; refresh baseline after successful save |
| `scripts/verify-discipline-display.mjs` | Regression tests for -5 deductions and baseline sync |
| `package.json` | `npm run test:discipline` |

### 6. Intentionally NOT changed

- Discipline scoring rules / deduction values in settings
- `saveClassAttendance`, point sync, Firestore schema
- Student Profile / Points Report display logic
- Dashboard Phase 1 performance optimizations

### 7. Tests (post-fix)

| Command | Result |
|---------|--------|
| `npm run test:discipline` | Passed |
| `npm run test:holidays` | Passed |
| `npm run build` | Passed |

**Awaiting commit/deploy approval.**

