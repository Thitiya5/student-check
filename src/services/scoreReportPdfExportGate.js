/**
 * Semester score summary PDF export gate — no html2pdf / jsPDF imports.
 */
import { canViewPointsReportSession } from './teacherAuth.js';

/**
 * @param {import('./studentScoreService.js').ReturnType<import('./studentScoreService.js').buildStudentScoreReport>[]} reports
 * @param {import('./teacherAuth.js').TeacherAuthSession|null|undefined} session
 */
export function canExportScoreReportPdf(reports, session) {
  if (!canViewPointsReportSession(session)) return false;
  return Array.isArray(reports) && reports.length > 0;
}
