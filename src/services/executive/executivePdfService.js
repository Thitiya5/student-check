/**
 * Executive Dashboard PDF — isolated from Reports PDF (Sprint 4).
 * Uses in-memory bundle data only; no Firestore reads.
 */
import { t } from '../../i18n/index.js';
import { buildPdfMatrixStyleHeaderHtml, escapePdfHtml } from '../pdfDocumentHeader.js';
import { saveMultiPagePortraitPdf } from '../pdfPageRender.js';
import { APP_THEME_COLOR } from '../../config/schoolBranding.js';
import { formatDateWithDayThai } from '../../components/datePicker.js';
import { formatExecutiveClassLabel } from '../../utils/executive/executiveClassLabel.js';
import { BANGKOK_TZ } from '../../utils/dateIso.js';
import { canExportExecutivePdf } from './executivePdfExportGate.js';

const EXEC_PDF_FONT = "'Sarabun',Tahoma,sans-serif";

const EXEC_PDF_STYLES = `
  .exec-pdf{font-family:${EXEC_PDF_FONT};color:#1c1535;width:100%;box-sizing:border-box;}
  .exec-pdf-page{padding:2px 4px 8px;}
  .exec-pdf h3{margin:12px 0 6px;font-size:10pt;font-weight:700;color:${APP_THEME_COLOR};}
  .exec-pdf h4{margin:8px 0 4px;font-size:9pt;font-weight:650;color:#333;}
  .exec-pdf-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 10px;}
  .exec-pdf-table th,.exec-pdf-table td{border:1px solid #bbb;padding:4px 5px;font-size:8pt;line-height:1.3;vertical-align:middle;}
  .exec-pdf-table th{background:#ede9fe;font-weight:700;text-align:center;}
  .exec-pdf-table td.num{text-align:center;}
  .exec-pdf-kpi{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:0 0 10px;}
  .exec-pdf-kpi__item{border:1px solid #ccc;border-radius:6px;padding:6px 4px;text-align:center;background:#faf8ff;}
  .exec-pdf-kpi__label{display:block;font-size:7pt;color:#555;margin-bottom:2px;}
  .exec-pdf-kpi__value{font-size:11pt;font-weight:700;color:${APP_THEME_COLOR};}
  .exec-pdf-insights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 8px;}
  .exec-pdf-insight{border:1px solid #ccc;border-radius:6px;padding:6px;background:#fff;}
  .exec-pdf-insight__label{font-size:7pt;color:#666;display:block;margin-bottom:2px;}
  .exec-pdf-insight__value{font-size:9.5pt;font-weight:700;}
  .exec-pdf-bar-row{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:8pt;}
  .exec-pdf-bar-row__label{flex:0 0 52px;font-weight:600;}
  .exec-pdf-bar-row__track{flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden;}
  .exec-pdf-bar-row__fill{height:100%;background:${APP_THEME_COLOR};border-radius:4px;}
  .exec-pdf-bar-row__val{flex:0 0 36px;text-align:right;font-weight:600;}
  .exec-pdf-two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .exec-pdf-list{margin:0;padding:0;list-style:none;}
  .exec-pdf-list li{font-size:8pt;padding:3px 0;border-bottom:1px solid #eee;}
  .exec-pdf-footer{margin-top:10px;font-size:7pt;color:#888;text-align:right;}
  .exec-pdf-completion{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 10px;}
  .exec-pdf-completion__card{border:1px solid #ccc;border-radius:6px;padding:8px;background:#faf8ff;}
  .exec-pdf-completion__title{font-size:8pt;font-weight:700;margin:0 0 4px;color:#333;}
  .exec-pdf-completion__value{font-size:10pt;font-weight:700;margin:0;color:${APP_THEME_COLOR};}
  .exec-pdf-completion__sub{font-size:7.5pt;color:#555;margin:4px 0 0;}
`;

/**
 * @param {string|null|undefined} iso
 */
function formatPdfTimestamp(iso) {
  if (!iso) return t('executive.header.lastUpdatedNone');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t('executive.header.lastUpdatedNone');
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
 * @param {string} classKey
 */
function formatRoomLabel(classKey) {
  const key = String(classKey || '').trim();
  if (!key || key === '—') return '—';
  return formatExecutiveClassLabel(key);
}

/**
 * @param {{ messageKey: string, count?: number, percent?: number }} operational
 */
function operationalPdfText(operational) {
  if (!operational?.messageKey) return '—';
  if (operational.messageKey === 'executive.completion.statusPending') {
    return t(operational.messageKey, { count: operational.count ?? 0 });
  }
  if (operational.messageKey === 'executive.completion.statusLow') {
    return t(operational.messageKey, { percent: operational.percent ?? 0 });
  }
  return t(operational.messageKey);
}

/**
 * @param {string} bodyHtml
 */
function pdfPageShell(bodyHtml) {
  return `<div class="exec-pdf"><style>${EXEC_PDF_STYLES}</style><section class="exec-pdf-page">${bodyHtml}</section></div>`;
}

/**
 * @param {{
 *   data: object,
 *   filters: import('../../hooks/executive/useExecutiveFilters.js').ExecutiveFilters,
 * }} opts
 */
function buildExecutivePdfPages({ data, filters }) {
  const dateKey = filters.date || '';
  const dateLabel = dateKey ? formatDateWithDayThai(dateKey) : '—';
  const lastUpdated = formatPdfTimestamp(data.lastUpdated);
  const exportedAt = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BANGKOK_TZ
  }).format(new Date());

  const gradeFilter = filters.grade
    ? filters.grade
    : t('executive.filters.allGrades');
  const roomFilter = filters.room ? filters.room : t('common.all');

  const metaLines = [
    { label: t('executive.filters.date'), value: dateLabel },
    { label: t('executive.header.lastUpdated'), value: lastUpdated },
    { label: t('executive.filters.grade'), value: gradeFilter },
    { label: t('executive.filters.room'), value: roomFilter }
  ];

  if (filters.academicYear) {
    metaLines.unshift({
      label: t('executive.filters.academicYear'),
      value: t('executive.period.academicYear', { year: filters.academicYear })
    });
  }
  if (filters.semester) {
    metaLines.splice(1, 0, {
      label: t('executive.filters.semester'),
      value: t('executive.period.semester', { term: filters.semester })
    });
  }

  const header = buildPdfMatrixStyleHeaderHtml({
    title: t('executive.pdf.title'),
    metaLines,
    logoSize: 52,
    nameSize: 16,
    titleSize: 13,
    metaSize: 9,
    marginBottom: 8
  });

  const { summary, completion, insights, charts, comparisonTable } = data;
  const status = completion.status ?? {
    totalRooms: 0,
    checkedRooms: 0,
    pendingRooms: 0,
    completionPercent: 0
  };
  const operational = completion.operationalStatus ?? {
    level: 'warn',
    messageKey: 'executive.completion.statusNoRooms'
  };
  const lastCompleted = completion.lastCompleted ?? {
    displayLabel: '—',
    teacherName: '—',
    timestamp: null
  };

  const pendingList = (completion.pendingRooms ?? [])
    .map((r) => `<li>${escapePdfHtml(r.displayLabel || r.classKey)}</li>`)
    .join('');

  const completionHtml = `<div class="exec-pdf-completion">
    <div class="exec-pdf-completion__card">
      <p class="exec-pdf-completion__title">${escapePdfHtml(t('executive.completion.cardCompletion'))}</p>
      <p class="exec-pdf-completion__value">${status.checkedRooms} / ${status.totalRooms} ${escapePdfHtml(t('executive.completion.classrooms'))}</p>
      <p class="exec-pdf-completion__sub">${escapePdfHtml(String(status.completionPercent))}%</p>
    </div>
    <div class="exec-pdf-completion__card">
      <p class="exec-pdf-completion__title">${escapePdfHtml(t('executive.completion.cardPending'))}</p>
      <p class="exec-pdf-completion__value">${escapePdfHtml(t('executive.completion.pendingCount', { count: status.pendingRooms }))}</p>
      ${pendingList ? `<ul class="exec-pdf-list">${pendingList}</ul>` : `<p class="exec-pdf-completion__sub">${escapePdfHtml(t('executive.completion.noPending'))}</p>`}
    </div>
    <div class="exec-pdf-completion__card">
      <p class="exec-pdf-completion__title">${escapePdfHtml(t('executive.completion.cardRecent'))}</p>
      <p class="exec-pdf-completion__value">${escapePdfHtml(lastCompleted.displayLabel)}</p>
      <p class="exec-pdf-completion__sub">${escapePdfHtml(lastCompleted.teacherName)}</p>
    </div>
    <div class="exec-pdf-completion__card">
      <p class="exec-pdf-completion__title">${escapePdfHtml(t('executive.completion.cardStatus'))}</p>
      <p class="exec-pdf-completion__value">${escapePdfHtml(operationalPdfText(operational))}</p>
    </div>
  </div>`;

  const kpiItems = [
    { label: t('executive.summary.totalStudents'), value: summary.totalStudents },
    { label: t('executive.summary.present'), value: summary.present },
    { label: t('executive.summary.absent'), value: summary.absent },
    { label: t('executive.summary.leave'), value: summary.leave },
    { label: t('executive.summary.late'), value: summary.late }
  ];
  const kpiHtml = `<div class="exec-pdf-kpi">${kpiItems
    .map(
      (item) => `<div class="exec-pdf-kpi__item">
        <span class="exec-pdf-kpi__label">${escapePdfHtml(item.label)}</span>
        <span class="exec-pdf-kpi__value">${escapePdfHtml(String(item.value ?? 0))}</span>
      </div>`
    )
    .join('')}</div>`;

  const insightsHtml = `<div class="exec-pdf-insights">
    <div class="exec-pdf-insight">
      <span class="exec-pdf-insight__label">${escapePdfHtml(t('executive.insights.rate'))}</span>
      <span class="exec-pdf-insight__value">${escapePdfHtml(String(insights.attendanceRate ?? 0))}%</span>
    </div>
    <div class="exec-pdf-insight">
      <span class="exec-pdf-insight__label">${escapePdfHtml(t('executive.insights.bestRoom'))}</span>
      <span class="exec-pdf-insight__value">${escapePdfHtml(formatRoomLabel(insights.bestPerformingRoom))}</span>
    </div>
    <div class="exec-pdf-insight">
      <span class="exec-pdf-insight__label">${escapePdfHtml(t('executive.insights.attentionRoom'))}</span>
      <span class="exec-pdf-insight__value">${escapePdfHtml(formatRoomLabel(insights.roomNeedingAttention))}</span>
    </div>
  </div>`;

  const page1 = pdfPageShell(
    `${header}
    <h3>${escapePdfHtml(t('executive.completion.title'))}</h3>
    ${completionHtml}
    <h3>${escapePdfHtml(t('executive.summary.aria'))}</h3>
    ${kpiHtml}
    <h3>${escapePdfHtml(t('executive.insights.title'))}</h3>
    ${insightsHtml}`
  );

  const compareHead = `<tr>
    <th>${escapePdfHtml(t('executive.table.grade'))}</th>
    <th>${escapePdfHtml(t('executive.summary.present'))}</th>
    <th>${escapePdfHtml(t('executive.summary.absent'))}</th>
    <th>${escapePdfHtml(t('executive.summary.leave'))}</th>
    <th>${escapePdfHtml(t('executive.summary.late'))}</th>
    <th>${escapePdfHtml(t('executive.table.attendancePct'))}</th>
  </tr>`;
  const compareBody = comparisonTable.length
    ? comparisonTable
        .map(
          (row) => `<tr>
        <td>${escapePdfHtml(row.grade)}</td>
        <td class="num">${row.present ?? 0}</td>
        <td class="num">${row.absent ?? 0}</td>
        <td class="num">${row.leave ?? 0}</td>
        <td class="num">${row.late ?? 0}</td>
        <td class="num"><strong>${row.attendancePct ?? 0}%</strong></td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="6" style="text-align:center;">${escapePdfHtml(t('executive.charts.empty'))}</td></tr>`;

  const byGradeBars = (charts.byGrade ?? [])
    .map((row) => {
      const w = Math.max(4, Math.min(100, row.presentPct ?? 0));
      return `<div class="exec-pdf-bar-row">
        <span class="exec-pdf-bar-row__label">${escapePdfHtml(row.grade)}</span>
        <div class="exec-pdf-bar-row__track"><div class="exec-pdf-bar-row__fill" style="width:${w}%"></div></div>
        <span class="exec-pdf-bar-row__val">${row.presentPct ?? 0}%</span>
      </div>`;
    })
    .join('');

  const statusRows = (charts.statusDistribution ?? [])
    .map((row) => {
      const w = Math.max(4, Math.min(100, row.pct ?? 0));
      return `<div class="exec-pdf-bar-row">
        <span class="exec-pdf-bar-row__label">${escapePdfHtml(t(`executive.status.${row.status}`))}</span>
        <div class="exec-pdf-bar-row__track"><div class="exec-pdf-bar-row__fill" style="width:${w}%"></div></div>
        <span class="exec-pdf-bar-row__val">${row.count ?? 0} (${row.pct ?? 0}%)</span>
      </div>`;
    })
    .join('');

  const roomComp = charts.roomCompletion ?? { checked: 0, pending: 0, total: 0 };
  const checkedPct =
    roomComp.total > 0
      ? Math.round((roomComp.checked / roomComp.total) * 1000) / 10
      : 0;

  const page2 = pdfPageShell(
    `<h3>${escapePdfHtml(t('executive.table.title'))}</h3>
    <table class="exec-pdf-table"><thead>${compareHead}</thead><tbody>${compareBody}</tbody></table>
    <div class="exec-pdf-two-col">
      <div>
        <h3>${escapePdfHtml(t('executive.charts.byGrade'))}</h3>
        ${byGradeBars || `<p style="font-size:8pt;color:#666;">${escapePdfHtml(t('executive.charts.empty'))}</p>`}
      </div>
      <div>
        <h3>${escapePdfHtml(t('executive.charts.distribution'))}</h3>
        ${statusRows || `<p style="font-size:8pt;color:#666;">${escapePdfHtml(t('executive.charts.emptySaved'))}</p>`}
      </div>
    </div>
    <h3>${escapePdfHtml(t('executive.charts.roomCompletion'))}</h3>
    <p style="font-size:9pt;margin:0 0 8px;">
      ${escapePdfHtml(t('executive.charts.checkedRooms', { count: roomComp.checked }))} ·
      ${escapePdfHtml(t('executive.charts.pendingRooms', { count: roomComp.pending }))} ·
      <strong>${checkedPct}%</strong>
    </p>`
  );

  const topRooms = (charts.topRooms ?? [])
    .map(
      (room) => `<li>${escapePdfHtml(room.displayLabel)} — <strong>${room.attendancePct}%</strong></li>`
    )
    .join('');
  const attentionRooms = (charts.attentionRooms ?? [])
    .map(
      (room) => `<li>${escapePdfHtml(room.displayLabel)} — <strong>${room.attendancePct}%</strong></li>`
    )
    .join('');

  const page3 = pdfPageShell(
    `<div class="exec-pdf-two-col">
      <div>
        <h3>${escapePdfHtml(t('executive.charts.topRooms'))}</h3>
        <ul class="exec-pdf-list">${topRooms || `<li>${escapePdfHtml(t('executive.charts.empty'))}</li>`}</ul>
      </div>
      <div>
        <h3>${escapePdfHtml(t('executive.charts.attentionRooms'))}</h3>
        <ul class="exec-pdf-list">${attentionRooms || `<li>${escapePdfHtml(t('executive.charts.empty'))}</li>`}</ul>
      </div>
    </div>
    <footer class="exec-pdf-footer">${escapePdfHtml(t('executive.pdf.exportedAt'))}: ${escapePdfHtml(exportedAt)}</footer>`
  );

  return [page1, page2, page3];
}

/**
 * @param {{
 *   data: object,
 *   filters: import('../../hooks/executive/useExecutiveFilters.js').ExecutiveFilters,
 * }} opts
 */
export async function exportExecutiveDashboardPdf(opts) {
  if (!canExportExecutivePdf(opts.data)) {
    throw new Error(t('executive.export.failed'));
  }

  const dateKey = String(opts.filters?.date || '').trim() || 'report';
  const filename = `executive-dashboard-${dateKey}.pdf`;
  const pages = buildExecutivePdfPages(opts);
  await saveMultiPagePortraitPdf(pages, filename);
}
