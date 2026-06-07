import { getAttendanceForClassOnDate } from './attendanceService.js';
import { fetchStudentsByClass } from './studentsService.js';
import {
  disciplineEntryToFirestore,
  emptyDisciplineEntry,
  parseDisciplineFromRecord
} from '../data/disciplineChecks.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import {
  enrichStudentsForPointSync,
  listSessionClassKeys,
  purgeSystemPointTransactionsForClassDay,
  syncClassPointTransactions
} from './studentPointsService.js';
import { classKeyToParts } from './teacherAuth.js';
import { initAppSettings } from './appSettingsService.js';
import { enumerateDateKeys } from '../utils/dateIso.js';

/**
 * Rebuild point transactions for one class/day after history edit or delete.
 * @param {{ classKey: string, date: string, teacherName?: string }} opts
 */
export async function resyncPointsForClassDay(opts) {
  await initAppSettings();
  const classKey = String(opts.classKey || '');
  const date = String(opts.date || '');
  const parts = classKeyToParts(classKey);
  if (!parts.level || !parts.room || !date) return;

  const records = await getAttendanceForClassOnDate(classKey, date);
  if (!records.length) {
    await purgeSystemPointTransactionsForClassDay(classKey, date);
    return;
  }

  const students = await fetchStudentsByClass(parts.level, parts.room);
  const recordMap = new Map(records.map((r) => [String(r.student_id), r]));

  const studentsPayload = enrichStudentsForPointSync(
    students.map((s) => {
      const sid = String(s.student_id);
      const rec = recordMap.get(sid);
      const student_name = `${String(s.first_name ?? '').trim()} ${String(s.last_name ?? '').trim()}`.trim();
      /** No attendance row — treat as unchecked (present, no deductions) after history delete. */
      if (!rec) {
        return {
          student_id: sid,
          first_name: String(s.first_name ?? ''),
          last_name: String(s.last_name ?? ''),
          student_name,
          status: 'present',
          disciplineReturnedBy: '',
          disciplineReturnedAt: null,
          ...disciplineEntryToFirestore(emptyDisciplineEntry())
        };
      }
      const status = normalizeAttendanceStatus(rec.status);
      const parsed = parseDisciplineFromRecord(rec);
      return {
        student_id: sid,
        first_name: String(s.first_name ?? ''),
        last_name: String(s.last_name ?? ''),
        student_name,
        status,
        disciplineReturnedBy: rec.disciplineReturnedBy || '',
        disciplineReturnedAt: rec.disciplineReturnedAt || null,
        ...disciplineEntryToFirestore(parsed)
      };
    }),
    date
  );

  await syncClassPointTransactions({
    classKey,
    date,
    teacherName: String(opts.teacherName || ''),
    students: studentsPayload
  });
}

/**
 * Clear stale system points for class/days that no longer have any attendance rows.
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {object} opts
 * @returns {Promise<number>} class-days reconciled
 */
export async function reconcileStaleSystemPoints(session, opts = {}) {
  if (!session) return 0;

  const from = String(opts.from || opts.date || '');
  const to = String(opts.to || from);
  const teacherName = String(opts.teacherName || session.teacherName || '');
  const dates = opts.date ? [opts.date] : enumerateDateKeys(from, to);
  if (!dates.length) return 0;

  /** @type {{ classKey: string, date: string }[]} */
  let jobs = [];

  if (Array.isArray(opts.pointRows) && opts.pointRows.length) {
    const seen = new Set();
    for (const row of opts.pointRows) {
      if (row.source === 'manual') continue;
      const classKey = String(row.class || '');
      const date = String(row.transactionDate || row.date || '');
      if (!classKey || !date || !dates.includes(date)) continue;
      const key = `${classKey}__${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ classKey, date });
    }
  } else {
    const classKeys = opts.classKey
      ? [String(opts.classKey)]
      : await listSessionClassKeys(session, { level: opts.level, room: opts.room });
    for (const date of dates) {
      for (const classKey of classKeys) {
        jobs.push({ classKey, date });
      }
    }
  }

  let reconciled = 0;
  for (const { classKey, date } of jobs) {
    const records = await getAttendanceForClassOnDate(classKey, date);
    if (records.length) continue;
    await resyncPointsForClassDay({ classKey, date, teacherName });
    reconciled += 1;
  }
  return reconciled;
}

/**
 * Sync points for every visible class on a date (used when history is empty).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {{ date: string, classKey?: string, level?: string, room?: string, teacherName?: string }} opts
 * @returns {Promise<number>} class-days processed
 */
export async function resyncPointsForDateScope(session, opts = {}) {
  return reconcileStaleSystemPoints(session, {
    date: opts.date,
    classKey: opts.classKey,
    level: opts.level,
    room: opts.room,
    teacherName: opts.teacherName
  });
}

/**
 * @param {{ class?: string, attendanceDate?: string, teacherName?: string }} record
 * @param {{ attendanceDate?: string, class?: string, teacherName?: string }} [updates]
 * @param {string} [fallbackTeacherName]
 */
export async function resyncPointsAfterHistoryChange(record, updates = {}, fallbackTeacherName = '') {
  const teacherName = String(
    updates.teacherName || record.teacherName || fallbackTeacherName || ''
  );
  const nextDate = String(updates.attendanceDate || record.attendanceDate || '');
  const nextClass = String(updates.class || record.class || '');
  const prevDate = String(record.attendanceDate || '');
  const prevClass = String(record.class || '');

  if (updates.attendanceDate && updates.attendanceDate !== prevDate && prevClass && prevDate) {
    await resyncPointsForClassDay({ classKey: prevClass, date: prevDate, teacherName });
  }
  if (nextClass && nextDate) {
    await resyncPointsForClassDay({ classKey: nextClass, date: nextDate, teacherName });
  }
}
