/**
 * PDF export for attendance reports (Thai-friendly via html2pdf).
 */
import html2pdf from 'html2pdf.js';
import {
  SCHOOL_LOGO_SRC,
  SCHOOL_NAME_TH,
  SCHOOL_TAGLINE_TH
} from '../config/schoolBranding.js';
import { statusLabel, t } from '../i18n/index.js';
import { summarizeAttendance } from './attendanceService.js';

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

  const modeLabel =
    mode === 'weekly'
      ? t('reports.weekly')
      : mode === 'monthly'
        ? t('reports.monthly')
        : mode === 'semester'
          ? t('reports.semester')
          : t('reports.daily');

  const stats = [
    [t('status.present'), summary.present],
    [t('status.late'), summary.late],
    [t('status.absent'), summary.absent],
    [t('status.sick'), summary.sick],
    [t('status.errand'), summary.errand],
    [t('status.activity'), summary.activity],
    [t('reports.attendancePercent'), `${summary.percent}%`]
  ];

  const tableRows = rows
    .slice(0, 500)
    .map(
      (r) => `<tr>
      <td>${escape(r.attendanceDate)}</td>
      <td>${escape(r.class)}</td>
      <td>${escape(r.student_name || r.student_id)}</td>
      <td>${escape(statusLabel(r.status))}</td>
      <td>${escape(r.teacherName)}</td>
    </tr>`
    )
    .join('');

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
    <p style="font-size:12px;color:#444;margin:0 0 16px;">
      ${escape(t('common.fromDate'))}: ${escape(from)} · ${escape(t('common.toDate'))}: ${escape(to)}<br/>
      ${escape(t('common.teacher'))}: ${escape(teacherName || '—')}
      ${classLabel ? `<br/>${escape(t('common.class'))}: ${escape(classLabel)}` : ''}<br/>
      ${escape(t('pdf.exportedAt'))}: ${escape(exportedAt)}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
      <thead><tr style="background:#f3eeff;">
        ${stats.map(([k]) => `<th style="border:1px solid #ddd;padding:8px;text-align:left;">${escape(k)}</th>`).join('')}
      </tr></thead>
      <tbody><tr>
        ${stats.map(([, v]) => `<td style="border:1px solid #ddd;padding:8px;font-weight:bold;">${escape(String(v))}</td>`).join('')}
      </tr></tbody>
    </table>
    <h3 style="font-size:14px;margin:16px 0 8px;">${escape(t('pdf.detailTable'))}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#f8f8fc;">
        <th style="border:1px solid #ddd;padding:6px;">${escape(t('common.date'))}</th>
        <th style="border:1px solid #ddd;padding:6px;">${escape(t('common.class'))}</th>
        <th style="border:1px solid #ddd;padding:6px;">${escape(t('history.searchStudent'))}</th>
        <th style="border:1px solid #ddd;padding:6px;">${escape(t('common.status'))}</th>
        <th style="border:1px solid #ddd;padding:6px;">${escape(t('common.teacher'))}</th>
      </tr></thead>
      <tbody>${tableRows || `<tr><td colspan="5">${escape(t('history.empty'))}</td></tr>`}</tbody>
    </table>
    ${rows.length > 500 ? `<p style="font-size:10px;color:#888;margin-top:8px;">${escape(t('pdf.truncated', { count: 500 }))}</p>` : ''}
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

/** @param {string} s */
function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
