import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import {
  queryAttendanceInRangeForSession,
  summarizeAttendance,
  buildAttendanceClassKey
} from '../services/attendanceService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  getAllowedClassKeys,
  classKeysToPickerOptions
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

function buildStudentAttendanceReports(rows) {
  const byStudent = new Map();
  for (const row of rows) {
    const studentId = String(row.student_id || '').trim();
    if (!studentId) continue;
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push(row);
  }
  return [...byStudent.entries()]
    .map(([studentId, list]) => {
      const summary = summarizeAttendance(list);
      const total = list.length || 1;
      const concern = summary.absent + summary.late + summary.sick + summary.errand;
      const concernPercent = Math.round((concern / total) * 100);
      return {
        studentId,
        classKey: String(list[0]?.class || ''),
        studentName: String(list[0]?.student_name || studentId),
        presentPercent: summary.percent,
        concernPercent,
        totalDays: list.length
      };
    })
    .sort((a, b) => {
      if (b.concernPercent !== a.concernPercent) return b.concernPercent - a.concernPercent;
      if (a.presentPercent !== b.presentPercent) return a.presentPercent - b.presentPercent;
      return a.studentName.localeCompare(b.studentName, 'th');
    });
}

function renderClassAttendanceSection(rows) {
  const summary = summarizeAttendance(rows);
  const statusRows = [
    { label: t('status.present'), value: summary.present },
    { label: t('status.late'), value: summary.late },
    { label: t('status.absent'), value: summary.absent },
    { label: t('status.sick'), value: summary.sick },
    { label: t('status.errand'), value: summary.errand },
    { label: t('status.activity'), value: summary.activity }
  ]
    .map(
      (item) => `<li class="reports-attendance__row">
      <span>${escapeHtml(item.label)}</span>
      <strong>${item.value}</strong>
    </li>`
    )
    .join('');

  const byClass = new Map();
  for (const row of rows) {
    const classKey = String(row.class || '—');
    if (!byClass.has(classKey)) byClass.set(classKey, []);
    byClass.get(classKey).push(row);
  }
  const classRows = [...byClass.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([classKey, list]) => {
      const classSummary = summarizeAttendance(list);
      return `<li class="reports-classes__row">
        <span class="reports-classes__name">${escapeHtml(classKey)}</span>
        <span class="reports-classes__meta">${classSummary.percent}% · ${classSummary.checked} ${escapeHtml(
        t('reports.total')
      )}</span>
      </li>`;
    })
    .join('');

  return `
    <section class="reports-attendance glass-card">
      <h3>${escapeHtml(t('reports.classAttendanceTitle'))}</h3>
      <p class="reports-attendance__meta">${escapeHtml(
        t('reports.classAttendanceMeta', { percent: summary.percent, total: summary.checked })
      )}</p>
      <ul class="reports-attendance__list">${statusRows}</ul>
    </section>
    <section class="reports-classes glass-card">
      <h3>${escapeHtml(t('reports.byClass'))}</h3>
      <ul class="reports-classes__list">${classRows}</ul>
    </section>
  `;
}

function renderIndividualAttendanceSection(rows) {
  const reports = buildStudentAttendanceReports(rows);
  if (!reports.length) {
    return `<section class="reports-students glass-card">
      <h3>${escapeHtml(t('reports.viewStudents'))}</h3>
      <p class="reports-students__hint">${escapeHtml(t('history.empty'))}</p>
    </section>`;
  }
  const riskCount = reports.filter((r) => r.concernPercent >= 60).length;
  const list = reports
    .map((r) => {
      const badge =
        r.concernPercent >= 60
          ? `<span class="reports-students__badge">${escapeHtml(t('points.parentWarningBadge'))}</span>`
          : '';
      return `<li class="reports-students__row">
        <button type="button" class="reports-students__item" data-open-profile="1" data-student-id="${escapeHtml(
          r.studentId
        )}" data-class-key="${escapeHtml(r.classKey)}">
          <span class="reports-students__name">${escapeHtml(r.studentName)}</span>
          ${badge}
          <span class="reports-students__pct">${r.presentPercent}%</span>
        </button>
      </li>`;
    })
    .join('');

  return `<section class="reports-students glass-card">
    <div class="reports-students__head">
      <h3>${escapeHtml(t('reports.viewStudents'))}</h3>
      <p class="reports-students__meta">${escapeHtml(
        t('reports.studentsMeta', { students: reports.length, atRisk: riskCount })
      )}</p>
    </div>
    <ol class="reports-students__list">${list}</ol>
  </section>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ state: object, onToast?: (msg: string) => void }} ctx
 */
export function renderReportsPage(container, { state = {}, onToast, onLogout, onBack, onNavigate } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const allowedKeys = getAllowedClassKeys(session);
  const today = getTodayDate();
  let mode = 'daily';
  let view = 'class';
  let rows = [];
  let refreshSeq = 0;
  const singleAssignedClass = !admin && Array.isArray(allowedKeys) && allowedKeys.length === 1
    ? String(allowedKeys[0] || '')
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
    ? `<label class="field" id="repTeacherField"><span>${escapeHtml(t('common.teacherName'))}</span><select id="repTeacher" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>`
    : '';

  container.innerHTML = `${renderPageHeader({
    title: t('reports.title'),
    topAction: 'back'
  })}
  <section class="segmented report-tabs">${tabsHtml}</section>
  <section class="filter-panel glass-card">
    <div class="report-filter-head">
      <h3 class="report-filter-title">${escapeHtml(t('reports.filters'))}</h3>
    </div>
    <div class="filter-grid filter-grid--reports">
      <label class="field"><span>${escapeHtml(t('common.fromDate'))}</span><input type="date" id="repFrom" class="input-field" value="${today}" /></label>
      <label class="field"><span>${escapeHtml(t('common.toDate'))}</span><input type="date" id="repTo" class="input-field" value="${today}" /></label>
      <label class="field"><span>${escapeHtml(t('common.level'))}</span><select id="repLevel" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      <label class="field"><span>${escapeHtml(t('common.room'))}</span><select id="repRoom" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      ${teacherFilterHtml}
    </div>
  </section>
  <section class="segmented report-view-tabs">
    <button type="button" class="is-active" data-view="class">${escapeHtml(t('reports.viewClass'))}</button>
    <button type="button" data-view="students">${escapeHtml(t('reports.viewStudents'))}</button>
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
      const m = ref.slice(0, 7);
      if (fromInput) fromInput.value = `${m}-01`;
      if (toInput) toInput.value = lastDayOfMonth(m);
    } else if (mode === 'semester' && admin) {
      const range = semesterRange(ref);
      if (fromInput) fromInput.value = range.from;
      if (toInput) toInput.value = range.to;
    }
  }

  async function loadLevels() {
    try {
      if (admin) {
        const levels = await fetchLevelOptions();
        levelSel.innerHTML =
          `<option value="">${escapeHtml(t('common.all'))}</option>` +
          levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
        return;
      }
      const keys = allowedKeys || [];
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
    if (admin) {
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

  async function renderReport() {
    if (!content) return;
    if (!rows.length) {
      content.innerHTML = renderEmpty(t('history.empty'), t('reports.emptyHint'));
      return;
    }
    const level = levelSel?.value || '';
    const room = roomSel?.value || '';
    const classKey = level && room ? buildAttendanceClassKey(level, room) : '';

    if (view === 'students' && !classKey) {
      content.innerHTML = renderEmpty(
        t('reports.pickClassTitle'),
        t('reports.pickClassForIndividualsHint')
      );
      return;
    }

    const exportSection = `<section class="reports-export-card reports-export-card--bottom glass-card">
      <p class="reports-export-card__hint">${escapeHtml(t('pdf.exportReady'))}</p>
      <button type="button" class="button-primary reports-export-card__button" id="repExportPdf">${escapeHtml(t('pdf.export'))}</button>
    </section>`;

    const reportBody = view === 'students' ? renderIndividualAttendanceSection(rows) : renderClassAttendanceSection(rows);
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
    const classKey =
      level && room ? buildAttendanceClassKey(level, room) : '';

    if (mode === 'semester' && admin && !classKey && !level) {
      if (content) {
        content.innerHTML = renderEmpty(
          t('reports.pickClassTitle'),
          t('reports.pickClassHint')
        );
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
  fromInput?.addEventListener('change', () => void refresh());
  toInput?.addEventListener('change', () => void refresh());

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
    if (!(btn instanceof HTMLButtonElement)) return;
    if (!rows.length) {
      onToast?.(t('history.empty'));
      return;
    }
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
    }
  });

  container.__reportsCleanup = () => {};
}
