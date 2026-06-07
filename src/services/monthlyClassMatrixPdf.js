/**
 * PDF สรุปรายเดือนแบบตาราง — ชื่อ | วัน 1–31 | % มา | คะแนนพฤติกรรม | รวม
 */
import html2pdf from 'html2pdf.js';
import { jsPDF } from 'jspdf';
import {
  SCHOOL_LOGO_SRC,
  SCHOOL_NAME_TH,
  SCHOOL_TAGLINE_TH
} from '../config/schoolBranding.js';
import { statusLabel, t } from '../i18n/index.js';
import { buildAttendanceClassKey, queryAttendanceInRangeForSession } from './attendanceService.js';
import { fetchStudentsByClass, studentFullName } from './studentsService.js';
import { queryClassPointsInRange } from './studentPointsService.js';
import { findHomeroomTeachersForClass } from './homeroomTeachers.js';
import { canAccessClass, toCanonicalClassKey, classKeyToParts } from './teacherAuth.js';
import {
  buildClassScoreReports,
  groupAttendanceByStudent,
  groupTransactionsByStudent
} from './studentScoreService.js';
import { computeScoreFromTransactions, computeAttendancePercentages } from '../utils/pointCalculations.js';
import { dedupeRecordsByDate } from '../utils/studentAttendanceSummary.js';
import { attendanceStatusAbbrev, ATTENDANCE_ABBREV, ATTENDANCE_ABBREV_LEGEND } from '../utils/attendanceAbbrev.js';

/**
 * @param {string} yearMonth yyyy-MM
 */
function lastDayOfMonth(yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {string} yearMonth yyyy-MM
 * @returns {{ day: number, dateKey: string, isWeekend: boolean }[]}
 */
export function buildMonthDayColumns(yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  /** @type {{ day: number, dateKey: string, isWeekend: boolean }[]} */
  const cols = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${yearMonth}-${String(day).padStart(2, '0')}`;
    const dow = new Date(`${dateKey}T12:00:00`).getDay();
    cols.push({
      day,
      dateKey,
      isWeekend: dow === 0 || dow === 6
    });
  }
  return cols;
}

/**
 * @param {string} yearMonth yyyy-MM
 */
function formatThaiMonthYear(yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(y, m - 1, 1));
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** จำนวนนักเรียนต่อหน้า — แต่ละ chunk render เป็น PDF 1 หน้า */
const MATRIX_ROWS_PER_PAGE = 30;

const MATRIX_PDF_OPTIONS = {
  margin: [5, 3, 5, 3],
  image: { type: 'jpeg', quality: 0.92 },
  html2canvas: { scale: 2, useCORS: true, logging: false },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
};

/**
 * @param {object[]} rows
 * @param {number} maxPerPage
 */
function chunkRowsForPdf(rows, maxPerPage) {
  if (!rows.length) return [[]];
  /** @type {object[][]} */
  const chunks = [];
  for (let i = 0; i < rows.length; i += maxPerPage) {
    chunks.push(rows.slice(i, i + maxPerPage));
  }
  return chunks;
}

/**
 * @param {number} dayCount
 */
function buildColgroup(dayCount) {
  const nameWidth = 15;
  const behaviorWidth = 8;
  const totalWidth = 6;
  const percentWidth = 5;
  const dayWidth = (100 - nameWidth - behaviorWidth - totalWidth - percentWidth) / dayCount;
  const dayCols = Array.from({ length: dayCount }, () => `<col style="width:${dayWidth.toFixed(2)}%;" />`).join('');
  return `<colgroup>
    <col style="width:${nameWidth}%;" />
    ${dayCols}
    <col style="width:${percentWidth}%;" />
    <col style="width:${behaviorWidth}%;" />
    <col style="width:${totalWidth}%;" />
  </colgroup>`;
}

/**
 * @param {{
 *   monthLabel: string,
 *   classKey: string,
 *   homeroomLine: string,
 * }} meta
 */
function renderMatrixSchoolHeader(meta) {
  return `<header class="pdf-matrix__header">
      <div class="pdf-matrix__brand">
        <img src="${SCHOOL_LOGO_SRC}" alt="" width="56" height="56" crossorigin="anonymous" />
        <div class="pdf-matrix__brand-text">
          <h1>${escapeHtml(SCHOOL_NAME_TH)}</h1>
          <p>${escapeHtml(SCHOOL_TAGLINE_TH)}</p>
        </div>
      </div>
      <h2>${escapeHtml(t('pdf.matrixTitle'))}</h2>
      <p class="pdf-matrix__meta">
        ${escapeHtml(t('pdf.matrixMonth'))}: <strong>${escapeHtml(meta.monthLabel)}</strong>
        &nbsp;·&nbsp; ${escapeHtml(t('common.class'))}: <strong>${escapeHtml(meta.classKey)}</strong>
        &nbsp;·&nbsp; ${escapeHtml(t('pdf.matrixHomeroom'))}: <strong>${escapeHtml(meta.homeroomLine)}</strong>
      </p>
    </header>`;
}

/**
 * @param {{ day: number, isWeekend: boolean }[]} dayColumns
 */
function renderMatrixTableHead(dayColumns) {
  const dayHeaders = dayColumns
    .map((col) => {
      const cls = col.isWeekend ? 'pdf-matrix__day pdf-matrix__day--weekend' : 'pdf-matrix__day';
      return `<th class="${cls}">${col.day}</th>`;
    })
    .join('');

  return `<thead>
        <tr class="pdf-matrix__head-row">
          <th class="pdf-matrix__col-name">${escapeHtml(t('pdf.matrixColName'))}</th>
          ${dayHeaders}
          <th class="pdf-matrix__col-summary">${escapeHtml(t('pdf.matrixColPercent'))}</th>
          <th class="pdf-matrix__col-summary">${escapeHtml(t('pdf.matrixColBehavior'))}</th>
          <th class="pdf-matrix__col-summary">${escapeHtml(t('pdf.matrixColTotal'))}</th>
        </tr>
      </thead>`;
}

/**
 * @param {object} row
 * @param {{ dateKey: string, isWeekend: boolean }[]} dayColumns
 */
function renderMatrixBodyRow(row, dayColumns) {
  const dayCells = dayColumns
    .map((col) => {
      const cls = col.isWeekend ? 'pdf-matrix__day pdf-matrix__day--weekend' : 'pdf-matrix__day';
      if (col.isWeekend) {
        return `<td class="${cls}"></td>`;
      }
      const status = row.statusByDate.get(col.dateKey);
      const abbrev = status ? attendanceStatusAbbrev(status) : '';
      const title = status ? escapeHtml(statusLabel(status)) : '';
      return `<td class="${cls}" title="${title}">${escapeHtml(abbrev)}</td>`;
    })
    .join('');

  return `<tr class="pdf-matrix__row">
        <td class="pdf-matrix__col-name">${escapeHtml(row.name)}</td>
        ${dayCells}
        <td class="pdf-matrix__col-summary">${row.presentPercent}%</td>
        <td class="pdf-matrix__col-summary pdf-matrix__score">${row.behaviorScore}</td>
        <td class="pdf-matrix__col-summary pdf-matrix__score">${row.totalScore}</td>
      </tr>`;
}

/** @param {string} legend @param {string} exportedAt */
function renderMatrixFooter(legend, exportedAt) {
  return `<footer class="pdf-matrix__footer">
      <p><strong>${escapeHtml(t('pdf.matrixLegend'))}:</strong> ${escapeHtml(legend)}</p>
      <p>${escapeHtml(t('pdf.matrixWeekendNote'))} · ${escapeHtml(t('pdf.exportedAt'))}: ${escapeHtml(exportedAt)}</p>
    </footer>`;
}

const MATRIX_PDF_STYLES = `
  .pdf-matrix{font-family:'Sarabun',Tahoma,sans-serif;color:#1a1a2e;width:100%;}
  .pdf-matrix-page{box-sizing:border-box;padding:8px 6px 10px;}
  .pdf-matrix__header{text-align:center;margin-bottom:10px;border-bottom:2px solid #7C4DFF;padding-bottom:8px;}
  .pdf-matrix__brand{display:flex;align-items:center;justify-content:center;gap:12px;}
  .pdf-matrix__brand img{border-radius:8px;flex-shrink:0;}
  .pdf-matrix__brand-text{text-align:left;}
  .pdf-matrix__brand-text h1{margin:0;font-size:18px;font-weight:700;color:#7C4DFF;line-height:1.2;}
  .pdf-matrix__brand-text p{margin:3px 0 0;font-size:11px;color:#444;}
  .pdf-matrix__header h2{margin:8px 0 4px;font-size:15px;font-weight:700;line-height:1.25;}
  .pdf-matrix__meta{margin:0;font-size:11px;line-height:1.5;word-wrap:break-word;}
  .pdf-matrix__meta strong{font-weight:700;}
  .pdf-matrix__table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .pdf-matrix__head-row{background:#ede9fe;}
  .pdf-matrix__col-name{border:1px solid #999;padding:3px 4px;text-align:left;font-size:7pt;line-height:1.25;word-wrap:break-word;overflow-wrap:break-word;vertical-align:middle;}
  .pdf-matrix__day{border:1px solid #ccc;padding:1px 0;text-align:center;font-size:6.5pt;line-height:1.1;vertical-align:middle;}
  .pdf-matrix__day--weekend{background:#ececec;}
  .pdf-matrix__col-summary{border:1px solid #999;padding:2px 1px;text-align:center;font-size:6pt;line-height:1.15;word-wrap:break-word;overflow-wrap:break-word;vertical-align:middle;}
  .pdf-matrix__row{page-break-inside:avoid;break-inside:avoid;}
  .pdf-matrix__score{font-size:7pt;font-weight:600;}
  .pdf-matrix__footer{margin-top:6px;}
  .pdf-matrix__footer p{margin:0 0 2px;font-size:7pt;color:#444;line-height:1.35;}
  .pdf-matrix__footer p:last-child{color:#888;font-size:6.5pt;}
`;

/**
 * @param {{
 *   chunk: object[],
 *   headerMeta: { monthLabel: string, classKey: string, homeroomLine: string },
 *   dayColumns: { dateKey: string, isWeekend: boolean }[],
 *   colgroup: string,
 *   tableHead: string,
 *   footer: string,
 * }} parts
 */
function buildMatrixPageHtml(parts) {
  const { chunk, headerMeta, dayColumns, colgroup, tableHead, footer } = parts;
  const bodyRows =
    chunk.map((row) => renderMatrixBodyRow(row, dayColumns)).join('') ||
    `<tr><td colspan="${dayColumns.length + 4}">${escapeHtml(t('history.empty'))}</td></tr>`;

  return `<div class="pdf-matrix"><style>${MATRIX_PDF_STYLES}</style>
    <section class="pdf-matrix-page">
      ${renderMatrixSchoolHeader(headerMeta)}
      <table class="pdf-matrix__table">${colgroup}${tableHead}<tbody>${bodyRows}</tbody></table>
      ${footer}
    </section>
  </div>`;
}

/** @param {string} pageHtml */
async function renderMatrixPageCanvas(pageHtml) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = pageHtml;
  const el = wrapper.querySelector('.pdf-matrix');
  if (!(el instanceof HTMLElement)) throw new Error('PDF render failed');

  document.body.appendChild(el);
  try {
    const worker = html2pdf()
      .set({ ...MATRIX_PDF_OPTIONS, pagebreak: { mode: [] } })
      .from(el);
    await worker.toCanvas();
    const canvas = await worker.get('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('PDF canvas failed');
    return canvas;
  } finally {
    el.remove();
  }
}

/**
 * @param {import('jspdf').jsPDF} pdf
 * @param {HTMLCanvasElement} canvas
 */
function appendCanvasToPdf(pdf, canvas) {
  const margin = MATRIX_PDF_OPTIONS.margin;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const innerW = pageWidth - margin[1] - margin[3];
  const innerH = pageHeight - margin[0] - margin[2];
  const imgType = MATRIX_PDF_OPTIONS.image.type.toUpperCase();
  const imgData = canvas.toDataURL(
    `image/${MATRIX_PDF_OPTIONS.image.type}`,
    MATRIX_PDF_OPTIONS.image.quality
  );
  const aspect = canvas.height / canvas.width;
  let renderW = innerW;
  let renderH = innerW * aspect;
  if (renderH > innerH) {
    renderH = innerH;
    renderW = innerH / aspect;
  }
  pdf.addImage(imgData, imgType, margin[1], margin[0], renderW, renderH);
}
/**
 * @param {{
 *   yearMonth: string,
 *   classKey: string,
 *   session: import('./teacherAuth.js').TeacherAuthSession,
 * }} opts
 */
export async function loadMonthlyClassMatrixData(opts) {
  const yearMonth = String(opts.yearMonth || '').trim();
  const classKey = toCanonicalClassKey(opts.classKey || '');
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error(t('pdf.matrixInvalidMonth'));
  }
  if (!classKey.includes('/')) {
    throw new Error(t('pdf.matrixPickClass'));
  }
  if (!canAccessClass(opts.session, classKey)) {
    throw new Error(t('admin.denied'));
  }

  const from = `${yearMonth}-01`;
  const to = lastDayOfMonth(yearMonth);
  const { level, room } = classKeyToParts(classKey);

  const [students, attendanceRows, transactions, homeroomTeachers] = await Promise.all([
    fetchStudentsByClass(level, room),
    queryAttendanceInRangeForSession(opts.session, { from, to, classKey }),
    queryClassPointsInRange(classKey, from, to),
    findHomeroomTeachersForClass(classKey)
  ]);

  students.sort((a, b) =>
    String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
  );

  const attByStudent = groupAttendanceByStudent(attendanceRows);
  const txnByStudent = groupTransactionsByStudent(transactions);
  const scoreReports = buildClassScoreReports(attendanceRows, transactions, students);
  const scoreById = new Map(scoreReports.map((r) => [r.studentId, r]));

  const dayColumns = buildMonthDayColumns(yearMonth);

  const rows = students.map((s) => {
    const sid = String(s.student_id);
    const attList = attByStudent.get(sid) || [];
    const days = dedupeRecordsByDate(attList);
    const statusByDate = new Map(days.map((d) => [d.attendanceDate, d.status]));
    const txns = txnByStudent.get(sid) || [];
    const score = computeScoreFromTransactions(txns);
    const attendance = computeAttendancePercentages(days);
    const report = scoreById.get(sid);

    return {
      student_id: sid,
      number: String(s.number || ''),
      name: studentFullName(s),
      statusByDate,
      behaviorScore: report?.totalScore ?? score.totalScore,
      totalScore: report?.totalScore ?? score.totalScore,
      presentPercent: report?.attendance?.presentPercent ?? attendance.presentPercent
    };
  });

  return {
    yearMonth,
    classKey,
    from,
    to,
    homeroomTeachers,
    dayColumns,
    rows
  };
}

/**
 * @param {{
 *   yearMonth: string,
 *   classKey: string,
 *   session: import('./teacherAuth.js').TeacherAuthSession,
 * }} opts
 */
export async function exportMonthlyClassMatrixPdf(opts) {
  const data = await loadMonthlyClassMatrixData(opts);
  const exportedAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const monthLabel = formatThaiMonthYear(data.yearMonth);
  const homeroomLine =
    data.homeroomTeachers.length > 0
      ? data.homeroomTeachers.join(', ')
      : t('pdf.matrixNoHomeroom');

  const legend = ATTENDANCE_ABBREV_LEGEND.map(([key]) => {
    const abbrev = ATTENDANCE_ABBREV[key];
    return `${abbrev}=${statusLabel(key)}`;
  }).join(' · ');

  const headerMeta = {
    monthLabel,
    classKey: data.classKey,
    homeroomLine
  };
  const colgroup = buildColgroup(data.dayColumns.length);
  const tableHead = renderMatrixTableHead(data.dayColumns);
  const pageChunks = chunkRowsForPdf(data.rows, MATRIX_ROWS_PER_PAGE);

  /** @type {import('jspdf').jsPDF} */
  let pdf = new jsPDF(MATRIX_PDF_OPTIONS.jsPDF);

  for (let pageIndex = 0; pageIndex < pageChunks.length; pageIndex += 1) {
    const chunk = pageChunks[pageIndex];
    const footer =
      pageIndex === pageChunks.length - 1 ? renderMatrixFooter(legend, exportedAt) : '';
    const pageHtml = buildMatrixPageHtml({
      chunk,
      headerMeta,
      dayColumns: data.dayColumns,
      colgroup,
      tableHead,
      footer
    });
    const canvas = await renderMatrixPageCanvas(pageHtml);
    if (pageIndex > 0) pdf.addPage();
    appendCanvasToPdf(pdf, canvas);
  }

  pdf.save(`attendance-matrix-${data.classKey.replace('/', '-')}-${data.yearMonth}.pdf`);
}
