import {
  computeScoreFromTransactions,
  computeScoreBreakdownFromTransactions,
  computeAttendancePercentages,
  computeParentMeetingRisk
} from '../utils/pointCalculations.js';
import { dedupeRecordsByDate, getSemesterDateRange } from '../utils/studentAttendanceSummary.js';
import {
  filterScoreReportsToOfficialRoster,
  isTestStudentRecord,
  loadOfficialRosterForClassKeys
} from '../utils/studentRosterFilter.js';
import { fetchStudentsByClass } from './studentsService.js';
import { getStartingScore, getParentMeetingThresholdPercent, getCommunityServiceThreshold } from './appSettingsService.js';
import { querySemesterAttendanceForSession } from './attendanceService.js';
import { queryPointsInRangeForSession, queryClassPointsInRange } from './studentPointsService.js';
import { getHomeroomClassKeys, isSchoolWideViewSession } from './teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';

/** In-memory read-only cache for homeroom dashboard / other callers (5 min). */
export const SEMESTER_SCORE_CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { payload: object, cachedAt: number }>} */
const semesterScoreCache = new Map();

/** @type {Map<string, Promise<object>>} */
const semesterScoreInflight = new Map();

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {string} refDate
 */
function semesterScoreCacheKey(session, refDate) {
  const range = getSemesterDateRange(refDate);
  const scope = isSchoolWideViewSession(session)
    ? 'school-wide'
    : getHomeroomClassKeys(session).slice().sort().join('|') || 'none';
  return `${scope}::${range.from}::${range.to}`;
}

/**
 * @param {Array<{ student_id: string }>} rows
 */
export function groupAttendanceByStudent(rows) {
  /** @type {Map<string, typeof rows>} */
  const map = new Map();
  for (const row of rows) {
    const sid = String(row.student_id);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(row);
  }
  return map;
}

/**
 * @param {Array<{ student_id: string }>} rows
 */
export function groupTransactionsByStudent(rows) {
  /** @type {Map<string, typeof rows>} */
  const map = new Map();
  for (const row of rows) {
    const sid = String(row.student_id);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(row);
  }
  return map;
}

/**
 * @param {{ studentId: string, studentName?: string, classKey?: string, attendanceRows?: Array<object>, transactions?: Array<object> }} p
 */
export function buildStudentScoreReport({
  studentId,
  studentName = '',
  classKey = '',
  attendanceRows = [],
  transactions = []
}) {
  const days = dedupeRecordsByDate(attendanceRows);
  const breakdown = computeScoreBreakdownFromTransactions(transactions);
  const attendance = computeAttendancePercentages(days);
  const parentRisk = computeParentMeetingRisk(days);

  return {
    studentId,
    studentName,
    classKey,
    startingScore: getStartingScore(),
    ...breakdown,
    attendance,
    parentRisk,
    behaviorPercent: breakdown.remainingPercent,
    attendanceDays: attendance.total
  };
}

/**
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 */
export function sortReportsByScore(reports, ascending = false) {
  return [...reports].sort((a, b) =>
    ascending ? a.totalScore - b.totalScore : b.totalScore - a.totalScore
  );
}

/** Sort by class/room (numeric), then score ascending, then student name. */
export function sortScoreReportsByClassThenScore(reports) {
  return [...reports].sort((a, b) => {
    const byClass = String(a.classKey || '').localeCompare(String(b.classKey || ''), undefined, {
      numeric: true
    });
    if (byClass) return byClass;
    const byScore = (Number(a.totalScore) || 0) - (Number(b.totalScore) || 0);
    if (byScore) return byScore;
    return String(a.studentName || a.studentId || '').localeCompare(
      String(b.studentName || b.studentId || ''),
      'th'
    );
  });
}

/**
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 */
export function filterAttendanceRiskReports(reports) {
  return reports.filter((r) => r.parentRisk?.shouldWarn);
}

/**
 * Load at-risk student reports for dashboard (scoped by role).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} [refDate] yyyy-MM-dd
 */
export async function loadAtRiskReportsForSession(session, refDate = getTodayDate()) {
  if (!session) return [];

  const range = getSemesterDateRange(refDate);
  let attRows = [];
  try {
    attRows = await querySemesterAttendanceForSession(session, range);
  } catch (err) {
    console.warn('[atRisk] semester attendance load failed', err);
  }

  const reports = buildClassScoreReports(attRows, []);
  return filterAttendanceRiskReports(reports).sort(
    (a, b) => (b.parentRisk?.riskPercent ?? 0) - (a.parentRisk?.riskPercent ?? 0)
  );
}

export function getAtRiskThresholdPercent() {
  return getParentMeetingThresholdPercent();
}

/**
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 * @returns {Array<[string, ReturnType<typeof buildStudentScoreReport>[]]>}
 */
export function groupAtRiskReportsByClass(reports) {
  /** @type {Map<string, ReturnType<typeof buildStudentScoreReport>[]>} */
  const byClass = new Map();
  for (const r of reports) {
    const ck = r.classKey || '—';
    if (!byClass.has(ck)) byClass.set(ck, []);
    byClass.get(ck).push(r);
  }
  return [...byClass.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );
}

/**
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 */
export function filterLowScoreReports(reports, threshold = 80) {
  return reports.filter((r) => r.totalScore < threshold);
}

/** Students who must perform community service (score below threshold). */
export function filterCommunityServiceReports(reports, threshold = getCommunityServiceThreshold()) {
  return reports.filter((r) => r.totalScore < threshold);
}

export function requiresCommunityService(totalScore, threshold = getCommunityServiceThreshold()) {
  return Number(totalScore) < threshold;
}

export function getCommunityServiceThresholdScore() {
  return getCommunityServiceThreshold();
}

/** Students with any point deduction this period. */
export function filterStudentsWithDeductions(reports) {
  return reports.filter((r) => (r.totalDeductions ?? 0) > 0);
}

/**
 * Dashboard view — only classes with deducted students, sorted by room.
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 * @param {ReturnType<typeof summarizeTransactionsByClass>} [txnByClass]
 */
export function summarizeDeductedReportsByClass(reports, txnByClass = new Map()) {
  /** @type {Map<string, ReturnType<typeof buildStudentScoreReport>[]>} */
  const byClass = new Map();
  for (const r of filterStudentsWithDeductions(reports)) {
    const ck = String(r.classKey || '').trim();
    if (!ck || ck === '—') continue;
    if (!byClass.has(ck)) byClass.set(ck, []);
    byClass.get(ck).push(r);
  }

  return [...byClass.entries()]
    .map(([classKey, list]) => {
      const deductedStudents = sortReportsByScore(list, true);
      const communityServiceStudents = filterCommunityServiceReports(deductedStudents);
      const txn = txnByClass.get(classKey) || { discipline: 0, behavior: 0, attendance: 0, total: 0 };
      return {
        classKey,
        deductedStudents,
        deductedCount: deductedStudents.length,
        communityServiceStudents,
        communityServiceCount: communityServiceStudents.length,
        txn
      };
    })
    .sort((a, b) => a.classKey.localeCompare(b.classKey, undefined, { numeric: true }));
}

/**
 * @param {Array<{ student_id: string, student_name?: string, class?: string }>} attendanceRows
 * @param {Array<{ student_id: string }>} transactions
 * @param {Array<{ student_id: string, first_name?: string, last_name?: string, student_name?: string }>} [roster]
 */
export function buildClassScoreReports(attendanceRows, transactions, roster = [], opts = {}) {
  const attByStudent = groupAttendanceByStudent(attendanceRows);
  const txnByStudent = groupTransactionsByStudent(transactions);
  const officialRosterOnly = opts.officialRosterOnly !== false && roster.length > 0;

  /** @type {Map<string, { student_id: string, student_name?: string }>} */
  const names = new Map();
  for (const s of roster) {
    if (isTestStudentRecord(s)) continue;
    names.set(String(s.student_id), s);
  }
  if (!officialRosterOnly) {
    for (const row of attendanceRows) {
      if (isTestStudentRecord(row)) continue;
      if (!names.has(row.student_id)) names.set(row.student_id, row);
    }
    for (const row of transactions) {
      if (isTestStudentRecord(row)) continue;
      if (!names.has(row.student_id)) names.set(row.student_id, row);
    }
  }

  const reports = [];
  for (const [studentId, meta] of names) {
    if (isTestStudentRecord({ ...meta, studentId })) continue;
    const studentAtt = attByStudent.get(studentId) || [];
    const name =
      String(meta.student_name ?? '').trim() ||
      `${String(meta.first_name ?? '').trim()} ${String(meta.last_name ?? '').trim()}`.trim();
    const classKey = String(studentAtt[0]?.class ?? meta.class ?? '');
    reports.push(
      buildStudentScoreReport({
        studentId,
        studentName: name || studentId,
        classKey,
        attendanceRows: studentAtt,
        transactions: txnByStudent.get(studentId) || []
      })
    );
  }
  return reports;
}

/**
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 */
export function summarizeBehaviorStats(reports) {
  if (!reports.length) {
    return {
      count: 0,
      avgScore: 0,
      avgPercent: 0,
      atRisk: 0,
      topScore: 0,
      lowScore: 0
    };
  }
  const scores = reports.map((r) => r.totalScore);
  const sum = scores.reduce((a, b) => a + b, 0);
  const percents = reports.map((r) => r.remainingPercent);
  const pctSum = percents.reduce((a, b) => a + b, 0);
  return {
    count: reports.length,
    avgScore: Math.round(sum / reports.length),
    avgPercent: Math.round(pctSum / reports.length),
    atRisk: filterAttendanceRiskReports(reports).length,
    topScore: Math.max(...scores),
    lowScore: Math.min(...scores)
  };
}

/**
 * @param {Array<{ class?: string, points?: number, category?: string, type?: string }>} transactions
 */
export function summarizeTransactionsByClass(transactions) {
  /** @type {Map<string, { discipline: number, behavior: number, attendance: number, total: number }>} */
  const map = new Map();
  for (const row of transactions) {
    const key = String(row.class || '—').trim() || '—';
    if (!map.has(key)) {
      map.set(key, { discipline: 0, behavior: 0, attendance: 0, total: 0 });
    }
    const item = map.get(key);
    const pts = Number(row.points) || 0;
    item.total += pts;
    const cat = row.category || row.type || '';
    if (cat === 'discipline') item.discipline += pts;
    else if (cat === 'behavior') item.behavior += pts;
    else if (cat === 'attendance') item.attendance += pts;
  }
  return map;
}

/**
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 * @param {Map<string, { discipline: number, behavior: number, attendance: number, total: number }>} [txnByClass]
 */
export function summarizeScoreReportsByClass(reports, txnByClass = new Map()) {
  /** @type {Map<string, ReturnType<typeof buildStudentScoreReport>[]>} */
  const byClass = new Map();
  for (const r of reports) {
    const ck = r.classKey || '—';
    if (!byClass.has(ck)) byClass.set(ck, []);
    byClass.get(ck).push(r);
  }

  return [...byClass.entries()]
    .map(([classKey, list]) => {
      const stats = summarizeBehaviorStats(list);
      const lowScores = filterLowScoreReports(list);
      const atRisk = filterAttendanceRiskReports(list);
      const txn = txnByClass.get(classKey) || { discipline: 0, behavior: 0, attendance: 0, total: 0 };
      return {
        classKey,
        stats,
        lowScores,
        atRisk,
        lowScoreStudents: sortReportsByScore(lowScores, true).slice(0, 5),
        txn
      };
    })
    .sort((a, b) => a.classKey.localeCompare(b.classKey, undefined, { numeric: true }));
}

/**
 * Include classes that have point transactions but no attendance-based reports yet.
 * @param {ReturnType<typeof summarizeScoreReportsByClass>} blocks
 * @param {ReturnType<typeof summarizeTransactionsByClass>} txnByClass
 */
function mergeTransactionOnlyClasses(blocks, txnByClass, txnRows = []) {
  const seen = new Set(blocks.map((b) => b.classKey));
  const extras = [];
  for (const [classKey, txn] of txnByClass) {
    if (!classKey || classKey === '—' || seen.has(classKey)) continue;
    const studentCount = new Set(
      txnRows.filter((r) => r.class === classKey).map((r) => String(r.student_id || '').trim()).filter(Boolean)
    ).size;
    extras.push({
      classKey,
      stats: { ...summarizeBehaviorStats([]), count: studentCount },
      lowScores: [],
      atRisk: [],
      lowScoreStudents: [],
      txn
    });
  }
  return [...blocks, ...extras].sort((a, b) =>
    a.classKey.localeCompare(b.classKey, undefined, { numeric: true })
  );
}

async function loadSemesterPointTransactions(session, range, attRows) {
  let txnRows = [];
  try {
    txnRows = await queryPointsInRangeForSession(session, { from: range.from, to: range.to });
  } catch (err) {
    console.warn('[scores] points load failed', err);
  }

  const classKeysFromAtt = [
    ...new Set(attRows.map((r) => String(r.class || '').trim()).filter(Boolean))
  ];
  if (!classKeysFromAtt.length) return txnRows;

  const covered = new Set(txnRows.map((r) => r.class));
  const missing = classKeysFromAtt.filter((k) => !covered.has(k));
  if (!missing.length) return txnRows;

  const extra = (
    await Promise.all(
      missing.map((k) => queryClassPointsInRange(k, range.from, range.to).catch(() => []))
    )
  ).flat();
  return [...txnRows, ...extra];
}

/**
 * Semester score reports scoped by role (homeroom / admin / pastoral).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} [refDate] yyyy-MM-dd
 */
async function fetchSemesterScoreReportsForSession(session, refDate = getTodayDate(), rangeOverride = null) {
  if (!session) {
    return {
      reports: [],
      transactions: [],
      range: rangeOverride || getSemesterDateRange(refDate),
      byClass: [],
      byClassDeducted: []
    };
  }

  const range = rangeOverride || getSemesterDateRange(refDate);
  let attRows = [];
  try {
    attRows = await querySemesterAttendanceForSession(session, range);
  } catch (err) {
    console.warn('[scores] attendance load failed', err);
  }

  const txnRows = await loadSemesterPointTransactions(session, range, attRows);
  const classKeys = [
    ...new Set(
      [...attRows, ...txnRows]
        .map((r) => String(r.class || '').trim())
        .filter(Boolean)
    )
  ];
  const roster = await loadOfficialRosterForClassKeys(classKeys, fetchStudentsByClass);
  const reports = filterScoreReportsToOfficialRoster(
    buildClassScoreReports(attRows, txnRows, roster, { officialRosterOnly: roster.length > 0 }),
    roster
  );
  const txnByClass = summarizeTransactionsByClass(txnRows);
  const byClass = mergeTransactionOnlyClasses(
    summarizeScoreReportsByClass(reports, txnByClass),
    txnByClass,
    txnRows
  );
  const byClassDeducted = summarizeDeductedReportsByClass(reports, txnByClass);
  return { reports, transactions: txnRows, range, byClass, byClassDeducted };
}

export async function loadSemesterScoreReportsForSession(session, refDate = getTodayDate()) {
  if (!session) {
    return fetchSemesterScoreReportsForSession(session, refDate);
  }

  const key = semesterScoreCacheKey(session, refDate);
  const hit = semesterScoreCache.get(key);
  if (hit && Date.now() - hit.cachedAt < SEMESTER_SCORE_CACHE_TTL_MS) {
    return hit.payload;
  }

  const inflight = semesterScoreInflight.get(key);
  if (inflight) return inflight;

  const promise = fetchSemesterScoreReportsForSession(session, refDate)
    .then((payload) => {
      semesterScoreCache.set(key, { payload, cachedAt: Date.now() });
      return payload;
    })
    .finally(() => {
      semesterScoreInflight.delete(key);
    });

  semesterScoreInflight.set(key, promise);
  return promise;
}

/**
 * Score reports for an explicit date range (Points Report on-demand load).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {{ from: string, to: string }} range
 */
export async function loadScoreReportsForDateRange(session, range) {
  if (!session || !range?.from || !range?.to) {
    return fetchSemesterScoreReportsForSession(session, getTodayDate(), range);
  }
  return fetchSemesterScoreReportsForSession(session, range.to, range);
}

/**
 * Filter score reports by class key and optional community-service threshold.
 * @param {ReturnType<typeof buildStudentScoreReport>[]} reports
 * @param {{ classKey?: string, level?: string, room?: string, communityServiceOnly?: boolean, search?: string }} [filters]
 */
export function filterScoreReports(reports, filters = {}) {
  let list = [...reports];
  const classKey =
    filters.classKey ||
    (filters.level && filters.room ? `${filters.level}/${filters.room}` : '');
  if (classKey) {
    list = list.filter((r) => r.classKey === classKey);
  } else if (filters.level) {
    const prefix = `${filters.level}/`;
    list = list.filter((r) => String(r.classKey || '').startsWith(prefix));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (r) =>
        String(r.studentName || '').toLowerCase().includes(q) ||
        String(r.studentId || '').toLowerCase().includes(q)
    );
  }
  if (filters.communityServiceOnly) {
    list = filterCommunityServiceReports(list);
  }
  return sortScoreReportsByClassThenScore(list);
}
