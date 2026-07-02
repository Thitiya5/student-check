/**
 * Lightweight PDF export gate — admin only; no html2pdf / jsPDF imports.
 */

import { isAdminSession } from '../teacherAuth.js';

/**
 * @param {object|null|undefined} data
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} [session]
 */
export function canExportExecutivePdf(data, session) {
  if (!isAdminSession(session)) return false;
  if (!data || data.error) return false;
  if (!data.summary || !data.charts || !data.completion || !data.insights) return false;
  if (!Array.isArray(data.comparisonTable)) return false;
  return true;
}
