/**
 * Discipline Report PDF — uses in-memory class detail only; no Firestore / GAS reads.
 */
import { t, statusLabel } from '../../i18n/index.js';
import { buildPdfDocumentHeaderHtml, escapePdfHtml } from '../pdfDocumentHeader.js';
import { saveMultiPagePortraitPdf } from '../pdfPageRender.js';
import { APP_THEME_COLOR } from '../../config/schoolBranding.js';
import { formatDateWithDayThai } from '../../components/datePicker.js';
import { getDisciplineChecks } from '../../data/disciplineChecks.js';
import { BANGKOK_TZ } from '../../utils/dateIso.js';
import { canExportDisciplineReportPdf } from './disciplinePdfExportGate.js';
import pkg from '../../../package.json';

const PDF_FONT = "'Sarabun',Tahoma,sans-serif";
const APP_VERSION = pkg.version || '—';

/** First page includes summary cards — fewer table rows */
const ROWS_FIRST_PAGE = 20;
const ROWS_NEXT_PAGE = 28;

const DISC_PDF_STYLES = `
  .disc-pdf{font-family:${PDF_FONT};color:#1c1535;width:100%;box-sizing:border-box;}
  .disc-pdf-page{padding:2px 4px 6px;}
  .disc-pdf-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 10px;}
  .disc-pdf-summary__item{border:1px solid #ccc;border-radius:6px;padding:6px 4px;text-align:center;background:#faf8ff;}
  .disc-pdf-summary__label{display:block;font-size:7pt;color:#555;margin-bottom:2px;line-height:1.2;}
  .disc-pdf-summary__value{font-size:11pt;font-weight:700;color:${APP_THEME_COLOR};}
  .disc-pdf-summary__value--warn{color:#c2410c;}
  .disc-pdf-summary__value--fail{color:#b91c1c;}
  .disc-pdf-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 8px;}
  .disc-pdf-table th,.disc-pdf-table td{border:1px solid #bbb;padding:3px 4px;font-size:7.5pt;line-height:1.3;vertical-align:middle;text-align:center;}
  .disc-pdf-table th{background:#ede9fe;font-weight:700;color:#1c1535;}
  .disc-pdf-table td.disc-pdf-name{text-align:left;word-wrap:break-word;overflow-wrap:break-word;}
  .disc-pdf-table tr{page-break-inside:avoid;break-inside:avoid;}
  .disc-pdf-pass{color:#15803d;font-weight:700;font-size:9pt;}
  .disc-pdf-fail{color:#b91c1c;font-weight:700;font-size:9pt;}
  .disc-pdf-remark{text-align:center;font-size:7pt;color:#444;}
  .disc-pdf-remark--neg{color:#b91c1c;font-weight:600;}
  .disc-pdf-footer{margin-top:8px;padding-top:6px;border-top:1px solid #ddd;font-size:6.5pt;color:#666;line-height:1.4;text-align:center;}
  .disc-pdf-page-meta{font-size:7pt;color:#555;text-align:right;margin:0 0 6px;}
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
 * @param {object[]} students
 * @param {Array<{ id: string }>} rules
 */
function computeClassSummary(students, rules) {
  const roster = students.filter((s) => !s.missing);
  /** @type {Record<string, number>} */
  const categoryFail = {};
  for (const rule of rules) {
    categoryFail[rule.id] = 0;
  }

  let passed = 0;
  let needImprovement = 0;

  for (const s of roster) {
    const allPass = rules.every((r) => s.rulePass?.[r.id]);
    if (allPass) passed += 1;
    else needImprovement += 1;
    for (const rule of rules) {
      if (!s.rulePass?.[rule.id]) categoryFail[rule.id] += 1;
    }
  }

  return {
    total: roster.length,
    passed,
    needImprovement,
    categoryFail
  };
}

/**
 * @param {boolean} passed
 * @param {boolean} absent
 */
function renderPassCell(passed, absent) {
  if (absent || !passed) {
    return `<span class="disc-pdf-fail" aria-label="${escapePdfHtml(t('disciplineReport.fail'))}">✗</span>`;
  }
  return `<span class="disc-pdf-pass" aria-label="${escapePdfHtml(t('disciplineReport.pass'))}">✓</span>`;
}

/**
 * @param {object} student
 * @param {Array<{ id: string, labelKey: string }>} rules
 * @param {number} index
 */
function renderStudentRow(student, rules, index) {
  const absent = student.status === 'absent';
  const ruleCells = rules
    .map((r) => `<td>${renderPassCell(Boolean(student.rulePass?.[r.id]), absent)}</td>`)
    .join('');

  let statusHtml = '—';
  if (student.missing) {
    statusHtml = escapePdfHtml(t('disciplineReport.notInRoll'));
  } else if (student.status) {
    statusHtml = escapePdfHtml(statusLabel(student.status) || student.status);
  }

  const pts = Number(student.totalPts) || 0;
  const remarkCls = pts < 0 ? 'disc-pdf-remark disc-pdf-remark--neg' : 'disc-pdf-remark';
  const remark = pts !== 0 ? String(pts) : '—';

  return `<tr>
    <td>${index + 1}</td>
    <td class="disc-pdf-name">${escapePdfHtml(student.student_name || '')}</td>
    <td>${statusHtml}</td>
    ${ruleCells}
    <td class="${remarkCls}">${escapePdfHtml(remark)}</td>
  </tr>`;
}

/**
 * @param {ReturnType<typeof computeClassSummary>} summary
 * @param {Array<{ id: string, labelKey: string }>} rules
 */
function renderSummaryCards(summary, rules) {
  const cards = [
    {
      label: t('disciplineReport.pdf.totalStudents'),
      value: summary.total,
      cls: ''
    },
    {
      label: t('disciplineReport.pdf.passed'),
      value: summary.passed,
      cls: ''
    },
    {
      label: t('disciplineReport.pdf.needImprovement'),
      value: summary.needImprovement,
      cls: 'disc-pdf-summary__value--warn'
    }
  ];

  for (const rule of rules) {
    cards.push({
      label: t(rule.labelKey),
      value: summary.categoryFail[rule.id] ?? 0,
      cls: 'disc-pdf-summary__value--fail'
    });
  }

  return `<div class="disc-pdf-summary">${cards
    .map(
      (card) => `<div class="disc-pdf-summary__item">
        <span class="disc-pdf-summary__label">${escapePdfHtml(card.label)}</span>
        <span class="disc-pdf-summary__value ${card.cls}">${escapePdfHtml(String(card.value))}</span>
      </div>`
    )
    .join('')}</div>`;
}

/**
 * @param {Array<{ id: string, labelKey: string }>} rules
 */
function renderTableHead(rules) {
  const ruleHeads = rules.map((r) => `<th>${escapePdfHtml(t(r.labelKey))}</th>`).join('');
  return `<thead><tr>
    <th>#</th>
    <th>${escapePdfHtml(t('pointsReport.student'))}</th>
    <th>${escapePdfHtml(t('common.status'))}</th>
    ${ruleHeads}
    <th>${escapePdfHtml(t('disciplineReport.pdf.remark'))}</th>
  </tr></thead>`;
}

/**
 * @param {object[]} students
 * @param {number} firstSize
 * @param {number} nextSize
 */
function chunkStudentsForPdf(students, firstSize, nextSize) {
  if (!students.length) return [[]];
  /** @type {object[][]} */
  const chunks = [];
  chunks.push(students.slice(0, firstSize));
  let offset = firstSize;
  while (offset < students.length) {
    chunks.push(students.slice(offset, offset + nextSize));
    offset += nextSize;
  }
  return chunks;
}

/**
 * @param {string} bodyHtml
 */
function pdfPageShell(bodyHtml) {
  return `<div class="disc-pdf"><style>${DISC_PDF_STYLES}</style><section class="disc-pdf-page">${bodyHtml}</section></div>`;
}

/**
 * @param {{
 *   detail: object,
 *   printedBy: string,
 *   printedAt: string,
 * }} opts
 */
function buildDisciplinePdfPages({ detail, printedBy, printedAt }) {
  const rules = getDisciplineChecks();
  const students = detail.students || [];
  const summary = computeClassSummary(students, rules);
  const inspectionLabel = formatDateWithDayThai(detail.inspectionDate);
  const tableHead = renderTableHead(rules);
  const chunks = chunkStudentsForPdf(students, ROWS_FIRST_PAGE, ROWS_NEXT_PAGE);
  const totalPages = chunks.length;

  return chunks.map((chunk, pageIndex) => {
    const pageNum = pageIndex + 1;
    const pageLabel = t('disciplineReport.pdf.pageOf', { page: pageNum, total: totalPages });

    const header = buildPdfDocumentHeaderHtml({
      title: t('disciplineReport.pdf.title'),
      metaLines: [
        { label: t('common.class'), value: detail.classKey },
        { label: t('disciplineReport.pdf.inspectionDateLabel'), value: inspectionLabel },
        { label: t('disciplineReport.pdf.printedAt'), value: printedAt },
        { label: t('disciplineReport.pdf.printedBy'), value: printedBy || '—' }
      ],
      logoSize: 56,
      nameSize: 18,
      tagSize: 11,
      titleSize: 15,
      metaSize: 10,
      marginBottom: 8
    });

    const summaryHtml = pageIndex === 0 ? renderSummaryCards(summary, rules) : '';
    const rowOffset = pageIndex === 0 ? 0 : ROWS_FIRST_PAGE + (pageIndex - 1) * ROWS_NEXT_PAGE;
    const bodyRows =
      chunk.map((s, i) => renderStudentRow(s, rules, rowOffset + i)).join('') ||
      `<tr><td colspan="${rules.length + 4}" style="text-align:center;">—</td></tr>`;

    const footer = `<footer class="disc-pdf-footer">
      ${escapePdfHtml(t('disciplineReport.pdf.footerGenerated'))}<br/>
      ${escapePdfHtml(t('disciplineReport.pdf.footerVersion', { version: APP_VERSION }))} · ${escapePdfHtml(t('pdf.exportedAt'))}: ${escapePdfHtml(printedAt)} · ${escapePdfHtml(pageLabel)}
    </footer>`;

    return pdfPageShell(
      `${header}
      <p class="disc-pdf-page-meta">${escapePdfHtml(pageLabel)}</p>
      ${summaryHtml}
      <table class="disc-pdf-table">${tableHead}<tbody>${bodyRows}</tbody></table>
      ${footer}`
    );
  });
}

/**
 * @param {{
 *   detail: object,
 *   session?: import('../teacherAuth.js').TeacherAuthSession|null,
 * }} opts
 */
export async function exportDisciplineReportPdf(opts) {
  if (!canExportDisciplineReportPdf(opts.detail, opts.session)) {
    throw new Error(t('pdf.exportDenied'));
  }

  const printedAt = formatPrintedTimestamp();
  const printedBy = String(opts.session?.teacherName || '').trim();
  const classSlug = String(opts.detail.classKey || 'class').replace('/', '-');
  const dateSlug = String(opts.detail.inspectionDate || 'date');
  const filename = `discipline-report-${classSlug}-${dateSlug}.pdf`;
  const pages = buildDisciplinePdfPages({
    detail: opts.detail,
    printedBy,
    printedAt
  });

  await saveMultiPagePortraitPdf(pages, filename);
}
