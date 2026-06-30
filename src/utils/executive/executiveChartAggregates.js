import {
  bucketExecutiveStatus,
  emptyExecutiveCounts,
  filterAttendanceRows,
  incrementExecutiveCount
} from './executiveAggregates.js';
import { recordsToAttendanceMap } from '../../services/attendanceService.js';
import { formatExecutiveClassLabel } from './executiveClassLabel.js';

/**
 * @typedef {object} ExecutiveChartsData
 * @property {Array<{ grade: string, presentPct: number }>} byGrade
 * @property {Array<{ status: string, count: number, pct: number }>} statusDistribution
 * @property {{ checked: number, pending: number, total: number }} roomCompletion
 * @property {Array<{ displayLabel: string, classKey: string, attendancePct: number }>} topRooms
 * @property {Array<{ displayLabel: string, classKey: string, attendancePct: number }>} attentionRooms
 */

/**
 * Count status buckets from saved attendance rows only (no unsubmitted students).
 * @param {Array<{ student_id: string, status?: string }>} rows
 */
export function summarizeSavedAttendanceStatuses(rows) {
  const byStudent = recordsToAttendanceMap(rows);
  const counts = emptyExecutiveCounts();

  for (const status of Object.values(byStudent)) {
    incrementExecutiveCount(bucketExecutiveStatus(status), counts);
  }

  const total = Object.keys(byStudent).length;
  return { counts, total };
}

/**
 * @param {Array<{ grade: string, attendancePct: number }>} gradeRows
 */
function buildGradeChart(gradeRows) {
  return gradeRows.map((row) => ({
    grade: row.grade,
    presentPct: Number(row.attendancePct) || 0
  }));
}

/**
 * @param {{ present: number, absent: number, leave: number, late: number }} counts
 * @param {number} total
 */
function buildStatusDistribution(counts, total) {
  if (!total) return [];

  const keys = ['present', 'absent', 'leave', 'late'];
  return keys
    .map((status) => {
      const count = counts[status] || 0;
      const pct = Math.round((count / total) * 1000) / 10;
      return { status, count, pct };
    })
    .filter((row) => row.count > 0);
}

/**
 * @param {import('./executiveCompletionAggregates.js').ExecutiveRoomCompletionState[]} roomStates
 * @param {Array<{ class?: string, student_id: string, status?: string }>} rows
 */
function buildRoomAttendanceRanking(roomStates, rows) {
  const submitted = roomStates.filter((state) => state.submitted);

  const rankings = submitted
    .map((state) => {
      const classRows = rows.filter((r) => String(r.class || '') === state.classKey);
      const byStudent = recordsToAttendanceMap(classRows);
      const statuses = Object.values(byStudent);
      if (!statuses.length) return null;

      let presentLike = 0;
      for (const status of statuses) {
        const bucket = bucketExecutiveStatus(status);
        if (bucket === 'present' || bucket === 'late') presentLike += 1;
      }

      return {
        classKey: state.classKey,
        displayLabel: state.displayLabel || formatExecutiveClassLabel(state.classKey),
        attendancePct: Math.round((presentLike / statuses.length) * 1000) / 10
      };
    })
    .filter(Boolean);

  const sorted = [...rankings].sort((a, b) => b.attendancePct - a.attendancePct);
  const topRooms = sorted.slice(0, 5);
  const attentionRooms = [...sorted].reverse().slice(0, 5);

  return { topRooms, attentionRooms };
}

/**
 * Build all chart payloads from an existing executive day context + bundle slices.
 * @param {{
 *   comparisonTable: Array<{ grade: string, attendancePct: number }>,
 *   completion: { status: { checkedRooms: number, pendingRooms: number, totalRooms: number } },
 *   roomStates: import('./executiveCompletionAggregates.js').ExecutiveRoomCompletionState[],
 *   rows: Array<object>,
 *   filters: { grade?: string, room?: string }
 * }} input
 * @returns {ExecutiveChartsData}
 */
export function buildExecutiveChartsData({
  comparisonTable,
  completion,
  roomStates,
  rows,
  filters
}) {
  const filteredRows = filterAttendanceRows(rows, filters);
  const { counts, total } = summarizeSavedAttendanceStatuses(filteredRows);
  const { topRooms, attentionRooms } = buildRoomAttendanceRanking(roomStates, filteredRows);

  return {
    byGrade: buildGradeChart(comparisonTable),
    statusDistribution: buildStatusDistribution(counts, total),
    roomCompletion: {
      checked: completion.status.checkedRooms,
      pending: completion.status.pendingRooms,
      total: completion.status.totalRooms
    },
    topRooms,
    attentionRooms
  };
}
