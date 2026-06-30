import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';

/**
 * @param {import('../../services/executive/mockExecutiveData.js').ExecutiveGradeRow[]} rows
 */
export function renderExecutiveCompareTable(rows) {
  const lbl = {
    grade: t('executive.table.grade'),
    present: t('executive.summary.present'),
    absent: t('executive.summary.absent'),
    leave: t('executive.summary.leave'),
    late: t('executive.summary.late'),
    pct: t('executive.table.attendancePct')
  };

  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.grade)}</td>
        <td class="exec-table__num" data-label="${escapeHtml(lbl.present)}">${escapeHtml(String(r.present))}</td>
        <td class="exec-table__num" data-label="${escapeHtml(lbl.absent)}">${escapeHtml(String(r.absent))}</td>
        <td class="exec-table__num" data-label="${escapeHtml(lbl.leave)}">${escapeHtml(String(r.leave))}</td>
        <td class="exec-table__num" data-label="${escapeHtml(lbl.late)}">${escapeHtml(String(r.late))}</td>
        <td class="exec-table__num exec-table__pct" data-label="${escapeHtml(lbl.pct)}">${escapeHtml(String(r.attendancePct))}%</td>
      </tr>`
    )
    .join('');

  return `<section class="exec-compare glass-card" aria-label="${escapeHtml(t('executive.table.aria'))}">
    <h2 class="exec-section-title">${escapeHtml(t('executive.table.title'))}</h2>
    <div class="exec-table-wrap exec-table-wrap--cards">
      <table class="exec-table exec-table--cards">
        <thead>
          <tr>
            <th>${escapeHtml(lbl.grade)}</th>
            <th>${escapeHtml(lbl.present)}</th>
            <th>${escapeHtml(lbl.absent)}</th>
            <th>${escapeHtml(lbl.leave)}</th>
            <th>${escapeHtml(lbl.late)}</th>
            <th>${escapeHtml(lbl.pct)}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}
