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
import {
  emptyDisciplineEntry,
  formatDisciplineScore,
  summarizeDisciplineChanges,
  resolveDisciplineFlagsForScoring,
  getDisciplineChecks,
  normalizeDisciplineFlags,
  disciplineEntryToFirestore
} from '../data/disciplineChecks.js';
import { showSaveResultBadge, dismissSaveResultBadge } from '../components/saveResultBadge.js';
import { t, statusLabel } from '../i18n/index.js';
import { isGasConfigured } from '../services/googleAppsScript.js';
import {
  buildAttendanceClassKey,
  getAttendanceForClassOnDate,
  recordsToAttendanceMap,
  recordsToDisciplineMap,
  saveClassAttendance,
  deleteAttendanceForClassOnDate
} from '../services/attendanceService.js';
import { cacheClassSession, getCachedClassSession } from '../services/offlineDb.js';
import { isOnline } from '../services/offlineSync.js';
import {
  fetchLevelOptions,
  fetchRoomOptions,
  fetchStudentsByClass,
  studentFullName
} from '../services/studentsService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  getAllowedClassKeys,
  getHomeroomClassKeys,
  classKeyToParts,
  canAccessLevelRoom,
} from '../services/teacherAuth.js';
import { getTodayDate, isSchoolDay, isWeekendDate } from '../utils/dateIso.js';
import { initAppSettings } from '../services/appSettingsService.js';
import { formatDateWithDayThai } from '../components/datePicker.js';
import { renderPageHeader, renderNavQuickLinks, bindPageHeaderActions } from '../components/pageHeader.js';
import { withBehaviorQuickLink } from '../utils/quickNavLinks.js';
import { getHashQuery } from '../services/navigation.js';
import {
  enrichStudentsForPointSync,
  syncClassPointTransactions
} from '../services/studentPointsService.js';
import { resyncPointsForClassDay } from '../services/historyPointSync.js';
import { openConfirmModal } from '../components/confirmModal.js';

function countStatuses(students, attendance, { weekendView = false } = {}) {
  const out = Object.fromEntries(ATTENDANCE_STATUS_KEYS.map((k) => [k, 0]));
  let unchecked = 0;
  for (const s of students) {
    const sid = s.student_id;
    const hasRecord = Object.prototype.hasOwnProperty.call(attendance, sid);
    if (weekendView && !hasRecord) {
      unchecked += 1;
      continue;
    }
    const st = normalizeAttendanceStatus(attendance[sid] || CHECK_DEFAULT_STATUS);
    if (st in out) out[st] += 1;
  }
  return { ...out, unchecked };
}

function buildFullMap(students, attendance) {
  const map = {};
  for (const s of students) {
    map[s.student_id] = attendance[s.student_id] || CHECK_DEFAULT_STATUS;
  }
  return map;
}

export function renderCheckPage(container, ctx = {}) {
  const { state = {}, submitAttendance, onNavigate, onBack, onToast, persistClassSelection, persistCheckDate } = ctx;

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

  const deepLink = getHashQuery();
  const deepDate = deepLink.get('date');
  const deepLevel = deepLink.get('level');
  const deepRoom = deepLink.get('room');
  const hasDeepClass = Boolean(deepLevel && deepRoom);
  let dateKey = deepDate || state.currentDate || getTodayDate();
  let level = deepLevel || state.currentLevel || '';
  let room = deepRoom || state.currentRoom || '';
  let classReady = hasDeepClass || Boolean(state.classConfirmed && level && room);
  let students = [];
  let attendance = {};
  /** @type {Record<string, { flags: string[], behaviors: Array<{ kind: string }>, note: string }>} */
  let discipline = {};
  /** @type {typeof discipline} */
  let baselineDiscipline = {};
  let weekendHasSavedData = false;
  let weekendSavedCount = 0;

  if (singleClass && !hasDeepClass) {
    const parts = classKeyToParts(singleClass);
    level = parts.level;
    room = parts.room;
  }

  const hideClassPicker = Boolean(singleClass && !hasDeepClass) || hasDeepClass;

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
    ${renderNavQuickLinks(
      withBehaviorQuickLink(session, [
        { label: t('nav.home'), path: '/dashboard' },
        { label: t('dashboard.quick.students'), path: '/students' },
        { label: t('dashboard.quick.history'), path: '/history' }
      ])
    )}
    <label class="field check-date-field glass-card">
      <span>${escapeHtml(t('common.date'))}</span>
      <input type="date" id="checkDate" class="input-field" value="${escapeHtml(dateKey)}" />
    </label>
    <section class="attendance-sheet class-picker-sheet glass-card" id="classPickerSheet" ${hideClassPicker ? 'hidden' : ''}>
      <h2>${escapeHtml(t('check.pickClass'))}</h2>
      ${admin ? pickerAdminHtml : multiClass ? pickerMultiHtml : pickerSingleHtml}
      <button type="button" class="button-primary class-picker-go" id="startCheckBtn" ${hideClassPicker ? 'hidden' : ''} disabled>${escapeHtml(t('check.start'))}</button>
    </section>
    <section id="checkBody">${renderEmpty(hideClassPicker ? t('check.loadingStudents') : t('check.pickClass'))}</section>
    <footer class="attendance-footer-slot" id="checkFooter" hidden>
      <button type="button" class="attendance-save-btn button-primary" id="saveAttendance">${escapeHtml(t('common.save'))}</button>
    </footer>
  </div>`;

  const headerSubtitle = container.querySelector('.dash-header__date');
  const dateInput = container.querySelector('#checkDate');
  const body = container.querySelector('#checkBody');
  const footer = container.querySelector('#checkFooter');
  const pickerSheet = container.querySelector('#classPickerSheet');
  const levelSel = container.querySelector('#levelSelect');
  const roomSel = container.querySelector('#roomSelect');
  const assignedSel = container.querySelector('#assignedClassSelect');
  const startBtn = container.querySelector('#startCheckBtn');

  function getStartButtonLabel() {
    return isSchoolDay(dateKey) ? t('check.start') : t('check.startView');
  }

  function updatePickerState() {
    if (levelSel) level = levelSel.value || level;
    if (roomSel) room = roomSel.value || room;
    const ready = Boolean(level && room);
    if (startBtn) {
      startBtn.disabled = !ready;
      startBtn.textContent = getStartButtonLabel();
    }
  }

  function updateHeaderDate() {
    if (headerSubtitle) {
      headerSubtitle.textContent = `${teacherName} · ${formatDateWithDayThai(dateKey)}`;
    }
  }

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
      updatePickerState();
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
      updatePickerState();
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
    level = levelSel?.value || lvl;
    room = roomSel.value || room;
    updatePickerState();
  }

  function cloneDisciplineMap(source = {}) {
    /** @type {typeof discipline} */
    const out = {};
    for (const [sid, entry] of Object.entries(source)) {
      out[sid] = {
        flags: [...(entry?.flags || [])],
        behaviors: (entry?.behaviors || []).map((b) => ({ ...b })),
        note: String(entry?.note || '')
      };
    }
    return out;
  }

  function summarizePendingDiscipline() {
    return summarizeDisciplineChanges(students, discipline, baselineDiscipline, studentFullName, {
      trackFlags: true,
      trackBehaviors: false
    });
  }

  function refreshSummary() {
    const row = body?.querySelector('.attendance-summary-row');
    if (!row) return;
    const weekend = isWeekendCheck();
    row.innerHTML = renderSummaryHtml(countStatuses(students, attendance, { weekendView: weekend }), {
      weekendUncheckedOnly: weekend && !weekendHasSavedData
    });
  }

  function renderSummaryHtml(summary, { weekendUncheckedOnly = false } = {}) {
    if (weekendUncheckedOnly) {
      return `<div class="attendance-mini attendance-mini--unchecked"><div class="k">${escapeHtml(t('status.unchecked'))}</div><div class="v">${summary.unchecked ?? 0}</div></div>`;
    }
    return ATTENDANCE_STATUS_KEYS.map(
      (k) =>
        `<div class="attendance-mini"><div class="k">${escapeHtml(statusLabel(k))}</div><div class="v">${summary[k] ?? 0}</div></div>`
    ).join('');
  }

  function isWeekendCheck() {
    return isWeekendDate(dateKey);
  }

  function renderStudentsUI() {
    if (!body) return;
    const weekend = isWeekendCheck();
    const canEdit = isSchoolDay(dateKey);
    const summary = countStatuses(students, attendance, { weekendView: weekend });
    const clearBtn =
      weekend && weekendHasSavedData
        ? `<div class="check-weekend-actions">
             <button type="button" class="button-secondary button-danger check-weekend-clear-btn" id="weekendClearBtn">${escapeHtml(t('check.weekendClearBtn'))}</button>
           </div>`
        : '';
    const weekendBanner = weekend
      ? `<div class="check-weekend-panel">
           <p class="check-weekend-banner" role="status">${escapeHtml(t('check.weekendBanner'))}</p>
           ${clearBtn}
         </div>`
      : '';
    body.innerHTML = `${weekendBanner}<p class="attendance-teacher-line"><strong>${escapeHtml(level)}/${escapeHtml(room)}</strong> ${MIDDOT} ${students.length} ${escapeHtml(t('check.studentsCount'))}</p>
      <div class="attendance-summary-row">
        ${renderSummaryHtml(summary, { weekendUncheckedOnly: weekend && !weekendHasSavedData })}
      </div>
      <div class="attendance-tools">
        <input class="input-field attendance-tools__search" id="studentSearch" placeholder="${escapeHtml(t('check.searchPlaceholder'))}" />
        <div class="attendance-tools__actions">
          ${canEdit ? `<button type="button" class="attendance-chip-btn" id="markAllPresent">${escapeHtml(t('check.markAll'))}</button>` : ''}
          ${admin || multiClass ? `<button type="button" class="attendance-chip-btn" id="changeClassBtn">${escapeHtml(t('check.changeClass'))}</button>` : ''}
        </div>
      </div>
      <div class="attendance-students-scroll attendance-students-list" id="studentList">${renderStudentCardListMarkup(students, attendance, discipline, canEdit, ATTENDANCE_STATUS_KEYS, dateKey, { showBehavior: false, weekendView: weekend })}</div>`;


    footer.hidden = !canEdit;
    bindInteractions();
  }

  function bindInteractions() {
    const scrollEl = body.querySelector('.attendance-students-list');
    if (!scrollEl) return;

    bindAttendanceStatusPickers(scrollEl, (studentId, status) => {
      const key = normalizeAttendanceStatus(status);
      if (!ATTENDANCE_STATUS_KEYS.includes(key)) return;
      attendance[studentId] = key;
      if (!discipline[studentId]) discipline[studentId] = emptyDisciplineEntry();
      const entry = {
        ...discipline[studentId],
        behaviors: [...(discipline[studentId].behaviors || [])],
        flags: [...(discipline[studentId].flags || [])]
      };
      if (key === 'absent') {
        entry.disciplineWaived = false;
        entry.flags = resolveDisciplineFlagsForScoring('absent', dateKey, entry.flags);
      } else {
        entry.flags = [];
        entry.disciplineWaived = false;
      }
      discipline[studentId] = entry;
      updateStudentCardUI(scrollEl, studentId, key, entry, dateKey);
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
        entry.disciplineWaived = false;
        discipline[studentId] = entry;
        updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
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

    body.querySelector('#weekendClearBtn')?.addEventListener('click', () => {
      if (!weekendHasSavedData) return;
      if (!isOnline()) {
        onToast?.(t('offline.offline'));
        return;
      }
      if (!assertClassAccess()) return;
      const classKey = buildAttendanceClassKey(level, room);
      openConfirmModal({
        title: t('check.weekendClearTitle'),
        message: t('check.weekendClearMessage', {
          class: classKey,
          date: formatDateWithDayThai(dateKey),
          count: weekendSavedCount
        }),
        confirmLabel: t('check.weekendClearBtn'),
        danger: true,
        onConfirm: () => {
          void clearWeekendAttendance();
        }
      });
    });
  }

  async function clearWeekendAttendance() {
    const classKey = buildAttendanceClassKey(level, room);
    const btn = body?.querySelector('#weekendClearBtn');
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      const deleted = await deleteAttendanceForClassOnDate(classKey, dateKey);
      await resyncPointsForClassDay({ classKey, date: dateKey, teacherName });
      attendance = {};
      discipline = {};
      weekendHasSavedData = false;
      weekendSavedCount = 0;
      for (const s of students) {
        discipline[String(s.student_id)] = emptyDisciplineEntry();
      }
      baselineDiscipline = cloneDisciplineMap(discipline);
      await cacheClassSession(classKey, dateKey, { attendance, discipline, students });
      onToast?.(t('check.weekendCleared', { count: deleted }));
      renderStudentsUI();
    } catch (err) {
      console.error('[check] weekend clear failed', err);
      onToast?.(err?.message || t('check.weekendClearFailed'));
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  }

  async function resyncPointsForLoadedClass() {
    if (!isOnline() || !students.length || !level || !room || !teacherName) return 0;
    const classKey = buildAttendanceClassKey(level, room);
    if (!isSchoolDay(dateKey)) {
      await resyncPointsForClassDay({ classKey, date: dateKey, teacherName });
      return 0;
    }
    const studentsPayload = enrichStudentsForPointSync(
      students.map((s) => {
        const sid = String(s.student_id);
        const disc = discipline[sid] || emptyDisciplineEntry();
        const status = normalizeAttendanceStatus(attendance[sid] || CHECK_DEFAULT_STATUS);
        return {
          student_id: sid,
          student_name: studentFullName(s),
          status,
          ...disciplineEntryToFirestore(disc)
        };
      }),
      dateKey
    );
    await syncClassPointTransactions({
      classKey,
      date: dateKey,
      teacherName,
      students: studentsPayload
    });
    await saveClassAttendance({
      classKey,
      teacherName,
      attendanceDate: dateKey,
      students: studentsPayload
    });
    return studentsPayload.filter(
      (s) => normalizeAttendanceStatus(s.status) === 'absent'
    ).length;
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
      const [, studentList, records] = await Promise.all([
        initAppSettings(),
        fetchStudentsByClass(level, room),
        isOnline() ? getAttendanceForClassOnDate(classKey, dateKey) : Promise.resolve([])
      ]);
      students = studentList;

      if (isOnline()) {
        attendance = recordsToAttendanceMap(records);
        discipline = recordsToDisciplineMap(records);
        weekendHasSavedData = isWeekendCheck() && records.length > 0;
        weekendSavedCount = records.length;
      } else {
        const cached = await getCachedClassSession(classKey, dateKey);
        attendance = cached?.attendance ?? {};
        discipline = cached?.discipline ?? {};
        weekendHasSavedData = isWeekendCheck() && Object.keys(attendance).length > 0;
        weekendSavedCount = Object.keys(attendance).length;
        if (!students.length) {
          throw new Error(t('offline.noCachedStudents'));
        }
      }

      const weekend = isWeekendCheck();

      students.forEach((s) => {
        const sid = String(s.student_id);
        if (!weekend && !attendance[sid]) {
          attendance[sid] = CHECK_DEFAULT_STATUS;
        }
        if (!discipline[sid]) discipline[sid] = emptyDisciplineEntry();
        if (weekend) return;
        if (normalizeAttendanceStatus(attendance[sid]) === 'absent') {
          if (!discipline[sid].disciplineWaived) {
            discipline[sid] = {
              ...discipline[sid],
              flags: resolveDisciplineFlagsForScoring('absent', dateKey, discipline[sid].flags)
            };
          }
        } else {
          const rules = getDisciplineChecks();
          let flags = normalizeDisciplineFlags(discipline[sid].flags);
          if (rules.length && flags.length === rules.length) {
            flags = [];
          }
          discipline[sid] = { ...discipline[sid], flags };
        }
      });

      baselineDiscipline = cloneDisciplineMap(discipline);
      dismissSaveResultBadge();
      await cacheClassSession(classKey, dateKey, { attendance, discipline, students });
      if (isOnline()) {
        try {
          const absentCount = await resyncPointsForLoadedClass();
          if (absentCount > 0) {
            onToast?.(t('check.pointsResynced', { count: absentCount }));
          }
        } catch (err) {
          console.error('[check] point resync failed', err);
          onToast?.(t('check.pointSyncFailed'));
        }
      }
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

  dateInput?.addEventListener('change', () => {
    dateKey = dateInput.value || getTodayDate();
    persistCheckDate?.(dateKey);
    updateHeaderDate();
    classReady = false;
    footer.hidden = true;
    if (pickerSheet && !hideClassPicker) pickerSheet.hidden = false;
    updatePickerState();
    if (level && room) {
      void openClass();
      return;
    }
    body.innerHTML = renderEmpty(hideClassPicker ? t('check.loadingStudents') : t('check.pickClass'));
  });

  levelSel?.addEventListener('change', async () => {
    level = levelSel.value;
    room = '';
    classReady = false;
    footer.hidden = true;
    persistClassSelection?.(level, '', { classConfirmed: false });
    if (level) await loadRooms(level);
    else if (roomSel) roomSel.disabled = true;
    updatePickerState();
    body.innerHTML = renderEmpty(t('check.pickRoom'));
  });

  roomSel?.addEventListener('change', () => {
    room = roomSel.value;
    level = levelSel?.value || level;
    classReady = false;
    updatePickerState();
    persistClassSelection?.(level, room, { classConfirmed: false });
    if (admin && level && room) void openClass();
  });

  assignedSel?.addEventListener('change', () => {
    const key = assignedSel.value;
    if (!key) {
      level = '';
      room = '';
      classReady = false;
      updatePickerState();
      return;
    }
    const parts = classKeyToParts(key);
    level = parts.level;
    room = parts.room;
    classReady = false;
    updatePickerState();
    persistClassSelection?.(level, room, { classConfirmed: false });
    if (multiClass && level && room) void openClass();
  });

  startBtn?.addEventListener('click', () => void openClass());

  container.querySelector('#saveAttendance')?.addEventListener('click', async () => {
    if (!classReady || !students.length) return;
    if (!isSchoolDay(dateKey)) {
      onToast?.(t('check.weekendNoSave'));
      return;
    }
    if (!assertClassAccess()) return;
    const full = buildFullMap(students, attendance);
    const saveBtn = container.querySelector('#saveAttendance');
    saveBtn.disabled = true;
    try {
      const classKey = buildAttendanceClassKey(level, room);
      const summary = summarizePendingDiscipline();
      const ok = await submitAttendance(full, {
        teacherName,
        classStudents: students,
        discipline,
        attendanceDate: dateKey,
        level,
        room,
        navigateAfterSave: true
      });
      if (ok) {
        showSaveResultBadge({
          classKey,
          dateLabel: formatDateWithDayThai(dateKey),
          totalDelta: summary.totalDelta,
          items: summary.items
        });
      }
    } finally {
      saveBtn.disabled = false;
    }
  });

  void initAppSettings()
    .then(() => loadLevels())
    .then(async () => {
      if (deepDate && dateInput instanceof HTMLInputElement) dateInput.value = deepDate;
      if (deepLevel && levelSel) levelSel.value = deepLevel;
      if (deepLevel) await loadRooms(deepLevel);
      if (deepRoom && roomSel) roomSel.value = deepRoom;
      if (deepDate) persistCheckDate?.(deepDate);
      if (deepLevel && deepRoom) {
        classReady = true;
        if (pickerSheet) pickerSheet.hidden = true;
        await openClass();
        return;
      }
      updatePickerState();
      if (level && room && assertClassAccess()) {
        void openClass();
      }
    })
    .catch((err) => onToast?.(err?.message));

  container.__checkCleanup = () => {};
}

