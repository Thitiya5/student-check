/**
 * Discipline report PDF export gate — admin only; no html2pdf / jsPDF imports.
 */

import { isAdminSession } from '../teacherAuth.js';

/**
 * @param {object|null|undefined} detail
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 */
export function canExportDisciplineReportPdf(detail, session) {
  if (!isAdminSession(session)) return false;
  if (!detail?.classKey || !detail?.inspectionDate) return false;
  if (!Array.isArray(detail.students)) return false;
  return true;
}
