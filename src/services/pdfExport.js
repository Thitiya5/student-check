/**

 * PDF export for attendance reports.

 */

import html2pdf from 'html2pdf.js';

import { statusLabel, t } from '../i18n/index.js';

import { summarizeAttendance } from './attendanceService.js';

import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';

import { enumerateDateKeys } from '../utils/dateIso.js';

import {

  summarizeDayBuckets,

  summarizeWeekBuckets,

  summarizeMonthBuckets,

  formatDayLabelTh,

  formatDateRangeTh

} from '../utils/reportAggregations.js';

import { buildPdfMatrixStyleHeaderHtml, escapePdfHtml } from './pdfDocumentHeader.js';
import { saveMultiPagePortraitPdf } from './pdfPageRender.js';
import { attendanceStatusAbbrev, ATTENDANCE_ABBREV_LEGEND } from '../utils/attendanceAbbrev.js';
import { fetchStudentsByClass } from './studentsService.js';
import { classKeyToParts } from './teacherAuth.js';
import { findHomeroomTeachersForClass } from './homeroomTeachers.js';



const DAILY_STATUS_SORT = {

  absent: 0,

  late: 1,

  sick: 2,

  errand: 3,

  activity: 4,

  leave: 5,

  present: 6

};



const PDF_FONT = "'Sarabun',Tahoma,sans-serif";

const PDF_TEXT = '#1a1a1a';

const PDF_BORDER = '1px solid #999';

const PDF_TH_BG = '#ede9fe';



/** แถวรายชื่อต่อหน้า — หน้า 1 มีสรุปสถิติ */
const CLASS_ROSTER_ROWS_FIRST = 26;
const CLASS_ROSTER_ROWS_NEXT = 32;
const CLASS_ROSTER_FONT = '8.5pt';



/** @param {T[]} items @param {number} size @returns {T[][]} */

function chunkArray(items, size) {

  if (!items.length) return [];

  /** @type {T[][]} */

  const chunks = [];

  for (let i = 0; i < items.length; i += size) {

    chunks.push(items.slice(i, i + size));

  }

  return chunks;

}



/**

 * @param {{

 *   rangeLabel: string,

 *   teacherName: string,

 *   classLabel: string,

 *   exportedAt: string,

 * }} meta

 */

function buildReportMetaLines(meta) {

  const lines = [

    { label: t('pdf.reportRange'), value: meta.rangeLabel },

    { label: t('common.teacher'), value: meta.teacherName || '—' }

  ];

  if (meta.classLabel) {

    lines.push({ label: t('common.class'), value: meta.classLabel });

  }

  lines.push({ label: t('pdf.exportedAt'), value: meta.exportedAt });

  return lines;
}

/** Meta แบบเดียวกับ PDF ตารางรายเดือน — วันที่ · ชั้น · ครูประจำชั้น */
function buildDailyClassMetaLines(rangeLabel, classLabel, homeroomLine) {
  return [
    { label: t('common.date'), value: rangeLabel },
    { label: t('common.class'), value: classLabel || '—' },
    { label: t('pdf.matrixHomeroom'), value: homeroomLine || '—' }
  ];
}

/** Meta รายงานทั้งโรงเรียน — วันที่อย่างเดียว */
function buildDailySchoolMetaLines(rangeLabel) {
  return [{ label: t('common.date'), value: rangeLabel }];
}



function buildDailyDocHeader(reportTitle, metaLines) {
  return buildPdfMatrixStyleHeaderHtml({
    title: reportTitle,
    metaLines,
    logoSize: 56,
    nameSize: 18,
    tagSize: 11,
    titleSize: 15,
    metaSize: 11,
    marginBottom: 10
  });
}

function pdfPageShell(bodyHtml) {
  return `<div class="pdf-report-page" style="font-family:${PDF_FONT};color:${PDF_TEXT};padding:4px 2px;box-sizing:border-box;">${bodyHtml}</div>`;
}



function bwTh(extra = '') {

  return `border:${PDF_BORDER};padding:2px 3px;font-size:7pt;line-height:1.2;background:${PDF_TH_BG};font-weight:700;vertical-align:middle;${extra}`;

}



function bwTd(extra = '') {

  return `border:${PDF_BORDER};padding:2px 3px;font-size:7pt;line-height:1.2;vertical-align:middle;${extra}`;

}



/**

 * @param {{

 *   mode: string,

 *   from: string,

 *   to: string,

 *   teacherName: string,

 *   classLabel?: string,

 *   rows: object[],

 *   dailyLayout?: 'school'|'class'|'default',

 * }} opts

 */

export async function exportReportPdf(opts) {

  const {

    mode,

    from,

    to,

    teacherName,

    classLabel = '',

    rows = [],

    dailyLayout = 'default'

  } = opts;



  const exportedAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  const rangeLabel =

    mode === 'daily' ? formatDayLabelTh(from) : formatDateRangeTh(from, to);



  const modeLabel =

    mode === 'weekly'

      ? t('reports.weekly')

      : mode === 'monthly'

        ? t('reports.monthly')

        : mode === 'semester'

          ? t('reports.semester')

          : t('reports.daily');



  const reportTitle =

    mode === 'daily' && dailyLayout === 'school'

      ? t('pdf.dailySchoolTitle')

      : mode === 'daily' && dailyLayout === 'class'

        ? t('pdf.dailyClassTitle')

        : `${t('reports.title')} — ${modeLabel}`;



  const metaLines = buildReportMetaLines({ rangeLabel, teacherName, classLabel, exportedAt });

  const layoutTag = mode === 'daily' ? dailyLayout : mode;
  const filename = `attendance-${layoutTag}-${from}${to !== from ? `-${to}` : ''}.pdf`;

  if (mode === 'daily' && dailyLayout === 'school') {
    const schoolMeta = buildDailySchoolMetaLines(rangeLabel);
    await saveMultiPagePortraitPdf(
      [buildSchoolDailyPageHtml({ reportTitle, metaLines: schoolMeta, rows })],
      filename
    );
    return;
  }

  if (mode === 'daily' && dailyLayout === 'class') {
    let classMeta = metaLines;
    if (classLabel) {
      let homeroomLine = teacherName || '—';
      try {
        const teachers = await findHomeroomTeachersForClass(classLabel);
        if (teachers.length) homeroomLine = teachers.join(', ');
      } catch {
        /* keep session teacher name */
      }
      classMeta = buildDailyClassMetaLines(rangeLabel, classLabel, homeroomLine);
    }
    const rosterRows = await enrichRowsWithStudentNumbers(rows, classLabel);
    const pages = buildClassRosterPages({
      reportTitle,
      metaLines: classMeta,
      rows: rosterRows,
      classLabel
    });
    await saveMultiPagePortraitPdf(pages, filename);
    return;
  }



  await exportLegacySinglePdf({

    mode,

    from,

    to,

    rows,

    reportTitle,

    metaLines,

    classLabel,

    filename

  });

}



/**

 * @param {object} ctx

 */

async function exportLegacySinglePdf(ctx) {

  const { mode, from, to, rows, reportTitle, metaLines, filename } = ctx;

  const summary = summarizeAttendance(rows);

  const periodRows = buildPdfPeriodRows(mode, from, to, rows);

  const periodLabel = periodPeriodColumnLabel(mode);



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



  const periodTableHead = `<tr>

    <th style="${bwTh('text-align:left;')}">${escapePdfHtml(periodLabel)}</th>

    <th style="${bwTh()}">${escapePdfHtml(t('reports.tableChecked'))}</th>

    <th style="${bwTh()}">${escapePdfHtml(t('status.present'))}</th>

    <th style="${bwTh()}">${escapePdfHtml(t('status.late'))}</th>

    <th style="${bwTh()}">${escapePdfHtml(t('status.absent'))}</th>

    <th style="${bwTh()}">${escapePdfHtml(t('reports.attendancePercent'))}</th>

  </tr>`;



  const periodTableBody = periodRows.length

    ? periodRows

        .map((row) => {

          const s = row.summary;

          const sub = row.subLabel

            ? `<br/><span style="font-size:6pt;color:#666;">${escapePdfHtml(row.subLabel)}</span>`

            : '';

          const muted = row.hasData ? '' : ' style="color:#999;"';

          return `<tr${muted}>

        <td style="${bwTd('text-align:left;')}">${escapePdfHtml(row.label)}${sub}</td>

        <td style="${bwTd('text-align:center;')}">${s.checked ?? 0}</td>

        <td style="${bwTd('text-align:center;')}">${s.present ?? 0}</td>

        <td style="${bwTd('text-align:center;')}">${s.late ?? 0}</td>

        <td style="${bwTd('text-align:center;')}">${s.absent ?? 0}</td>

        <td style="${bwTd('text-align:center;font-weight:700;')}">${row.hasData ? `${s.percent ?? 0}%` : '—'}</td>

      </tr>`;

        })

        .join('')

    : `<tr><td colspan="6" style="${bwTd()}">${escapePdfHtml(t('history.empty'))}</td></tr>`;



  const docHeader = buildDailyDocHeader(reportTitle, metaLines);

  const statsTableHtml = buildCompactStatsTableHtml(stats);

  const dailyExtra = mode === 'daily' ? buildDailyRosterHtml(rows) : '';

  const periodTableHtml = `<h3 style="font-size:10pt;margin:10px 0 6px;font-weight:700;">${escapePdfHtml(t('pdf.periodBreakdown'))}</h3>

    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">${periodTableHead}<tbody>${periodTableBody}</tbody></table>`;



  const html = pdfPageShell(`${docHeader}${statsTableHtml}${periodTableHtml}${dailyExtra}`);

  const wrapper = document.createElement('div');

  wrapper.innerHTML = html;

  const el = wrapper.firstElementChild;

  if (!(el instanceof HTMLElement)) throw new Error('PDF render failed');

  document.body.appendChild(el);

  try {

    await html2pdf()

      .set({

        margin: 8,

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

 * @param {{ reportTitle: string, metaLines: object[], rows: object[] }} ctx

 */

function buildSchoolDailyPageHtml(ctx) {

  const { reportTitle, metaLines, rows } = ctx;

  const summary = summarizeAttendance(rows);

  const entries = getSchoolClassEntries(rows);



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



  const classBody = entries.length

    ? entries

        .map(([classKey, list]) => {

          const s = summarizeAttendance(list);

          const note =

            s.absent > 0

              ? `${t('status.absent')} ${s.absent}`

              : s.late > 0

                ? `${t('status.late')} ${s.late}`

                : '';

          return `<tr>

        <td style="${bwTd('font-weight:600;text-align:left;')}">${escapePdfHtml(classKey)}</td>

        <td style="${bwTd('text-align:center;')}">${s.checked ?? 0}</td>

        <td style="${bwTd('text-align:center;')}">${s.present ?? 0}</td>

        <td style="${bwTd('text-align:center;')}">${s.late ?? 0}</td>

        <td style="${bwTd('text-align:center;')}">${s.absent ?? 0}</td>

        <td style="${bwTd('text-align:center;font-weight:700;')}">${s.percent ?? 0}%</td>

        <td style="${bwTd('font-size:6.5pt;text-align:left;')}">${escapePdfHtml(note)}</td>

      </tr>`;

        })

        .join('')

    : `<tr><td colspan="7" style="${bwTd()}">${escapePdfHtml(t('history.empty'))}</td></tr>`;



  const classTable = `<h3 style="font-size:9pt;margin:8px 0 4px;font-weight:700;">${escapePdfHtml(t('pdf.dailyClassTable'))}</h3>

    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">

      <thead><tr>

        <th style="${bwTh('text-align:left;width:12%;')}">${escapePdfHtml(t('common.class'))}</th>

        <th style="${bwTh('width:10%;')}">${escapePdfHtml(t('reports.tableChecked'))}</th>

        <th style="${bwTh('width:10%;')}">${escapePdfHtml(t('status.present'))}</th>

        <th style="${bwTh('width:10%;')}">${escapePdfHtml(t('status.late'))}</th>

        <th style="${bwTh('width:10%;')}">${escapePdfHtml(t('status.absent'))}</th>

        <th style="${bwTh('width:10%;')}">${escapePdfHtml(t('reports.attendancePercent'))}</th>

        <th style="${bwTh('text-align:left;width:18%;')}">${escapePdfHtml(t('pdf.note'))}</th>

      </tr></thead>

      <tbody>${classBody}</tbody>

    </table>`;



  const docHeader = buildDailyDocHeader(reportTitle, metaLines);

  return pdfPageShell(`${docHeader}${buildCompactStatsTableHtml(stats, { fontSize: '7pt' })}${classTable}`);

}



/**

 * @param {string[][]} stats

 * @param {{ fontSize?: string }} [opts]

 */

function buildCompactStatsTableHtml(stats, opts = {}) {

  const fs = opts.fontSize || '7pt';

  const th = `border:${PDF_BORDER};padding:2px 2px;font-size:${fs};background:${PDF_TH_BG};font-weight:700;text-align:center;line-height:1.15;`;

  const td = `border:${PDF_BORDER};padding:2px 2px;font-size:${fs};font-weight:700;text-align:center;line-height:1.15;`;

  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;">

    <thead><tr>${stats.map(([k]) => `<th style="${th}">${escapePdfHtml(k)}</th>`).join('')}</tr></thead>

    <tbody><tr>${stats.map(([, v]) => `<td style="${td}">${escapePdfHtml(String(v))}</td>`).join('')}</tr></tbody>

  </table>`;

}



/**

 * @param {{

 *   reportTitle: string,

 *   metaLines: object[],

 *   rows: object[],

 *   classLabel: string,

 * }} ctx

 */

function buildClassRosterPages(ctx) {
  const { reportTitle, metaLines, rows } = ctx;
  const list = dedupeClassRosterRows(rows);
  const summary = summarizeAttendance(rows);

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

  const docHeader = () => buildDailyDocHeader(reportTitle, metaLines);

  if (!list.length) {
    return [
      pdfPageShell(
        `${docHeader()}${buildCompactStatsTableHtml(stats)}<p style="font-size:${CLASS_ROSTER_FONT};margin:8px 0 0;">${escapePdfHtml(t('history.empty'))}</p>`
      )
    ];
  }

  /** @type {string[]} */
  const pages = [];
  let offset = 0;
  let pageIndex = 0;

  while (offset < list.length) {
    const limit = pageIndex === 0 ? CLASS_ROSTER_ROWS_FIRST : CLASS_ROSTER_ROWS_NEXT;
    const chunk = list.slice(offset, offset + limit);
    const legend = pageIndex === 0 ? buildRosterAbbrevLegend() : '';
    const top =
      pageIndex === 0
        ? `${docHeader()}${buildCompactStatsTableHtml(stats)}`
        : docHeader();
    pages.push(pdfPageShell(`${top}${buildClassRosterTable(chunk)}${legend}`));
    offset += chunk.length;
    pageIndex += 1;
  }

  return pages;
}

async function enrichRowsWithStudentNumbers(rows, classKey) {
  const key = String(classKey || '').trim();
  if (!key.includes('/')) return rows;
  const { level, room } = classKeyToParts(key);
  if (!level || !room) return rows;
  try {
    const students = await fetchStudentsByClass(level, room);
    const numberById = new Map(
      students.map((s) => [String(s.student_id), String(s.number ?? '').trim()])
    );
    return rows.map((r) => ({
      ...r,
      number: numberById.get(String(r.student_id)) || ''
    }));
  } catch {
    return rows;
  }
}

function buildClassRosterTable(items) {
  if (!items.length) return '';

  const thNum = bwTh(`width:10%;text-align:center;font-size:${CLASS_ROSTER_FONT};padding:4px 3px;`);
  const thName = bwTh(`text-align:left;font-size:${CLASS_ROSTER_FONT};padding:4px 6px;`);
  const thSt = bwTh(`width:14%;text-align:center;font-size:${CLASS_ROSTER_FONT};padding:4px 3px;`);
  const tdNum = bwTd(`text-align:center;width:10%;font-size:${CLASS_ROSTER_FONT};padding:4px 3px;`);
  const tdName = bwTd(`text-align:left;font-size:${CLASS_ROSTER_FONT};padding:4px 6px;line-height:1.35;`);
  const tdSt = bwTd(`text-align:center;width:14%;font-size:${CLASS_ROSTER_FONT};padding:4px 3px;font-weight:600;`);

  const body = items
    .map(
      (r) => `<tr>
      <td style="${tdNum}">${escapePdfHtml(String(r.number ?? '').trim() || '—')}</td>
      <td style="${tdName}">${escapePdfHtml(r.student_name || r.student_id)}</td>
      <td style="${tdSt}">${escapePdfHtml(attendanceStatusAbbrev(r.status))}</td>
    </tr>`
    )
    .join('');

  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <thead><tr>
      <th style="${thNum}">${escapePdfHtml(t('common.number'))}</th>
      <th style="${thName}">${escapePdfHtml(t('pdf.studentList'))}</th>
      <th style="${thSt}">${escapePdfHtml(t('common.status'))}</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildRosterAbbrevLegend() {
  const legend = ATTENDANCE_ABBREV_LEGEND.map(([key]) => {
    const abbrev = attendanceStatusAbbrev(key);
    return `${abbrev}=${statusLabel(key)}`;
  }).join(' · ');
  return `<p style="font-size:7pt;color:#444;margin:8px 0 0;line-height:1.4;"><strong>${escapePdfHtml(t('pdf.matrixLegend'))}:</strong> ${escapePdfHtml(legend)}</p>`;
}

function dedupeClassRosterRows(rows) {
  const sorted = [...rows].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  );
  const byStudent = new Map();
  for (const row of sorted) {
    const sid = String(row.student_id || '').trim();
    if (!sid) continue;
    byStudent.set(sid, row);
  }
  return [...byStudent.values()].sort((a, b) => {
    const na = parseInt(String(a.number || ''), 10);
    const nb = parseInt(String(b.number || ''), 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    if (!Number.isNaN(na) && Number.isNaN(nb)) return -1;
    if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
    return String(a.student_name || '').localeCompare(String(b.student_name || ''), 'th');
  });
}

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



/** @param {object[]} rows */

function getSchoolClassEntries(rows) {

  const byClass = new Map();

  for (const row of rows) {

    const classKey = String(row.class || '').trim();

    if (!classKey) continue;

    if (!byClass.has(classKey)) byClass.set(classKey, []);

    byClass.get(classKey).push(row);

  }

  return [...byClass.entries()].sort((a, b) =>

    a[0].localeCompare(b[0], undefined, { numeric: true })

  );

}



/** @param {object[]} rows */

function buildDailyRosterHtml(rows) {

  const list = dedupeDailyRows(rows);

  if (!list.length) return '';



  const body = list

    .map(

      (r) => `<tr>

      <td style="${bwTd('text-align:left;')}">${escapePdfHtml(r.student_name || r.student_id)}</td>

      <td style="${bwTd('text-align:center;')}">${escapePdfHtml(statusLabel(r.status))}</td>

    </tr>`

    )

    .join('');



  return `<h3 style="font-size:10pt;margin:10px 0 6px;font-weight:700;">${escapePdfHtml(t('pdf.dailyRoster'))}</h3>

    <table style="width:58%;max-width:400px;border-collapse:collapse;table-layout:fixed;">

      <thead><tr>

        <th style="${bwTh('text-align:left;padding:3px 5px;font-size:8pt;')}">${escapePdfHtml(t('pdf.studentList'))}</th>

        <th style="${bwTh('text-align:center;padding:3px 5px;font-size:8pt;width:68px;')}">${escapePdfHtml(t('common.status'))}</th>

      </tr></thead>

      <tbody>${body}</tbody>

    </table>`;

}



function dedupeDailyRows(rows) {

  const sorted = [...rows].sort((a, b) =>

    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))

  );

  const byStudent = new Map();

  for (const row of sorted) {

    const sid = String(row.student_id || '').trim();

    if (!sid) continue;

    byStudent.set(sid, row);

  }

  return [...byStudent.values()].sort((a, b) => {

    const sa = DAILY_STATUS_SORT[normalizeAttendanceStatus(a.status)] ?? 9;

    const sb = DAILY_STATUS_SORT[normalizeAttendanceStatus(b.status)] ?? 9;

    if (sa !== sb) return sa - sb;

    return String(a.student_name || '').localeCompare(String(b.student_name || ''), 'th');

  });

}


