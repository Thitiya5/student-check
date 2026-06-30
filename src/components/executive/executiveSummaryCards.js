import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';
import { hasSavedAttendanceToday } from '../../utils/executive/executiveEmptyState.js';

/**
 * @param {import('../../services/executive/mockExecutiveData.js').ExecutiveSummary} summary
 * @param {{ charts?: import('../../utils/executive/executiveChartAggregates.js').ExecutiveChartsData|null }} [opts]
 */
export function renderExecutiveSummaryCards(summary, { charts = null } = {}) {
  const awaiting = !hasSavedAttendanceToday(charts);
  const awaitingLabel = t('executive.empty.awaitingData');

  const cards = [
    { key: 'total', label: t('executive.summary.totalStudents'), value: summary.totalStudents, variant: '' },
    { key: 'present', label: t('executive.summary.present'), value: summary.present, variant: 'exec-kpi--present' },
    { key: 'absent', label: t('executive.summary.absent'), value: summary.absent, variant: 'exec-kpi--absent' },
    { key: 'leave', label: t('executive.summary.leave'), value: summary.leave, variant: 'exec-kpi--leave' },
    { key: 'late', label: t('executive.summary.late'), value: summary.late, variant: 'exec-kpi--late' }
  ];

  return `<section class="exec-kpi-grid" aria-label="${escapeHtml(t('executive.summary.aria'))}">
    ${cards
      .map((c) => {
        const display =
          c.key === 'total' || !awaiting ? String(c.value) : awaitingLabel;
        const muted = c.key !== 'total' && awaiting ? ' exec-kpi__value--awaiting' : '';
        return `<article class="exec-kpi glass-card ${c.variant}">
      <span class="exec-kpi__label">${escapeHtml(c.label)}</span>
      <span class="exec-kpi__value${muted}">${escapeHtml(display)}</span>
    </article>`;
      })
      .join('')}
  </section>`;
}