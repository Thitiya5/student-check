import { escapeHtml } from '../utils/html.js';
import { statusLabel, t } from '../i18n/index.js';
import { summarizeAttendance } from '../services/attendanceService.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import {
  summarizeDayBuckets,
  summarizeWeekBuckets,
  summarizeMonthBuckets,
  buildStudentPeriodReports,
  averageBucketPercent,
  formatDateRangeTh,
  formatDayLabelTh
} from '../utils/reportAggregations.js';
import { enumerateDateKeys } from '../utils/dateIso.js';

/**
 * @param {{ percent?: number, checked?: number, present?: number, late?: number, absent?: number, sick?: number, errand?: number, activity?: number }} summary
 */
function renderStatGrid(summary) {
  const items = [
    { label: t('reports.attendancePercent'), value: `${summary.percent ?? 0}%`, highlight: true },
    { label: t('reports.total'), value: String(summary.checked ?? 0) },
    { label: t('status.present'), value: String(summary.present ?? 0) },
    { label: t('status.late'), value: String(summary.late ?? 0) },
    { label: t('status.absent'), value: String(summary.absent ?? 0) },
    { label: t('status.sick'), value: String(summary.sick ?? 0) }
  ];
  return `<div class="report-stat-grid">${items
    .map(
      (item) => `<div class="report-stat${item.highlight ? ' report-stat--highlight' : ''}">
        <span class="report-stat__label">${escapeHtml(item.label)}</span>
        <strong class="report-stat__value">${escapeHtml(item.value)}</strong>
      </div>`
    )
    .join('')}</div>`;
}

/**
 * @param {{ label: string, subLabel?: string, summary?: { percent?: number }, hasData?: boolean }[]} buckets
 * @param {{ scroll?: boolean }} [opts]
 */
function renderPercentColumns(buckets, opts = {}) {
  const scroll = opts.scroll === true;
  const max = Math.max(...buckets.map((b) => b.summary?.percent ?? 0), 1);
  const cols = buckets
    .map((b) => {
      const pct = b.summary?.percent ?? 0;
      const h = Math.max(4, Math.round((pct / max) * 100));
      const empty = !b.hasData;
      return `<div class="chart-col">
        <div class="chart-col__bar-wrap">
          <div class="chart-col__bar chart-col__bar--present" style="height:${empty ? '10%' : `${h}%`}" title="${pct}%">
            ${empty ? '' : `<span class="chart-col__val">${pct}</span>`}
          </div>
        </div>
        <span class="chart-col__label">${escapeHtml(b.label)}</span>
        ${b.subLabel ? `<span class="chart-col__sub">${escapeHtml(b.subLabel)}</span>` : ''}
      </div>`;
    })
    .join('');
  const cls = scroll ? 'chart-columns chart-columns--scroll' : 'chart-columns';
  return `<div class="${cls}">${cols}</div>`;
}

/**
 * @param {{ key: string, label: string, subLabel?: string, summary: object, hasData: boolean }[]} buckets
 */
function renderBucketTable(buckets) {
  const head = `<tr>
    <th>${escapeHtml(t('reports.tablePeriod'))}</th>
    <th>${escapeHtml(t('reports.tableChecked'))}</th>
    <th>${escapeHtml(t('status.present'))}</th>
    <th>${escapeHtml(t('status.late'))}</th>
    <th>${escapeHtml(t('status.absent'))}</th>
    <th>${escapeHtml(t('reports.attendancePercent'))}</th>
  </tr>`;
  const body = buckets
    .map((b) => {
      const s = b.summary;
      const muted = b.hasData ? '' : ' report-table__row--muted';
      return `<tr class="${muted}">
        <td>${escapeHtml(b.label)}${b.subLabel ? `<br/><span class="report-table__sub">${escapeHtml(b.subLabel)}</span>` : ''}</td>
        <td>${b.hasData ? s.checked : '—'}</td>
        <td>${b.hasData ? s.present : '—'}</td>
        <td>${b.hasData ? s.late : '—'}</td>
        <td>${b.hasData ? s.absent : '—'}</td>
        <td><strong>${b.hasData ? `${s.percent}%` : '—'}</strong></td>
      </tr>`;
    })
    .join('');
  return `<section class="glass-card report-table-card">
    <div class="report-table-wrap">
      <table class="report-table">${head}${body}</table>
    </div>
  </section>`;
}

function renderPeriodBanner(title) {
  return `<section class="report-period-banner glass-card">
    <h3 class="report-period-banner__title">${escapeHtml(title)}</h3>
  </section>`;
}

/** สรุปรายวันแบบกระชับ — แถวเดียว */
function renderDailyInlineStats(summary) {
  const chips = [
    { label: t('reports.attendancePercent'), value: `${summary.percent ?? 0}%`, cls: 'report-chip--ok' },
    { label: t('status.present'), value: String(summary.present ?? 0), cls: '' },
    { label: t('status.late'), value: String(summary.late ?? 0), cls: summary.late ? 'report-chip--warn' : '' },
    { label: t('status.absent'), value: String(summary.absent ?? 0), cls: summary.absent ? 'report-chip--bad' : '' },
    { label: t('status.sick'), value: String(summary.sick ?? 0), cls: '' },
    { label: t('status.errand'), value: String(summary.errand ?? 0), cls: '' },
    { label: t('status.activity'), value: String(summary.activity ?? 0), cls: '' }
  ];
  return `<div class="report-daily-stats">${chips
    .map(
      (c) =>
        `<span class="report-chip ${c.cls}"><span class="report-chip__label">${escapeHtml(c.label)}</span><strong class="report-chip__value">${escapeHtml(c.value)}</strong></span>`
    )
    .join('')}</div>`;
}

function renderDailyHeader(title, summary) {
  return `<section class="report-daily-header glass-card">
    <div class="report-daily-header__top">
      <h3 class="report-daily-header__title">${escapeHtml(title)}</h3>
      <span class="report-daily-header__pct">${summary.percent ?? 0}%</span>
    </div>
    ${renderDailyInlineStats(summary)}
  </section>`;
}

const DAILY_STATUS_SORT = {
  absent: 0,
  late: 1,
  sick: 2,
  errand: 3,
  activity: 4,
  leave: 5,
  present: 6
};

/**
 * @param {object[]} rows
 */
function dedupeDailyRows(rows) {
  const sorted = [...rows].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  );
  /** @type {Map<string, object>} */
  const byStudent = new Map();
  for (const row of sorted) {
    const sid = String(row.student_id || '').trim();
    const name = String(row.student_name || '').trim();
    const classKey = String(row.class || '').trim();
    const key = sid || (name ? `${classKey}::${name}` : '');
    if (!key) continue;
    byStudent.set(key, row);
  }
  return [...byStudent.values()];
}

function sortDailyRows(rows) {
  return [...rows].sort((a, b) => {
    const sa = DAILY_STATUS_SORT[normalizeAttendanceStatus(a.status)] ?? 9;
    const sb = DAILY_STATUS_SORT[normalizeAttendanceStatus(b.status)] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.student_name || '').localeCompare(String(b.student_name || ''), 'th');
  });
}

/**
 * @param {object[]} rows
 * @param {string} classKey
 */
function renderDailyRosterCompact(rows, classKey) {
  const unique = sortDailyRows(dedupeDailyRows(rows));
  if (!unique.length) {
    return `<section class="glass-card report-roster-card">
      <p class="reports-students__hint">${escapeHtml(t('reports.noRecordsDay'))}</p>
    </section>`;
  }

  const list = unique
    .map(
      (r) => `<li class="report-roster-item">
      <span class="report-roster-item__name">${escapeHtml(r.student_name || r.student_id)}</span>
      <span class="report-status report-status--${escapeHtml(normalizeAttendanceStatus(r.status))}">${escapeHtml(statusLabel(r.status))}</span>
    </li>`
    )
    .join('');

  return `<section class="glass-card report-roster-card">
    <div class="report-roster-card__head">
      <h3>${escapeHtml(classKey)}</h3>
      <span class="report-roster-card__count">${unique.length}</span>
    </div>
    <ul class="report-roster-list">${list}</ul>
  </section>`;
}

/**
 * แอดมินดูทุกห้อง — สรุปเป็นชั้น ไม่ลากรายชื่อทั้งโรงเรียน
 * @param {object[]} rows
 * @param {string} [levelFilter]
 */
function renderDailyClassOverview(rows, levelFilter = '') {
  const byClass = new Map();
  for (const row of rows) {
    const classKey = String(row.class || '').trim();
    if (!classKey) continue;
    if (levelFilter && !classKey.startsWith(`${levelFilter}/`)) continue;
    if (!byClass.has(classKey)) byClass.set(classKey, []);
    byClass.get(classKey).push(row);
  }

  const entries = [...byClass.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  if (!entries.length) {
    return `<section class="glass-card report-roster-card">
      <p class="reports-students__hint">${escapeHtml(t('reports.noRecordsDay'))}</p>
    </section>`;
  }

  const cards = entries
    .map(([classKey, list]) => {
      const s = summarizeAttendance(list);
      const flags = [];
      if (s.absent) flags.push(`${t('status.absent')} ${s.absent}`);
      if (s.late) flags.push(`${t('status.late')} ${s.late}`);
      const flagText = flags.length ? flags.join(' · ') : `${s.percent}%`;
      const warn = s.absent || s.late ? ' report-class-chip--warn' : '';
      return `<li><button type="button" class="report-class-chip${warn}" data-class-key="${escapeHtml(classKey)}">
        <span class="report-class-chip__name">${escapeHtml(classKey)}</span>
        <strong class="report-class-chip__pct">${s.percent}%</strong>
        <span class="report-class-chip__meta">${s.checked} ${escapeHtml(t('reports.total'))} · ${escapeHtml(flagText)}</span>
      </button></li>`;
    })
    .join('');

  return `<section class="glass-card report-roster-card">
    <ul class="report-class-grid">${cards}</ul>
  </section>`;
}

/**
 * @param {object[]} rows
 * @param {'daily'|'weekly'|'monthly'|'semester'} mode
 */
export function renderIndividualSection(rows, mode) {
  const reports = buildStudentPeriodReports(rows);
  if (!reports.length) {
    return `<section class="reports-students glass-card">
      <h3>${escapeHtml(t('reports.viewStudents'))}</h3>
      <p class="reports-students__hint">${escapeHtml(t('history.empty'))}</p>
    </section>`;
  }
  const list = reports
    .map((r) => {
      const badge =
        r.concernPercent >= 60
          ? `<span class="reports-students__badge">${escapeHtml(t('points.parentWarningBadge'))}</span>`
          : '';
      let meta = '';
      if (mode === 'weekly' || mode === 'monthly' || mode === 'semester') {
        meta = `<span class="reports-students__detail">${escapeHtml(
          t('reports.studentPeriodMeta', {
            days: r.totalDays,
            absent: r.counts.absent,
            late: r.counts.late
          })
        )}</span>`;
      }
      return `<li class="reports-students__row">
        <button type="button" class="reports-students__item" data-open-profile="1" data-student-id="${escapeHtml(
          r.studentId
        )}" data-class-key="${escapeHtml(r.classKey)}">
          <span class="reports-students__name">${escapeHtml(r.studentName)}</span>
          ${badge}
          ${meta}
          <span class="reports-students__pct">${r.presentPercent}%</span>
        </button>
      </li>`;
    })
    .join('');

  return `<section class="reports-students glass-card">
    <h3>${escapeHtml(t('reports.viewStudents'))}</h3>
    <ol class="reports-students__list">${list}</ol>
  </section>`;
}

/**
 * @param {{ rows: object[], from: string, to: string, classKey: string, view: string, level?: string }} ctx
 */
export function renderDailyReport(ctx) {
  const { rows, from, classKey, view, level = '' } = ctx;
  const dateKey = from;
  const summary = summarizeAttendance(rows);
  const title = formatDayLabelTh(dateKey);
  const classSuffix = classKey ? ` · ${classKey}` : level ? ` · ${level}` : '';

  if (view === 'students') {
    return `${renderDailyHeader(title + classSuffix, summary)}${renderIndividualSection(rows, 'daily')}`;
  }

  const header = renderDailyHeader(title + classSuffix, summary);
  if (classKey) {
    return `${header}${renderDailyRosterCompact(rows, classKey)}`;
  }
  return `${header}${renderDailyClassOverview(rows, level)}`;
}

/**
 * @param {{ rows: object[], from: string, to: string, classKey: string, view: string }} ctx
 */
export function renderWeeklyReport(ctx) {
  const { rows, from, to, classKey, view } = ctx;
  const dayKeys = enumerateDateKeys(from, to);
  const dayBuckets = summarizeDayBuckets(rows, dayKeys);
  const summary = summarizeAttendance(rows);
  const avg = averageBucketPercent(dayBuckets);
  const title = `${t('reports.weeklyTitle')} · ${formatDateRangeTh(from, to)}${classKey ? ` · ${classKey}` : ''}`;

  if (view === 'students') {
    return `${renderPeriodBanner(title)}${renderIndividualSection(rows, 'weekly')}`;
  }

  const dayChartBuckets = dayBuckets.map((d) => ({
    label: d.subLabel,
    subLabel: d.label,
    summary: d.summary,
    hasData: d.hasData
  }));

  return [
    renderPeriodBanner(title),
    renderStatGrid({
      ...summary,
      percent: avg
    }),
    `<section class="glass-card chart-card">
      <h3>${escapeHtml(t('reports.weeklyTrend'))}</h3>
      ${renderPercentColumns(dayChartBuckets, { scroll: dayKeys.length > 7 })}
    </section>`,
    renderBucketTable(
      dayBuckets.map((d) => ({
        key: d.key,
        label: `${d.subLabel} ${d.label}`,
        subLabel: '',
        summary: d.summary,
        hasData: d.hasData
      }))
    )
  ].join('');
}

/**
 * @param {{ rows: object[], from: string, to: string, classKey: string, view: string }} ctx
 */
export function renderMonthlyReport(ctx) {
  const { rows, from, to, classKey, view } = ctx;
  const weekBuckets = summarizeWeekBuckets(rows, from, to);
  const summary = summarizeAttendance(rows);
  const avg = averageBucketPercent(weekBuckets);
  const title = `${t('reports.monthlyTitle')} · ${formatDateRangeTh(from, to)}${classKey ? ` · ${classKey}` : ''}`;

  if (view === 'students') {
    return `${renderPeriodBanner(title)}${renderIndividualSection(rows, 'monthly')}`;
  }

  const chartBuckets = weekBuckets.map((w) => ({
    label: t('reports.weekN', { n: w.weekIndex }),
    subLabel: w.subLabel,
    summary: w.summary,
    hasData: w.hasData
  }));

  return [
    renderPeriodBanner(title),
    renderStatGrid({ ...summary, percent: avg }),
    `<section class="glass-card chart-card">
      <h3>${escapeHtml(t('reports.monthlyStatusWeeks'))}</h3>
      ${renderPercentColumns(chartBuckets, { scroll: weekBuckets.length > 5 })}
    </section>`,
    renderBucketTable(
      weekBuckets.map((w) => ({
        key: w.key,
        label: t('reports.weekN', { n: w.weekIndex }),
        subLabel: w.subLabel,
        summary: w.summary,
        hasData: w.hasData
      }))
    )
  ].join('');
}

/**
 * @param {{ rows: object[], from: string, to: string, classKey: string, view: string }} ctx
 */
export function renderSemesterReport(ctx) {
  const { rows, from, to, classKey, view } = ctx;
  const monthBuckets = summarizeMonthBuckets(rows, from, to);
  const summary = summarizeAttendance(rows);
  const avg = averageBucketPercent(monthBuckets);
  const title = `${t('reports.semesterTitle')} · ${formatDateRangeTh(from, to)} · ${classKey}`;

  if (view === 'students') {
    return `${renderPeriodBanner(title)}${renderIndividualSection(rows, 'semester')}`;
  }

  const chartBuckets = monthBuckets.map((m) => ({
    label: m.label,
    subLabel: formatDateRangeTh(m.from, m.to),
    summary: m.summary,
    hasData: m.hasData
  }));

  return [
    renderPeriodBanner(title),
    renderStatGrid({ ...summary, percent: avg }),
    `<section class="glass-card chart-card">
      <h3>${escapeHtml(t('reports.semesterTrend'))}</h3>
      ${renderPercentColumns(chartBuckets, { scroll: monthBuckets.length > 6 })}
    </section>`,
    renderBucketTable(
      monthBuckets.map((m) => ({
        key: m.key,
        label: m.label,
        subLabel: formatDateRangeTh(m.from, m.to),
        summary: m.summary,
        hasData: m.hasData
      }))
    )
  ].join('');
}
