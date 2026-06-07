import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t, statusLabel } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { loadTeacherAuthSession, isSchoolWideViewSession, classKeyToParts } from '../services/teacherAuth.js';
import {
  defaultReportYearMonth,
  loadDisciplineReportOverview,
  loadClassDisciplineDetail,
  canViewDisciplineReportSession
} from '../services/disciplineReportService.js';
import { getDisciplineChecks } from '../data/disciplineChecks.js';
import { getTodayDate } from '../utils/dateIso.js';
import { formatDateWithDayThai } from '../components/datePicker.js';

function statusBadge(status) {
  if (status === 'recorded') {
    return `<span class="disc-report-badge disc-report-badge--ok">${escapeHtml(t('disciplineReport.statusRecorded'))}</span>`;
  }
  if (status === 'partial') {
    return `<span class="disc-report-badge disc-report-badge--warn">${escapeHtml(t('disciplineReport.statusPartial'))}</span>`;
  }
  return `<span class="disc-report-badge disc-report-badge--miss">${escapeHtml(t('disciplineReport.statusNotRecorded'))}</span>`;
}

function passCell(passed, absent) {
  if (absent) {
    return `<span class="disc-report-cell disc-report-cell--fail" aria-label="${escapeHtml(t('disciplineReport.fail'))}">✗</span>`;
  }
  if (passed) {
    return `<span class="disc-report-cell disc-report-cell--pass" aria-label="${escapeHtml(t('disciplineReport.pass'))}">✓</span>`;
  }
  return `<span class="disc-report-cell disc-report-cell--fail" aria-label="${escapeHtml(t('disciplineReport.fail'))}">✗</span>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderDisciplineReportPage(container, { state = {}, onToast, onLogout, onBack, onNavigate } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!canViewDisciplineReportSession(session)) {
    container.innerHTML = renderEmpty(t('disciplineReport.denied'));
    return;
  }

  const schoolWide = isSchoolWideViewSession(session);
  const today = getTodayDate();
  let yearMonth = defaultReportYearMonth(today);
  /** @type {string|null} */
  let selectedClass = null;
  /** @type {Awaited<ReturnType<typeof loadDisciplineReportOverview>>|null} */
  let overview = null;
  let loadSeq = 0;

  container.classList.add('discipline-report-page');
  container.innerHTML = `${renderPageHeader({
    title: t('disciplineReport.title'),
    subtitle: t('disciplineReport.subtitle'),
    topAction: 'back'
  })}
  <section class="reports-toolbar glass-card disc-report-toolbar">
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('disciplineReport.pickMonth'))}</p>
      <div class="reports-toolbar__period">
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('disciplineReport.month'))}</span>
          <input type="month" id="discRepMonth" class="reports-filter__control input-field" value="${escapeHtml(yearMonth)}" />
        </label>
        <button type="button" class="button-primary disc-report-load-btn" id="discRepLoadBtn">${escapeHtml(t('disciplineReport.load'))}</button>
      </div>
    </div>
  </section>
  <div id="discRepBody">${renderLoading(t('disciplineReport.loading'))}</div>`;

  bindPageHeaderActions(container, {
    onBack: () => (selectedClass ? showOverview() : onBack?.('/dashboard')),
    onNavigate
  });

  const body = container.querySelector('#discRepBody');
  const monthInput = container.querySelector('#discRepMonth');

  function checkEditHref(classKey, inspectionDate) {
    const { level, room } = classKeyToParts(classKey);
    if (schoolWide) {
      return `#/inspection?date=${encodeURIComponent(inspectionDate)}&level=${encodeURIComponent(level)}&room=${encodeURIComponent(room)}`;
    }
    return `#/check?date=${encodeURIComponent(inspectionDate)}&level=${encodeURIComponent(level)}&room=${encodeURIComponent(room)}`;
  }

  function renderSummaryCards() {
    if (!overview) return '';
    const { summary, inspectionDates, primaryDate } = overview;
    const dateLabel = primaryDate ? formatDateWithDayThai(primaryDate) : '—';
    const datesExtra =
      inspectionDates.length > 1
        ? ` · ${inspectionDates.map((d) => formatDateWithDayThai(d)).join(', ')}`
        : '';
    return `<div class="disc-report-summary glass-card">
      <p class="disc-report-summary__dates">${escapeHtml(t('disciplineReport.inspectionDate', { date: dateLabel }))}${escapeHtml(datesExtra)}</p>
      <div class="disc-report-summary__stats">
        <div class="disc-report-stat">
          <span class="disc-report-stat__val">${summary.recorded}</span>
          <span class="disc-report-stat__lbl">${escapeHtml(t('disciplineReport.statRecorded'))}</span>
        </div>
        <div class="disc-report-stat">
          <span class="disc-report-stat__val disc-report-stat__val--warn">${summary.partial}</span>
          <span class="disc-report-stat__lbl">${escapeHtml(t('disciplineReport.statPartial'))}</span>
        </div>
        <div class="disc-report-stat">
          <span class="disc-report-stat__val disc-report-stat__val--miss">${summary.notRecorded}</span>
          <span class="disc-report-stat__lbl">${escapeHtml(t('disciplineReport.statNotRecorded'))}</span>
        </div>
        <div class="disc-report-stat">
          <span class="disc-report-stat__val">${summary.total}</span>
          <span class="disc-report-stat__lbl">${escapeHtml(t('disciplineReport.statTotal'))}</span>
        </div>
      </div>
    </div>`;
  }

  function renderClassGrid() {
    if (!overview?.classes?.length) {
      return renderEmpty(t('disciplineReport.noClasses'));
    }
    const items = overview.classes
      .map((c) => {
        const meta =
          c.status === 'not_recorded'
            ? t('disciplineReport.classMetaNone')
            : t('disciplineReport.classMetaCounts', {
                fail: c.failCount,
                absent: c.absentCount,
                n: c.recordCount
              });
        return `<button type="button" class="disc-report-class-card glass-card" data-class="${escapeHtml(c.classKey)}">
          <span class="disc-report-class-card__key">${escapeHtml(c.classKey)}</span>
          ${statusBadge(c.status)}
          <span class="disc-report-class-card__meta">${escapeHtml(meta)}</span>
        </button>`;
      })
      .join('');
    return `<section class="disc-report-classes">
      <h2 class="disc-report-section-title">${escapeHtml(t('disciplineReport.classGridTitle'))}</h2>
      <div class="disc-report-class-grid">${items}</div>
    </section>`;
  }

  function renderOverviewHtml() {
    if (!overview?.inspectionDates?.length) {
      return renderEmpty(t('disciplineReport.noInspectionDate'), t('disciplineReport.noInspectionDateHint'));
    }
    return `${renderSummaryCards()}${renderClassGrid()}`;
  }

  async function renderClassDetail(classKey) {
    if (!overview?.primaryDate || !body) return;
    body.innerHTML = renderLoading(t('disciplineReport.loadingClass'));
    const seq = ++loadSeq;
    try {
      const detail = await loadClassDisciplineDetail(session, classKey, overview.primaryDate);
      if (seq !== loadSeq) return;

      const rules = getDisciplineChecks();
      const headCols = rules
        .map((r) => `<th scope="col">${escapeHtml(t(r.labelKey))}</th>`)
        .join('');

      const rows = detail.students
        .map((s, i) => {
          const absent = s.status === 'absent';
          const ruleCells = rules
            .map((r) => `<td>${passCell(s.rulePass[r.id], absent)}</td>`)
            .join('');
          const statusHtml = s.missing
            ? `<span class="disc-report-missing">${escapeHtml(t('disciplineReport.notInRoll'))}</span>`
            : s.status
              ? escapeHtml(statusLabel(s.status) || s.status)
              : '—';
          const ptsCls = s.totalPts < 0 ? 'disc-report-pts--neg' : '';
          return `<tr class="${s.missing ? 'disc-report-row--missing' : ''}">
            <td>${i + 1}</td>
            <td class="disc-report-name">${escapeHtml(s.student_name)}</td>
            <td>${statusHtml}</td>
            ${ruleCells}
            <td class="disc-report-pts ${ptsCls}">${s.totalPts ? s.totalPts : '0'}</td>
          </tr>`;
        })
        .join('');

      const editHref = checkEditHref(classKey, overview.primaryDate);
      const editLabel = schoolWide
        ? t('disciplineReport.editInspection')
        : t('disciplineReport.editCheck');

      body.innerHTML = `<section class="disc-report-detail glass-card">
        <div class="disc-report-detail__head">
          <button type="button" class="disc-report-back-btn" id="discRepBackBtn">← ${escapeHtml(t('common.back'))}</button>
          <div>
            <h2 class="disc-report-detail__title">${escapeHtml(classKey)}</h2>
            <p class="disc-report-detail__sub">${escapeHtml(formatDateWithDayThai(overview.primaryDate))}</p>
          </div>
          <a class="button-secondary disc-report-edit-link" href="${editHref}">${escapeHtml(editLabel)} →</a>
        </div>
        <div class="disc-report-table-wrap">
          <table class="disc-report-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">${escapeHtml(t('pointsReport.student'))}</th>
                <th scope="col">${escapeHtml(t('common.status'))}</th>
                ${headCols}
                <th scope="col">${escapeHtml(t('disciplineReport.deductTotal'))}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="disc-report-legend">${escapeHtml(t('disciplineReport.legend'))}</p>
      </section>`;

      body.querySelector('#discRepBackBtn')?.addEventListener('click', () => showOverview());
    } catch (err) {
      if (seq !== loadSeq) return;
      body.innerHTML = renderEmpty(t('disciplineReport.loadFailed'), err?.message || '');
    }
  }

  function bindClassGrid() {
    body?.querySelectorAll('[data-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const classKey = btn.getAttribute('data-class');
        if (!classKey) return;
        selectedClass = classKey;
        void renderClassDetail(classKey);
      });
    });
  }

  function showOverview() {
    selectedClass = null;
    if (!body || !overview) return;
    body.innerHTML = renderOverviewHtml();
    bindClassGrid();

    if (!schoolWide && overview.classes.length === 1) {
      const only = overview.classes[0];
      if (only.status !== 'not_recorded') {
        void renderClassDetail(only.classKey);
      }
    }
  }

  async function loadOverview() {
    yearMonth = monthInput?.value || yearMonth;
    if (!body) return;
    body.innerHTML = renderLoading(t('disciplineReport.loading'));
    selectedClass = null;
    const seq = ++loadSeq;
    try {
      overview = await loadDisciplineReportOverview(session, yearMonth);
      if (seq !== loadSeq) return;
      showOverview();
    } catch (err) {
      if (seq !== loadSeq) return;
      body.innerHTML = renderEmpty(t('disciplineReport.loadFailed'), err?.message || '');
      onToast?.(err?.message || t('disciplineReport.loadFailed'));
    }
  }

  container.querySelector('#discRepLoadBtn')?.addEventListener('click', () => void loadOverview());
  monthInput?.addEventListener('change', () => void loadOverview());

  void loadOverview();

  container.__disciplineReportCleanup = () => {
    loadSeq += 1;
  };
}
