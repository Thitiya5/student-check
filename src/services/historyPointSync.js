import { getAttendanceForClassOnDate } from './attendanceService.js';
import { fetchStudentsByClass } from './studentsService.js';
import {
  disciplineEntryToFirestore,
  emptyDisciplineEntry,
  parseDisciplineFromRecord
} from '../data/disciplineChecks.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { enrichStudentsForPointSync, syncClassPointTransactions } from './studentPointsService.js';
import { classKeyToParts } from './teacherAuth.js';
import { initAppSettings } from './appSettingsService.js';

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

  const students = await fetchStudentsByClass(parts.level, parts.room);
  const records = await getAttendanceForClassOnDate(classKey, date);
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
