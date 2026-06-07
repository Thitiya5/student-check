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
  groupAtRiskReportsByClass,
  loadSemesterScoreReportsForSession,
  requiresCommunityService,
  getCommunityServiceThresholdScore
} from '../services/studentScoreService.js';
import { isInspectionDayCached } from '../services/inspectionScheduleService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  canManageBehaviorSession,
  isSchoolWideViewSession,
  canViewPointsReportSession,
  getHomeroomClassKeys
} from '../services/teacherAuth.js';
import { canViewDisciplineReportSession } from '../services/disciplineReportService.js';
import { getSemesterDateRange } from '../utils/studentAttendanceSummary.js';
import { parseClassKey } from '../services/attendanceService.js';
import { formatDisciplineScore } from '../data/disciplineChecks.js';
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

function canViewDashboardScores(session) {
  if (!session) return false;
  if (isSchoolWideViewSession(session)) return true;
  return getHomeroomClassKeys(session).length > 0;
}

const DASH_SCORES_LIST_CAP = 80;

/** @typedef {'rooms'|'deducted'|'service'} ScoresViewTab */

function pointsReportHref(classKey, today) {
  const semester = getSemesterDateRange(today);
  const qs = new URLSearchParams({ from: semester.from, to: semester.to });
  const { level, room } = parseClassKey(classKey);
  if (level) qs.set('level', level);
  if (room) qs.set('room', room);
  return `/points-report?${qs.toString()}`;
}

function renderCompactClassCard(block, today) {
  const { classKey, deductedCount, communityServiceCount, txn } = block;
  const totalPts = formatDisciplineScore(Number(txn.total) || 0);
  const ptsCls = Number(txn.total) < 0 ? 'dash-score-room-card__pts--neg' : '';
  const csBadge =
    communityServiceCount > 0
      ? `<span class="dash-score-room-card__cs">${escapeHtml(t('dashboard.communityServiceCount', { count: communityServiceCount }))}</span>`
      : '';

  return `<button type="button" class="dash-score-room-card glass-card" data-href="${escapeHtml(pointsReportHref(classKey, today))}">
    <span class="dash-score-room-card__key">${escapeHtml(classKey)}</span>
    <span class="dash-score-room-card__meta">
      <em>${escapeHtml(String(deductedCount))}</em> ${escapeHtml(t('dashboard.scoresDeductedLabel'))}
      <span class="dash-score-room-card__pts ${ptsCls}">${escapeHtml(totalPts)}</span>
    </span>
    ${csBadge}
  </button>`;
}

function renderStudentListRow(student, classKey, csThreshold, { forceCs = false } = {}) {
  const isCs = forceCs || requiresCommunityService(student.totalScore, csThreshold);
  const rowCls = isCs ? 'dash-score-student-row dash-score-student-row--cs' : 'dash-score-student-row';
  const csBadge = isCs
    ? `<span class="dash-score-student-row__cs">${escapeHtml(t('dashboard.communityServiceBadge'))}</span>`
    : '';
  const profileQs = new URLSearchParams({ id: student.studentId, class: classKey });
  return `<button type="button" class="${rowCls}" data-href="/student-profile?${escapeHtml(profileQs.toString())}">
    <span class="dash-score-student-row__class">${escapeHtml(classKey)}</span>
    <span class="dash-score-student-row__name">${escapeHtml(student.studentName)}</span>
    <strong class="dash-score-student-row__pts">${escapeHtml(String(student.totalScore))}</strong>
    ${csBadge}
  </button>`;
}

function renderScoresTabs(activeTab, counts) {
  const tabs = [
    { id: 'rooms', val: counts.rooms, lbl: t('dashboard.scoresStatRooms'), mod: '' },
    { id: 'deducted', val: counts.deducted, lbl: t('dashboard.scoresStatDeducted'), mod: 'dash-scores-tab--deduct' },
    { id: 'service', val: counts.service, lbl: t('dashboard.scoresStatCommunityService'), mod: 'dash-scores-tab--cs' }
  ];
  return `<div class="dash-scores-tabs glass-card" role="tablist" aria-label="${escapeHtml(t('dashboard.scoresTabList'))}">
    ${tabs
      .map((tab) => {
        const active = activeTab === tab.id;
        return `<button type="button" class="dash-scores-tab ${tab.mod}${active ? ' is-active' : ''}" role="tab" data-scores-tab="${tab.id}" aria-selected="${active ? 'true' : 'false'}">
          <span class="dash-scores-tab__val">${escapeHtml(String(tab.val))}</span>
          <span class="dash-scores-tab__lbl">${escapeHtml(tab.lbl)}</span>
        </button>`;
      })
      .join('')}
  </div>`;
}

function renderScoresPanelContent(tab, byClassDeducted, today, csThreshold) {
  if (tab === 'rooms') {
    return `<div class="dash-scores-panel dash-scores-panel--rooms" role="tabpanel">
      <p class="dash-scores-panel__title">${escapeHtml(t('dashboard.scoresPanelRooms'))}</p>
      <div class="dash-scores-room-grid">${byClassDeducted.map((b) => renderCompactClassCard(b, today)).join('')}</div>
    </div>`;
  }

  if (tab === 'deducted') {
    const all = byClassDeducted
      .flatMap((b) => b.deductedStudents.map((s) => ({ ...s, classKey: b.classKey })))
      .sort((a, b) => a.totalScore - b.totalScore);
    const shown = all.slice(0, DASH_SCORES_LIST_CAP);
    const more =
      all.length > DASH_SCORES_LIST_CAP
        ? `<p class="dash-scores-panel__more">${escapeHtml(t('dashboard.scoresListMore', { count: all.length - DASH_SCORES_LIST_CAP }))}</p>`
        : '';
    return `<div class="dash-scores-panel dash-scores-panel--deducted" role="tabpanel">
      <p class="dash-scores-panel__title">${escapeHtml(t('dashboard.scoresPanelDeducted'))}</p>
      <div class="dash-scores-student-list">${shown.map((s) => renderStudentListRow(s, s.classKey, csThreshold)).join('')}</div>
      ${more}
    </div>`;
  }

  if (tab === 'service') {
    const all = byClassDeducted
      .flatMap((b) => (b.communityServiceStudents || []).map((s) => ({ ...s, classKey: b.classKey })))
      .sort((a, b) => a.totalScore - b.totalScore);
    if (!all.length) {
      return `<div class="dash-scores-panel dash-scores-panel--service" role="tabpanel">
        <p class="dash-scores-panel__title">${escapeHtml(t('dashboard.scoresPanelService', { threshold: csThreshold }))}</p>
        <p class="dash-score-empty dash-score-empty--inline">${escapeHtml(t('dashboard.scoresServiceEmpty', { threshold: csThreshold }))}</p>
      </div>`;
    }
    return `<div class="dash-scores-panel dash-scores-panel--service" role="tabpanel">
      <p class="dash-scores-panel__title">${escapeHtml(t('dashboard.scoresPanelService', { threshold: csThreshold }))}</p>
      <div class="dash-scores-student-list">${all.map((s) => renderStudentListRow(s, s.classKey, csThreshold, { forceCs: true })).join('')}</div>
    </div>`;
  }

  return '';
}

function renderScoresSectionHtml(byClassDeducted, today, opts, activeTab = null) {
  if (!byClassDeducted.length) {
    return `<p class="dash-score-empty">${escapeHtml(t('dashboard.scoresNoDeductions'))}</p>`;
  }

  const csThreshold = getCommunityServiceThresholdScore();
  const counts = {
    rooms: byClassDeducted.length,
    deducted: byClassDeducted.reduce((n, b) => n + b.deductedCount, 0),
    service: byClassDeducted.reduce((n, b) => n + (b.communityServiceCount || 0), 0)
  };
  const semester = getSemesterDateRange(today);
  const fullReportQs = new URLSearchParams({ from: semester.from, to: semester.to });

  const panel = activeTab
    ? renderScoresPanelContent(activeTab, byClassDeducted, today, csThreshold)
    : `<p class="dash-scores-panel-hint">${escapeHtml(t('dashboard.scoresTabHint'))}</p>`;

  return `<div class="dash-scores-hub" data-scores-hub="1">
    ${renderScoresTabs(activeTab, counts)}
    <div id="dashScoresPanel">${panel}</div>
    ${
      opts.canPointsReport
        ? `<button type="button" class="dash-scores-full-link" data-href="/points-report?${escapeHtml(fullReportQs.toString())}">${escapeHtml(t('dashboard.scoresFullReport'))} →</button>`
        : ''
    }
  </div>`;
}

export function renderDashboardPage(container, { state = {}, onNavigate, onLogout, onToast } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  const teacherName = String(session?.teacherName || state.teacherName || '').trim();
  const today = getTodayDate();
  const admin = isAdminSession(session);
  const showBehaviorQuick = canManageBehaviorSession(session) && !admin;
  const showPointsReportQuick = canViewPointsReportSession(session);
  const showDisciplineReportQuick = canViewDisciplineReportSession(session);
  const showScoresSection = canViewDashboardScores(session);
  const canBehavior = canManageBehaviorSession(session);
  const displayTeacher = teacherName || t('dashboard.teacherFallback');

  const quickActions = [
    { title: t('dashboard.quick.check'), target: '/check' },
    ...(showPointsReportQuick ? [{ title: t('dashboard.quick.pointsReport'), target: '/points-report' }] : []),
    { title: t('dashboard.quick.reports'), target: '/reports' },
    { title: t('dashboard.quick.history'), target: '/history' },
    { title: t('dashboard.quick.students'), target: '/students' },
    ...(showBehaviorQuick ? [{ title: t('dashboard.quick.behavior'), target: '/behavior' }] : []),
    ...(showDisciplineReportQuick ? [{ title: t('dashboard.quick.disciplineReport'), target: '/discipline-report' }] : []),
    ...(admin ? [{ title: t('dashboard.quick.admin'), target: '/admin' }] : [])
  ];
  const quickActionsClass =
    quickActions.length >= 6 ? 'dash-actions--six' : quickActions.length >= 5 ? 'dash-actions--five' : '';

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

    <section class="dash-actions ${quickActionsClass}" aria-label="${escapeHtml(t('dashboard.quickMenu'))}">
      ${renderDashboardQuickActions(quickActions)}
    </section>

    <section class="dash-section" id="dashboardAlertsSection" hidden>
      <h2 class="dash-section__title">${escapeHtml(t('dashboard.alertsTitle'))}</h2>
      <div id="dashboardAlerts" class="dash-alerts"></div>
    </section>

    <section class="dash-section" id="dashboardClassesSection" hidden>
      <h2 class="dash-section__title">${escapeHtml(t('dashboard.classesToday'))}</h2>
      <div id="dashboardClasses" class="dash-class-chips"></div>
    </section>

    ${
      showScoresSection
        ? `<section class="dash-section" id="dashboardScoresSection">
      <h2 class="dash-section__title">${escapeHtml(t('dashboard.scoresTitle'))}</h2>
      <p class="dash-section__hint">${escapeHtml(t('dashboard.scoresTabHintShort'))}</p>
      <div id="dashboardScores" class="dash-score-panel">${renderLoading(t('dashboard.scoresLoading'))}</div>
    </section>`
        : ''
    }
  </div>`;

  bindPageHeaderActions(container, { onLogout });

  const statsEl = container.querySelector('#dashboardStats');
  const alertsSection = container.querySelector('#dashboardAlertsSection');
  const alertsEl = container.querySelector('#dashboardAlerts');
  const classesSection = container.querySelector('#dashboardClassesSection');
  const classesEl = container.querySelector('#dashboardClasses');
  const scoresEl = container.querySelector('#dashboardScores');

  /** @type {{ byClassDeducted: object[], activeTab: ScoresViewTab|null, opts: object }} */
  let scoresCache = { byClassDeducted: [], activeTab: null, opts: {} };

  function paintScoresView() {
    if (!scoresEl || !scoresCache.byClassDeducted.length) return;
    scoresEl.innerHTML = renderScoresSectionHtml(
      scoresCache.byClassDeducted,
      today,
      scoresCache.opts,
      scoresCache.activeTab
    );
    bindScoreActions();
  }

  function bindScoreActions() {
    scoresEl?.querySelectorAll('[data-href]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const href = btn.getAttribute('data-href');
        if (href) onNavigate?.(href);
      });
    });

    scoresEl?.querySelectorAll('[data-scores-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = /** @type {ScoresViewTab} */ (btn.getAttribute('data-scores-tab') || 'rooms');
        scoresCache.activeTab = scoresCache.activeTab === tab ? null : tab;
        paintScoresView();
      });
    });
  }

  async function loadScores() {
    if (!scoresEl || !showScoresSection || !session) return;
    try {
      const { byClassDeducted } = await loadSemesterScoreReportsForSession(session, today);
      scoresCache = {
        byClassDeducted,
        activeTab: scoresCache.activeTab,
        opts: { canBehavior, canPointsReport: showPointsReportQuick }
      };
      if (!byClassDeducted.length) {
        scoresEl.innerHTML = renderEmpty(t('dashboard.scoresNoDeductions'));
        return;
      }
      scoresEl.innerHTML = renderScoresSectionHtml(
        byClassDeducted,
        today,
        scoresCache.opts,
        scoresCache.activeTab
      );
      bindScoreActions();
    } catch (err) {
      console.warn('[dashboard] scores load failed', err);
      scoresEl.innerHTML = renderEmpty(t('dashboard.scoresLoadFailed'), err?.message);
    }
  }

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
        <div class="dash-risk-head__icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="dash-risk-head__text">
          <p class="dash-risk-head__title">${escapeHtml(t('dashboard.attendanceRisk', { count: atRisk.length, threshold }))}</p>
          <p class="dash-risk-head__meta">${escapeHtml(t('dashboard.riskHeadMeta', { rooms: classCount, threshold }))}</p>
        </div>
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
        <button type="button" class="button-secondary button-secondary--sm dash-alert__btn" data-goto="/check">${escapeHtml(t('dashboard.goCheckInspection'))}</button>
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

    if (showScoresSection && scoresCache.byClassDeducted.length) {
      const csTotal = scoresCache.byClassDeducted.reduce(
        (n, b) => n + (Number(b.communityServiceCount) || 0),
        0
      );
      if (csTotal > 0) {
        cards.push(`<article class="dash-alert dash-alert--warn glass-card">
          <strong>${escapeHtml(t('dashboard.communityServiceAlert', { count: csTotal }))}</strong>
          <p class="dash-alert__hint">${escapeHtml(t('dashboard.communityServiceAlertHint'))}</p>
          <button type="button" class="button-secondary button-secondary--sm dash-alert__btn" data-scores-tab="service">${escapeHtml(t('dashboard.viewCommunityService'))}</button>
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
    alertsEl?.querySelectorAll('[data-scores-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-scores-tab') || 'service';
        scoresCache.activeTab = /** @type {ScoresViewTab} */ (tab);
        document.querySelector('#dashboardScoresSection')?.scrollIntoView({ behavior: 'smooth' });
        paintScoresView();
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
      paintStats(summarizeAttendance(data.rows));
      await Promise.all([loadScores()]);
      await loadAlerts();
      paintClasses(data.rows);
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
