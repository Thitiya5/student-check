import { t } from '../../i18n/index.js';
import { formatDateWithDayThai } from '../../components/datePicker.js';
import { getTodayDate } from '../../utils/dateIso.js';
import { escapeHtml } from '../../utils/html.js';
import { getExecutiveDashboardBundle } from '../../services/executive/executiveAttendanceService.js';
import { createExecutiveFilters } from '../../hooks/executive/useExecutiveFilters.js';
import { renderExecutiveHeader } from '../../components/executive/executiveHeader.js';
import { renderExecutiveCompletionProgress } from '../../components/executive/executiveCompletionProgress.js';
import { renderExecutiveSummaryCards } from '../../components/executive/executiveSummaryCards.js';
import { renderExecutiveFilters, bindExecutiveFilters } from '../../components/executive/executiveFilters.js';
import { renderExecutiveCharts } from '../../components/executive/executiveCharts.js';
import { renderExecutiveCompareTable } from '../../components/executive/executiveCompareTable.js';
import { renderExecutiveInsights } from '../../components/executive/executiveInsights.js';
import { renderExecutiveExportBar, bindExecutiveExportBar } from '../../components/executive/executiveExportBar.js';
import { canExportExecutivePdf } from '../../services/executive/executivePdfService.js';
import {
  bindExecutiveErrorState,
  renderExecutiveErrorState
} from '../../components/executive/executiveErrorState.js';

/**
 * @param {HTMLElement} container
 * @param {{ state?: { teacherAuth?: object }, onNavigate?: (path: string) => void, onToast?: (msg: string) => void }} ctx
 */
export function renderExecutiveDashboardPage(container, { state, onToast } = {}) {
  container.classList.add('executive-dashboard-page');
  const filterStore = createExecutiveFilters();
  const session = state?.teacherAuth ?? null;
  let loadSeq = 0;

  async function loadData(filters) {
    const seq = ++loadSeq;
    const query = {
      date: filters.date || getTodayDate(),
      grade: filters.grade,
      room: filters.room
    };

    try {
      const bundle = await getExecutiveDashboardBundle(session, query);
      if (seq !== loadSeq) return null;
      return {
        summary: bundle.summary,
        comparisonTable: bundle.comparisonTable,
        insights: bundle.insights,
        completion: bundle.completion,
        charts: bundle.charts,
        lastUpdated: bundle.lastUpdated,
        error: null
      };
    } catch (err) {
      if (seq !== loadSeq) return null;
      const isRosterError = err?.code === 'executive-roster-failed';
      if (!isRosterError) {
        onToast?.(err?.message || t('common.loadFailed'));
      }
      return {
        error: err?.message || t('common.loadFailed'),
        isRosterError,
        summary: null,
        comparisonTable: null,
        insights: null,
        completion: null,
        charts: null,
        lastUpdated: null
      };
    }
  }

  function renderShell({ filters, data, loading }) {
    const todayLabel = formatDateWithDayThai(filters.date || getTodayDate());
    const hasError = Boolean(data?.error);
    const lastUpdated = data?.lastUpdated ?? null;

    const dataSections = loading
      ? ''
      : hasError
        ? renderExecutiveErrorState({
            message: data.error,
            isRosterError: data.isRosterError
          })
        : `${renderExecutiveCompletionProgress(data?.completion ?? null, { loading: false, charts: data?.charts })}
        ${renderExecutiveSummaryCards(data?.summary ?? { totalStudents: 0, present: 0, absent: 0, leave: 0, late: 0 }, { charts: data?.charts })}        ${renderExecutiveCharts(data?.charts, { loading: false })}
        ${renderExecutiveCompareTable(data?.comparisonTable ?? [])}
        ${renderExecutiveInsights(data?.insights ?? { attendanceRate: 0, bestPerformingRoom: '—', roomNeedingAttention: '—' }, { loading: false })}
        ${renderExecutiveExportBar({ canExport: canExportExecutivePdf(data) })}`;

    container.innerHTML = `<div class="exec-layout">
      <div class="exec-main">
        ${renderExecutiveHeader({ filters, todayLabel, lastUpdated, loading })}
        ${renderExecutiveFilters(filters)}
        ${loading ? `<p class="exec-loading" role="status">${escapeHtml(t('common.loading'))}</p>` : ''}
        ${dataSections}
      </div>
    </div>`;

    bindExecutiveFilters(container, filterStore);
    if (hasError) {
      bindExecutiveErrorState(container, () => refresh());
    } else if (!loading && data) {
      bindExecutiveExportBar(container, { data, filters, onToast });
    }
  }

  async function refresh() {
    const filters = filterStore.getState();
    renderShell({ filters, data: null, loading: true });
    const data = await loadData(filters);
    if (!data) return;
    renderShell({ filters, data, loading: false });
  }

  filterStore.subscribe(() => {
    refresh();
  });

  refresh();

  container.__executiveCleanup = () => {
    loadSeq += 1;
    filterStore.subscribe(() => {});
  };
}
