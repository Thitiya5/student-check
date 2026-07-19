import {
  buildAttendanceClassKey,
  getAttendanceForClassOnDate,
  queryAttendanceByDateForSession,
  queryAttendanceByDateSchoolWide
} from './attendanceService.js';
import {
  getDisciplineChecks,
  normalizeDisciplineFlags,
  parseDisciplineFromRecord,
  resolveDisciplineFlagsForScoring,
  attendancePointPenalty
} from '../data/disciplineChecks.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import {
  getMonthlyInspectionDate,
  listInspectionDatesInRange,
  initAppSettings
} from './appSettingsService.js';
import {
  getViewClassKeys,
  isAdminSession,
  isSchoolWideViewSession,
  classKeyToParts
} from './teacherAuth.js';
import { fetchLevelOptions, fetchRoomOptions, fetchStudentsByClass } from './studentsService.js';
import { getTodayDate } from '../utils/dateIso.js';
import { peekSchoolOverviewCache } from './executive/schoolOverviewCache.js';
import {
  disciplineDetailCacheKey,
  disciplineOverviewCacheKey,
  fetchDisciplineReportWithCache,
  peekDisciplineReportCache
} from './discipline/disciplineReportCache.js';

/** @typedef {'not_recorded'|'recorded'|'partial'} ClassRecordStatus */

/**
 * @param {string} [refDate] yyyy-MM-dd
 */
export function defaultReportYearMonth(refDate = getTodayDate()) {
  return refDate.slice(0, 7);
}

/**
 * @param {string} yearMonth YYYY-MM
 */
export function getInspectionDatesForMonth(yearMonth) {
  const ym = String(yearMonth || '').trim();
  if (!ym || ym.length < 7) return [];
  const from = `${ym}-01`;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const to = new Date(y, m, 0);
  const last = `${ym}-${String(to.getDate()).padStart(2, '0')}`;
  const inRange = listInspectionDatesInRange(from, last);
  if (inRange.length) return inRange;
  const primary = getMonthlyInspectionDate(ym);
  return primary.startsWith(ym) ? [primary] : [];
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 */
export async function listReportClassKeys(session) {
  const viewKeys = getViewClassKeys(session);
  if (viewKeys === null) {
    const levels = await fetchLevelOptions();
    /** @type {string[]} */
    const keys = [];
    for (const level of levels) {
      const rooms = await fetchRoomOptions(level);
      for (const room of rooms) {
        keys.push(buildAttendanceClassKey(level, room));
      }
    }
    return keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return [...viewKeys].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Latest attendance row per student per class.
 * @param {Array<{ student_id: string, class: string, createdAt?: string }>} rows
 */
export function dedupeAttendanceByClassStudent(rows) {
  /** @type {Map<string, typeof rows[0]>} */
  const map = new Map();
  for (const row of rows) {
    const key = `${row.class}__${row.student_id}`;
    const prev = map.get(key);
    if (!prev || String(row.createdAt || '') >= String(prev.createdAt || '')) {
      map.set(key, row);
    }
  }
  return map;
}

/**
 * @param {string} classKey
 * @param {Map<string, object>} byClassStudent
 * @param {number} [rosterSize]
 */
export function classRecordStatus(classKey, byClassStudent, rosterSize = 0) {
  let count = 0;
  for (const key of byClassStudent.keys()) {
    if (key.startsWith(`${classKey}__`)) count += 1;
  }
  if (count === 0) return /** @type {ClassRecordStatus} */ ('not_recorded');
  if (rosterSize > 0 && count < rosterSize) return 'partial';
  return 'recorded';
}

/**
 * @param {object} record
 * @param {string} inspectionDate
 */
export function disciplineRowFromRecord(record, inspectionDate) {
  const rules = getDisciplineChecks();
  const status = normalizeAttendanceStatus(record.status);
  const parsed = parseDisciplineFromRecord(record);
  const flags = resolveDisciplineFlagsForScoring(status, inspectionDate, parsed.flags, {
    disciplineWaived: parsed.disciplineWaived
  });
  const flagSet = new Set(flags);

  /** @type {Record<string, boolean>} */
  const rulePass = {};
  for (const rule of rules) {
    rulePass[rule.id] = !flagSet.has(rule.id);
  }

  let disciplinePts = 0;
  for (const id of flags) {
    const rule = rules.find((r) => r.id === id);
    if (rule) disciplinePts += rule.points;
  }
  const attendancePts = attendancePointPenalty(status);
  const totalPts = disciplinePts + attendancePts;

  return {
    student_id: String(record.student_id || ''),
    student_name: String(record.student_name || ''),
    status,
    rulePass,
    flags: normalizeDisciplineFlags(flags),
    disciplinePts,
    attendancePts,
    totalPts
  };
}

/**
 * @param {Array<object>} students
 * @param {Array<object>} classRecords
 * @param {string} inspectionDate
 */
export function buildClassDisciplineMatrix(students, classRecords, inspectionDate) {
  /** @type {Map<string, object>} */
  const bySid = new Map();
  for (const r of classRecords) {
    bySid.set(String(r.student_id), r);
  }

  return students.map((s) => {
    const sid = String(s.student_id);
    const rec = bySid.get(sid);
    if (!rec) {
      return {
        student_id: sid,
        student_name: String(s.student_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()),
        status: '',
        rulePass: Object.fromEntries(getDisciplineChecks().map((r) => [r.id, true])),
        flags: [],
        disciplinePts: 0,
        attendancePts: 0,
        totalPts: 0,
        missing: true
      };
    }
    return disciplineRowFromRecord(rec, inspectionDate);
  });
}

/**
 * Reuse School Overview attendance cache for admin when inspection date matches.
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} date
 */
async function loadAttendanceRowsForDiscipline(session, date) {
  if (isAdminSession(session)) {
    const shared = peekSchoolOverviewCache(date);
    if (shared?.allRows) {
      return shared.allRows;
    }
    const rows = await queryAttendanceByDateSchoolWide(date);
    return rows;
  }
  return queryAttendanceByDateForSession(session, date);
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} yearMonth
 * @param {string[]} classKeys
 * @param {string} primaryDate
 * @param {Array<object>} allRows
 */
function buildOverviewFromRows(yearMonth, inspectionDates, classKeys, primaryDate, allRows) {
  const deduped = dedupeAttendanceByClassStudent(allRows);

  /** @type {Array<{ classKey: string, status: ClassRecordStatus, recordCount: number, failCount: number, absentCount: number }>} */
  const classes = [];
  let recorded = 0;
  let partial = 0;
  let notRecorded = 0;

  for (const classKey of classKeys) {
    let recordCount = 0;
    let failCount = 0;
    let absentCount = 0;
    for (const [key, row] of deduped) {
      if (!key.startsWith(`${classKey}__`)) continue;
      recordCount += 1;
      const status = normalizeAttendanceStatus(row.status);
      if (status === 'absent') absentCount += 1;
      const parsed = parseDisciplineFromRecord(row);
      const flags = resolveDisciplineFlagsForScoring(status, primaryDate, parsed.flags, {
        disciplineWaived: parsed.disciplineWaived
      });
      if (flags.length) failCount += 1;
    }
    const status = classRecordStatus(classKey, deduped);
    if (status === 'recorded') recorded += 1;
    else if (status === 'partial') partial += 1;
    else notRecorded += 1;
    classes.push({ classKey, status, recordCount, failCount, absentCount });
  }

  return {
    yearMonth,
    inspectionDates,
    primaryDate,
    classKeys,
    classes,
    allRows,
    summary: { total: classKeys.length, recorded, partial, notRecorded }
  };
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} yearMonth YYYY-MM
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function loadDisciplineReportOverview(session, yearMonth, opts = {}) {
  const cacheKey = disciplineOverviewCacheKey(yearMonth, session);
  if (!opts.forceRefresh) {
    const cached = peekDisciplineReportCache(cacheKey);
    if (cached) return cached;
  }

  return fetchDisciplineReportWithCache(
    cacheKey,
    async () => {
      await initAppSettings();
      const inspectionDates = getInspectionDatesForMonth(yearMonth);
      const classKeys = await listReportClassKeys(session);
      if (!inspectionDates.length || !classKeys.length) {
        return {
          yearMonth,
          inspectionDates,
          classKeys,
          classes: [],
          allRows: [],
          summary: { total: classKeys.length, recorded: 0, partial: 0, notRecorded: classKeys.length }
        };
      }

      const primaryDate = inspectionDates[0];
      const allRows = await loadAttendanceRowsForDiscipline(session, primaryDate);
      return buildOverviewFromRows(yearMonth, inspectionDates, classKeys, primaryDate, allRows);
    },
    { forceRefresh: Boolean(opts.forceRefresh) }
  );
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} classKey
 * @param {string} inspectionDate
 * @param {{ cachedRows?: Array<object>|null, forceRefresh?: boolean }} [opts]
 */
export async function loadClassDisciplineDetail(session, classKey, inspectionDate, opts = {}) {
  const detailKey = disciplineDetailCacheKey(classKey, inspectionDate);
  if (!opts.forceRefresh) {
    const cached = peekDisciplineReportCache(detailKey);
    if (cached) return cached;
  }

  return fetchDisciplineReportWithCache(
    detailKey,
    async () => {
      await initAppSettings();
      const { level, room } = classKeyToParts(classKey);

      let classRowsPromise;
      if (Array.isArray(opts.cachedRows) && opts.cachedRows.length) {
        classRowsPromise = Promise.resolve(
          opts.cachedRows.filter((r) => String(r.class) === classKey)
        );
      } else {
        classRowsPromise = getAttendanceForClassOnDate(classKey, inspectionDate);
      }

      const [students, classRows] = await Promise.all([
        level && room ? fetchStudentsByClass(level, room) : Promise.resolve([]),
        classRowsPromise
      ]);

      const deduped = dedupeAttendanceByClassStudent(classRows);
      const records = [...deduped.values()];
      const matrix = buildClassDisciplineMatrix(students, records, inspectionDate);
      return { classKey, inspectionDate, students: matrix, rosterSize: students.length };
    },
    { forceRefresh: Boolean(opts.forceRefresh) }
  );
}

export function canViewDisciplineReportSession(session) {
  if (!session) return false;
  if (isSchoolWideViewSession(session)) return true;
  return getViewClassKeys(session).length > 0;
}

/**
 * Sync peek helpers for pages — no network.
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} yearMonth
 */
export function peekDisciplineReportOverview(session, yearMonth) {
  return peekDisciplineReportCache(disciplineOverviewCacheKey(yearMonth, session));
}

/**
 * @param {string} classKey
 * @param {string} inspectionDate
 */
export function peekDisciplineReportDetail(classKey, inspectionDate) {
  return peekDisciplineReportCache(disciplineDetailCacheKey(classKey, inspectionDate));
}
