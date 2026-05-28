/**
 * Backup / restore attendance data (JSON + CSV).
 */
import { saveClassAttendance } from './attendanceService.js';
import { isOnline } from './offlineSync.js';
import { enqueuePendingAttendance, buildPendingId } from './offlineDb.js';

/**
 * @param {object[]} rows
 * @param {object} meta
 */
export function downloadAttendanceJson(rows, meta = {}) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    meta,
    records: rows
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `attendance-backup-${dateStamp()}.json`,
    'application/json'
  );
}

/**
 * @param {object[]} rows
 */
export function downloadAttendanceCsv(rows) {
  const headers = [
    'attendanceDate',
    'class',
    'student_id',
    'student_name',
    'status',
    'teacherName',
    'disciplineScore'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.attendanceDate,
        r.class,
        r.student_id,
        csvCell(r.student_name),
        r.status,
        csvCell(r.teacherName),
        r.disciplineScore ?? 0
      ].join(',')
    );
  }
  downloadBlob(lines.join('\n'), `attendance-backup-${dateStamp()}.csv`, 'text/csv;charset=utf-8');
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} content
 * @param {string} filename
 * @param {string} mime
 */
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {File} file
 * @returns {Promise<{ records: object[], meta: object }>}
 */
export async function parseBackupJsonFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const records = Array.isArray(data?.records) ? data.records : Array.isArray(data) ? data : [];
  return { records, meta: data?.meta ?? {} };
}

/**
 * Group backup records by class + date and restore to Firestore or offline queue.
 * @param {object[]} records
 * @param {string} defaultTeacherName
 * @returns {Promise<{ restored: number, queued: number }>}
 */
export async function restoreAttendanceRecords(records, defaultTeacherName = '') {
  /** @type {Map<string, { classKey: string, attendanceDate: string, teacherName: string, students: object[] }>} */
  const groups = new Map();

  for (const r of records) {
    const classKey = String(r.class ?? '');
    const attendanceDate = String(r.attendanceDate ?? '');
    if (!classKey || !attendanceDate) continue;
    const key = `${classKey}__${attendanceDate}`;
    if (!groups.has(key)) {
      groups.set(key, {
        classKey,
        attendanceDate,
        teacherName: String(r.teacherName || defaultTeacherName || ''),
        students: []
      });
    }
    const g = groups.get(key);
    g.students.push({
      student_id: String(r.student_id),
      student_name: String(r.student_name ?? ''),
      status: r.status,
      disciplineFlags: r.disciplineFlags ?? [],
      disciplineAdjust: r.disciplineAdjust ?? 0,
      disciplineNote: r.disciplineNote ?? '',
      disciplineScore: r.disciplineScore ?? 0
    });
  }

  let restored = 0;
  let queued = 0;

  for (const batch of groups.values()) {
    if (isOnline()) {
      try {
        await saveClassAttendance(batch);
        restored += 1;
        continue;
      } catch (err) {
        console.warn('[restore] online save failed, queueing', err);
      }
    }
    await enqueuePendingAttendance({
      id: buildPendingId(batch),
      ...batch,
      students: batch.students
    });
    queued += 1;
  }

  return { restored, queued };
}
