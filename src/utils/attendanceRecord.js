/**
 * Attendance row helpers — matches Google Sheet columns:
 * DATE, STUDENT_ID, STATUS, TYPE, TERM, TIMESTAMP, unique_key
 *
 * TYPE = ชั้น (LEVEL จาก Students)
 * TERM = ห้อง (ROOM จาก Students)
 */

/**
 * @param {string} date yyyy-MM-dd
 * @param {string} studentId
 * @param {string} type
 * @param {string} term
 */
export function buildAttendanceUniqueKey(date, studentId, type, term) {
  return [date, studentId, type, term].join('|');
}

/**
 * @param {object} opts
 * @param {string} opts.date
 * @param {string} opts.studentId
 * @param {string} opts.status
 * @param {string} opts.type
 * @param {string} opts.term
 * @param {Date} [opts.timestamp]
 */
export function buildAttendanceRecord({ date, studentId, status, type, term, timestamp = new Date(), first_name = '', last_name = '', checked_by = '' }) {
   const unique_key = buildAttendanceUniqueKey(date, studentId, type, term);
   return {
     student_id: String(studentId),
     first_name: String(first_name),
     last_name: String(last_name),
     full_name: `${String(first_name).trim()} ${String(last_name).trim()}`.trim(),
     status: String(status || 'present').toLowerCase(),
     type: String(type),
     term: String(term),
     timestamp: timestamp.toISOString(),
     checked_by: String(checked_by),
    unique_key
  };
}

/**
 * @param {string} date
 * @param {string} type
 * @param {string} term
 * @param {Array<{ student_id: string, level?: string, room?: string }>} students
 * @param {Record<string, string>} attendance
 */
export function buildAttendanceRecordsForClass(date, type, term, students, attendance) {
  const classType = type;
  const classTerm = term;
  return students.map((s) => {
    const sid = s.student_id;
    const st = attendance[sid] || 'present';
    return buildAttendanceRecord({
      date,
      studentId: sid,
       first_name: s.first_name || '',
       last_name: s.last_name || '',
       status: st,
       type: classType || s.level || '',
       term: classTerm || s.room || '',
       timestamp: new Date(),
       checked_by: ''
    });
  });
}
