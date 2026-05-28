import { toDateKey } from './dateIso.js';

/**
 * Calculate attendance summary grouped by level, room, and date
 * @param {Array<{student_id, first_name, last_name, level, room}>} students
 * @param {Record<string, string>} attendance - student_id → status
 * @returns {Object} summary by level/room/date
 */
export function calculateSummaryByClass(students, attendance) {
  /** @type {Record<string, Record<string, {present: number, late: number, absent: number, leave: number, sick: number, total: number}>} */
  const summary = {};

  students.forEach((student) => {
    const key = `${student.level}/${student.room}`;
    if (!summary[key]) {
      summary[key] = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, total: 0 };
    }
    const status = attendance[student.student_id] || 'present';
    if (status in summary[key]) {
      summary[key][status]++;
    }
    summary[key].total++;
  });

  return summary;
}

/**
 * Calculate weekly summary for a specific level/room
 * @param {Array<{date, student_id, status, type, term}>} attendanceRecords - from Attendance sheet
 * @param {string} level
 * @param {string} room
 * @returns {Record<string, {present: number, late: number, absent: number, leave: number, sick: number, total: number}>}
 */
export function calculateWeeklySummary(attendanceRecords, level, room) {
  const weekly = {};

  attendanceRecords.forEach((record) => {
    if (record.type !== level || record.term !== room) return;
    const dateKey = record.date;
    if (!weekly[dateKey]) {
      weekly[dateKey] = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, total: 0 };
    }
    const status = record.status?.toLowerCase() || 'present';
    if (status in weekly[dateKey]) {
      weekly[dateKey][status]++;
    }
    weekly[dateKey].total++;
  });

  return weekly;
}

/**
 * Calculate term summary (by semester/year)
 * @param {Array<{date, student_id, status, type, term}>} attendanceRecords
 * @param {string} level
 * @param {string} room
 * @param {string} [termYear] - e.g. '2569/1' (year/semester) - if not provided, use current
 * @returns {Object} summary with present %, late %, absent %, etc.
 */
export function calculateTermSummary(attendanceRecords, level, room, termYear) {
  const summary = {};

  attendanceRecords.forEach((record) => {
    if (record.type !== level || record.term !== room) return;
    const studentId = record.student_id;
    if (!summary[studentId]) {
      summary[studentId] = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, total: 0 };
    }
    const status = record.status?.toLowerCase() || 'present';
    if (status in summary[studentId]) {
      summary[studentId][status]++;
    }
    summary[studentId].total++;
  });

  return summary;
}

/**
 * Calculate percentage present for each student
 * @param {Object} summary - result from calculateTermSummary
 * @returns {Object} summary with percentPresent added
 */
export function addPercentPresent(summary) {
  const result = {};
  for (const [studentId, counts] of Object.entries(summary)) {
    const presentPercent = counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : 0;
    result[studentId] = { ...counts, percentPresent };
  }
  return result;
}

/**
 * Get current academic term (ปีการศึกษา)
 * @returns {string} e.g., '2569/1' (year/semester)
 */
export function getCurrentTerm() {
  const now = new Date();
  const year = now.getFullYear() + 543; // Thai Buddhist year
  const month = now.getMonth() + 1;
  const semester = month <= 5 ? 1 : 2; // Semester 1: Jan-May, Semester 2: June-Dec (typical Thai school)
  return `${year}/${semester}`;
}

/**
 * Group attendance records by level/room/date
 * @param {Array<{date, student_id, status, type, term, timestamp}>} records
 * @returns {Record<string, Record<string, Array>>} grouped[level/room][date] = [records...]
 */
export function groupRecordsByLevelRoomDate(records) {
  const grouped = {};
  records.forEach((record) => {
    const key = `${record.type}/${record.term}`;
    if (!grouped[key]) grouped[key] = {};
    const dateKey = record.date;
    if (!grouped[key][dateKey]) grouped[key][dateKey] = [];
    grouped[key][dateKey].push(record);
  });
  return grouped;
}
