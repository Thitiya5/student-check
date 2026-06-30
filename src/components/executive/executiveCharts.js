import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';
import { hasSavedAttendanceToday } from '../../utils/executive/executiveEmptyState.js';

function chartAwaitingPlaceholder() {
  return `<p class="exec-chart-placeholder">
    <span class="exec-chart-placeholder__icon" aria-hidden="true">📊</span>
    <span class="exec-chart-placeholder__text">${escapeHtml(t('executive.empty.chartsPlaceholder'))}</span>
  </p>`;
}
/**
 * @param {import('../../utils/executive/executiveChartAggregates.js').ExecutiveChartsData|null|undefined} charts
 * @param {{ loading?: boolean }} [opts]
 */
export function renderExecutiveCharts(charts, { loading = false } = {}) {
  if (loading) {
    return `<section class="exec-charts" aria-label="${escapeHtml(t('executive.charts.aria'))}">
      <article class="exec-chart-card glass-card exec-chart-card--loading">
        <p class="exec-chart-empty">${escapeHtml(t('common.loading'))}</p>
      </article>
    </section>`;
  }

  if (!charts) {
    return `<section class="exec-charts" aria-label="${escapeHtml(t('executive.charts.aria'))}">
      <article class="exec-chart-card glass-card">
        ${chartAwaitingPlaceholder()}
      </article>
    </section>`;
  }

  const awaiting = !hasSavedAttendanceToday(charts);

  return `<section class="exec-charts" aria-label="${escapeHtml(t('executive.charts.aria'))}">
    ${renderGradeChart(charts.byGrade, awaiting)}
    ${renderStatusChart(charts.statusDistribution, awaiting)}
    ${renderRoomCompletionChart(charts.roomCompletion, awaiting)}
    ${renderTopAttentionChart(charts.topRooms, charts.attentionRooms, awaiting)}
  </section>`;
}

/**
 * @param {Array<{ grade: string, presentPct: number }>} rows
 * @param {boolean} [awaiting]
 */
function renderGradeChart(rows, awaiting = false) {
  if (awaiting) {
    return chartCard(t('executive.charts.byGrade'), chartAwaitingPlaceholder());
  }
  if (!rows.length) {
    return chartCard(t('executive.charts.byGrade'), `<p class="exec-chart-empty">${escapeHtml(t('executive.charts.empty'))}</p>`);
  }

  const maxPct = Math.max(...rows.map((r) => r.presentPct), 1);
  const bars = rows
    .map((row) => {
      const h = Math.max(8, Math.round((row.presentPct / maxPct) * 100));
      return `<div class="exec-chart-col">
        <div class="exec-chart-col__bar-wrap">
          <div class="exec-chart-col__bar" style="height:${h}%" title="${row.presentPct}%">
            <span class="exec-chart-col__val">${escapeHtml(String(row.presentPct))}%</span>
          </div>
        </div>
        <span class="exec-chart-col__label">${escapeHtml(row.grade)}</span>
      </div>`;
    })
    .join('');

  return chartCard(t('executive.charts.byGrade'), `<div class="exec-chart-cols">${bars}</div>`);
}

/**
 * @param {Array<{ status: string, count: number, pct: number }>} rows
 * @param {boolean} [awaiting]
 */
function renderStatusChart(rows, awaiting = false) {
  if (awaiting) {
    return chartCard(t('executive.charts.distribution'), chartAwaitingPlaceholder());
  }
  if (!rows.length) {
    return chartCard(
      t('executive.charts.distribution'),
      `<p class="exec-chart-empty">${escapeHtml(t('executive.charts.emptySaved'))}</p>`
    );
  }

  const maxPct = Math.max(...rows.map((r) => r.pct), 1);
  const body = rows
    .map((row) => {
      const w = Math.max(4, Math.round((row.pct / maxPct) * 100));
      return `<div class="exec-status-row">
        <span class="exec-status-row__label">${escapeHtml(t(`executive.status.${row.status}`))}</span>
        <div class="exec-status-row__track">
          <div class="exec-status-row__fill exec-status-row__fill--${escapeHtml(row.status)}" style="width:${w}%"></div>
        </div>
        <span class="exec-status-row__count">${escapeHtml(String(row.count))}</span>
        <span class="exec-status-row__pct">${escapeHtml(String(row.pct))}%</span>
      </div>`;
    })
    .join('');

  return chartCard(t('executive.charts.distribution'), `<div class="exec-status-list">${body}</div>`);
}

/**
 * @param {{ checked: number, pending: number, total: number }} roomCompletion
 * @param {boolean} [awaiting]
 */
function renderRoomCompletionChart(roomCompletion, awaiting = false) {
  if (awaiting) {
    return chartCard(t('executive.charts.roomCompletion'), chartAwaitingPlaceholder());
  }
  const { checked, pending, total } = roomCompletion;
  if (!total) {
    return chartCard(
      t('executive.charts.roomCompletion'),
      `<p class="exec-chart-empty">${escapeHtml(t('executive.charts.emptyRooms'))}</p>`
    );
  }

  const checkedPct = Math.round((checked / total) * 1000) / 10;
  const pendingPct = Math.max(0, 100 - checkedPct);

  return chartCard(
    t('executive.charts.roomCompletion'),
    `<div class="exec-room-donut-wrap">
      <div class="exec-donut" style="--checked-pct:${checkedPct}" role="img" aria-label="${escapeHtml(t('executive.charts.roomCompletionAria', { checked, total }))}">
        <div class="exec-donut__hole">
          <span class="exec-donut__value">${escapeHtml(String(checkedPct))}%</span>
        </div>
      </div>
      <ul class="exec-donut-legend">
        <li><span class="exec-donut-legend__swatch exec-donut-legend__swatch--checked"></span>${escapeHtml(t('executive.charts.checkedRooms', { count: checked }))}</li>
        <li><span class="exec-donut-legend__swatch exec-donut-legend__swatch--pending"></span>${escapeHtml(t('executive.charts.pendingRooms', { count: pending }))}</li>
        <li class="exec-donut-legend__meta">${escapeHtml(t('executive.charts.pendingPct', { pct: pendingPct }))}</li>
      </ul>
    </div>`
  );
}

/**
 * @param {Array<{ displayLabel: string, attendancePct: number }>} topRooms
 * @param {Array<{ displayLabel: string, attendancePct: number }>} attentionRooms
 * @param {boolean} [awaiting]
 */
function renderTopAttentionChart(topRooms, attentionRooms, awaiting = false) {
  if (awaiting) {
    return chartCard(t('executive.charts.topAttention'), chartAwaitingPlaceholder(), true);
  }
  if (!topRooms.length && !attentionRooms.length) {
    return chartCard(
      t('executive.charts.topAttention'),
      `<p class="exec-chart-empty">${escapeHtml(t('executive.charts.emptySubmitted'))}</p>`,
      true
    );
  }

  const topBlock = renderRoomRankList(
    t('executive.charts.topRooms'),
    topRooms,
    'exec-room-rank--top'
  );
  const attentionBlock = renderRoomRankList(
    t('executive.charts.attentionRooms'),
    attentionRooms,
    'exec-room-rank--attention'
  );

  return chartCard(
    t('executive.charts.topAttention'),
    `<div class="exec-room-rank-grid">${topBlock}${attentionBlock}</div>`,
    true
  );
}

/**
 * @param {string} title
 * @param {Array<{ displayLabel: string, attendancePct: number }>} rooms
 * @param {string} variant
 */
function renderRoomRankList(title, rooms, variant) {
  if (!rooms.length) {
    return `<div class="exec-room-rank ${variant}">
      <h4 class="exec-room-rank__title">${escapeHtml(title)}</h4>
      <p class="exec-chart-empty exec-chart-empty--inline">${escapeHtml(t('executive.charts.empty'))}</p>
    </div>`;
  }

  const rows = rooms
    .map((room) => {
      const w = Math.max(6, Math.min(100, room.attendancePct));
      return `<div class="exec-room-rank-row">
        <span class="exec-room-rank-row__label">${escapeHtml(room.displayLabel)}</span>
        <div class="exec-room-rank-row__track">
          <div class="exec-room-rank-row__fill" style="width:${w}%"></div>
        </div>
        <span class="exec-room-rank-row__pct">${escapeHtml(String(room.attendancePct))}%</span>
      </div>`;
    })
    .join('');

  return `<div class="exec-room-rank ${variant}">
    <h4 class="exec-room-rank__title">${escapeHtml(title)}</h4>
    <div class="exec-room-rank__list">${rows}</div>
  </div>`;
}

/**
 * @param {string} title
 * @param {string} body
 * @param {boolean} [wide]
 */
function chartCard(title, body, wide = false) {
  return `<article class="exec-chart-card glass-card${wide ? ' exec-chart-card--wide' : ''}">
    <h3 class="exec-section-title">${escapeHtml(title)}</h3>
    ${body}
  </article>`;
}
