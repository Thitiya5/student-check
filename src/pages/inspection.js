import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t, statusLabel } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import {
  fetchLevelOptions,
  fetchRoomOptions,
  fetchStudentsByClass,
  studentFullName
} from '../services/studentsService.js';
import {
  buildAttendanceClassKey,
  getAttendanceForClassOnDate,
  recordsToAttendanceMap,
  saveClassAttendance
} from '../services/attendanceService.js';
import { getDisciplineChecks, normalizeDisciplineFlags, emptyDisciplineEntry } from '../data/disciplineChecks.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { syncInspectionPointTransactions } from '../services/studentPointsService.js';
import { isInspectionDayCached } from '../services/inspectionScheduleService.js';
import { getTodayDate } from '../utils/dateIso.js';
import { isDisciplineScoringEnabled } from '../services/appSettingsService.js';
import { isAdminSession, loadTeacherAuthSession } from '../services/teacherAuth.js';

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderInspectionPage(container, { state = {}, onToast, onLogout, onNavigate, onBack } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!isAdminSession(session)) {
    onNavigate?.('/dashboard');
    return;
  }

  const today = getTodayDate();
  let level = '';
  let room = '';
  let dateKey = today;
  /** @type {Array<object>} */
  let students = [];
  /** @type {Record<string, string>} */
  let attendance = {};
  /** @type {Record<string, { flags: string[] }>} */
  let inspection = {};
  let loaded = false;
  let inspectionAllowed = false;

  container.innerHTML = `${renderPageHeader({
    title: t('inspection.title'),
    subtitle: t('inspection.subtitle'),
    topAction: 'back'
  })}
  <section class="filter-panel glass-card">
    <div class="filter-grid filter-grid--reports">
      <label class="field"><span>${escapeHtml(t('common.date'))}</span><input type="date" id="inspDate" class="input-field" value="${today}" /></label>
      <label class="field"><span>${escapeHtml(t('common.level'))}</span><select id="inspLevel" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      <label class="field"><span>${escapeHtml(t('common.room'))}</span><select id="inspRoom" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>
    </div>
    <button type="button" class="button-primary" id="inspLoadBtn">${escapeHtml(t('inspection.loadClass'))}</button>
  </section>
  <section id="inspBody">${renderEmpty(t('inspection.pickClass'), t('inspection.pickClassHint'))}</section>`;

  bindPageHeaderActions(container, {
    onBack: () => onBack?.('/admin'),
    onNavigate
  });

  const body = container.querySelector('#inspBody');
  const levelSel = container.querySelector('#inspLevel');
  const roomSel = container.querySelector('#inspRoom');
  const dateInput = container.querySelector('#inspDate');

  async function loadLevels() {
    const levels = await fetchLevelOptions();
    levelSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }

  async function loadRooms(lv) {
    if (!lv) {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      return;
    }
    const rooms = await fetchRoomOptions(lv);
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  function isAbsent(studentId) {
    const st = normalizeAttendanceStatus(attendance[studentId] || 'present');
    return st === 'absent';
  }

  function renderList() {
    if (!students.length) {
      body.innerHTML = renderEmpty(t('check.noStudents'));
      return;
    }

    const cards = students
      .map((s) => {
        const sid = s.student_id;
        const st = normalizeAttendanceStatus(attendance[sid] || 'present');
        const absent = st === 'absent';
        const flags = absent
          ? getDisciplineChecks().map((r) => r.id)
          : normalizeDisciplineFlags(inspection[sid]?.flags || []);
        const chips = getDisciplineChecks().map((rule) => {
          const on = flags.includes(rule.id);
          const disabled = absent ? 'disabled' : '';
          return `<button type="button" class="discipline-chip${on ? ' discipline-chip--on' : ''}" data-sid="${escapeHtml(sid)}" data-flag="${escapeHtml(rule.id)}" ${disabled} aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(t(rule.labelKey))}</button>`;
        }).join('');

        return `<article class="inspection-card glass-card ${absent ? 'inspection-card--absent' : ''}">
        <div class="inspection-card__head">
          <strong>${escapeHtml(studentFullName(s))}</strong>
          <span class="status-pill status-${escapeHtml(st)}">${escapeHtml(statusLabel(st))}</span>
        </div>
        ${absent ? `<p class="inspection-card__auto">${escapeHtml(t('inspection.autoFail'))}</p>` : ''}
        <div class="discipline-chips">${chips}</div>
      </article>`;
      })
      .join('');

    body.innerHTML = `
      <p class="inspection-hint">${escapeHtml(t('inspection.hint'))}</p>
      <div class="inspection-list">${cards}</div>
      <button type="button" class="button-primary inspection-save" id="inspSaveBtn">${escapeHtml(t('inspection.save'))}</button>`;

    body.querySelectorAll('.discipline-chip[data-sid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const sid = btn.getAttribute('data-sid');
        const flag = btn.getAttribute('data-flag');
        if (!sid || !flag) return;
        if (!inspection[sid]) inspection[sid] = { flags: [] };
        const set = new Set(inspection[sid].flags);
        if (set.has(flag)) set.delete(flag);
        else set.add(flag);
        inspection[sid].flags = [...set];
        renderList();
      });
    });

    body.querySelector('#inspSaveBtn')?.addEventListener('click', () => void saveInspection());
  }

  async function openClass() {
    level = levelSel?.value || '';
    room = roomSel?.value || '';
    dateKey = dateInput?.value || today;
    if (!level || !room) {
      onToast?.(t('toast.pickClass'));
      return;
    }

    inspectionAllowed = isInspectionDayCached(dateKey) && isDisciplineScoringEnabled();
    if (!inspectionAllowed) {
      body.innerHTML = renderEmpty(t('inspection.notScheduled'), t('inspection.notScheduledHint'));
      return;
    }

    body.innerHTML = renderLoading();
    try {
      const classKey = buildAttendanceClassKey(level, room);
      students = await fetchStudentsByClass(level, room);
      const records = await getAttendanceForClassOnDate(classKey, dateKey);
      attendance = recordsToAttendanceMap(records);
      inspection = {};
      for (const s of students) {
        const sid = s.student_id;
        const rec = records.find((r) => r.student_id === sid);
        inspection[sid] = {
          flags: normalizeDisciplineFlags(rec?.disciplineFlags || [])
        };
      }
      loaded = true;
      renderList();
    } catch (err) {
      body.innerHTML = renderEmpty(t('inspection.loadFailed'), err?.message || '');
    }
  }

  async function saveInspection() {
    if (!loaded || !students.length) return;
    const classKey = buildAttendanceClassKey(level, room);
    const teacherName = session?.teacherName || '';

    const payloadStudents = students.map((s) => {
      const sid = s.student_id;
      const st = normalizeAttendanceStatus(attendance[sid] || 'present');
      const absent = st === 'absent';
      const flags = absent
        ? getDisciplineChecks().map((r) => r.id)
        : normalizeDisciplineFlags(inspection[sid]?.flags || []);
      return {
        student_id: sid,
        student_name: studentFullName(s),
        status: st,
        flags,
        autoFail: absent
      };
    });

    try {
      await syncInspectionPointTransactions({
        classKey,
        date: dateKey,
        teacherName,
        students: payloadStudents
      });

      await saveClassAttendance({
        classKey,
        teacherName,
        attendanceDate: dateKey,
        students: students.map((s) => {
          const sid = s.student_id;
          const st = normalizeAttendanceStatus(attendance[sid] || 'present');
          const absent = st === 'absent';
          const flags = absent
            ? getDisciplineChecks().map((r) => r.id)
            : normalizeDisciplineFlags(inspection[sid]?.flags || []);
          const disc = emptyDisciplineEntry();
          disc.flags = flags;
          return {
            student_id: sid,
            first_name: s.first_name,
            last_name: s.last_name,
            student_name: studentFullName(s),
            status: st,
            disciplineFlags: flags,
            disciplineBehaviors: [],
            disciplineAdjust: 0,
            disciplineNote: ''
          };
        })
      });

      onToast?.(t('inspection.saved'));
    } catch (err) {
      onToast?.(err?.message || t('inspection.saveFailed'));
    }
  }

  levelSel?.addEventListener('change', () => void loadRooms(levelSel.value));
  dateInput?.addEventListener('change', () => {
    loaded = false;
    body.innerHTML = renderEmpty(t('inspection.pickClass'), t('inspection.pickClassHint'));
  });
  container.querySelector('#inspLoadBtn')?.addEventListener('click', () => void openClass());
  void loadLevels();
  inspectionAllowed = isInspectionDayCached(today) && isDisciplineScoringEnabled();
  if (!inspectionAllowed && body) {
    body.innerHTML = renderEmpty(t('inspection.notScheduled'), t('inspection.notScheduledHint'));
  }
  container.__inspectionCleanup = () => {};
}
