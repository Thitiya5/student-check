import { renderDashboardQuickActions } from '../components/cards.js';
import { formatDateWithDayThai } from '../components/datePicker.js';
import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty, statusBadgeClass } from '../utils/ui.js';
import {
  getDashboardDataForSession,
  summarizeAttendance,
  queryAttendanceInRangeForSession
} from '../services/attendanceService.js';
import {
  loadAtRiskReportsForSession,
  getAtRiskThresholdPercent,
  groupAtRiskReportsByClass
} from '../services/studentScoreService.js';
import { isInspectionDayCached } from '../services/inspectionScheduleService.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';
import { statusLabel, t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';

function dashStatCard(label, value, variant = '') {
  return `<article class="dash-stat ${variant}">
    <span class="dash-stat__label">${escapeHtml(label)}</span>
    <span class="dash-stat__value">${escapeHtml(String(value))}</span>
  </article>`;
}

function activityRow(r) {
  const status = escapeHtml(statusLabel(r.status) || r.status);
  return `<article class="dash-activity-item">
    <div class="dash-activity-item__main">
      <strong>${escapeHtml(r.student_name || r.student_id)}</strong>
      <span class="${statusBadgeClass(r.status)}">${status}</span>
    </div>
    <span class="dash-activity-item__meta">${escapeHtml(r.class)}</span>
  </article>`;
}

function classChip(classKey, summary) {
  return `<article class="dash-class-chip">
    <span class="dash-class-chip__name">${escapeHtml(classKey)}</span>
    <span class="dash-class-chip__meta">${summary.checked} · ${summary.percent}%</span>
  </article>`;
}

/** @param {object[]} rows */
function groupByClass(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.class || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()]
    .map(([classKey, list]) => ({ classKey, summary: summarizeAttendance(list) }))
    .sort((a, b) => a.classKey.localeCompare(b.classKey, undefined, { numeric: true }));
}

export function renderDashboardPage(container, { state = {}, onNavigate, onLogout, onToast } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  const teacherName = String(session?.teacherName || state.teacherName || '').trim();
  const today = getTodayDate();
  const admin = isAdminSession(session);
  const displayTeacher = teacherName || t('dashboard.teacherFallback');

  container.innerHTML = `<div class="dashboard-home">
    ${renderPageHeader({
      title: `${t('dashboard.greeting')}, ${displayTeacher}`,
      subtitle: formatDateWithDayThai(today),
      topAction: 'logout',
      sticky: false
    })}

    <section class="dash-stats" id="dashboardStats" aria-label="${escapeHtml(t('dashboard.todaySummary'))}">
      ${renderLoading(t('dashboard.loadingStats'))}
    </section>

    <section class="dash-actions ${admin ? 'dash-actions--five' : ''}" aria-label="${escapeHtml(t('dashboard.quickMenu'))}">
      ${renderDashboardQuickActions([
        { title: t('dashboard.quick.check'), target: '/check' },
        { title: t('dashboard.quick.history'), target: '/history' },
        { title: t('dashboard.quick.reports'), target: '/reports' },
        { title: t('dashboard.quick.students'), target: '/students' },
        ...(admin ? [{ title: t('dashboard.quick.admin'), target: '/admin' }] : [])
      ])}
    </section>

    <section class="dash-section" id="dashboardAlertsSection" hidden>
      <h2 class="dash-section__title">${escapeHtml(t('dashboard.alertsTitle'))}</h2>
      <div id="dashboardAlerts" class="dash-alerts"></div>
    </section>

    <section class="dash-section" id="dashboardClassesSection" hidden>
      <h2 class="dash-section__title">${escapeHtml(t('dashboard.classesToday'))}</h2>
      <div id="dashboardClasses" class="dash-class-chips"></div>
    </section>
  </div>`;

  bindPageHeaderActions(container, { onLogout });

  const statsEl = container.querySelector('#dashboardStats');
  const alertsSection = container.querySelector('#dashboardAlertsSection');
  const alertsEl = container.querySelector('#dashboardAlerts');
  const classesSection = container.querySelector('#dashboardClassesSection');
  const classesEl = container.querySelector('#dashboardClasses');

  function paintStats(summary) {
    if (!statsEl) return;
    statsEl.innerHTML = [
      dashStatCard(t('status.present'), summary.present, 'dash-stat--present'),
      dashStatCard(t('status.late'), summary.late, 'dash-stat--late'),
      dashStatCard(t('status.absent'), summary.absent, 'dash-stat--absent'),
      dashStatCard(t('status.sick'), summary.sick, 'dash-stat--sick'),
      dashStatCard(t('status.errand'), summary.errand, 'dash-stat--errand'),
      dashStatCard(t('status.activity'), summary.activity, 'dash-stat--activity'),
      dashStatCard(t('dashboard.percent'), `${summary.percent}%`, 'dash-stat--percent')
    ].join('');
  }

  function paintClasses(rows) {
    if (!classesEl || !classesSection) return;
    const groups = groupByClass(rows);
    if (!groups.length) {
      classesSection.hidden = true;
      classesEl.innerHTML = '';
      return;
    }
    classesSection.hidden = false;
    classesEl.innerHTML = groups.map((g) => classChip(g.classKey, g.summary)).join('');
  }

  function applyRows(rows) {
    paintStats(summarizeAttendance(rows));
    paintClasses(rows);
  }

  function renderAtRiskAlertHtml(atRisk) {
    const threshold = getAtRiskThresholdPercent();
    if (!atRisk.length) {
      return `<article class="dash-alert dash-alert--ok glass-card">
        <strong>${escapeHtml(t('dashboard.noRiskTitle'))}</strong>
        <p>${escapeHtml(t('dashboard.noRiskMessage'))}</p>
      </article>`;
    }

    const byClass = groupAtRiskReportsByClass(atRisk);
    const classCount = byClass.length;

    const classBlocks = byClass
      .map(([classKey, list]) => {
        const items = list
          .map(
            (r) =>
              `<li class="dash-risk-student">
            <span class="dash-risk-student__name">${escapeHtml(r.studentName)}</span>
            <span class="dash-risk-student__pct">${r.parentRisk?.riskPercent ?? 0}%</span>
          </li>`
          )
          .join('');

        return `<details class="dash-risk-class">
        <summary class="dash-risk-class__summary">
          <span class="dash-risk-class__key">${escapeHtml(classKey)}</span>
          <span class="dash-risk-class__badge">${list.length}</span>
          <span class="dash-risk-class__chev" aria-hidden="true">›</span>
        </summary>
        <div class="dash-risk-class__body">
          <ol class="dash-risk-student-list">${items}</ol>
          <button type="button" class="dash-risk-class__link" data-risk-class="${escapeHtml(classKey)}">${escapeHtml(t('dashboard.openClassStudents'))}</button>
        </div>
      </details>`;
      })
      .join('');

    return `<article class="dash-alert dash-alert--risk glass-card" role="alert">
      <div class="dash-risk-head">
        <p class="dash-risk-head__title">${escapeHtml(t('dashboard.attendanceRisk', { count: atRisk.length, threshold }))}</p>
        <p class="dash-risk-head__meta">${escapeHtml(t('dashboard.riskHeadMeta', { rooms: classCount, threshold }))}</p>
      </div>
      <div class="dash-risk-class-list">${classBlocks}</div>
    </article>`;
  }

  function bindAtRiskAlertActions() {
    alertsEl?.querySelectorAll('[data-risk-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const classKey = btn.getAttribute('data-risk-class');
        if (!classKey) return;
        try {
          sessionStorage.setItem('studentsPickClass', classKey);
        } catch {
          // ignore
        }
        onNavigate?.('/students');
      });
    });
  }

  function paintAlerts(cards) {
    if (!alertsSection || !alertsEl) return;
    if (!cards.length) {
      alertsSection.hidden = true;
      alertsEl.innerHTML = '';
      return;
    }
    alertsSection.hidden = false;
    alertsEl.innerHTML = cards.join('');
  }

  async function loadAlerts() {
    /** @type {string[]} */
    const cards = [];

    if (isInspectionDayCached(today)) {
      cards.push(`<article class="dash-alert dash-alert--info glass-card">
        <strong>${escapeHtml(t('dashboard.inspectionToday'))}</strong>
        ${admin ? `<button type="button" class="button-secondary button-secondary--sm dash-alert__btn" data-goto="/inspection">${escapeHtml(t('inspection.open'))}</button>` : ''}
      </article>`);
    }

    if (session) {
      try {
        const atRisk = await loadAtRiskReportsForSession(session, today);
        cards.push(renderAtRiskAlertHtml(atRisk));
      } catch (err) {
        console.warn('[dashboard] alerts load failed', err);
        cards.push(`<article class="dash-alert dash-alert--warn glass-card">
          <strong>${escapeHtml(t('dashboard.alertsLoadFailed'))}</strong>
        </article>`);
      }
    }

    paintAlerts(cards);
    bindAtRiskAlertActions();
    alertsEl?.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.getAttribute('data-goto');
        if (path) onNavigate?.(path);
      });
    });
  }

  async function load() {
    if (!session && !teacherName) {
      applyRows([]);
      paintAlerts([]);
      return;
    }
    try {
      const data = await getDashboardDataForSession(session, today);
      applyRows(data.rows);
      void loadAlerts();
    } catch (err) {
      console.error('[dashboard] load failed', err);
      if (statsEl) statsEl.innerHTML = renderEmpty(t('dashboard.loadFailed'), err?.message);
      onToast?.(err?.message || t('dashboard.loadFailed'));
    }
  }

  void load();

  container.__dashboardCleanup = () => {};

  container.querySelectorAll('.dash-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) onNavigate?.(target);
    });
  });
}
