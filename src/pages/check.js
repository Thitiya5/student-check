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
  saveClassAttendance
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
import { getTodayDate } from '../utils/dateIso.js';
import { initAppSettings } from '../services/appSettingsService.js';
import { formatDateWithDayThai } from '../components/datePicker.js';
import { renderPageHeader, renderNavQuickLinks, bindPageHeaderActions } from '../components/pageHeader.js';
import { withBehaviorQuickLink } from '../utils/quickNavLinks.js';
import { getHashQuery } from '../services/navigation.js';
import {
  enrichStudentsForPointSync,
  syncClassPointTransactions
} from '../services/studentPointsService.js';

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
    const summary = countStatuses(students, attendance);
    row.innerHTML = ATTENDANCE_STATUS_KEYS.map(
      (k) =>
        `<div class="attendance-mini"><div class="k">${escapeHtml(statusLabel(k))}</div><div class="v">${summary[k]}</div></div>`
    ).join('');
  }

  function renderStudentsUI() {
    if (!body) return;
    const summary = countStatuses(students, attendance);
    body.innerHTML = `<p class="attendance-teacher-line"><strong>${escapeHtml(level)}/${escapeHtml(room)}</strong> ${MIDDOT} ${students.length} ${escapeHtml(t('check.studentsCount'))}</p>
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
      <div class="attendance-students-scroll attendance-students-list" id="studentList">${renderStudentCardListMarkup(students, attendance, discipline, true, ATTENDANCE_STATUS_KEYS, dateKey, { showBehavior: false })}</div>`;


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
  }

  async function resyncPointsForLoadedClass() {
    if (!isOnline() || !students.length || !level || !room || !teacherName) return 0;
    const classKey = buildAttendanceClassKey(level, room);
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

    await initAppSettings();

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
        const sid = String(s.student_id);
        if (!attendance[sid]) attendance[sid] = CHECK_DEFAULT_STATUS;
        if (!discipline[sid]) discipline[sid] = emptyDisciplineEntry();
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
    body.innerHTML = renderEmpty(
      level && room ? t('check.dateChangedHint') : hideClassPicker ? t('check.loadingStudents') : t('check.pickClass')
    );
    if (hideClassPicker && level && room) {
      void openClass();
    }
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
      if (singleClass && level && room) {
        void openClass();
      } else if (classReady && level && room && assertClassAccess()) {
        void openClass();
      }
    })
    .catch((err) => onToast?.(err?.message));

  container.__checkCleanup = () => {};
}

