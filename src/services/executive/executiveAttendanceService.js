/**
 * Sprint 2 — Executive analytics (Firestore read-only via attendanceService).
 * Does not modify production services or Firestore schema.
 */
import { getTodayDate } from '../../utils/dateIso.js';
import {
  distinctGradeLevels,
  summarizeExecutiveByGrade,
  summarizeExecutiveByRoom,
  summarizeExecutiveDay
} from '../../utils/executive/executiveAggregates.js';
import { fetchExecutiveDayContext } from './executiveDayContext.js';
import {
  deriveOperationalStatus,
  findLastCompletedRoom,
  listPendingRooms,
  summarizeRoomCompletion
} from '../../utils/executive/executiveCompletionAggregates.js';
import { buildExecutiveChartsData } from '../../utils/executive/executiveChartAggregates.js';

/**
 * @typedef {object} ExecutiveTodaySummary
 * @property {string} date
 * @property {number} totalStudents
 * @property {number} present
 * @property {number} absent
 * @property {number} leave
 * @property {number} late
 * @property {number} attendancePct
 * @property {string|null} lastUpdated
 */

/**
 * @typedef {object} ExecutiveGradeRow
 * @property {string} grade
 * @property {number} present
 * @property {number} absent
 * @property {number} leave
 * @property {number} late
 * @property {number} attendancePct
 */

/**
 * @typedef {object} ExecutiveAttendanceRate
 * @property {number} attendanceRate
 * @property {string} bestPerformingRoom
 * @property {string} roomNeedingAttention
 * @property {string|null} lastUpdated
 */

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @returns {Promise<ExecutiveTodaySummary>}
 */
export async function getTodaySummary(session, opts = {}) {
  const ctx = await fetchExecutiveDayContext(session, opts);
  const summary = summarizeExecutiveDay(ctx.roster, ctx.rows, ctx.filters);

  return {
    date: ctx.date,
    totalStudents: summary.totalStudents,
    present: summary.present,
    absent: summary.absent,
    leave: summary.leave,
    late: summary.late,
    attendancePct: summary.attendancePct,
    lastUpdated: ctx.lastUpdated
  };
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 */
export async function getGradeSummary(session, opts = {}) {
  const ctx = await fetchExecutiveDayContext(session, opts);
  const grades = ctx.filters.grade
    ? [ctx.filters.grade]
    : distinctGradeLevels(ctx.roster);

  const gradeRows = summarizeExecutiveByGrade(ctx.roster, ctx.rows, grades);

  return {
    date: ctx.date,
    grades: gradeRows,
    lastUpdated: ctx.lastUpdated
  };
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @returns {Promise<ExecutiveAttendanceRate>}
 */
export async function getAttendanceRate(session, opts = {}) {
  const ctx = await fetchExecutiveDayContext(session, opts);
  const summary = summarizeExecutiveDay(ctx.roster, ctx.rows, ctx.filters);
  const roomRows = summarizeExecutiveByRoom(ctx.roster, ctx.rows).filter(
    (room) => room.totalStudents > 0
  );

  const scopedRooms = ctx.filters.grade
    ? roomRows.filter((room) => room.level === ctx.filters.grade)
    : roomRows;

  let bestPerformingRoom = '—';
  let roomNeedingAttention = '—';

  if (scopedRooms.length) {
    const sorted = [...scopedRooms].sort((a, b) => b.attendancePct - a.attendancePct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    bestPerformingRoom = best.classKey;
    roomNeedingAttention = worst.classKey;
    if (scopedRooms.length === 1) {
      roomNeedingAttention = '—';
    }
  }

  return {
    attendanceRate: summary.attendancePct,
    bestPerformingRoom,
    roomNeedingAttention,
    lastUpdated: ctx.lastUpdated
  };
}

/**
 * Single-load bundle for executive dashboard (one roster + one Firestore query).
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 */
export async function getExecutiveDashboardBundle(session, opts = {}) {
  const ctx = await fetchExecutiveDayContext(session, opts);
  const summary = summarizeExecutiveDay(ctx.roster, ctx.rows, ctx.filters);
  const grades = ctx.filters.grade
    ? [ctx.filters.grade]
    : distinctGradeLevels(ctx.roster);
  const gradeRows = summarizeExecutiveByGrade(ctx.roster, ctx.rows, grades);
  const roomRows = summarizeExecutiveByRoom(ctx.roster, ctx.rows).filter(
    (room) => room.totalStudents > 0
  );
  const scopedRooms = ctx.filters.grade
    ? roomRows.filter((room) => room.level === ctx.filters.grade)
    : roomRows;

  let bestPerformingRoom = '—';
  let roomNeedingAttention = '—';
  if (scopedRooms.length) {
    const sorted = [...scopedRooms].sort((a, b) => b.attendancePct - a.attendancePct);
    bestPerformingRoom = sorted[0].classKey;
    roomNeedingAttention = sorted[sorted.length - 1].classKey;
    if (scopedRooms.length === 1) roomNeedingAttention = '—';
  }

  const completionStatus = summarizeRoomCompletion(ctx.roomStates);
  const completion = {
    status: completionStatus,
    pendingRooms: listPendingRooms(ctx.roomStates),
    lastCompleted: findLastCompletedRoom(ctx.roomStates),
    operationalStatus: deriveOperationalStatus(completionStatus)
  };

  const comparisonTable = gradeRows;
  const charts = buildExecutiveChartsData({
    comparisonTable,
    completion,
    roomStates: ctx.roomStates,
    rows: ctx.rows,
    filters: ctx.filters
  });

  return {
    summary: {
      totalStudents: summary.totalStudents,
      present: summary.present,
      absent: summary.absent,
      leave: summary.leave,
      late: summary.late
    },
    comparisonTable,
    insights: {
      attendanceRate: summary.attendancePct,
      bestPerformingRoom,
      roomNeedingAttention,
      lastUpdated: ctx.lastUpdated
    },
    completion,
    charts,
    lastUpdated: ctx.lastUpdated,
    date: ctx.date
  };
}

export { getCompletionStatus, getPendingRooms, getLastCompletedRoom } from './executiveCompletionService.js';
