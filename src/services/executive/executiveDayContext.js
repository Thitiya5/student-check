/**
 * Shared executive day context — single roster + Firestore read per refresh.
 * Cached by date (memory + sessionStorage, 3 min TTL) unless forceRefresh.
 */
import { queryAttendanceByDateSchoolWide } from '../attendanceService.js';
import { fetchAllStudents } from '../studentsService.js';
import { getTodayDate } from '../../utils/dateIso.js';
import {
  filterAttendanceRows,
  filterRoster,
  latestAttendanceTimestamp
} from '../../utils/executive/executiveAggregates.js';
import { buildRoomCompletionStates } from '../../utils/executive/executiveCompletionAggregates.js';
import { fetchSchoolOverviewWithCache } from './schoolOverviewCache.js';

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
 * School overview is read-only for all logged-in teachers and admins.
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 */
export function assertExecutiveReadAccess(session) {
  if (!session) {
    const err = new Error('School overview requires login');
    err.code = 'executive-denied';
    throw err;
  }
}

/**
 * Build day context from a cached school overview entry (no network).
 * @param {import('./schoolOverviewCache.js').SchoolOverviewCacheEntry} entry
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @returns {ExecutiveDayContext}
 */
export function buildExecutiveDayContextFromCacheEntry(entry, opts = {}) {
  const date = String(opts.date || getTodayDate());
  const filters = {
    grade: String(opts.grade || '').trim(),
    room: String(opts.room || '').trim()
  };
  const roster = Array.isArray(entry.roster) ? entry.roster : [];
  const allRows = Array.isArray(entry.allRows) ? entry.allRows : [];
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

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string, forceRefresh?: boolean }} [opts]
 * @returns {Promise<ExecutiveDayContext>}
 */
export async function fetchExecutiveDayContext(session, opts = {}) {
  assertExecutiveReadAccess(session);
  const date = String(opts.date || getTodayDate());
  const filters = {
    grade: String(opts.grade || '').trim(),
    room: String(opts.room || '').trim()
  };
  const forceRefresh = Boolean(opts.forceRefresh);

  const cachedPayload = await fetchSchoolOverviewWithCache(
    date,
    async () => {
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

      const allRows = await queryAttendanceByDateSchoolWide(date);
      return { roster, allRows };
    },
    { forceRefresh }
  );

  const roster = cachedPayload.roster;
  const allRows = cachedPayload.allRows;

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
