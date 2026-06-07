import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import {
  queryAttendanceInRangeForSession,
  buildAttendanceClassKey
} from '../services/attendanceService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  isSchoolWideViewSession,
  getViewClassKeys,
  classKeysToPickerOptions,
  canAccessClass
} from '../services/teacherAuth.js';
import { fetchLevelOptions, fetchRoomOptions } from '../services/studentsService.js';
import {
  getTodayDate,
  formatDateInBangkok,
  weekRangeContaining
} from '../utils/dateIso.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { exportReportPdf } from '../services/pdfExport.js';
import { exportMonthlyClassMatrixPdf } from '../services/monthlyClassMatrixPdf.js';
import {
  renderDailyReport,
  renderWeeklyReport,
  renderMonthlyReport,
  renderSemesterReport
} from './reportsRender.js';

function semesterRange(refDate) {
  const d = refDate || getTodayDate();
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  if (m >= 5 && m <= 10) {
    return { from: `${y}-05-01`, to: `${y}-10-31` };
  }
  if (m >= 11) {
    return { from: `${y}-11-01`, to: `${y + 1}-04-30` };
  }
  return { from: `${y - 1}-11-01`, to: `${y}-04-30` };
}

function lastDayOfMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return formatDateInBangkok(new Date(y, m, 0));
}

/**
 * @param {HTMLElement} container
 * @param {{ state: object, onToast?: (msg: string) => void }} ctx
 */
export function renderReportsPage(container, { state = {}, onToast, onLogout, onBack, onNavigate } = {}) {
  container.classList.add('reports-page');
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const schoolWide = isSchoolWideViewSession(session);
  const viewKeys = getViewClassKeys(session);
  const today = getTodayDate();
  let mode = 'daily';
  let view = 'class';
  let rows = [];
  let refreshSeq = 0;
  const singleAssignedClass = !schoolWide && Array.isArray(viewKeys) && viewKeys.length === 1
    ? String(viewKeys[0] || '')
    : '';

  const tabsHtml = admin
    ? `<button type="button" class="is-active" data-mode="daily">${escapeHtml(t('reports.daily'))}</button>
       <button type="button" data-mode="weekly">${escapeHtml(t('reports.weekly'))}</button>
       <button type="button" data-mode="monthly">${escapeHtml(t('reports.monthly'))}</button>
       <button type="button" data-mode="semester">${escapeHtml(t('reports.semester'))}</button>`
    : `<button type="button" class="is-active" data-mode="daily">${escapeHtml(t('reports.daily'))}</button>
       <button type="button" data-mode="weekly">${escapeHtml(t('reports.weekly'))}</button>
       <button type="button" data-mode="monthly">${escapeHtml(t('reports.monthly'))}</button>`;

  const teacherFilterHtml = admin
    ? `<label class="reports-filter reports-filter--wide" id="repTeacherField">
        <span class="reports-filter__label">${escapeHtml(t('common.teacherName'))}</span>
        <select id="repTeacher" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
      </label>`
    : '';

  container.innerHTML = `${renderPageHeader({
    title: t('reports.title'),
    topAction: 'back'
  })}
  <section class="segmented report-tabs">${tabsHtml}</section>
  <section class="reports-toolbar glass-card reports-toolbar--daily">
    <div class="reports-toolbar__view segmented report-view-tabs">
      <button type="button" class="is-active" data-view="class">${escapeHtml(t('reports.viewClass'))}</button>
      <button type="button" data-view="students">${escapeHtml(t('reports.viewStudents'))}</button>
    </div>
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterPeriod'))}</p>
      <div class="reports-toolbar__period">
        <label class="reports-filter" id="repFromWrap">
          <span class="reports-filter__label" id="repFromLabel">${escapeHtml(t('common.date'))}</span>
          <input type="date" id="repFrom" class="reports-filter__control input-field" value="${today}" />
        </label>
        <label class="reports-filter" id="repToWrap">
          <span class="reports-filter__label">${escapeHtml(t('common.toDate'))}</span>
          <input type="date" id="repTo" class="reports-filter__control input-field" value="${today}" />
        </label>
        <label class="reports-filter" id="repMonthWrap">
          <span class="reports-filter__label">${escapeHtml(t('pdf.matrixMonth'))}</span>
          <input type="month" id="repMonth" class="reports-filter__control input-field" value="${today.slice(0, 7)}" />
        </label>
        <button type="button" class="reports-today-chip" id="repTodayBtn">${escapeHtml(t('common.today'))}</button>
      </div>
    </div>
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterClass'))}</p>
      <div class="reports-toolbar__class-row">
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.level'))}</span>
          <select id="repLevel" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.room'))}</span>
          <select id="repRoom" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
        ${teacherFilterHtml}
      </div>
    </div>
    <div class="reports-toolbar__footer">
      <button type="button" class="reports-primary-link" id="repPointsReportBtn">${escapeHtml(t('pointsReport.open'))}</button>
      <div class="reports-toolbar__matrix" id="repMatrixSection" hidden>
        <button type="button" class="button-secondary reports-toolbar__matrix-btn" id="repExportMatrixPdf">${escapeHtml(t('pdf.matrixExportShort'))}</button>
      </div>
    </div>
  </section>
  <section id="reportContent">${renderLoading()}</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  const content = container.querySelector('#reportContent');
  const fromInput = container.querySelector('#repFrom');
  const toInput = container.querySelector('#repTo');
  const levelSel = container.querySelector('#repLevel');
  const roomSel = container.querySelector('#repRoom');
  const teacherSel = container.querySelector('#repTeacher');
  const monthInput = container.querySelector('#repMonth');
  const matrixSection = container.querySelector('#repMatrixSection');
  const toolbar = container.querySelector('.reports-toolbar');
  const toWrap = container.querySelector('#repToWrap');
  const fromWrap = container.querySelector('#repFromWrap');
  const monthWrap = container.querySelector('#repMonthWrap');
  const fromLabel = container.querySelector('#repFromLabel');

  function updateModeChrome() {
    if (matrixSection) matrixSection.hidden = mode !== 'monthly';
    toolbar?.classList.toggle('reports-toolbar--monthly', mode === 'monthly');
    toolbar?.classList.toggle('reports-toolbar--daily', mode === 'daily');
    toolbar?.classList.toggle('reports-toolbar--weekly', mode === 'weekly');
    toolbar?.classList.toggle('reports-toolbar--semester', mode === 'semester');
    if (toWrap) toWrap.hidden = mode === 'daily' || mode === 'monthly';
    if (fromWrap) fromWrap.hidden = mode === 'monthly';
    if (monthWrap) monthWrap.hidden = mode !== 'monthly';
    if (fromLabel) {
      fromLabel.textContent =
        mode === 'daily'
          ? t('common.date')
          : mode === 'weekly'
            ? t('reports.weekAnchor')
            : t('common.fromDate');
    }
  }

  function syncMonthFromRange() {
    if (!monthInput) return;
    const ref = fromInput?.value || today;
    monthInput.value = ref.slice(0, 7);
  }

  function applyMonthToRange(monthVal) {
    const m = monthVal || today.slice(0, 7);
    if (fromInput) fromInput.value = `${m}-01`;
    if (toInput) toInput.value = lastDayOfMonth(m);
    if (monthInput) monthInput.value = m;
  }

  function applyModeDates() {
    const ref = fromInput?.value || today;
    if (mode === 'daily') {
      const d = admin ? ref : today;
      if (fromInput) fromInput.value = d;
      if (toInput) toInput.value = d;
    } else if (mode === 'weekly') {
      const range = weekRangeContaining(ref);
      if (fromInput) fromInput.value = range.from;
      if (toInput) toInput.value = range.to;
    } else if (mode === 'monthly') {
      const m = monthInput?.value || ref.slice(0, 7);
      applyMonthToRange(m);
    } else if (mode === 'semester' && admin) {
      const range = semesterRange(ref);
      if (fromInput) fromInput.value = range.from;
      if (toInput) toInput.value = range.to;
    }
    syncMonthFromRange();
    updateModeChrome();
  }

  async function loadLevels() {
    try {
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
      if (singleAssignedClass) {
        const [defaultLevel] = singleAssignedClass.split('/');
        if (defaultLevel) levelSel.value = defaultLevel;
      }
    } catch (err) {
      onToast?.(err?.message);
    }
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
    try {
      const map = JSON.parse(levelSel?.dataset.rooms || '{}');
      const rooms = map[level] || [];
      roomSel.innerHTML =
        `<option value="">${escapeHtml(t('common.all'))}</option>` +
        rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    } catch {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
    }
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

  function renderReportBody(ctx) {
    if (mode === 'weekly') return renderWeeklyReport(ctx);
    if (mode === 'monthly') return renderMonthlyReport(ctx);
    if (mode === 'semester') return renderSemesterReport(ctx);
    return renderDailyReport(ctx);
  }

  async function renderReport() {
    if (!rows.length) {
      content.innerHTML = renderEmpty(t('history.empty'));
      return;
    }
    const level = levelSel?.value || '';
    const room = roomSel?.value || '';
    const classKey = level && room ? buildAttendanceClassKey(level, room) : '';
    const from = fromInput?.value || today;
    const to = toInput?.value || today;

    if (view === 'students' && !classKey) {
      content.innerHTML = renderEmpty(t('reports.pickClassTitle'));
      return;
    }

    if (mode === 'semester' && admin && !classKey) {
      content.innerHTML = renderEmpty(t('reports.pickClassTitle'));
      return;
    }

    const exportSection = `<section class="reports-export-card reports-export-card--bottom reports-export-card--compact glass-card">
      <button type="button" class="button-primary reports-export-card__button" id="repExportPdf">${escapeHtml(t('pdf.export'))}</button>
    </section>`;

    const reportBody = renderReportBody({
      rows,
      from,
      to,
      classKey,
      view,
      level
    });
    content.innerHTML = `${reportBody}${exportSection}`;
  }

  async function refresh() {
    const seq = ++refreshSeq;
    if (content) content.innerHTML = renderLoading();
    const from = fromInput?.value || today;
    const to = toInput?.value || today;
    const level = levelSel?.value || '';
    const room = roomSel?.value || '';
    const teacher = admin && teacherSel ? teacherSel.value : '';
    const classKey = level && room ? buildAttendanceClassKey(level, room) : '';

    if (mode === 'semester' && admin && !classKey && !level) {
      if (content) {
        content.innerHTML = renderEmpty(t('reports.pickClassTitle'));
      }
      return;
    }

    try {
      rows = await queryAttendanceInRangeForSession(session, {
        from,
        to,
        level: level || undefined,
        room: room || undefined,
        classKey: classKey || undefined,
        teacherName: teacher || undefined
      });
      if (seq !== refreshSeq) return;
      paintTeacherOptions(rows.map((r) => r.teacherName));
      await renderReport();
    } catch (err) {
      if (seq !== refreshSeq) return;
      console.error('[reports] failed', err);
      const hint =
        err?.code === 'range-too-wide' ? err.message : err?.message || t('reports.loadFailed');
      if (content) content.innerHTML = renderEmpty(t('reports.loadFailed'), hint);
    }
  }

  container.querySelector('.report-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!(btn instanceof HTMLButtonElement)) return;
    mode = btn.dataset.mode || 'daily';
    container.querySelectorAll('.report-tabs button').forEach((b) => b.classList.toggle('is-active', b === btn));
    applyModeDates();
    void refresh();
  });

  container.querySelector('.report-view-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!(btn instanceof HTMLButtonElement)) return;
    view = btn.dataset.view || 'class';
    container
      .querySelectorAll('.report-view-tabs button')
      .forEach((b) => b.classList.toggle('is-active', b === btn));
    void renderReport();
  });

  levelSel?.addEventListener('change', () => {
    void loadRooms(levelSel.value);
    void refresh();
  });
  roomSel?.addEventListener('change', () => void refresh());
  teacherSel?.addEventListener('change', () => void refresh());
  fromInput?.addEventListener('change', () => {
    if (mode === 'weekly') applyModeDates();
    void refresh();
  });
  toInput?.addEventListener('change', () => void refresh());
  monthInput?.addEventListener('change', () => {
    if (mode === 'monthly') {
      applyMonthToRange(monthInput.value);
      void refresh();
    }
  });

  container.querySelector('#repTodayBtn')?.addEventListener('click', () => {
    if (fromInput) fromInput.value = today;
    if (toInput) toInput.value = today;
    if (monthInput) monthInput.value = today.slice(0, 7);
    applyModeDates();
    void refresh();
  });

  async function initializeFilters() {
    await loadLevels();
    if (singleAssignedClass) {
      const [, defaultRoom = ''] = singleAssignedClass.split('/');
      await loadRooms(levelSel?.value || '');
      if (roomSel && defaultRoom) roomSel.value = defaultRoom;
    }
    applyModeDates();
    await refresh();
  }
  void initializeFilters();

  container.addEventListener('click', async (e) => {
    const classChip = e.target.closest('button.report-class-chip[data-class-key]');
    if (classChip instanceof HTMLButtonElement) {
      const classKey = classChip.getAttribute('data-class-key') || '';
      const slash = classKey.indexOf('/');
      if (slash > 0 && levelSel && roomSel) {
        levelSel.value = classKey.slice(0, slash);
        void loadRooms(levelSel.value).then(() => {
          roomSel.value = classKey.slice(slash + 1);
          void refresh();
        });
      }
      return;
    }

    const open = e.target.closest('button[data-open-profile][data-student-id]');
    if (open instanceof HTMLButtonElement) {
      const studentId = open.getAttribute('data-student-id') || '';
      const classKey = open.getAttribute('data-class-key') || '';
      if (studentId) {
        onNavigate?.(
          `/student-profile?id=${encodeURIComponent(studentId)}&class=${encodeURIComponent(classKey)}`
        );
      }
      return;
    }
    const btn = e.target.closest('#repExportPdf');
    if (btn instanceof HTMLButtonElement) {
      if (!rows.length) {
        onToast?.(t('history.empty'));
        return;
      }
      if (btn.disabled) return;
      btn.disabled = true;
      const prevLabel = btn.textContent;
      btn.textContent = t('pdf.exporting');
      try {
        const from = fromInput?.value || today;
        const to = toInput?.value || today;
        const classLabel =
          levelSel?.value && roomSel?.value
            ? buildAttendanceClassKey(levelSel.value, roomSel.value)
            : levelSel?.value || '';
        await exportReportPdf({
          mode,
          from,
          to,
          teacherName: session?.teacherName || '',
          classLabel,
          rows
        });
        onToast?.(t('pdf.exportDone'));
      } catch (err) {
        onToast?.(err?.message || t('pdf.exportFailed'));
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel || t('pdf.export');
      }
      return;
    }

    const pointsBtn = e.target.closest('#repPointsReportBtn');
    if (pointsBtn instanceof HTMLButtonElement) {
      const from = fromInput?.value || today;
      const to = toInput?.value || today;
      const level = levelSel?.value || '';
      const room = roomSel?.value || '';
      const qs = new URLSearchParams({ from, to });
      if (level) qs.set('level', level);
      if (room) qs.set('room', room);
      onNavigate?.(`/points-report?${qs.toString()}`);
      return;
    }

    const matrixBtn = e.target.closest('#repExportMatrixPdf');
    if (!(matrixBtn instanceof HTMLButtonElement)) return;

    const level = levelSel?.value || '';
    const room = roomSel?.value || '';
    if (!level || !room) {
      onToast?.(t('pdf.matrixPickClass'));
      return;
    }
    const classKey = buildAttendanceClassKey(level, room);
    if (!canAccessClass(session, classKey)) {
      onToast?.(t('admin.denied'));
      return;
    }
    const yearMonth = monthInput?.value || fromInput?.value?.slice(0, 7) || today.slice(0, 7);
    try {
      matrixBtn.disabled = true;
      await exportMonthlyClassMatrixPdf({ yearMonth, classKey, session });
      onToast?.(t('pdf.matrixExportDone'));
    } catch (err) {
      onToast?.(err?.message || t('pdf.exportFailed'));
    } finally {
      matrixBtn.disabled = false;
    }
  });

  container.__reportsCleanup = () => {};
}
