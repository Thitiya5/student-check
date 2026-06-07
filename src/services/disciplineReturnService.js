import { getAttendanceForClassOnDate, saveClassAttendance } from './attendanceService.js';
import { fetchStudentsByClass } from './studentsService.js';
import {
  disciplineEntryToFirestore,
  emptyDisciplineEntry,
  normalizeDisciplineFlags,
  parseDisciplineFromRecord,
  resolveDisciplineFlagsForScoring
} from '../data/disciplineChecks.js';
import { normalizeAttendanceStatus, CHECK_DEFAULT_STATUS } from '../data/attendanceStatuses.js';
import { syncClassPointTransactions } from './studentPointsService.js';
import { classKeyToParts } from './teacherAuth.js';
import { initAppSettings } from './appSettingsService.js';

/**
 * @param {object} opts
 * @param {(ctx: {
 *   studentId: string,
 *   status: string,
 *   parsed: ReturnType<typeof parseDisciplineFromRecord>,
 *   rec: object|undefined,
 *   disc: ReturnType<typeof emptyDisciplineEntry>,
 *   flags: string[],
 * }) => { flags?: string[], disciplineWaived?: boolean, disciplineReturnedBy?: string, disciplineReturnedAt?: string|null }} opts.mutate
 */
async function applyDisciplineChangeForClass(opts) {
  await initAppSettings();
  const classKey = String(opts.classKey || '');
  const parts = classKeyToParts(classKey);
  const sid = String(opts.studentId || '');
  const date = String(opts.date || '');
  const teacherName = String(opts.teacherName || '');

  if (!parts.level || !parts.room || !sid || !date) {
    throw new Error('Invalid class, student, or date');
  }

  const students = await fetchStudentsByClass(parts.level, parts.room);
  const records = await getAttendanceForClassOnDate(classKey, date);
  const recordMap = new Map(records.map((r) => [String(r.student_id), r]));

  const studentsPayload = students.map((s) => {
    const studentId = String(s.student_id);
    const rec = recordMap.get(studentId);
    const status = normalizeAttendanceStatus(rec?.status || CHECK_DEFAULT_STATUS);
    const parsed = parseDisciplineFromRecord(rec || {});
    let flags = normalizeDisciplineFlags(parsed.flags);
    const disc = emptyDisciplineEntry();
    disc.flags = flags;
    disc.behaviors = parsed.behaviors || [];
    disc.note = parsed.note || '';
    disc.disciplineWaived = parsed.disciplineWaived;

    let disciplineReturnedBy = String(rec?.disciplineReturnedBy || '');
    let disciplineReturnedAt = rec?.disciplineReturnedAt || null;

    if (studentId === sid) {
      const next = opts.mutate({ studentId, status, parsed, rec, disc, flags });
      if (next.flags) flags = normalizeDisciplineFlags(next.flags);
      disc.flags = flags;
      if (next.disciplineWaived !== undefined) disc.disciplineWaived = next.disciplineWaived;
      if (next.disciplineReturnedBy !== undefined) disciplineReturnedBy = next.disciplineReturnedBy;
      if (next.disciplineReturnedAt !== undefined) disciplineReturnedAt = next.disciplineReturnedAt;
    }

    return {
      student_id: studentId,
      first_name: String(s.first_name ?? ''),
      last_name: String(s.last_name ?? ''),
      student_name: `${String(s.first_name ?? '').trim()} ${String(s.last_name ?? '').trim()}`.trim(),
      status,
      disciplineReturnedBy,
      disciplineReturnedAt,
      ...disciplineEntryToFirestore(disc)
    };
  });

  await saveClassAttendance({
    classKey,
    teacherName,
    attendanceDate: date,
    students: studentsPayload
  });
  await syncClassPointTransactions({
    classKey,
    date,
    teacherName,
    students: studentsPayload
  });
}

/**
 * Remove one or all discipline flags for a student on a class/day.
 * Attendance status is unchanged (e.g. absent stays absent, only discipline flags cleared).
 *
 * @param {{
 *   classKey: string,
 *   studentId: string,
 *   date: string,
 *   teacherName: string,
 *   flagId?: string|null,
 *   removeAll?: boolean,
 * }} opts
 */
export async function returnDisciplinePointsForStudent(opts) {
  const removeAll = opts.removeAll === true || opts.flagId == null;
  const flagId = removeAll ? null : String(opts.flagId || '');
  if (!removeAll && !flagId) {
    throw new Error('Invalid discipline flag');
  }

  const returnedAt = new Date().toISOString();
  await applyDisciplineChangeForClass({
    classKey: opts.classKey,
    studentId: opts.studentId,
    date: opts.date,
    teacherName: opts.teacherName,
    mutate: ({ flags }) => ({
      flags: removeAll ? [] : flags.filter((f) => f !== flagId),
      disciplineWaived: true,
      disciplineReturnedBy: String(opts.teacherName || ''),
      disciplineReturnedAt: returnedAt
    })
  });
}

/**
 * Re-apply discipline flags after a return (clears waive; absent on inspection day gets full auto-fail again).
 *
 * @param {{
 *   classKey: string,
 *   studentId: string,
 *   date: string,
 *   teacherName: string,
 * }} opts
 */
export async function restoreDisciplinePointsForStudent(opts) {
  await applyDisciplineChangeForClass({
    classKey: opts.classKey,
    studentId: opts.studentId,
    date: opts.date,
    teacherName: opts.teacherName,
    mutate: ({ status, flags }) => ({
      flags: resolveDisciplineFlagsForScoring(status, opts.date, flags, { disciplineWaived: false }),
      disciplineWaived: false,
      disciplineReturnedBy: '',
      disciplineReturnedAt: null
    })
  });
}
