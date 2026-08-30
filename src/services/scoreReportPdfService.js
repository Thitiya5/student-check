/**
 * Semester score summary PDF — uses in-memory score reports only.
 */
import { t } from '../i18n/index.js';
import { buildPdfDocumentHeaderHtml, escapePdfHtml } from './pdfDocumentHeader.js';
import { saveMultiPagePortraitPdf } from './pdfPageRender.js';
import { APP_THEME_COLOR } from '../config/schoolBranding.js';
import { BANGKOK_TZ } from '../utils/dateIso.js';
import { canExportScoreReportPdf } from './scoreReportPdfExportGate.js';
import { requiresCommunityService, getCommunityServiceThresholdScore } from './studentScoreService.js';
import pkg from '../../package.json';

const PDF_FONT = "'Sarabun',Tahoma,sans-serif";
const APP_VERSION = pkg.version || '—';
const ROWS_FIRST_PAGE = 18;
const ROWS_NEXT_PAGE = 26;

const SCORE_PDF_STYLES = `
  .score-pdf{font-family:${PDF_FONT};color:#1c1535;width:100%;box-sizing:border-box;}
  .score-pdf-page{padding:2px 4px 6px;}
  .score-pdf-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 10px;}
  .score-pdf-summary__item{border:1px solid #ccc;border-radius:6px;padding:6px 4px;text-align:center;background:#faf8ff;}
  .score-pdf-summary__label{display:block;font-size:7pt;color:#555;margin-bottom:2px;line-height:1.2;}
  .score-pdf-summary__value{font-size:11pt;font-weight:700;color:${APP_THEME_COLOR};}
  .score-pdf-summary__value--cs{color:#b91c1c;}
  .score-pdf-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 8px;}
  .score-pdf-table th,.score-pdf-table td{border:1px solid #bbb;padding:3px 3px;font-size:7pt;line-height:1.25;vertical-align:middle;text-align:center;}
  .score-pdf-table th{background:#ede9fe;font-weight:700;color:#1c1535;}
  .score-pdf-table td.score-pdf-name{text-align:left;word-wrap:break-word;overflow-wrap:break-word;}
  .score-pdf-table tr{page-break-inside:avoid;break-inside:avoid;}
  .score-pdf-table tr.score-pdf-row--cs{background:#fef2f2;}
  .score-pdf-score{font-weight:700;font-size:8.5pt;}
  .score-pdf-score--cs{color:#b91c1c;}
  .score-pdf-ded{color:#b91c1c;}
  .score-pdf-pos{color:#15803d;}
  .score-pdf-cs{font-size:6.5pt;font-weight:700;color:#b91c1c;}
  .score-pdf-ok{font-size:6.5pt;color:#15803d;}
  .score-pdf-footer{margin-top:8px;padding-top:6px;border-top:1px solid #ddd;font-size:6.5pt;color:#666;line-height:1.4;text-align:center;}
  .score-pdf-page-meta{font-size:7pt;color:#555;text-align:right;margin:0 0 6px;}
`;

/**
 * @param {Date} [date]
 */
function formatPrintedTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BANGKOK_TZ
  }).format(date);
}

/**
 * @param {object[]} reports
 * @param {number} firstSize
 * @param {number} nextSize
 */
function chunkReportsForPdf(reports, firstSize, nextSize) {
  if (!reports.length) return [[]];
  /** @type {object[][]} */
  const chunks = [];
  chunks.push(reports.slice(0, firstSize));
  let offset = firstSize;
  while (offset < reports.length) {
    chunks.push(reports.slice(offset, offset + nextSize));
    offset += nextSize;
  }
  return chunks;
}

/**
 * @param {string} bodyHtml
 */
function pdfPageShell(bodyHtml) {
  return `<div class="score-pdf"><style>${SCORE_PDF_STYLES}</style><section class="score-pdf-page">${bodyHtml}</section></div>`;
}

function renderTableHead() {
  return `<thead><tr>
    <th style="width:5%">#</th>
    <th style="width:22%">${escapePdfHtml(t('pointsReport.student'))}</th>
    <th style="width:10%">${escapePdfHtml(t('common.room'))}</th>
    <th style="width:8%">${escapePdfHtml(t('pointsReport.semesterScore'))}</th>
    <th style="width:9%">${escapePdfHtml(t('pointsReport.colAttendance'))}</th>
    <th style="width:9%">${escapePdfHtml(t('pointsReport.colDiscipline'))}</th>
    <th style="width:8%">${escapePdfHtml(t('pointsReport.colBehaviorGood'))}</th>
    <th style="width:8%">${escapePdfHtml(t('pointsReport.colBehaviorBad'))}</th>
    <th style="width:12%">${escapePdfHtml(t('pointsReport.scoreStatus'))}</th>
  </tr></thead>`;
}

/**
 * @param {object} report
 * @param {number} index
 * @param {number} csThreshold
 */
function renderReportRow(report, index, csThreshold) {
  const isCs = requiresCommunityService(report.totalScore, csThreshold);
  const rowCls = isCs ? 'score-pdf-row--cs' : '';
  const scoreCls = isCs ? 'score-pdf-score score-pdf-score--cs' : 'score-pdf-score';
  const status = isCs
    ? `<span class="score-pdf-cs">${escapePdfHtml(t('dashboard.communityServiceBadge'))}</span>`
    : `<span class="score-pdf-ok">${escapePdfHtml(t('pointsReport.scoreOk'))}</span>`;

  return `<tr class="${rowCls}">
    <td>${index + 1}</td>
    <td class="score-pdf-name">${escapePdfHtml(report.studentName || report.studentId || '')}</td>
    <td>${escapePdfHtml(report.classKey || '—')}</td>
    <td><span class="${scoreCls}">${escapePdfHtml(String(report.totalScore ?? '—'))}</span></td>
    <td class="score-pdf-ded">-${escapePdfHtml(String(report.attendanceDeductions ?? 0))}</td>
    <td class="score-pdf-ded">-${escapePdfHtml(String(report.disciplineDeductions ?? 0))}</td>
    <td class="score-pdf-pos">+${escapePdfHtml(String(report.behaviorPositive ?? 0))}</td>
    <td class="score-pdf-ded">-${escapePdfHtml(String(report.behaviorNegative ?? 0))}</td>
    <td>${status}</td>
  </tr>`;
}

/**
 * @param {object[]} reports
 * @param {number} csThreshold
 */
function renderSummaryCards(reports, csThreshold) {
  const csCount = reports.filter((r) => requiresCommunityService(r.totalScore, csThreshold)).length;
  const cards = [
    { label: t('pointsReport.pdf.totalStudents'), value: reports.length, cls: '' },
    { label: t('pointsReport.pdf.communityService'), value: csCount, cls: csCount ? 'score-pdf-summary__value--cs' : '' },
    {
      label: t('pointsReport.pdf.avgScore'),
      value: reports.length
        ? Math.round(reports.reduce((s, r) => s + (Number(r.totalScore) || 0), 0) / reports.length)
        : 0,
      cls: ''
    },
    { label: t('pointsReport.pdf.threshold'), value: `< ${csThreshold}`, cls: '' }
  ];

  return `<div class="score-pdf-summary">${cards
    .map(
      (card) => `<div class="score-pdf-summary__item">
        <span class="score-pdf-summary__label">${escapePdfHtml(card.label)}</span>
        <span class="score-pdf-summary__value ${card.cls}">${escapePdfHtml(String(card.value))}</span>
      </div>`
    )
    .join('')}</div>`;
}

/**
 * @param {{
 *   reports: object[],
 *   range: { from: string, to: string },
 *   classLabel?: string,
 *   communityServiceOnly?: boolean,
 *   printedBy?: string,
 *   printedAt?: string,
 * }} opts
 */
function buildScorePdfPages(opts) {
  const {
    reports,
    range,
    classLabel = t('common.all'),
    communityServiceOnly = false,
    printedBy = '',
    printedAt = formatPrintedTimestamp()
  } = opts;
  const csThreshold = getCommunityServiceThresholdScore();
  const tableHead = renderTableHead();
  const chunks = chunkReportsForPdf(reports, ROWS_FIRST_PAGE, ROWS_NEXT_PAGE);
  const rangeLabel = `${range.from} – ${range.to}`;
  const filterNote = communityServiceOnly
    ? t('pointsReport.pdf.filterCommunity', { threshold: csThreshold })
    : '';

  return chunks.map((chunk, pageIndex) => {
    const pageNum = pageIndex + 1;
    const totalPages = chunks.length;
    const pageLabel = t('pointsReport.pdf.pageOf', { page: pageNum, total: totalPages });

    const header = buildPdfDocumentHeaderHtml({
      title: t('pointsReport.pdf.title'),
      metaLines: [
        { label: t('reports.filterPeriod'), value: rangeLabel },
        { label: t('common.class'), value: classLabel },
        ...(filterNote ? [{ label: t('pointsReport.pdf.filterLabel'), value: filterNote }] : []),
        { label: t('pdf.exportedAt'), value: printedAt },
        { label: t('pointsReport.recordedBy'), value: printedBy || '—' }
      ],
      logoSize: 56,
      nameSize: 18,
      tagSize: 11,
      titleSize: 15,
      metaSize: 10,
      marginBottom: 8
    });

    const summaryHtml = pageIndex === 0 ? renderSummaryCards(reports, csThreshold) : '';
    const rowOffset = pageIndex === 0 ? 0 : ROWS_FIRST_PAGE + (pageIndex - 1) * ROWS_NEXT_PAGE;
    const bodyRows =
      chunk.map((r, i) => renderReportRow(r, rowOffset + i, csThreshold)).join('') ||
      `<tr><td colspan="9" style="text-align:center;">—</td></tr>`;

    const footer = `<footer class="score-pdf-footer">
      ${escapePdfHtml(t('pointsReport.pdf.footerGenerated'))}<br/>
      ${escapePdfHtml(t('pointsReport.pdf.footerVersion', { version: APP_VERSION }))} · ${escapePdfHtml(pageLabel)}
    </footer>`;

    return pdfPageShell(
      `${header}
      <p class="score-pdf-page-meta">${escapePdfHtml(pageLabel)}</p>
      ${summaryHtml}
      <table class="score-pdf-table">${tableHead}<tbody>${bodyRows}</tbody></table>
      ${footer}`
    );
  });
}

/**
 * @param {{
 *   reports: object[],
 *   range: { from: string, to: string },
 *   classLabel?: string,
 *   communityServiceOnly?: boolean,
 *   session?: import('./teacherAuth.js').TeacherAuthSession|null,
 * }} opts
 */
export async function exportScoreReportPdf(opts) {
  if (!canExportScoreReportPdf(opts.reports, opts.session)) {
    throw new Error(t('pdf.exportDenied'));
  }

  const printedAt = formatPrintedTimestamp();
  const printedBy = String(opts.session?.teacherName || '').trim();
  const fromSlug = String(opts.range?.from || 'from');
  const toSlug = String(opts.range?.to || 'to');
  const classSlug = String(opts.classLabel || 'all')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-ก-๙]/g, '') || 'all';
  const filename = `score-report-${classSlug}-${fromSlug}-${toSlug}.pdf`;

  const pages = buildScorePdfPages({
    reports: opts.reports,
    range: opts.range,
    classLabel: opts.classLabel,
    communityServiceOnly: opts.communityServiceOnly,
    printedBy,
    printedAt
  });

  await saveMultiPagePortraitPdf(pages, filename);
}
