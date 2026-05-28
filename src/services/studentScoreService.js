import {
  computeScoreFromTransactions,
  computeAttendancePercentages,
  computeParentMeetingRisk
} from '../utils/pointCalculations.js';
import { dedupeRecordsByDate, getSemesterDateRange } from '../utils/studentAttendanceSummary.js';
import { getStartingScore, getParentMeetingThresholdPercent } from './appSettingsService.js';
import {
  buildAttendanceClassKey,
  queryAttendanceInRangeForSession
} from './attendanceService.js';
import { isAdminSession } from './teacherAuth.js';
import { fetchLevelOptions, fetchRoomOptions } from './studentsService.js';
import { getTodayDate } from '../utils/dateIso.js';

/**
 * All class keys from Google Sheets metadata (LEVEL × ROOM).
 */
async function fetchAllClassKeys() {
  const levels = await fetchLevelOptions();
  /** @type {string[]} */
  const keys = [];
  for (const level of levels) {
    const rooms = await fetchRoomOptions(level);
    for (const room of rooms) {
      keys.push(buildAttendanceClassKey(level, room));
    }
  }
  return keys;
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
  const score = computeScoreFromTransactions(transactions);
  const attendance = computeAttendancePercentages(days);
  const parentRisk = computeParentMeetingRisk(days);

  return {
    studentId,
    studentName,
    classKey,
    startingScore: getStartingScore(),
    ...score,
    attendance,
    parentRisk,
    behaviorPercent: score.remainingPercent,
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

  if (isAdminSession(session)) {
    try {
      const classKeys = await fetchAllClassKeys();
      const chunks = await Promise.all(
        classKeys.map((classKey) =>
          queryAttendanceInRangeForSession(session, {
            from: range.from,
            to: range.to,
            classKey
          }).catch((err) => {
            console.warn('[atRisk] class query failed', classKey, err);
            return [];
          })
        )
      );
      attRows = chunks.flat();
    } catch (err) {
      console.warn('[atRisk] admin class list failed', err);
    }
  } else {
    attRows = await queryAttendanceInRangeForSession(session, {
      from: range.from,
      to: range.to
    });
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

/**
 * @param {Array<{ student_id: string, student_name?: string, class?: string }>} attendanceRows
 * @param {Array<{ student_id: string }>} transactions
 * @param {Array<{ student_id: string, first_name?: string, last_name?: string, student_name?: string }>} [roster]
 */
export function buildClassScoreReports(attendanceRows, transactions, roster = []) {
  const attByStudent = groupAttendanceByStudent(attendanceRows);
  const txnByStudent = groupTransactionsByStudent(transactions);

  /** @type {Map<string, { student_id: string, student_name?: string }>} */
  const names = new Map();
  for (const s of roster) {
    names.set(String(s.student_id), s);
  }
  for (const row of attendanceRows) {
    if (!names.has(row.student_id)) names.set(row.student_id, row);
  }
  for (const row of transactions) {
    if (!names.has(row.student_id)) names.set(row.student_id, row);
  }

  const reports = [];
  for (const [studentId, meta] of names) {
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
