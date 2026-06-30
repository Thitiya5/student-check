import { normalizeAttendanceStatus } from '../../data/attendanceStatuses.js';
import {
  buildAttendanceClassKey,
  parseClassKey,
  recordsToAttendanceMap
} from '../../services/attendanceService.js';

/** @typedef {'present'|'absent'|'leave'|'late'} ExecutiveStatusBucket */

/**
 * @param {unknown} status
 * @returns {ExecutiveStatusBucket}
 */
export function bucketExecutiveStatus(status) {
  const key = normalizeAttendanceStatus(status);
  if (key === 'present') return 'present';
  if (key === 'late') return 'late';
  if (key === 'absent') return 'absent';
  if (key === 'leave' || key === 'sick' || key === 'errand' || key === 'activity') return 'leave';
  return 'present';
}

/**
 * @returns {{ present: number, absent: number, leave: number, late: number }}
 */
export function emptyExecutiveCounts() {
  return { present: 0, absent: 0, leave: 0, late: 0 };
}

/**
 * @param {ExecutiveStatusBucket} bucket
 * @param {{ present: number, absent: number, leave: number, late: number }} counts
 */
export function incrementExecutiveCount(bucket, counts) {
  counts[bucket] += 1;
}

/**
 * @param {Array<{ student_id: string, status?: string, createdAt?: string|null }>} rows
 * @param {Array<{ student_id: string, level?: string, room?: string }>} roster
 * @param {{ grade?: string, room?: string }} [filters]
 */
export function summarizeExecutiveDay(roster, rows, filters = {}) {
  const students = filterRoster(roster, filters);
  const attendanceRows = filterAttendanceRows(rows, filters);
  const statusByStudent = recordsToAttendanceMap(attendanceRows);

  const counts = emptyExecutiveCounts();
  for (const student of students) {
    const sid = String(student.student_id || '');
    const status = statusByStudent[sid] || 'absent';
    incrementExecutiveCount(bucketExecutiveStatus(status), counts);
  }

  return {
    totalStudents: students.length,
    ...counts,
    attendancePct: students.length
      ? Math.round(((counts.present + counts.late) / students.length) * 1000) / 10
      : 0
  };
}

/**
 * @param {Array<{ student_id: string, level?: string, room?: string }>} roster
 * @param {Array<{ student_id: string, class?: string, status?: string, createdAt?: string|null }>} rows
 * @param {string[]} grades
 */
export function summarizeExecutiveByGrade(roster, rows, grades) {
  return grades.map((grade) => {
    const summary = summarizeExecutiveDay(roster, rows, { grade });
    return {
      grade,
      present: summary.present,
      absent: summary.absent,
      leave: summary.leave,
      late: summary.late,
      attendancePct: summary.attendancePct
    };
  });
}

/**
 * @param {Array<{ student_id: string, level?: string, room?: string }>} roster
 * @param {Array<{ student_id: string, class?: string, status?: string, createdAt?: string|null }>} rows
 */
export function summarizeExecutiveByRoom(roster, rows) {
  /** @type {Map<string, { classKey: string, roster: typeof roster }>} */
  const rooms = new Map();

  for (const student of roster) {
    const level = String(student.level || '').trim();
    const room = String(student.room || '').trim();
    if (!level || !room) continue;
    const classKey = buildAttendanceClassKey(level, room);
    if (!rooms.has(classKey)) {
      rooms.set(classKey, { classKey, roster: [] });
    }
    rooms.get(classKey).roster.push(student);
  }

  const results = [];
  for (const { classKey, roster: classRoster } of rooms.values()) {
    if (!classRoster.length) continue;
    const classRows = rows.filter((r) => String(r.class || '') === classKey);
    const summary = summarizeExecutiveDay(classRoster, classRows);
    results.push({
      classKey,
      ...parseClassKey(classKey),
      attendancePct: summary.attendancePct,
      totalStudents: summary.totalStudents
    });
  }

  return results.sort((a, b) => a.classKey.localeCompare(b.classKey, undefined, { numeric: true }));
}

/**
 * @param {Array<{ createdAt?: string|null }>} rows
 * @returns {string|null} ISO timestamp
 */
export function latestAttendanceTimestamp(rows) {
  let latest = null;
  for (const row of rows) {
    const ts = row.updatedAt
      ? String(row.updatedAt)
      : row.createdAt
        ? String(row.createdAt)
        : '';
    if (!ts) continue;
    if (!latest || ts > latest) latest = ts;
  }
  return latest;
}

/**
 * @param {Array<{ student_id: string, level?: string, room?: string }>} roster
 * @param {{ grade?: string, room?: string }} filters
 */
export function filterRoster(roster, { grade = '', room = '' } = {}) {
  const gradeKey = String(grade || '').trim();
  const roomKey = String(room || '').trim();
  return roster.filter((student) => {
    const level = String(student.level || '').trim();
    const rm = String(student.room || '').trim();
    if (gradeKey && level !== gradeKey) return false;
    if (roomKey && rm !== roomKey) return false;
    return true;
  });
}

/**
 * @param {Array<{ class?: string }>} rows
 * @param {{ grade?: string, room?: string }} filters
 */
export function filterAttendanceRows(rows, { grade = '', room = '' } = {}) {
  const gradeKey = String(grade || '').trim();
  const roomKey = String(room || '').trim();
  return rows.filter((row) => {
    const classKey = String(row.class || '');
    if (!classKey) return false;
    const { level, room: rm } = parseClassKey(classKey);
    if (gradeKey && level !== gradeKey) return false;
    if (roomKey && rm !== roomKey) return false;
    return true;
  });
}

/**
 * @param {Array<{ level?: string }>} roster
 */
export function distinctGradeLevels(roster) {
  return [...new Set(roster.map((s) => String(s.level || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}
