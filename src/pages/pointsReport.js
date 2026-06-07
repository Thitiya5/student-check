import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { getTodayDate } from '../utils/dateIso.js';
import { formatDateWithDayThai } from '../components/datePicker.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  isSchoolWideViewSession,
  canManageBehaviorSession,
  canViewPointsReportSession,
  canEditPointsReportSession,
  canReturnDisciplinePointsSession,
  getViewClassKeys,
  classKeysToPickerOptions
} from '../services/teacherAuth.js';
import { getSemesterDateRange } from '../utils/studentAttendanceSummary.js';
import { getHashQuery } from '../services/navigation.js';
import { fetchLevelOptions, fetchRoomOptions } from '../services/studentsService.js';
import {
  queryPointsInRangeForSession,
  reasonLabel
} from '../services/studentPointsService.js';
import { returnDisciplinePointsForStudent, restoreDisciplinePointsForStudent } from '../services/disciplineReturnService.js';
import { reconcileStaleSystemPoints } from '../services/historyPointSync.js';
import { queryAttendanceInRangeForSession } from '../services/attendanceService.js';
import { openPinConfirmModal } from '../components/pinConfirmModal.js';
import { verifyBehaviorWritePin } from '../services/teachersService.js';
import { formatDisciplineScore } from '../data/disciplineChecks.js';

/** @param {import('../services/studentPointsService.js').PointTransaction[]} rows */
function summarizeByClass(rows) {
  /** @type {Map<string, { class: string, count: number, total: number, discipline: number, behavior: number, attendance: number }>} */
  const map = new Map();
  for (const row of rows) {
    const key = row.class || '—';
    if (!map.has(key)) {
      map.set(key, { class: key, count: 0, total: 0, discipline: 0, behavior: 0, attendance: 0 });
    }
    const item = map.get(key);
    const pts = Number(row.points) || 0;
    item.count += 1;
    item.total += pts;
    const cat = row.category || row.type;
    if (cat === 'discipline') item.discipline += pts;
    else if (cat === 'behavior') item.behavior += pts;
    else if (cat === 'attendance') item.attendance += pts;
  }
  return [...map.values()].sort((a, b) => a.class.localeCompare(b.class, undefined, { numeric: true }));
}

function categoryLabel(cat) {
  const key = `pointsReport.cat.${cat}`;
  const label = t(key);
  return label !== key ? label : cat;
}

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderPointsReportPage(container, { state = {}, onToast, onLogout, onBack, onNavigate } = {}) {
  container.classList.add('points-report-page');
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const schoolWide = isSchoolWideViewSession(session);
  const canEditBehavior = canManageBehaviorSession(session);
  const canEditReport = canEditPointsReportSession(session);
  const canReturnDiscipline = canReturnDisciplinePointsSession(session);
  const viewOnly = canViewPointsReportSession(session) && !canEditReport;
  const teacherName = String(session?.teacherName || state.teacherName || '').trim();
  const viewKeys = getViewClassKeys(session);
  const today = getTodayDate();
  const semester = getSemesterDateRange(today);
  const initialQuery = getHashQuery();
  const initialTab = initialQuery.get('tab') || '';
  const defaultFrom =
    initialTab === 'behavior' ? today : viewOnly ? semester.from : today;
  const defaultTo =
    initialTab === 'behavior' ? today : viewOnly ? semester.to : today;
  const initialFrom = initialQuery.get('from') || defaultFrom;
  const initialTo = initialQuery.get('to') || initialQuery.get('from') || defaultTo;
  const initialLevel = initialQuery.get('level') || '';
  const initialRoom = initialQuery.get('room') || '';

  let mode =
    initialTab === 'behavior'
      ? 'behavior'
      : viewOnly
        ? 'ledger'
        : 'classes';
  let rows = [];
  /** @type {Map<string, { disciplineWaived: boolean, disciplineReturnedBy: string, disciplineReturnedAt: string|null }>} */
  let attendanceMeta = new Map();
  let refreshSeq = 0;

  function attendanceMetaKey(studentId, date, classKey) {
    return `${studentId}__${date}__${classKey}`;
  }

  function formatReturnedAt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  container.innerHTML = `${renderPageHeader({
    title: t('pointsReport.title'),
    subtitle: viewOnly ? t('pointsReport.viewOnlyHint') : '',
    topAction: 'back'
  })}
  <section class="segmented report-tabs points-report-tabs">
    <button type="button" class="${mode === 'classes' ? 'is-active' : ''}" data-mode="classes">${escapeHtml(t('pointsReport.tabClasses'))}</button>
    <button type="button" class="${mode === 'ledger' ? 'is-active' : ''}" data-mode="ledger">${escapeHtml(t('pointsReport.tabLedger'))}</button>
    <button type="button" class="${mode === 'behavior' ? 'is-active' : ''}" data-mode="behavior">${escapeHtml(t('pointsReport.tabBehavior'))}</button>
  </section>
  <section class="reports-toolbar glass-card points-report-toolbar">
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterPeriod'))}</p>
      <div class="reports-toolbar__period points-report-toolbar__period">
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.fromDate'))}</span>
          <input type="date" id="ptsFrom" class="reports-filter__control input-field" value="${escapeHtml(initialFrom)}" />
        </label>
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.toDate'))}</span>
          <input type="date" id="ptsTo" class="reports-filter__control input-field" value="${escapeHtml(initialTo)}" />
        </label>
        <button type="button" class="reports-today-chip" id="ptsTodayBtn">${escapeHtml(t('common.today'))}</button>
      </div>
    </div>
    <div class="reports-toolbar__block" id="ptsClassBlock">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterClass'))}</p>
      <div class="reports-toolbar__class-row">
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.level'))}</span>
          <select id="ptsLevel" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.room'))}</span>
          <select id="ptsRoom" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
      </div>
    </div>
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterMore'))}</p>
      <div class="reports-toolbar__class-row points-report-toolbar__more">
        <label class="reports-filter" id="ptsCategoryWrap">
          <span class="reports-filter__label">${escapeHtml(t('pointsReport.category'))}</span>
          <select id="ptsCategory" class="reports-filter__control select-field">
            <option value="">${escapeHtml(t('common.all'))}</option>
            <option value="attendance">${escapeHtml(t('pointsReport.cat.attendance'))}</option>
            <option value="discipline">${escapeHtml(t('pointsReport.cat.discipline'))}</option>
            <option value="behavior">${escapeHtml(t('pointsReport.cat.behavior'))}</option>
            <option value="manual">${escapeHtml(t('pointsReport.cat.manual'))}</option>
          </select>
        </label>
        ${
          admin
            ? `<label class="reports-filter reports-filter--wide">
          <span class="reports-filter__label">${escapeHtml(t('common.teacherName'))}</span>
          <select id="ptsTeacher" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>`
            : ''
        }
        <label class="reports-filter reports-filter--wide" id="ptsSearchWrap">
          <span class="reports-filter__label">${escapeHtml(t('common.search'))}</span>
          <input type="search" id="ptsSearch" class="reports-filter__control input-field" placeholder="${escapeHtml(t('common.nameOrId'))}" />
        </label>
      </div>
      <label class="points-report-toolbar__deduct" id="ptsDeductWrap">
        <input type="checkbox" id="ptsDeductOnly" />
        <span>${escapeHtml(t('pointsReport.deductionsOnly'))}</span>
      </label>
    </div>
  </section>
  <p class="points-report-behavior-hint" id="ptsBehaviorHint" hidden>${escapeHtml(t('pointsReport.behaviorTabHint'))}</p>
  <section id="pointsReportContent">${renderLoading()}</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  const content = container.querySelector('#pointsReportContent');
  const fromInput = container.querySelector('#ptsFrom');
  const toInput = container.querySelector('#ptsTo');
  const levelSel = container.querySelector('#ptsLevel');
  const roomSel = container.querySelector('#ptsRoom');
  const categorySel = container.querySelector('#ptsCategory');
  const teacherSel = container.querySelector('#ptsTeacher');
  const searchInput = container.querySelector('#ptsSearch');
  const deductOnly = container.querySelector('#ptsDeductOnly');
  const categoryWrap = container.querySelector('#ptsCategoryWrap');
  const deductWrap = container.querySelector('#ptsDeductWrap');
  const behaviorHint = container.querySelector('#ptsBehaviorHint');
  const classBlock = container.querySelector('#ptsClassBlock');
  const searchWrap = container.querySelector('#ptsSearchWrap');
  const filterMoreBlock = container.querySelector('.points-report-toolbar__more')?.closest('.reports-toolbar__block');

  function resetBehaviorFilters() {
    if (levelSel) levelSel.value = '';
    if (roomSel) {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      roomSel.value = '';
    }
    if (searchInput) searchInput.value = '';
  }

  function syncToolbarForMode() {
    const isBehavior = mode === 'behavior';
    if (categoryWrap) categoryWrap.hidden = isBehavior;
    if (deductWrap) deductWrap.hidden = isBehavior;
    if (classBlock) classBlock.hidden = isBehavior;
    if (searchWrap) searchWrap.hidden = isBehavior;
    if (behaviorHint) behaviorHint.hidden = !isBehavior;
    if (filterMoreBlock) {
      const titleEl = filterMoreBlock.querySelector('.reports-toolbar__block-title');
      if (titleEl) titleEl.hidden = isBehavior;
    }
  }

  function paintContent() {
    if (mode === 'classes') renderClassSummary(summarizeByClass(rows));
    else if (mode === 'behavior') renderBehaviorList(rows);
    else renderLedger(rows);
  }

  function renderClassSummary(list) {
    if (!list.length) {
      content.innerHTML = renderEmpty(t('pointsReport.empty'));
      return;
    }
    const cards = list
      .map((item) => {
        const totalLabel = formatDisciplineScore(item.total);
        const cls = item.total < 0 ? 'points-class-chip--warn' : '';
        return `<button type="button" class="points-class-chip glass-card ${cls}" data-class="${escapeHtml(item.class)}">
          <span class="points-class-chip__name">${escapeHtml(item.class)}</span>
          <span class="points-class-chip__meta">${escapeHtml(t('pointsReport.items', { count: item.count }))} · ${escapeHtml(totalLabel)}</span>
          <span class="points-class-chip__breakdown">${escapeHtml(t('pointsReport.breakdown', {
            attendance: formatDisciplineScore(item.attendance),
            discipline: formatDisciplineScore(item.discipline),
            behavior: formatDisciplineScore(item.behavior)
          }))}</span>
        </button>`;
      })
      .join('');
    content.innerHTML = `<p class="points-ledger-summary">${escapeHtml(t('pointsReport.drillHint'))}</p><div class="points-class-grid">${cards}</div>`;
    content.querySelectorAll('[data-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const classKey = btn.getAttribute('data-class') || '';
        const slash = classKey.indexOf('/');
        if (slash < 0) return;
        levelSel.value = classKey.slice(0, slash);
        mode = 'ledger';
        container.querySelectorAll('[data-mode]').forEach((tab) => {
          tab.classList.toggle('is-active', tab.getAttribute('data-mode') === 'ledger');
        });
        void loadRooms(levelSel.value).then(() => {
          roomSel.value = classKey.slice(slash + 1);
          void refresh();
        });
      });
    });
  }

  /** @param {import('../services/studentPointsService.js').PointTransaction[]} list */
  function groupLedgerByStudentDay(list) {
    /** @type {Map<string, { student_id: string, student_name: string, class: string, transactionDate: string, teacherName: string, rows: typeof list, total: number }>} */
    const map = new Map();
    for (const row of list) {
      const date = String(row.transactionDate || row.date || '');
      const key = `${row.student_id}__${date}__${row.class || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          student_id: String(row.student_id || ''),
          student_name: String(row.student_name || row.student_id || ''),
          class: String(row.class || ''),
          transactionDate: date,
          teacherName: String(row.teacherName || ''),
          rows: [],
          total: 0
        });
      }
      const group = map.get(key);
      group.rows.push(row);
      group.total += Number(row.points) || 0;
    }
    return [...map.values()].sort((a, b) => {
      const byDate = (b.transactionDate || '').localeCompare(a.transactionDate || '');
      if (byDate) return byDate;
      return (a.student_name || '').localeCompare(b.student_name || '', 'th');
    });
  }

  function editLinkForRow(row) {
    if (!canEditReport) return null;
    const cat = row.category || row.type || '';
    const date = String(row.transactionDate || row.date || '');
    const classKey = String(row.class || '');
    const student = String(row.student_id || '');
    if (cat === 'behavior' && canEditBehavior) {
      const qs = new URLSearchParams({ date, class: classKey });
      if (student) qs.set('student', student);
      return { href: `/behavior?${qs.toString()}`, label: t('pointsReport.editBehavior') };
    }
    if (cat === 'discipline' || cat === 'attendance') {
      const qs = new URLSearchParams({ date });
      const slash = classKey.indexOf('/');
      if (slash > 0) {
        qs.set('level', classKey.slice(0, slash));
        qs.set('room', classKey.slice(slash + 1));
      }
      return { href: `/check?${qs.toString()}`, label: t('pointsReport.editCheck') };
    }
    return null;
  }

  /** @param {import('../services/studentPointsService.js').PointTransaction} row */
  function isDisciplineDeductionRow(row) {
    const cat = row.category || row.type || '';
    return cat === 'discipline' && Number(row.points) < 0;
  }

  /** @param {{ rows: import('../services/studentPointsService.js').PointTransaction[] }} group */
  function hasAttendanceDeduction(group) {
    return group.rows.some((row) => {
      const cat = row.category || row.type || '';
      return cat === 'attendance' && Number(row.points) < 0;
    });
  }

  function confirmRestoreDiscipline(group) {
    const classKey = String(group.class || '');
    const sid = String(group.student_id || '');
    const date = String(group.transactionDate || '');
    if (!classKey || !sid || !date) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }

    openPinConfirmModal({
      title: t('pointsReport.restoreDisciplineTitle'),
      onConfirm: async (pin) => {
        await verifyBehaviorWritePin(session, pin);
        await restoreDisciplinePointsForStudent({
          classKey,
          studentId: sid,
          date,
          teacherName
        });
        onToast?.(t('pointsReport.disciplineRestored'));
        void refresh();
      },
      onError: (err) => {
        onToast?.(err instanceof Error ? err.message : t('behavior.saveFailed'));
      }
    });
  }

  /** @param {{ student_id: string, class: string, transactionDate: string }} group @param {string|null} flagId @param {boolean} removeAll */
  function confirmReturnDiscipline(group, flagId, removeAll) {
    const classKey = String(group.class || '');
    const sid = String(group.student_id || '');
    const date = String(group.transactionDate || '');
    if (!classKey || !sid || !date) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }
    if (!removeAll && !flagId) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }

    openPinConfirmModal({
      title: removeAll ? t('pointsReport.returnAllDisciplineTitle') : t('disciplineRecords.returnTitle'),
      onConfirm: async (pin) => {
        await verifyBehaviorWritePin(session, pin);
        await returnDisciplinePointsForStudent({
          classKey,
          studentId: sid,
          date,
          teacherName,
          flagId: removeAll ? null : flagId,
          removeAll
        });
        onToast?.(removeAll ? t('pointsReport.disciplineReturnedAll') : t('disciplineRecords.returned'));
        void refresh();
      },
      onError: (err) => {
        onToast?.(err instanceof Error ? err.message : t('behavior.saveFailed'));
      }
    });
  }

  function renderLedger(list) {
    if (!list.length) {
      content.innerHTML = renderEmpty(t('pointsReport.empty'));
      return;
    }
    const totalPts = list.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
    const groups = groupLedgerByStudentDay(list);
    const cards = groups
      .map((group, idx) => {
        const ptsNum = Number(group.total) || 0;
        const pts = formatDisciplineScore(ptsNum);
        const ptsClass =
          ptsNum < 0
            ? 'points-entry-card__score--neg'
            : ptsNum > 0
              ? 'points-entry-card__score--pos'
              : 'points-entry-card__score--zero';
        const editRow =
          group.rows.find((r) => {
            const cat = r.category || r.type || '';
            return cat === 'attendance' || cat === 'discipline';
          }) || group.rows[0];
        const edit = editRow ? editLinkForRow(editRow) : null;
        const disciplineDeductions = group.rows.filter(isDisciplineDeductionRow);
        const meta = attendanceMeta.get(
          attendanceMetaKey(group.student_id, group.transactionDate, group.class)
        );
        const isWaived = Boolean(meta?.disciplineWaived);
        const useActionCard = canReturnDiscipline && disciplineDeductions.length > 0;
        const showRestore = canReturnDiscipline && isWaived && !disciplineDeductions.length;
        const showCheckEdit = edit && (!useActionCard || hasAttendanceDeduction(group));
        const returnedAudit =
          isWaived && meta?.disciplineReturnedBy
            ? `<p class="points-entry-card__return-audit">${escapeHtml(
                t('pointsReport.disciplineReturnedBy', {
                  teacher: meta.disciplineReturnedBy,
                  when: formatReturnedAt(meta.disciplineReturnedAt)
                })
              )}</p>`
            : '';
        const breakdown = group.rows
          .map((row) => {
            const cat = row.category || row.type || '';
            const linePts = formatDisciplineScore(Number(row.points) || 0);
            const lineCls =
              Number(row.points) < 0
                ? 'points-entry-card__line-pts--neg'
                : 'points-entry-card__line-pts--pos';
            const showReturn = useActionCard && isDisciplineDeductionRow(row);
            const returnBtn = showReturn
              ? `<button type="button" class="button-ghost button-secondary--sm points-entry-card__return-btn" data-return-flag="${escapeHtml(String(row.reason || ''))}" data-group-idx="${idx}">${escapeHtml(t('disciplineRecords.returnPoints'))}</button>`
              : '';
            const linePtsHtml = `<span class="points-entry-card__line-pts ${lineCls}">${escapeHtml(linePts)}</span>`;
            const lineEnd = returnBtn
              ? `<span class="points-entry-card__line-actions">${linePtsHtml}${returnBtn}</span>`
              : linePtsHtml;
            return `<li class="points-entry-card__line${showReturn ? ' points-entry-card__line--has-action' : ''}">
              <span class="points-entry-card__line-label">${escapeHtml(categoryLabel(cat))} · ${escapeHtml(reasonLabel(row.reason, cat))}</span>
              ${lineEnd}
            </li>`;
          })
          .join('');
        const footerActions = useActionCard
          ? `<div class="points-entry-card__footer-actions behavior-history-card__actions">
              <button type="button" class="button-ghost button-secondary--sm behavior-history-card__return-btn" data-return-all data-group-idx="${idx}">${escapeHtml(t('pointsReport.returnAllDiscipline'))}</button>
              ${showCheckEdit ? `<button type="button" class="button-secondary button-secondary--sm" data-edit-check data-group-idx="${idx}">${escapeHtml(edit.label)}</button>` : ''}
            </div>`
          : showRestore
            ? `<div class="points-entry-card__footer-actions behavior-history-card__actions">
              <button type="button" class="button-secondary button-secondary--sm" data-restore-discipline data-group-idx="${idx}">${escapeHtml(t('pointsReport.restoreDiscipline'))}</button>
              ${showCheckEdit ? `<button type="button" class="button-secondary button-secondary--sm" data-edit-check data-group-idx="${idx}">${escapeHtml(edit.label)}</button>` : ''}
            </div>`
          : showCheckEdit
            ? `<span class="points-entry-card__edit">${escapeHtml(edit.label)} →</span>`
            : '';
        const actionCls =
          useActionCard || showRestore
            ? ' points-entry-card--actions'
            : showCheckEdit
              ? ' points-entry-card--action'
              : ' points-entry-card--readonly';
        const cardTag = useActionCard || showRestore ? 'article' : showCheckEdit ? 'button type="button"' : 'article';
        const cardAttrs = useActionCard
          ? ''
          : showCheckEdit
            ? ` data-edit-idx="${idx}"`
            : '';
        return `<${cardTag} class="points-entry-card points-entry-card--grouped${actionCls} glass-card"${cardAttrs}>
          <div class="points-entry-card__score ${ptsClass}">${escapeHtml(pts)}</div>
          <div class="points-entry-card__body">
            <div class="points-entry-card__top">
              <strong class="points-entry-card__name">${escapeHtml(group.student_name)}</strong>
              <span class="points-entry-card__class">${escapeHtml(group.class)}</span>
            </div>
            <div class="points-entry-card__meta">
              <span>${escapeHtml(group.transactionDate)}</span>
              <span class="points-entry-card__group-label">${escapeHtml(t('pointsReport.dayTotal'))}</span>
            </div>
            <ul class="points-entry-card__breakdown">${breakdown}</ul>
            <p class="points-entry-card__teacher">${escapeHtml(t('pointsReport.recordedBy'))}: ${escapeHtml(group.teacherName || group.rows[0]?.teacherName || '—')}</p>
            ${returnedAudit}
            ${footerActions}
          </div>
        </${useActionCard || showRestore ? 'article' : showCheckEdit ? 'button' : 'article'}>`;
      })
      .join('');
    content.innerHTML = `
      <p class="points-ledger-summary">${escapeHtml(
        t('pointsReport.summaryGrouped', {
          students: groups.length,
          entries: list.length,
          total: formatDisciplineScore(totalPts)
        })
      )}</p>
      <div class="points-ledger-cards">${cards}</div>`;

    content.querySelectorAll('[data-edit-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-edit-idx'));
        const group = groups[idx];
        const editRow =
          group?.rows.find((r) => {
            const cat = r.category || r.type || '';
            return cat === 'attendance' || cat === 'discipline';
          }) || group?.rows[0];
        const target = editRow ? editLinkForRow(editRow) : null;
        if (target?.href) onNavigate?.(target.href);
      });
    });

    content.querySelectorAll('[data-return-flag]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-group-idx'));
        const group = groups[idx];
        const flagId = btn.getAttribute('data-return-flag') || '';
        if (group) confirmReturnDiscipline(group, flagId, false);
      });
    });

    content.querySelectorAll('[data-return-all]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-group-idx'));
        const group = groups[idx];
        if (group) confirmReturnDiscipline(group, null, true);
      });
    });

    content.querySelectorAll('[data-restore-discipline]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-group-idx'));
        const group = groups[idx];
        if (group) confirmRestoreDiscipline(group);
      });
    });

    content.querySelectorAll('[data-edit-check]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-group-idx'));
        const group = groups[idx];
        const editRow =
          group?.rows.find((r) => {
            const cat = r.category || r.type || '';
            return cat === 'attendance' || cat === 'discipline';
          }) || group?.rows[0];
        const target = editRow ? editLinkForRow(editRow) : null;
        if (target?.href) onNavigate?.(target.href);
      });
    });
  }

  /** @param {import('../services/studentPointsService.js').PointTransaction} row @param {number} idx @param {{ showDate?: boolean }} [opts] */
  function renderBehaviorCard(row, idx, opts = {}) {
    const showDate = opts.showDate !== false;
    const ptsNum = Number(row.points) || 0;
    const pts = formatDisciplineScore(ptsNum);
    const ptsClass =
      ptsNum < 0
        ? 'points-entry-card__score--neg'
        : ptsNum > 0
          ? 'points-entry-card__score--pos'
          : 'points-entry-card__score--zero';
    const dateKey = String(row.transactionDate || row.date || '');
    const dateLabel = dateKey ? formatDateWithDayThai(dateKey) : '—';
    const note = String(row.note || '').trim();
    const edit = editLinkForRow(row);
    const tagCls = row.reason === 'good' ? 'points-behavior-tag--good' : 'points-behavior-tag--bad';
    const tagLabel = reasonLabel(row.reason, 'behavior');
    const actionCls = edit ? ' points-entry-card--action' : ' points-entry-card--readonly';

    return `<${edit ? 'button type="button"' : 'article'} class="points-entry-card points-behavior-entry${actionCls} glass-card"${edit ? ` data-behavior-idx="${idx}"` : ''}>
          <div class="points-entry-card__score ${ptsClass}">${escapeHtml(pts)}</div>
          <div class="points-entry-card__body">
            <div class="points-entry-card__top">
              <strong class="points-entry-card__name">${escapeHtml(row.student_name || row.student_id)}</strong>
              <span class="points-entry-card__class">${escapeHtml(row.class || '')}</span>
            </div>
            <div class="points-entry-card__meta points-behavior-entry__meta">
              ${showDate ? `<span class="points-behavior-entry__date">${escapeHtml(dateLabel)}</span>` : ''}
              <span class="points-behavior-tag ${tagCls}">${escapeHtml(tagLabel)}</span>
            </div>
            ${note ? `<p class="points-entry-card__note points-behavior-entry__note">${escapeHtml(note)}</p>` : `<p class="points-behavior-entry__note-empty">${escapeHtml(t('pointsReport.behaviorNoNote'))}</p>`}
            <p class="points-entry-card__teacher">${escapeHtml(t('pointsReport.recordedBy'))}: ${escapeHtml(row.teacherName || '—')}</p>
            ${edit ? `<span class="points-entry-card__edit">${escapeHtml(edit.label)} →</span>` : ''}
          </div>
        </${edit ? 'button' : 'article'}>`;
  }

  /** @param {import('../services/studentPointsService.js').PointTransaction[]} list */
  function renderBehaviorList(list) {
    const behaviorRows = list
      .filter((r) => (r.category || r.type) === 'behavior')
      .sort((a, b) => {
        const byDate = (b.transactionDate || b.date || '').localeCompare(a.transactionDate || a.date || '');
        if (byDate) return byDate;
        const byClass = (a.class || '').localeCompare(b.class || '', undefined, { numeric: true });
        if (byClass) return byClass;
        return (a.student_name || '').localeCompare(b.student_name || '', 'th');
      });

    if (!behaviorRows.length) {
      content.innerHTML = renderEmpty(
        t('pointsReport.behaviorEmpty'),
        t('pointsReport.behaviorEmptyHint')
      );
      return;
    }

    let goodCount = 0;
    let badCount = 0;
    let totalPts = 0;
    for (const row of behaviorRows) {
      const pts = Number(row.points) || 0;
      totalPts += pts;
      if (row.reason === 'good' || pts > 0) goodCount += 1;
      else badCount += 1;
    }

    /** @type {Map<string, typeof behaviorRows>} */
    const byDate = new Map();
    for (const row of behaviorRows) {
      const dateKey = String(row.transactionDate || row.date || '');
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(row);
    }
    const dayGroups = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    let flatIdx = 0;
    const sections = dayGroups
      .map(([dateKey, dayRows]) => {
        const cards = dayRows.map((row) => renderBehaviorCard(row, flatIdx++, { showDate: false })).join('');
        const dayLabel = dateKey ? formatDateWithDayThai(dateKey) : '—';
        return `<section class="points-behavior-day glass-card">
          <header class="points-behavior-day__head">
            <h2 class="points-behavior-day__heading">${escapeHtml(dayLabel)}</h2>
            <span class="points-behavior-day__count">${escapeHtml(t('pointsReport.behaviorDayCount', { count: dayRows.length }))}</span>
          </header>
          <div class="points-ledger-cards points-behavior-list">${cards}</div>
        </section>`;
      })
      .join('');

    content.innerHTML = `
      <p class="points-ledger-summary">${escapeHtml(
        t('pointsReport.behaviorSummary', {
          count: behaviorRows.length,
          good: goodCount,
          bad: badCount,
          total: formatDisciplineScore(totalPts)
        })
      )}</p>
      <div class="points-behavior-days">${sections}</div>`;

    content.querySelectorAll('[data-behavior-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-behavior-idx'));
        const row = behaviorRows[idx];
        const target = row ? editLinkForRow(row) : null;
        if (target?.href) onNavigate?.(target.href);
      });
    });
  }

  function paintTeacherOptions(names) {
    if (!admin || !teacherSel) return;
    const current = teacherSel.value;
    const unique = [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    teacherSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      unique.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (current && unique.includes(current)) teacherSel.value = current;
  }

  async function loadLevels() {
    if (schoolWide) {
      const levels = await fetchLevelOptions();
      levelSel.innerHTML =
        `<option value="">${escapeHtml(t('common.all'))}</option>` +
        levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      return;
    }
    const keys = viewKeys || [];
    const { levels, roomsByLevel } = classKeysToPickerOptions(keys);
    levelSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    levelSel.dataset.rooms = JSON.stringify(roomsByLevel);
  }

  async function loadRooms(level) {
    if (!roomSel) return;
    if (!level) {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      return;
    }
    if (schoolWide) {
      const rooms = await fetchRoomOptions(level);
      roomSel.innerHTML =
        `<option value="">${escapeHtml(t('common.all'))}</option>` +
        rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
      return;
    }
    const map = JSON.parse(levelSel?.dataset.rooms || '{}');
    const rooms = map[level] || [];
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  async function fetchPointsRows(rangeOpts) {
    return queryPointsInRangeForSession(session, {
      ...rangeOpts,
      category: mode === 'behavior' ? 'behavior' : categorySel?.value || '',
      teacherName: teacherSel?.value || '',
      search: searchInput?.value?.trim() || '',
      deductionsOnly: mode === 'behavior' ? false : deductOnly?.checked
    });
  }

  async function refresh() {
    const seq = ++refreshSeq;
    if (content) content.innerHTML = renderLoading();
    try {
      const rangeOpts = {
        from: fromInput?.value || today,
        to: toInput?.value || today,
        level: levelSel?.value || '',
        room: roomSel?.value || ''
      };
      const attendancePromise =
        mode === 'ledger'
          ? queryAttendanceInRangeForSession(session, rangeOpts).catch(() => [])
          : Promise.resolve([]);
      let data = await fetchPointsRows(rangeOpts);
      if (seq !== refreshSeq) return;
      if (mode !== 'behavior') {
        const reconciled = await reconcileStaleSystemPoints(session, {
          ...rangeOpts,
          pointRows: data
        });
        if (reconciled > 0) {
          data = await fetchPointsRows(rangeOpts);
          if (seq !== refreshSeq) return;
        }
      }
      const attendanceRows = await attendancePromise;
      if (seq !== refreshSeq) return;
      rows = data;
      attendanceMeta = new Map();
      for (const row of attendanceRows) {
        if (!row.disciplineWaived) continue;
        const key = attendanceMetaKey(row.student_id, row.attendanceDate, row.class);
        attendanceMeta.set(key, {
          disciplineWaived: true,
          disciplineReturnedBy: String(row.disciplineReturnedBy || ''),
          disciplineReturnedAt: row.disciplineReturnedAt || null
        });
      }
      paintTeacherOptions(data.map((r) => r.teacherName));
      paintContent();
    } catch (err) {
      if (seq !== refreshSeq) return;
      content.innerHTML = renderEmpty(t('pointsReport.loadFailed'), err?.message || '');
      onToast?.(err?.message);
    }
  }

  container.querySelectorAll('[data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const next = tab.getAttribute('data-mode') || 'classes';
      if (next === 'behavior' && mode !== 'behavior') {
        resetBehaviorFilters();
      }
      mode = next;
      container.querySelectorAll('[data-mode]').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('data-mode') === mode);
      });
      syncToolbarForMode();
      void refresh();
    });
  });

  levelSel?.addEventListener('change', async () => {
    await loadRooms(levelSel.value);
    void refresh();
  });
  [toInput, roomSel, categorySel, teacherSel, deductOnly].forEach((el) => {
    el?.addEventListener('change', () => void refresh());
  });
  fromInput?.addEventListener('change', () => void refresh());
  searchInput?.addEventListener('input', () => void refresh());

  container.querySelector('#ptsTodayBtn')?.addEventListener('click', () => {
    if (fromInput) fromInput.value = today;
    if (toInput) toInput.value = today;
    void refresh();
  });

  if (initialTab === 'behavior') {
    resetBehaviorFilters();
  }
  syncToolbarForMode();

  void loadLevels()
    .then(async () => {
      if (initialLevel) {
        levelSel.value = initialLevel;
        await loadRooms(initialLevel);
        if (initialRoom) roomSel.value = initialRoom;
        if (initialLevel && initialRoom && mode !== 'behavior') mode = 'ledger';
      }
      container.querySelectorAll('[data-mode]').forEach((tab) => {
        tab.classList.toggle('is-active', tab.getAttribute('data-mode') === mode);
      });
      syncToolbarForMode();
      await refresh();
    })
    .catch((err) => onToast?.(err?.message));

  container.__pointsReportCleanup = () => {};
}
