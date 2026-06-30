/**
 * Shared executive day context — single roster + Firestore read per refresh.
 */
import { queryAttendanceByDateForSession } from '../attendanceService.js';
import { fetchAllStudents } from '../studentsService.js';
import { isAdminSession } from '../teacherAuth.js';
import { getTodayDate } from '../../utils/dateIso.js';
import {
  filterAttendanceRows,
  filterRoster,
  latestAttendanceTimestamp
} from '../../utils/executive/executiveAggregates.js';
import { buildRoomCompletionStates } from '../../utils/executive/executiveCompletionAggregates.js';

/**
 * @typedef {object} ExecutiveDayContext
 * @property {string} date
 * @property {{ grade: string, room: string }} filters
 * @property {Array<object>} roster
 * @property {Array<object>} rows
 * @property {Array<object>} filteredRoster
 * @property {string|null} lastUpdated
 * @property {import('../../utils/executive/executiveCompletionAggregates.js').ExecutiveRoomCompletionState[]} roomStates
 */

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 */
export function assertExecutiveReadAccess(session) {
  if (!isAdminSession(session)) {
    const err = new Error('Executive dashboard requires admin access');
    err.code = 'executive-denied';
    throw err;
  }
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @returns {Promise<ExecutiveDayContext>}
 */
export async function fetchExecutiveDayContext(session, opts = {}) {
  assertExecutiveReadAccess(session);
  const date = String(opts.date || getTodayDate());
  const filters = {
    grade: String(opts.grade || '').trim(),
    room: String(opts.room || '').trim()
  };

  let roster;
  try {
    roster = await fetchAllStudents();
  } catch (err) {
    const rosterErr = new Error(
      err instanceof Error ? err.message : 'ไม่สามารถโหลดรายชื่อนักเรียนได้'
    );
    rosterErr.code = 'executive-roster-failed';
    throw rosterErr;
  }

  if (!Array.isArray(roster)) {
    const rosterErr = new Error('ไม่สามารถโหลดรายชื่อนักเรียนได้');
    rosterErr.code = 'executive-roster-failed';
    throw rosterErr;
  }

  const allRows = await queryAttendanceByDateForSession(session, date);

  const rows = filterAttendanceRows(allRows, filters);
  const filteredRoster = filterRoster(roster, filters);
  const roomStates = buildRoomCompletionStates(roster, allRows, filters);

  return {
    date,
    filters,
    roster,
    rows,
    filteredRoster,
    lastUpdated: latestAttendanceTimestamp(rows),
    roomStates
  };
}
