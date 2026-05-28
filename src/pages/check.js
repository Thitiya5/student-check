import {
  renderStudentCardListMarkup,
  bindAttendanceStatusPickers,
  bindDisciplinePickers,
  updateStudentCardUI,
  updateStudentDisciplineUI
} from '../components/studentCard.js';
import { joinWithDot, MIDDOT } from '../utils/separator.js';
import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty, renderError } from '../utils/ui.js';
import {
  ATTENDANCE_STATUS_KEYS,
  normalizeAttendanceStatus,
  CHECK_DEFAULT_STATUS
} from '../data/attendanceStatuses.js';
import { emptyDisciplineEntry } from '../data/disciplineChecks.js';
import { t, statusLabel } from '../i18n/index.js';
import { isGasConfigured } from '../services/googleAppsScript.js';
import {
  buildAttendanceClassKey,
  getAttendanceForClassOnDate,
  recordsToAttendanceMap,
  recordsToDisciplineMap
} from '../services/attendanceService.js';
import { cacheClassSession, getCachedClassSession } from '../services/offlineDb.js';
import { isOnline } from '../services/offlineSync.js';
import { fetchLevelOptions, fetchRoomOptions, fetchStudentsByClass } from '../services/studentsService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  getAllowedClassKeys,
  getHomeroomClassKeys,
  classKeyToParts,
  canAccessLevelRoom,
} from '../services/teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';
import { isInspectionDayCached } from '../services/inspectionScheduleService.js';
import { canRecordDisciplineOnDate } from '../services/appSettingsService.js';
import { formatDateWithDayThai } from '../components/datePicker.js';
import { renderPageHeader, renderNavQuickLinks, bindPageHeaderActions } from '../components/pageHeader.js';
import { openBehaviorNoteModal } from '../components/behaviorNoteModal.js';

function countStatuses(students, attendance) {
  const out = Object.fromEntries(ATTENDANCE_STATUS_KEYS.map((k) => [k, 0]));
  for (const s of students) {
    const st = normalizeAttendanceStatus(attendance[s.student_id] || CHECK_DEFAULT_STATUS);
    if (st in out) out[st] += 1;
  }
  return out;
}

function buildFullMap(students, attendance) {
  const map = {};
  for (const s of students) {
    map[s.student_id] = attendance[s.student_id] || CHECK_DEFAULT_STATUS;
  }
  return map;
}

export function renderCheckPage(container, ctx = {}) {
  const { state = {}, submitAttendance, onNavigate, onBack, onToast, persistClassSelection } = ctx;

  const session = state.teacherAuth || loadTeacherAuthSession();
  const teacherName = String(session?.teacherName || state.teacherName || '').trim();
  const admin = isAdminSession(session);
  const allowedKeys = getAllowedClassKeys(session);
  const homeroomKeys = getHomeroomClassKeys(session);
  const singleClass =
    homeroomKeys.length === 1
      ? homeroomKeys[0]
      : !admin && allowedKeys?.length === 1
        ? allowedKeys[0]
        : '';
  const multiClass = !admin && allowedKeys && allowedKeys.length > 1;

  const dateKey = getTodayDate();
  let level = state.currentLevel || '';
  let room = state.currentRoom || '';
  let classReady = Boolean(state.classConfirmed && level && room);
  let students = [];
  let attendance = {};
  /** @type {Record<string, { flags: string[], adjust: number }>} */
  let discipline = {};

  if (singleClass) {
    const parts = classKeyToParts(singleClass);
    level = parts.level;
    room = parts.room;
  }

  const pickerAdminHtml = `<div class="class-picker-grid">
        <label class="field"><span>${escapeHtml(t('common.level'))}</span><select id="levelSelect" class="select-field"><option value="">${escapeHtml(t('common.select'))}</option></select></label>
        <label class="field"><span>${escapeHtml(t('common.room'))}</span><select id="roomSelect" class="select-field" disabled><option value="">${escapeHtml(t('common.select'))}</option></select></label>
      </div>`;

  const pickerMultiHtml = `<label class="field class-picker-single">
        <span>${escapeHtml(t('check.assignedClass'))}</span>
        <select id="assignedClassSelect" class="select-field"><option value="">${escapeHtml(t('common.select'))}</option></select>
      </label>`;

  const pickerSingleHtml = `<p class="class-picker-fixed glass-inline">
        <span class="class-picker-fixed__label">${escapeHtml(t('common.class'))}</span>
        <strong>${escapeHtml(singleClass)}</strong>
      </p>`;

  container.innerHTML = `<div class="attendance-screen">
    ${renderPageHeader({
      title: t('check.title'),
      subtitle: `${teacherName} · ${formatDateWithDayThai(dateKey)}`,
      topAction: 'back'
    })}
    ${renderNavQuickLinks([
      { label: t('nav.home'), path: '/dashboard' },
      { label: t('dashboard.quick.students'), path: '/students' },
      { label: t('dashboard.quick.history'), path: '/history' }
    ])}
    <section class="attendance-sheet class-picker-sheet glass-card" id="classPickerSheet" ${singleClass ? 'hidden' : ''}>
      <h2>${escapeHtml(t('check.pickClass'))}</h2>
      ${admin ? pickerAdminHtml : multiClass ? pickerMultiHtml : pickerSingleHtml}
      <button type="button" class="button-primary class-picker-go" id="startCheckBtn" ${singleClass ? 'hidden' : ''} disabled>${escapeHtml(t('check.start'))}</button>
    </section>
    <section id="checkBody">${renderEmpty(singleClass ? t('check.loadingStudents') : t('check.pickClass'))}</section>
    <footer class="attendance-footer-slot" id="checkFooter" hidden>
      <button type="button" class="attendance-save-btn button-primary" id="saveAttendance">${escapeHtml(t('common.save'))}</button>
    </footer>
  </div>`;

  const body = container.querySelector('#checkBody');
  const footer = container.querySelector('#checkFooter');
  const pickerSheet = container.querySelector('#classPickerSheet');
  const levelSel = container.querySelector('#levelSelect');
  const roomSel = container.querySelector('#roomSelect');
  const assignedSel = container.querySelector('#assignedClassSelect');
  const startBtn = container.querySelector('#startCheckBtn');

  function assertClassAccess() {
    if (!canAccessLevelRoom(session, level, room)) {
      console.warn('[check] class access denied', { level, room, allowed: session?.assignedClasses });
      onToast?.(t('toast.classNotAllowed'));
      return false;
    }
    return true;
  }

  async function loadLevels() {
    if (!isGasConfigured()) {
      body.innerHTML = renderError(t('check.gasNotConfigured'), t('check.gasHint'), 'checkGasSettings');
      body.querySelector('#checkGasSettings')?.addEventListener('click', () => onNavigate('/login'));
      return;
    }

    if (admin && levelSel) {
      const levels = await fetchLevelOptions();
      levelSel.innerHTML =
        `<option value="">${escapeHtml(t('common.select'))}</option>` +
        levels
          .map(
            (l) =>
              `<option value="${escapeHtml(l)}" ${l === level ? 'selected' : ''}>${escapeHtml(l)}</option>`
          )
          .join('');
      if (level) await loadRooms(level);
      return;
    }

    if (multiClass && assignedSel && allowedKeys) {
      assignedSel.innerHTML =
        `<option value="">${escapeHtml(t('common.select'))}</option>` +
        allowedKeys
          .map(
            (k) =>
              `<option value="${escapeHtml(k)}" ${k === buildAttendanceClassKey(level, room) ? 'selected' : ''}>${escapeHtml(k)}</option>`
          )
          .join('');
      if (startBtn) startBtn.disabled = !assignedSel.value;
    }
  }

  async function loadRooms(lvl) {
    if (!admin || !roomSel) return;
    const rooms = await fetchRoomOptions(lvl);
    roomSel.disabled = false;
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.select'))}</option>` +
      rooms
        .map(
          (r) =>
            `<option value="${escapeHtml(r)}" ${r === room ? 'selected' : ''}>${escapeHtml(t('common.roomLabel'))} ${escapeHtml(r)}</option>`
        )
        .join('');
    if (startBtn) startBtn.disabled = !(level && room);
  }

  function refreshSummary() {
    const row = body?.querySelector('.attendance-summary-row');
    if (!row) return;
    const summary = countStatuses(students, attendance);
    row.innerHTML = ATTENDANCE_STATUS_KEYS.map(
      (k) =>
        `<div class="attendance-mini"><div class="k">${escapeHtml(statusLabel(k))}</div><div class="v">${summary[k]}</div></div>`
    ).join('');
  }

  function renderStudentsUI() {
    if (!body) return;
    const summary = countStatuses(students, attendance);
    const inspectionBanner =
      isInspectionDayCached(dateKey) && canRecordDisciplineOnDate(dateKey)
        ? `<p class="check-inspection-banner" role="status">${escapeHtml(t('check.inspectionDayBanner'))}</p>`
        : '';

    body.innerHTML = `<p class="attendance-teacher-line"><strong>${escapeHtml(level)}/${escapeHtml(room)}</strong> ${MIDDOT} ${students.length} ${escapeHtml(t('check.studentsCount'))}</p>
      ${inspectionBanner}
      <div class="attendance-summary-row">
        ${ATTENDANCE_STATUS_KEYS.map((k) => `<div class="attendance-mini"><div class="k">${escapeHtml(statusLabel(k))}</div><div class="v">${summary[k] ?? 0}</div></div>`).join('')}
      </div>
      <div class="attendance-tools">
        <input class="input-field attendance-tools__search" id="studentSearch" placeholder="${escapeHtml(t('check.searchPlaceholder'))}" />
        <div class="attendance-tools__actions">
          <button type="button" class="attendance-chip-btn" id="markAllPresent">${escapeHtml(t('check.markAll'))}</button>
          ${admin || multiClass ? `<button type="button" class="attendance-chip-btn" id="changeClassBtn">${escapeHtml(t('check.changeClass'))}</button>` : ''}
        </div>
      </div>
      <div class="attendance-students-scroll attendance-students-list" id="studentList">${renderStudentCardListMarkup(students, attendance, discipline, true, ATTENDANCE_STATUS_KEYS, dateKey)}</div>`;


    footer.hidden = false;
    bindInteractions();
  }

  function bindInteractions() {
    const scrollEl = body.querySelector('.attendance-students-list');
    if (!scrollEl) return;

    bindAttendanceStatusPickers(scrollEl, (studentId, status) => {
      const key = normalizeAttendanceStatus(status);
      if (!ATTENDANCE_STATUS_KEYS.includes(key)) return;
      attendance[studentId] = key;
      const disc = discipline[studentId] || emptyDisciplineEntry();
      updateStudentCardUI(scrollEl, studentId, key, disc, dateKey);
      refreshSummary();
    });

    bindDisciplinePickers(scrollEl, (studentId, action) => {
      if (!discipline[studentId]) discipline[studentId] = emptyDisciplineEntry();
      const entry = { ...discipline[studentId], behaviors: [...(discipline[studentId].behaviors || [])] };

      if (action.type === 'toggle' && action.flag) {
        const set = new Set(entry.flags);
        if (set.has(action.flag)) set.delete(action.flag);
        else set.add(action.flag);
        entry.flags = [...set];
        discipline[studentId] = entry;
        updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
        return;
      }

      if (action.type === 'behavior' && action.kind) {
        const kind = action.kind;
        const existing = entry.behaviors.find((b) => b.kind === kind);
        if (existing) {
          entry.behaviors = entry.behaviors.filter((b) => b.kind !== kind);
          discipline[studentId] = entry;
          updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
          return;
        }
        openBehaviorNoteModal({
          title: kind === 'good' ? t('discipline.goodDeed') : t('discipline.badDeed'),
          onConfirm: (note) => {
            entry.behaviors = [...entry.behaviors.filter((b) => b.kind !== kind), { kind, note }];
            discipline[studentId] = entry;
            updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
          }
        });
      }
    });

    body.querySelector('#markAllPresent')?.addEventListener('click', () => {
      students.forEach((s) => {
        attendance[s.student_id] = 'present';
        const disc = discipline[s.student_id] || emptyDisciplineEntry();
        updateStudentCardUI(scrollEl, s.student_id, 'present', disc, dateKey);
      });
      refreshSummary();
    });

    body.querySelector('#changeClassBtn')?.addEventListener('click', () => {
      classReady = false;
      footer.hidden = true;
      persistClassSelection?.('', '', { classConfirmed: false });
      level = '';
      room = '';
      if (levelSel) levelSel.value = '';
      if (roomSel) {
        roomSel.value = '';
        roomSel.disabled = true;
      }
      if (assignedSel) assignedSel.value = '';
      if (startBtn) startBtn.disabled = true;
      if (pickerSheet) pickerSheet.hidden = false;
      body.innerHTML = renderEmpty(t('check.pickNew'));
    });

    let search = '';
    body.querySelector('#studentSearch')?.addEventListener('input', (e) => {
      search = e.target.value.trim().toLowerCase();
      scrollEl.querySelectorAll('.attendance-student-card').forEach((el) => {
        const text = el.textContent?.toLowerCase() ?? '';
        el.style.display = !search || text.includes(search) ? '' : 'none';
      });
    });
  }

  async function openClass() {
    if (!level || !room) return;
    if (!assertClassAccess()) return;

    classReady = true;
    persistClassSelection?.(level, room, { classConfirmed: true });
    if (pickerSheet) pickerSheet.hidden = true;
    body.innerHTML = renderLoading(t('check.loadingStudents'));

    const classKey = buildAttendanceClassKey(level, room);
    try {
      students = await fetchStudentsByClass(level, room);

      if (isOnline()) {
        const records = await getAttendanceForClassOnDate(classKey, dateKey);
        attendance = recordsToAttendanceMap(records);
        discipline = recordsToDisciplineMap(records);
      } else {
        const cached = await getCachedClassSession(classKey, dateKey);
        attendance = cached?.attendance ?? {};
        discipline = cached?.discipline ?? {};
        if (!students.length) {
          throw new Error(t('offline.noCachedStudents'));
        }
      }

      students.forEach((s) => {
        const sid = s.student_id;
        if (!attendance[sid]) attendance[sid] = CHECK_DEFAULT_STATUS;
        if (!discipline[sid]) discipline[sid] = emptyDisciplineEntry();
      });

      await cacheClassSession(classKey, dateKey, { attendance, discipline, students });
      renderStudentsUI();
    } catch (err) {
      console.error('[check] openClass failed', err);
      body.innerHTML = renderError(t('check.loadFailed'), err?.message, 'checkRetryLoad');
      body.querySelector('#checkRetryLoad')?.addEventListener('click', () => void openClass());
      if (pickerSheet) pickerSheet.hidden = false;
      onToast?.(err?.message);
    }
  }

  bindPageHeaderActions(container, {
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  levelSel?.addEventListener('change', async () => {
    level = levelSel.value;
    room = '';
    classReady = false;
    footer.hidden = true;
    persistClassSelection?.(level, '', { classConfirmed: false });
    if (level) await loadRooms(level);
    else if (roomSel) roomSel.disabled = true;
    body.innerHTML = renderEmpty(t('check.pickRoom'));
  });

  roomSel?.addEventListener('change', () => {
    room = roomSel.value;
    if (startBtn) startBtn.disabled = !(level && room);
    persistClassSelection?.(level, room, { classConfirmed: false });
  });

  assignedSel?.addEventListener('change', () => {
    const key = assignedSel.value;
    if (!key) {
      level = '';
      room = '';
      if (startBtn) startBtn.disabled = true;
      return;
    }
    const parts = classKeyToParts(key);
    level = parts.level;
    room = parts.room;
    if (startBtn) startBtn.disabled = false;
    persistClassSelection?.(level, room, { classConfirmed: false });
  });

  startBtn?.addEventListener('click', () => void openClass());

  container.querySelector('#saveAttendance')?.addEventListener('click', async () => {
    if (!classReady || !students.length) return;
    if (!assertClassAccess()) return;
    const full = buildFullMap(students, attendance);
    const saveBtn = container.querySelector('#saveAttendance');
    saveBtn.disabled = true;
    try {
      await submitAttendance(full, {
        teacherName,
        classStudents: students,
        discipline,
        attendanceDate: dateKey,
        level,
        room,
        navigateAfterSave: true
      });
    } finally {
      saveBtn.disabled = false;
    }
  });

  void loadLevels()
    .then(() => {
      if (singleClass && level && room) {
        if (classReady) void openClass();
        else void openClass();
      } else if (classReady && level && room && assertClassAccess()) {
        void openClass();
      }
    })
    .catch((err) => onToast?.(err?.message));

  container.__checkCleanup = () => {};
}

