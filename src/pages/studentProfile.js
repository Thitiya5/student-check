import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, renderNavQuickLinks, bindPageHeaderActions } from '../components/pageHeader.js';
import { goBackTo } from '../services/navigation.js';
import { buildAttendanceClassKey } from '../services/attendanceService.js';
import { openConfirmModal } from '../components/confirmModal.js';
import { studentFullName } from '../services/studentsService.js';
import { getStartingScore } from '../services/appSettingsService.js';
import {
  queryStudentTransactions as loadTxns,
  createManualTransaction,
  deletePointTransaction,
  updatePointTransaction
} from '../services/studentPointsService.js';
import { queryStudentAttendanceInRange } from '../services/attendanceService.js';
import { buildStudentScoreReport } from '../services/studentScoreService.js';
import { getSemesterDateRange } from '../utils/studentAttendanceSummary.js';
import { isAdminSession, loadTeacherAuthSession } from '../services/teacherAuth.js';
import {
  buildTimelineForTab,
  renderTimelineHtml,
  emptyMessageForTab
} from '../components/studentProfileTimeline.js';

/** @typedef {'all'|'attendance'|'discipline'|'behavior'} ProfileTab */

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderStudentProfilePage(container, ctx = {}) {
  const { state = {}, onToast, onNavigate } = ctx;
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const handleBack = () => goBackTo('profile', '/students');

  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const studentFromState = state.profileStudent || null;
  let studentId = params.get('id') || '';
  let classKey = params.get('class') || '';

  if (!studentId && studentFromState?.student_id) {
    studentId = String(studentFromState.student_id);
  }
  if (!classKey && studentFromState) {
    if (studentFromState.class_key) {
      classKey = String(studentFromState.class_key);
    } else if (studentFromState.level && studentFromState.room) {
      classKey = buildAttendanceClassKey(studentFromState.level, studentFromState.room);
    }
  }

  if (!studentId) {
    container.innerHTML = `${renderPageHeader({ title: t('points.profileTitle'), topAction: 'back' })}
      <div class="ui-empty"><p class="ui-empty__title">${escapeHtml(t('points.noStudent'))}</p></div>`;
    bindPageHeaderActions(container, {
      onBack: handleBack,
      onNavigate
    });
    return;
  }

  const range = getSemesterDateRange();
  let transactions = [];
  let attendanceRows = [];
  /** @type {ReturnType<typeof buildStudentScoreReport>|null} */
  let report = null;
  /** @type {ProfileTab} */
  let filter = 'all';
  let summaryMounted = false;

  container.innerHTML = `${renderPageHeader({
    title: t('points.profileTitle'),
    topAction: 'back'
  })}
  ${renderNavQuickLinks([
    { label: t('dashboard.quick.students'), path: '/students', active: true },
    { label: t('dashboard.quick.check'), path: '/check' },
    { label: t('nav.home'), path: '/dashboard' }
  ])}
  <div id="profileRoot" class="profile-page">${renderLoading()}</div>`;

  bindPageHeaderActions(container, {
    onBack: handleBack,
    onNavigate
  });

  const root = container.querySelector('#profileRoot');

  function getStudentName() {
    return studentFromState
      ? studentFullName(studentFromState)
      : report?.studentName || studentId;
  }

  function refreshReport() {
    report = buildStudentScoreReport({
      studentId,
      studentName: getStudentName(),
      classKey,
      attendanceRows,
      transactions
    });
  }

  function renderSummaryHtml() {
    if (!report) return '';
    const name = getStudentName();
    const att = report.attendance;
    const baseScore = getStartingScore();
    const scoreTone =
      report.totalScore < baseScore
        ? 'is-negative'
        : report.totalScore > baseScore
          ? 'is-positive'
          : '';

    const parentAlert = report.parentRisk.shouldWarn
      ? `<div class="profile-hero__alert" role="alert">
        <span class="profile-alert__badge">${escapeHtml(t('points.parentWarningBadge'))}</span>
        <span>${escapeHtml(t('points.parentWarningTitle'))}</span>
      </div>`
      : '';

    return `
      <section class="profile-hero glass-card">
        ${parentAlert}
        <h2 class="profile-hero__name">${escapeHtml(name)}</h2>
        <p class="profile-hero__meta">รหัส ${escapeHtml(studentId)}${classKey ? ` · ${escapeHtml(classKey)}` : ''}</p>
        <div class="profile-hero__score ${scoreTone}">
          <span class="profile-hero__score-val">${report.totalScore}</span>
          <span class="profile-hero__score-cap">${escapeHtml(t('points.currentScore'))}</span>
        </div>
        <div class="profile-hero__chips">
          <span class="profile-chip profile-chip--up">+${report.totalPositive}</span>
          <span class="profile-chip profile-chip--down">−${report.totalDeductions}</span>
          <span class="profile-chip">${report.remainingPercent}%</span>
        </div>
        <div class="profile-hero__att">
          <div class="profile-hero__att-item"><em>${att.presentPercent}%</em><span>${escapeHtml(t('status.present'))}</span></div>
          <div class="profile-hero__att-item"><em>${att.absentPercent}%</em><span>${escapeHtml(t('status.absent'))}</span></div>
          <div class="profile-hero__att-item"><em>${att.latePercent}%</em><span>${escapeHtml(t('status.late'))}</span></div>
          <div class="profile-hero__att-item"><em>${att.leavePercent}%</em><span>${escapeHtml(t('points.leaveShort'))}</span></div>
        </div>
        <p class="profile-hero__range">${escapeHtml(t(range.labelKey))} · ${escapeHtml(range.from)} – ${escapeHtml(range.to)} · ${escapeHtml(t('points.attendanceDays', { n: att.total }))}</p>
      </section>`;
  }

  function renderTabsHtml() {
    const tabs = /** @type {ProfileTab[]} */ (['all', 'attendance', 'discipline', 'behavior']);
    const labels = {
      all: t('points.filterAll'),
      attendance: t('points.filterAttendance'),
      discipline: t('points.filterDiscipline'),
      behavior: t('points.filterBehavior')
    };
    return `<nav class="profile-tabs segmented" aria-label="${escapeHtml(t('points.timeline'))}">
      ${tabs
        .map(
          (key) =>
            `<button type="button" class="profile-tabs__btn${filter === key ? ' is-active' : ''}" data-filter="${key}">${escapeHtml(labels[key])}</button>`
        )
        .join('')}
    </nav>`;
  }

  function paintTimeline() {
    const timelineEl = root?.querySelector('#profileTimeline');
    if (!timelineEl) return;

    const items = buildTimelineForTab(filter, attendanceRows, transactions);
    if (!items.length) {
      timelineEl.innerHTML = `<div class="profile-timeline-empty ui-empty">
        <p class="ui-empty__title">${escapeHtml(emptyMessageForTab(filter))}</p>
      </div>`;
      return;
    }

    timelineEl.innerHTML = renderTimelineHtml(items, {
      admin,
      onEdit: () => {},
      onDelete: () => {}
    });

    bindTimelineActions(timelineEl);
  }

  function bindTimelineActions(scope) {
    scope.querySelectorAll('[data-del-txn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-txn');
        if (!id) return;
        openConfirmModal({
          title: t('points.deleteTitle'),
          message: t('points.deleteMessage'),
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          danger: true,
          onConfirm: async () => {
            try {
              await deletePointTransaction(id);
              transactions = transactions.filter((x) => x.id !== id);
              refreshReport();
              paintTimeline();
              onToast?.(t('points.deleted'));
            } catch (err) {
              onToast?.(err?.message || t('points.saveFailed'));
            }
          }
        });
      });
    });

    scope.querySelectorAll('[data-edit-txn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-txn');
        const txn = transactions.find((x) => x.id === id);
        if (txn) openEditModal(txn);
      });
    });
  }

  function bindTabs() {
    root?.querySelectorAll('.profile-tabs__btn[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-filter');
        if (!next || next === filter) return;
        filter = /** @type {ProfileTab} */ (next);
        root.querySelectorAll('.profile-tabs__btn').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        paintTimeline();
      });
    });
  }

  function mountShell() {
    if (!root || !report) return;

    root.innerHTML = `
      <div id="profileSummary">${renderSummaryHtml()}</div>
      <div id="profileTabsWrap">${renderTabsHtml()}</div>
      ${
        admin
          ? `<section class="profile-admin-bar">
        <button type="button" class="button-secondary button-secondary--sm" id="restorePointsBtn">${escapeHtml(t('points.restore'))}</button>
      </section>`
          : ''
      }
      <section id="profileTimeline" class="profile-timeline-section" aria-live="polite"></section>`;

    summaryMounted = true;
    bindTabs();
    root.querySelector('#restorePointsBtn')?.addEventListener('click', openRestoreModal);
    paintTimeline();
  }

  function openRestoreModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-sheet glass-card">
        <h2>${escapeHtml(t('points.restore'))}</h2>
        <div class="form-grid">
          <label class="field"><span>${escapeHtml(t('points.restoreAmount'))}</span>
            <input type="number" id="restorePts" class="input-field" min="1" value="5" /></label>
          <label class="field"><span>${escapeHtml(t('common.date'))}</span>
            <input type="date" id="restoreDate" class="input-field" value="${range.to}" /></label>
          <label class="field"><span>${escapeHtml(t('discipline.note'))}</span>
            <input type="text" id="restoreNote" class="input-field" placeholder="${escapeHtml(t('points.restoreNotePh'))}" /></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="button-secondary" id="restoreCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="button" class="button-primary" id="restoreOk">${escapeHtml(t('common.save'))}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector('#restoreCancel')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('#restoreOk')?.addEventListener('click', async () => {
      const pts = Number(backdrop.querySelector('#restorePts')?.value);
      const date = backdrop.querySelector('#restoreDate')?.value || range.to;
      const note = backdrop.querySelector('#restoreNote')?.value?.trim() || 'restore';
      if (!pts || pts <= 0) {
        onToast?.(t('points.restoreInvalid'));
        return;
      }
      const name = getStudentName();
      try {
        const id = await createManualTransaction({
          student_id: studentId,
          student_name: name,
          class: classKey,
          category: 'behavior',
          reason: 'restore',
          points: pts,
          note,
          transactionDate: date,
          date,
          teacherName: session?.teacherName || ''
        });
        transactions.unshift({
          id,
          student_id: studentId,
          student_name: name,
          class: classKey,
          category: 'behavior',
          type: 'behavior',
          reason: 'restore',
          points: pts,
          note,
          transactionDate: date,
          date,
          teacherName: session?.teacherName || '',
          source: 'manual',
          createdAt: new Date().toISOString()
        });
        refreshReport();
        if (summaryMounted) {
          const summaryEl = root.querySelector('#profileSummary');
          if (summaryEl) summaryEl.innerHTML = renderSummaryHtml();
        }
        paintTimeline();
        onToast?.(t('points.restored'));
        close();
      } catch (err) {
        onToast?.(err?.message || t('points.saveFailed'));
      }
    });
  }

  function openEditModal(txn) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-sheet glass-card">
        <h2>${escapeHtml(t('points.editTitle'))}</h2>
        <div class="form-grid">
          <label class="field"><span>${escapeHtml(t('points.points'))}</span>
            <input type="number" id="editPts" class="input-field" value="${txn.points}" /></label>
          <label class="field"><span>${escapeHtml(t('discipline.note'))}</span>
            <input type="text" id="editNote" class="input-field" value="${escapeHtml(txn.note || '')}" /></label>
          <label class="field"><span>${escapeHtml(t('points.reason'))}</span>
            <input type="text" id="editReason" class="input-field" value="${escapeHtml(txn.reason)}" /></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="button-secondary" id="editCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="button" class="button-primary" id="editOk">${escapeHtml(t('common.save'))}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector('#editCancel')?.addEventListener('click', close);
    backdrop.querySelector('#editOk')?.addEventListener('click', async () => {
      const points = Number(backdrop.querySelector('#editPts')?.value);
      const reason = backdrop.querySelector('#editReason')?.value?.trim() || txn.reason;
      const note = backdrop.querySelector('#editNote')?.value?.trim() || '';
      try {
        await updatePointTransaction(
          txn.id,
          { points, reason, note },
          session?.teacherName || ''
        );
        txn.points = points;
        txn.reason = reason;
        txn.note = note;
        refreshReport();
        if (summaryMounted) {
          const summaryEl = root.querySelector('#profileSummary');
          if (summaryEl) summaryEl.innerHTML = renderSummaryHtml();
        }
        paintTimeline();
        onToast?.(t('points.saved'));
        close();
      } catch (err) {
        onToast?.(err?.message || t('points.saveFailed'));
      }
    });
  }

  async function load() {
    try {
      const [txns, att] = await Promise.all([
        loadTxns(studentId, range.from, range.to),
        queryStudentAttendanceInRange(studentId, {
          from: range.from,
          to: range.to,
          classKey: classKey || undefined
        })
      ]);
      transactions = txns;
      attendanceRows = att;
      refreshReport();
      mountShell();
    } catch (err) {
      if (root) {
        root.innerHTML = renderEmpty(t('points.loadFailed'), err?.message || '');
      }
    }
  }

  void load();
  container.__studentProfileCleanup = () => {};
}
