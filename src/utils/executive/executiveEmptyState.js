/**
 * Sprint 4.1 — Executive empty-state display helpers (UI only, no business logic).
 */

/**
 * @param {import('./executiveChartAggregates.js').ExecutiveChartsData|null|undefined} charts
 */
export function hasSavedAttendanceToday(charts) {
  const rows = charts?.statusDistribution ?? [];
  return rows.length > 0 && rows.some((row) => (row.count ?? 0) > 0);
}

/**
 * @param {import('../../services/executive/executiveCompletionService.js').ExecutiveCompletionBundle|null|undefined} completion
 */
export function hasSubmittedRoomToday(completion) {
  return (completion?.status?.checkedRooms ?? 0) > 0;
}

/**
 * @param {import('../../services/executive/executiveCompletionService.js').ExecutiveCompletionBundle|null|undefined} completion
 * @param {import('./executiveChartAggregates.js').ExecutiveChartsData|null|undefined} charts
 */
export function isExecutiveAttendanceNotStarted(completion, charts) {
  return !hasSubmittedRoomToday(completion) && !hasSavedAttendanceToday(charts);
}
