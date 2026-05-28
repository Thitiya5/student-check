import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { PARENT_RISK_STATUS_KEYS } from '../config/pointSystem.js';
import {
  getStartingScore,
  getParentMeetingThresholdPercent,
  isDisciplineActiveDate,
  canRecordDisciplineOnDate,
  getDisciplineDeductionPoints,
  getBehaviorGoodPoints,
  getBehaviorBadPoints
} from '../services/appSettingsService.js';
import { dedupeRecordsByDate } from './studentAttendanceSummary.js';

export { isDisciplineActiveDate, canRecordDisciplineOnDate };

/**
 * @param {Array<{ points?: number, category?: string, type?: string, transactionDate?: string, date?: string, reason?: string }>} transactions
 * @param {{ disciplineOnly?: boolean }} [opts]
 */
export function computeScoreFromTransactions(transactions, opts = {}) {
  let positive = 0;
  let deductions = 0;
  const base = getStartingScore();

  for (const row of transactions) {
    const cat = row.category || row.type || '';
    if (opts.disciplineOnly && cat === 'attendance') continue;

    const p = Number(row.points) || 0;
    if (p > 0) positive += p;
    else deductions += Math.abs(p);
  }

  const totalScore = base + positive - deductions;
  const remainingPercent = Math.max(
    0,
    Math.min(999, Math.round((totalScore / base) * 100))
  );

  return {
    totalScore,
    totalPositive: positive,
    totalDeductions: deductions,
    remainingPercent,
    netChange: positive - deductions
  };
}

/**
 * @param {Array<{ status: string, attendanceDate?: string }>} records
 */
export function computeAttendancePercentages(records) {
  const days = dedupeRecordsByDate(records);
  const total = days.length;
  if (!total) {
    return {
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
      sick: 0,
      errand: 0,
      activity: 0,
      leave: 0,
      presentPercent: 0,
      latePercent: 0,
      absentPercent: 0,
      sickPercent: 0,
      errandPercent: 0,
      activityPercent: 0,
      leavePercent: 0
    };
  }

  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    sick: 0,
    errand: 0,
    activity: 0,
    leave: 0
  };

  for (const row of days) {
    const key = normalizeAttendanceStatus(row.status);
    if (key === 'leave') counts.leave += 1;
    else if (key in counts) counts[key] += 1;
    else counts.present += 1;
  }

  const pct = (n) => Math.round((n / total) * 100);

  return {
    total,
    ...counts,
    presentPercent: pct(counts.present),
    latePercent: pct(counts.late),
    absentPercent: pct(counts.absent),
    sickPercent: pct(counts.sick),
    errandPercent: pct(counts.errand),
    activityPercent: pct(counts.activity),
    leavePercent: pct(counts.leave + counts.sick + counts.errand + counts.activity)
  };
}

/**
 * @param {Array<{ status: string, attendanceDate?: string }>} records
 */
export function computeParentMeetingRisk(records) {
  const days = dedupeRecordsByDate(records);
  const total = days.length;
  const threshold = getParentMeetingThresholdPercent();
  if (!total) {
    return { riskCount: 0, total: 0, riskPercent: 0, shouldWarn: false, threshold };
  }

  let riskCount = 0;
  for (const row of days) {
    const key = normalizeAttendanceStatus(row.status);
    if (PARENT_RISK_STATUS_KEYS.includes(key)) riskCount += 1;
  }

  const riskPercent = Math.round((riskCount / total) * 100);
  return {
    riskCount,
    total,
    riskPercent,
    shouldWarn: riskPercent >= threshold,
    threshold
  };
}

/**
 * @param {{ flags?: string[], behaviors?: Array<{ kind: string, note?: string }> }} entry
 * @param {string} [date]
 */
export function computeDayBehaviorDelta(entry, date) {
  if (!date || !canRecordDisciplineOnDate(date)) return 0;
  let delta = 0;
  const flags = entry?.flags || [];
  const behaviors = entry?.behaviors || [];

  for (const id of flags) {
    delta += getDisciplineDeductionPoints(id);
  }
  for (const b of behaviors) {
    if (b.kind === 'good') delta += getBehaviorGoodPoints();
    if (b.kind === 'bad') delta += getBehaviorBadPoints();
  }
  return delta;
}

/**
 * @param {number} score
 */
export function formatTotalScore(score) {
  const n = Math.round(Number(score) || 0);
  return String(n);
}
