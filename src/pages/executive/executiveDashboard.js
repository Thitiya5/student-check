import { t } from '../../i18n/index.js';
import { formatDateWithDayThai } from '../../components/datePicker.js';
import { getTodayDate } from '../../utils/dateIso.js';
import { escapeHtml } from '../../utils/html.js';
import { getExecutiveDashboardBundle, tryGetExecutiveDashboardBundleFromCache } from '../../services/executive/executiveAttendanceService.js';
import { perfMarkEnd, perfMarkStart } from '../../utils/perfTrace.js';
import { createExecutiveFilters } from '../../hooks/executive/useExecutiveFilters.js';
import { renderExecutiveHeader, bindExecutiveHeader } from '../../components/executive/executiveHeader.js';
import { renderExecutiveCompletionProgress } from '../../components/executive/executiveCompletionProgress.js';
import { renderExecutiveSummaryCards } from '../../components/executive/executiveSummaryCards.js';
import { renderExecutiveFilters, bindExecutiveFilters } from '../../components/executive/executiveFilters.js';
import { renderExecutiveCharts } from '../../components/executive/executiveCharts.js';
import { renderExecutiveCompareTable } from '../../components/executive/executiveCompareTable.js';
import { renderExecutiveInsights } from '../../components/executive/executiveInsights.js';
import { renderExecutiveExportBar, bindExecutiveExportBar } from '../../components/executive/executiveExportBar.js';
import { isAdminSession } from '../../services/teacherAuth.js';
import { canExportExecutivePdf } from '../../services/executive/executivePdfExportGate.js';
import { peekSchoolOverviewCache } from '../../services/executive/schoolOverviewCache.js';
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
  const isAdmin = isAdminSession(session);
  let loadSeq = 0;
  let refreshing = false;
  /** @type {object|null} */
  let lastRenderedData = null;

  async function loadData(filters, { forceRefresh = false } = {}) {
    const seq = ++loadSeq;
    const query = {
      date: filters.date || getTodayDate(),
      grade: filters.grade,
      room: filters.room,
      forceRefresh
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

  function renderShell({ filters, data, loading, isRefreshing = false }) {
    const todayLabel = formatDateWithDayThai(filters.date || getTodayDate());
    const hasError = Boolean(data?.error);
    const lastUpdated = data?.lastUpdated ?? null;
    const showDataSections = !loading && data;

    const dataSections = !showDataSections
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
        ${isAdmin ? renderExecutiveExportBar({ canExport: canExportExecutivePdf(data, session) }) : ''}`;

    container.innerHTML = `<div class="exec-layout">
      <div class="exec-main">
        ${renderExecutiveHeader({ filters, todayLabel, lastUpdated, loading, refreshing: isRefreshing })}
        ${renderExecutiveFilters(filters)}
        ${loading ? `<p class="exec-loading" role="status">${escapeHtml(t('common.loading'))}</p>` : ''}
        ${dataSections}
      </div>
    </div>`;

    bindExecutiveFilters(container, filterStore);
    bindExecutiveHeader(container, {
      onRefresh: () => {
        void refresh({ forceRefresh: true });
      }
    });
    if (hasError) {
      bindExecutiveErrorState(container, () => refresh({ forceRefresh: true }));
    } else if (!loading && data && isAdmin) {
      bindExecutiveExportBar(container, { data, filters, onToast, session });
    }
  }

  async function refresh({ forceRefresh = false } = {}) {
    const filters = filterStore.getState();
    const date = filters.date || getTodayDate();
    const hasWarmCache = !forceRefresh && Boolean(peekSchoolOverviewCache(date));

    if (!hasWarmCache) {
      renderShell({ filters, data: lastRenderedData, loading: true, isRefreshing: forceRefresh });
    } else if (forceRefresh) {
      refreshing = true;
      renderShell({ filters, data: lastRenderedData, loading: false, isRefreshing: true });
    } else {
      const instant = tryGetExecutiveDashboardBundleFromCache(session, {
        date,
        grade: filters.grade,
        room: filters.room
      });
      if (instant) {
        lastRenderedData = {
          summary: instant.summary,
          comparisonTable: instant.comparisonTable,
          insights: instant.insights,
          completion: instant.completion,
          charts: instant.charts,
          lastUpdated: instant.lastUpdated,
          error: null
        };
        renderShell({ filters, data: lastRenderedData, loading: false, isRefreshing: false });
      }
    }

    const data = await loadData(filters, { forceRefresh });
    refreshing = false;
    if (!data) return;
    lastRenderedData = data;
    renderShell({ filters, data, loading: false, isRefreshing: false });
    perfMarkEnd('executive-dashboard', { date, cached: hasWarmCache && !forceRefresh });
  }

  filterStore.subscribe(() => {
    void refresh();
  });

  perfMarkStart('executive-dashboard');
  void refresh();

  container.__executiveCleanup = () => {
    loadSeq += 1;
    refreshing = false;
    filterStore.subscribe(() => {});
  };
}
