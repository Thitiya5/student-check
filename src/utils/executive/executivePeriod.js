/**
 * Sprint 1 — period label helpers for executive header (mock / UI).
 */

import { t } from '../../i18n/index.js';

/**
 * @param {import('../../hooks/executive/useExecutiveFilters.js').ExecutiveFilters} filters
 */
export function formatExecutivePeriodLabel(filters) {
  const parts = [];
  if (filters.academicYear) {
    parts.push(t('executive.period.academicYear', { year: filters.academicYear }));
  }
  if (filters.semester) {
    parts.push(t('executive.period.semester', { term: filters.semester }));
  }
  if (filters.month) {
    parts.push(filters.month);
  }
  if (filters.date) {
    parts.push(filters.date);
  }
  return parts.filter(Boolean).join(' · ') || '—';
}
