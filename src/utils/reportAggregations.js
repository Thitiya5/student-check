import { summarizeAttendance } from '../services/attendanceService.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { dedupeRecordsByDate } from './studentAttendanceSummary.js';
import {
  enumerateDateKeys,
  formatWeekdayShortTh,
  weekRangeContaining,
  BANGKOK_TZ
} from './dateIso.js';

/**
 * @param {string} dateKey yyyy-MM-dd
 */
export function formatDayLabelTh(dateKey) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: BANGKOK_TZ
  }).format(new Date(`${dateKey}T12:00:00`));
}

/**
 * @param {string} from @param {string} to
 */
export function formatDateRangeTh(from, to) {
  const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: BANGKOK_TZ };
  const f = new Intl.DateTimeFormat('th-TH', opts).format(new Date(`${from}T12:00:00`));
  const t =
    from === to
      ? ''
      : new Intl.DateTimeFormat('th-TH', opts).format(new Date(`${to}T12:00:00`));
  return from === to ? f : `${f} – ${t}`;
}

/**
 * @param {string} monthKey yyyy-MM
 */
export function formatMonthLabelTh(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: BANGKOK_TZ
  }).format(new Date(y, m - 1, 1));
}

/**
 * @param {object[]} rows
 */
export function groupRowsByDate(rows) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const row of rows) {
    const d = String(row.attendanceDate || '').trim();
    if (!d) continue;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(row);
  }
  return map;
}

/**
 * @param {object[]} rows
 * @param {string[]} dateKeys
 */
export function summarizeDayBuckets(rows, dateKeys) {
  const byDate = groupRowsByDate(rows);
  return dateKeys.map((dateKey) => {
    const dayRows = byDate.get(dateKey) || [];
    const summary = summarizeAttendance(dayRows);
    return {
      key: dateKey,
      label: formatDayLabelTh(dateKey),
      subLabel: formatWeekdayShortTh(dateKey),
      rows: dayRows,
      summary,
      hasData: dayRows.length > 0
    };
  });
}

/**
 * Calendar weeks (Mon-start) intersecting [from, to].
 * @param {string} from @param {string} to
 */
export function buildWeekBuckets(from, to) {
  const dateKeys = enumerateDateKeys(from, to);
  /** @type {Map<string, string[]>} */
  const weekMap = new Map();
  for (const dk of dateKeys) {
    const mon = weekRangeContaining(dk).from;
    if (!weekMap.has(mon)) weekMap.set(mon, []);
    const list = weekMap.get(mon);
    if (!list.includes(dk)) list.push(dk);
  }
  return [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mon, dks], index) => ({
      key: mon,
      weekIndex: index + 1,
      from: dks[0],
      to: dks[dks.length - 1],
      dateKeys: dks,
      subLabel: formatDateRangeTh(dks[0], dks[dks.length - 1])
    }));
}

/**
 * @param {object[]} rows
 * @param {string} from @param {string} to
 */
export function summarizeWeekBuckets(rows, from, to) {
  const buckets = buildWeekBuckets(from, to);
  const byDate = groupRowsByDate(rows);
  return buckets.map((bucket) => {
    const weekRows = bucket.dateKeys.flatMap((dk) => byDate.get(dk) || []);
    const summary = summarizeAttendance(weekRows);
    const dayBuckets = summarizeDayBuckets(weekRows, bucket.dateKeys);
    const daysWithData = dayBuckets.filter((d) => d.hasData).length;
    return {
      ...bucket,
      rows: weekRows,
      summary,
      hasData: weekRows.length > 0,
      daysWithData,
      totalDays: bucket.dateKeys.length
    };
  });
}

/**
 * @param {string} from @param {string} to
 * @param {object[]} rows
 */
export function buildMonthKeysInRange(from, to, rows) {
  const keys = new Set();
  for (const dk of enumerateDateKeys(from, to)) keys.add(dk.slice(0, 7));
  for (const row of rows) {
    const m = String(row.attendanceDate || '').slice(0, 7);
    if (m) keys.add(m);
  }
  return [...keys].sort();
}

/**
 * @param {object[]} rows
 * @param {string} from @param {string} to
 */
export function summarizeMonthBuckets(rows, from, to) {
  const monthKeys = buildMonthKeysInRange(from, to, rows);
  const byDate = groupRowsByDate(rows);
  return monthKeys.map((monthKey, index) => {
    const prefix = `${monthKey}-`;
    const monthDateKeys = [...byDate.keys()].filter((d) => d.startsWith(prefix)).sort();
    const monthRows = monthDateKeys.flatMap((dk) => byDate.get(dk) || []);
    const weekBuckets = summarizeWeekBuckets(
      monthRows,
      monthDateKeys[0] || `${monthKey}-01`,
      monthDateKeys[monthDateKeys.length - 1] || `${monthKey}-28`
    );
    const summary = summarizeAttendance(monthRows);
    return {
      key: monthKey,
      monthIndex: index + 1,
      label: formatMonthLabelTh(monthKey),
      from: monthDateKeys[0] || `${monthKey}-01`,
      to: monthDateKeys[monthDateKeys.length - 1] || `${monthKey}-01`,
      dateKeys: monthDateKeys,
      weekBuckets,
      rows: monthRows,
      summary,
      hasData: monthRows.length > 0
    };
  });
}

/**
 * @param {object[]} rows
 */
export function buildStudentPeriodReports(rows) {
  /** @type {Map<string, object[]>} */
  const byStudent = new Map();
  for (const row of rows) {
    const studentId = String(row.student_id || '').trim();
    if (!studentId) continue;
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push(row);
  }

  return [...byStudent.entries()]
    .map(([studentId, list]) => {
      const days = dedupeRecordsByDate(list);
      const summary = summarizeAttendance(list);
      const counts = { present: 0, late: 0, absent: 0, sick: 0, errand: 0, activity: 0, leave: 0 };
      for (const d of days) {
        const key = normalizeAttendanceStatus(d.status);
        if (key in counts) counts[key] += 1;
      }
      const concern = counts.absent + counts.late + counts.sick + counts.errand;
      const concernPercent = days.length ? Math.round((concern / days.length) * 100) : 0;
      return {
        studentId,
        classKey: String(list[0]?.class || ''),
        studentName: String(list[0]?.student_name || studentId),
        presentPercent: summary.percent,
        concernPercent,
        totalDays: days.length,
        counts
      };
    })
    .sort((a, b) => {
      if (b.concernPercent !== a.concernPercent) return b.concernPercent - a.concernPercent;
      if (a.presentPercent !== b.presentPercent) return a.presentPercent - b.presentPercent;
      return a.studentName.localeCompare(b.studentName, 'th');
    });
}

/**
 * Average percent across buckets (only buckets with data).
 * @param {{ summary?: { percent?: number }, hasData?: boolean }[]} buckets
 */
export function averageBucketPercent(buckets) {
  const withData = buckets.filter((b) => b.hasData && b.summary);
  if (!withData.length) return 0;
  const sum = withData.reduce((acc, b) => acc + (b.summary?.percent ?? 0), 0);
  return Math.round(sum / withData.length);
}
