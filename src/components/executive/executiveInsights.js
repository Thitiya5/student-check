import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';

/**
 * @param {import('../../services/executive/executiveAttendanceService.js').ExecutiveAttendanceRate} insights
 * @param {{ loading?: boolean }} [opts]
 */
export function renderExecutiveInsights(insights, { loading = false } = {}) {
  const rate = loading ? '…' : `${insights.attendanceRate}%`;
  const best = loading ? '…' : insights.bestPerformingRoom;
  const attention = loading ? '…' : insights.roomNeedingAttention;

  return `<section class="exec-insights glass-card" aria-label="${escapeHtml(t('executive.insights.aria'))}">
    <h2 class="exec-section-title">${escapeHtml(t('executive.insights.title'))}</h2>
    <div class="exec-insights__grid">
      <article class="exec-insight-item">
        <span class="exec-insight-item__label">${escapeHtml(t('executive.insights.rate'))}</span>
        <span class="exec-insight-item__value">${escapeHtml(rate)}</span>
      </article>
      <article class="exec-insight-item exec-insight-item--positive">
        <span class="exec-insight-item__label">${escapeHtml(t('executive.insights.bestRoom'))}</span>
        <span class="exec-insight-item__value">${escapeHtml(best)}</span>
      </article>
      <article class="exec-insight-item exec-insight-item--alert">
        <span class="exec-insight-item__label">${escapeHtml(t('executive.insights.attentionRoom'))}</span>
        <span class="exec-insight-item__value">${escapeHtml(attention)}</span>
      </article>
    </div>
  </section>`;
}
