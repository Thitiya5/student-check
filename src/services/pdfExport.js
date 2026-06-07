/**
 * PDF export for attendance reports — layout อิงรายเดือน (หัวข้อ + สรุป + ตารางรายช่วง).
 */
import html2pdf from 'html2pdf.js';
import {
  SCHOOL_LOGO_SRC,
  SCHOOL_NAME_TH,
  SCHOOL_TAGLINE_TH
} from '../config/schoolBranding.js';
import { statusLabel, t } from '../i18n/index.js';
import { summarizeAttendance } from './attendanceService.js';
import { enumerateDateKeys } from '../utils/dateIso.js';
import {
  summarizeDayBuckets,
  summarizeWeekBuckets,
  summarizeMonthBuckets,
  formatDayLabelTh,
  formatDateRangeTh
} from '../utils/reportAggregations.js';

/**
 * @param {{
 *   mode: string,
 *   from: string,
 *   to: string,
 *   teacherName: string,
 *   classLabel?: string,
 *   rows: object[],
 * }} opts
 */
export async function exportReportPdf(opts) {
  const { mode, from, to, teacherName, classLabel = '', rows = [] } = opts;
  const summary = summarizeAttendance(rows);
  const exportedAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const periodRows = buildPdfPeriodRows(mode, from, to, rows);
  const periodLabel = periodPeriodColumnLabel(mode);

  const modeLabel =
    mode === 'weekly'
      ? t('reports.weekly')
      : mode === 'monthly'
        ? t('reports.monthly')
        : mode === 'semester'
          ? t('reports.semester')
          : t('reports.daily');

  const rangeLabel =
    mode === 'daily'
      ? formatDayLabelTh(from)
      : formatDateRangeTh(from, to);

  const stats = [
    [t('reports.attendancePercent'), `${summary.percent}%`],
    [t('status.present'), summary.present],
    [t('status.late'), summary.late],
    [t('status.absent'), summary.absent],
    [t('status.sick'), summary.sick],
    [t('status.errand'), summary.errand],
    [t('status.activity'), summary.activity],
    [t('reports.total'), summary.checked]
  ];

  const periodTableHead = `<tr style="background:#f3eeff;">
    <th style="border:1px solid #ddd;padding:8px;text-align:left;">${escape(periodLabel)}</th>
    <th style="border:1px solid #ddd;padding:8px;">${escape(t('reports.tableChecked'))}</th>
    <th style="border:1px solid #ddd;padding:8px;">${escape(t('status.present'))}</th>
    <th style="border:1px solid #ddd;padding:8px;">${escape(t('status.late'))}</th>
    <th style="border:1px solid #ddd;padding:8px;">${escape(t('status.absent'))}</th>
    <th style="border:1px solid #ddd;padding:8px;">${escape(t('reports.attendancePercent'))}</th>
  </tr>`;

  const periodTableBody = periodRows.length
    ? periodRows
        .map((row) => {
          const s = row.summary;
          const sub = row.subLabel
            ? `<br/><span style="font-size:10px;color:#666;">${escape(row.subLabel)}</span>`
            : '';
          const muted = row.hasData ? '' : ' style="color:#999;"';
          return `<tr${muted}>
        <td style="border:1px solid #ddd;padding:7px;">${escape(row.label)}${sub}</td>
        <td style="border:1px solid #ddd;padding:7px;text-align:center;">${s.checked ?? 0}</td>
        <td style="border:1px solid #ddd;padding:7px;text-align:center;">${s.present ?? 0}</td>
        <td style="border:1px solid #ddd;padding:7px;text-align:center;">${s.late ?? 0}</td>
        <td style="border:1px solid #ddd;padding:7px;text-align:center;">${s.absent ?? 0}</td>
        <td style="border:1px solid #ddd;padding:7px;text-align:center;font-weight:bold;">${row.hasData ? `${s.percent ?? 0}%` : '—'}</td>
      </tr>`;
        })
        .join('')
    : `<tr><td colspan="6" style="border:1px solid #ddd;padding:8px;">${escape(t('history.empty'))}</td></tr>`;

  const dailyRoster =
    mode === 'daily' ? buildDailyRosterHtml(rows) : '';

  const html = `
  <div class="pdf-report" style="font-family:'Sarabun',Tahoma,sans-serif;padding:24px;color:#1a1a2e;max-width:800px;">
    <header style="display:flex;align-items:center;gap:16px;margin-bottom:20px;border-bottom:2px solid #7C4DFF;padding-bottom:16px;">
      <img src="${SCHOOL_LOGO_SRC}" alt="" width="64" height="64" style="border-radius:12px;" crossorigin="anonymous" />
      <div>
        <h1 style="margin:0;font-size:20px;color:#7C4DFF;">${escape(SCHOOL_NAME_TH)}</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#555;">${escape(SCHOOL_TAGLINE_TH)}</p>
      </div>
    </header>
    <h2 style="font-size:16px;margin:0 0 8px;">${escape(t('reports.title'))} — ${escape(modeLabel)}</h2>
    <p style="font-size:12px;color:#444;margin:0 0 14px;line-height:1.5;">
      <strong>${escape(t('pdf.reportRange'))}:</strong> ${escape(rangeLabel)}<br/>
      ${escape(t('common.teacher'))}: ${escape(teacherName || '—')}
      ${classLabel ? `<br/>${escape(t('common.class'))}: ${escape(classLabel)}` : ''}<br/>
      ${escape(t('pdf.exportedAt'))}: ${escape(exportedAt)}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;">
      <thead><tr style="background:#f8f8fc;">
        ${stats.map(([k]) => `<th style="border:1px solid #ddd;padding:8px;text-align:left;">${escape(k)}</th>`).join('')}
      </tr></thead>
      <tbody><tr>
        ${stats.map(([, v]) => `<td style="border:1px solid #ddd;padding:8px;font-weight:bold;">${escape(String(v))}</td>`).join('')}
      </tr></tbody>
    </table>
    <h3 style="font-size:14px;margin:0 0 8px;">${escape(t('pdf.periodBreakdown'))}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px;">
      <thead>${periodTableHead}</thead>
      <tbody>${periodTableBody}</tbody>
    </table>
    ${dailyRoster}
  </div>`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error('PDF render failed');

  document.body.appendChild(el);

  const filename = `attendance-${mode}-${from}-${to}.pdf`;

  try {
    await html2pdf()
      .set({
        margin: 10,
        filename,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .from(el)
      .save();
  } finally {
    el.remove();
  }
}

/**
 * @param {string} mode
 * @param {string} from
 * @param {string} to
 * @param {object[]} rows
 */
function buildPdfPeriodRows(mode, from, to, rows) {
  if (mode === 'daily') {
    const summary = summarizeAttendance(rows);
    return [
      {
        label: formatDayLabelTh(from),
        subLabel: from,
        summary,
        hasData: rows.length > 0
      }
    ];
  }
  if (mode === 'weekly') {
    const dayKeys = enumerateDateKeys(from, to);
    return summarizeDayBuckets(rows, dayKeys).map((d) => ({
      label: `${d.subLabel} ${d.label}`,
      subLabel: d.key,
      summary: d.summary,
      hasData: d.hasData
    }));
  }
  if (mode === 'monthly') {
    return summarizeWeekBuckets(rows, from, to).map((w) => ({
      label: t('reports.weekN', { n: w.weekIndex }),
      subLabel: w.subLabel,
      summary: w.summary,
      hasData: w.hasData
    }));
  }
  if (mode === 'semester') {
    return summarizeMonthBuckets(rows, from, to).map((m) => ({
      label: m.label,
      subLabel: formatDateRangeTh(m.from, m.to),
      summary: m.summary,
      hasData: m.hasData
    }));
  }
  return [];
}

/** @param {string} mode */
function periodPeriodColumnLabel(mode) {
  if (mode === 'daily') return t('common.date');
  if (mode === 'weekly') return t('pdf.periodDay');
  if (mode === 'monthly') return t('pdf.periodWeek');
  if (mode === 'semester') return t('pdf.periodMonth');
  return t('reports.tablePeriod');
}

/**
 * @param {object[]} rows
 */
function buildDailyRosterHtml(rows) {
  const byStudent = new Map();
  const sorted = [...rows].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  );
  for (const row of sorted) {
    const sid = String(row.student_id || '').trim();
    if (!sid) continue;
    byStudent.set(sid, row);
  }
  const list = [...byStudent.values()].sort((a, b) =>
    String(a.student_name || '').localeCompare(String(b.student_name || ''), 'th')
  );
  if (!list.length) return '';

  const body = list
    .map(
      (r) => `<tr>
      <td style="border:1px solid #ddd;padding:6px;">${escape(r.student_name || r.student_id)}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:center;">${escape(statusLabel(r.status))}</td>
    </tr>`
    )
    .join('');

  return `<h3 style="font-size:14px;margin:16px 0 8px;">${escape(t('pdf.dailyRoster'))}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#f8f8fc;">
        <th style="border:1px solid #ddd;padding:6px;text-align:left;">${escape(t('history.searchStudent'))}</th>
        <th style="border:1px solid #ddd;padding:6px;">${escape(t('common.status'))}</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** @param {string} s */
function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
