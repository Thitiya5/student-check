import { ATTENDANCE_STATUS_KEYS, normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { getDisciplineChecks, parseDisciplineFromRecord } from '../data/disciplineChecks.js';
import { computeParentMeetingRisk } from './pointCalculations.js';
import { getTodayDate } from './dateIso.js';
import { getAppSettings } from '../services/appSettingsService.js';

/** @typedef {'ok'|'watch'|'alert'} RiskLevel */

/**
 * Hardcoded Thai school semester fallback (May–Oct / Nov–Apr).
 * @param {string} refDate yyyy-MM-dd
 */
function getHardcodedSemesterDateRange(refDate) {
  const y = Number(refDate.slice(0, 4));
  const m = Number(refDate.slice(5, 7));
  if (m >= 5 && m <= 10) {
    return { from: `${y}-05-01`, to: `${y}-10-31`, labelKey: 'students.rangeSemester1', term: 1 };
  }
  if (m >= 11) {
    return { from: `${y}-11-01`, to: `${y + 1}-04-30`, labelKey: 'students.rangeSemester2', term: 2 };
  }
  return { from: `${y - 1}-11-01`, to: `${y}-04-30`, labelKey: 'students.rangeSemester2', term: 2 };
}

/**
 * Active semester date range from app settings (preferred) or hardcoded fallback.
 * @param {string} [refDate] yyyy-MM-dd
 */
export function getSemesterDateRange(refDate = getTodayDate()) {
  const date = String(refDate || getTodayDate()).slice(0, 10);
  const ay = getAppSettings()?.academicYear;
  if (ay?.semester1Start && ay?.semester1End && ay?.semester2Start && ay?.semester2End) {
    if (date >= ay.semester1Start && date <= ay.semester1End) {
      return { from: ay.semester1Start, to: ay.semester1End, labelKey: 'students.rangeSemester1', term: 1 };
    }
    if (date >= ay.semester2Start && date <= ay.semester2End) {
      return { from: ay.semester2Start, to: ay.semester2End, labelKey: 'students.rangeSemester2', term: 2 };
    }
  }
  return getHardcodedSemesterDateRange(date);
}

/**
 * One status per calendar day (latest record wins).
 * @param {Array<{ student_id: string, attendanceDate: string, status: string, createdAt?: string|null }>} records
 */
export function dedupeRecordsByDate(records) {
  const sorted = [...records].sort((a, b) => {
    const dc = String(a.attendanceDate).localeCompare(String(b.attendanceDate));
    if (dc !== 0) return dc;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  /** @type {Map<string, typeof records[0]>} */
  const byDate = new Map();
  for (const row of sorted) {
    const date = String(row.attendanceDate || '');
    if (!date) continue;
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) => String(b.attendanceDate).localeCompare(String(a.attendanceDate)));
}

/**
 * @param {Array<{ status?: string, disciplineFlags?: string[], disciplineAdjust?: number, disciplineScore?: number }>} dayRecords
 */
export function summarizeDiscipline(dayRecords) {
  /** @type {Record<string, number>} */
  const flagCounts = Object.fromEntries(getDisciplineChecks().map((r) => [r.id, 0]));
  let issueDays = 0;

  for (const row of dayRecords) {
    const { flags, behaviors } = parseDisciplineFromRecord(row);
    for (const id of flags) {
      if (id in flagCounts) flagCounts[id] += 1;
    }
    if (flags.length > 0 || behaviors.length > 0) issueDays += 1;
  }

  return { totalScore: 0, issueDays, flagCounts };
}

/**
 * @param {Array<{ status: string, disciplineFlags?: string[], disciplineAdjust?: number, disciplineScore?: number }>} dayRecords
 */
export function summarizeStudentAttendance(dayRecords) {
  const counts = Object.fromEntries(ATTENDANCE_STATUS_KEYS.map((k) => [k, 0]));
  let legacyLeave = 0;

  for (const row of dayRecords) {
    const key = normalizeAttendanceStatus(row.status);
    if (key === 'leave') legacyLeave += 1;
    else if (key in counts) counts[key] += 1;
    else counts.present += 1;
  }

  const discipline = summarizeDiscipline(dayRecords);

  const total = dayRecords.length;
  const presentLike = counts.present + counts.late;
  const absentLike = counts.absent;
  const leaveLike = legacyLeave + counts.sick + counts.errand + counts.activity;

  const percent = (n) => (total ? Math.round((n / total) * 100) : 0);

  const presentPercent = percent(presentLike);
  const absentPercent = percent(absentLike);
  const leavePercent = percent(leaveLike);
  const absentLeavePercent = percent(absentLike + leaveLike);

  const parentRisk = computeParentMeetingRisk(dayRecords);
  const risk = assessStudentRisk({ absentPercent, leavePercent, absentLeavePercent, parentRisk });

  return {
    total,
    counts,
    presentPercent,
    absentPercent,
    leavePercent,
    absentLeavePercent,
    discipline,
    parentRisk,
    risk
  };
}

/**
 * @param {{ absentPercent: number, leavePercent: number, absentLeavePercent: number, parentRisk?: { shouldWarn?: boolean, riskPercent?: number } }} p
 * @returns {RiskLevel}
 */
export function assessStudentRisk({ absentPercent, leavePercent, absentLeavePercent, parentRisk }) {
  if (parentRisk?.shouldWarn) return 'alert';
  if (absentPercent >= 25 || leavePercent >= 40 || absentLeavePercent >= 45) return 'alert';
  if (absentPercent >= 15 || leavePercent >= 28 || absentLeavePercent >= 32) return 'watch';
  if ((parentRisk?.riskPercent ?? 0) >= 40) return 'watch';
  return 'ok';
}
