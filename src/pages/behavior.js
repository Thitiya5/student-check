import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, renderNavQuickLinks, bindPageHeaderActions } from '../components/pageHeader.js';
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
  recordsToDisciplineMap,
  saveClassAttendance
} from '../services/attendanceService.js';
import {
  emptyDisciplineEntry,
  disciplineEntryToFirestore,
  formatDisciplineScore,
  summarizeDisciplineChanges
} from '../data/disciplineChecks.js';
import { showSaveResultBadge, dismissSaveResultBadge } from '../components/saveResultBadge.js';
import { CHECK_DEFAULT_STATUS, normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import {
  loadTeacherAuthSession,
  canManageBehaviorSession,
  canManageBehaviorForClass,
  isSchoolWideViewSession,
  getViewClassKeys,
  classKeysToPickerOptions,
  canViewLevelRoom,
  classKeyToParts
} from '../services/teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';
import { formatDateWithDayThai } from '../components/datePicker.js';
import {
  isDisciplineScoringEnabled,
  isDisciplineActiveDate,
  initAppSettings
} from '../services/appSettingsService.js';
import {
  bindDisciplinePickers,
  renderBehaviorStudentCardListMarkup,
  updateStudentDisciplineUI
} from '../components/studentCard.js';
import { openBehaviorEntryModal } from '../components/behaviorNoteModal.js';
import { openPinConfirmModal } from '../components/pinConfirmModal.js';
import { verifyBehaviorWritePin } from '../services/teachersService.js';
import {
  queryPointsInRangeForSession,
  reasonLabel,
  syncClassPointTransactions
} from '../services/studentPointsService.js';
import { isGasConfigured } from '../services/googleAppsScript.js';
import { getHashQuery } from '../services/navigation.js';

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderBehaviorPage(container, { state = {}, onNavigate, onBack, onToast } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!canManageBehaviorSession(session)) {
    onNavigate?.('/dashboard');
    return;
  }

  container.classList.add('behavior-page');
  const schoolWide = isSchoolWideViewSession(session);
  const viewKeys = getViewClassKeys(session);
  const teacherName = String(session?.teacherName || state.teacherName || '').trim();
  const today = getTodayDate();

  let mode = 'record';
  let dateKey = today;
  let historyFrom = today;
  let historyTo = today;
  let historyLevel = '';
  let historyRoom = '';

  let level = '';
  let room = '';
  let students = [];
  let attendance = {};
  /** @type {Record<string, { flags: string[], behaviors: Array<{ kind: string, note: string }>, note: string }>} */
  let discipline = {};
  /** @type {Record<string, { flags: string[], behaviors: Array<{ kind: string, note: string, points?: number }>, note: string }>} */
  let baselineDiscipline = {};
  let loaded = false;
  let focusStudentId = '';
  let historyRows = [];
  let historySeq = 0;

  container.innerHTML = `${renderPageHeader({
    title: t('behavior.title'),
    subtitle: formatDateWithDayThai(dateKey),
    topAction: 'back'
  })}
  ${renderNavQuickLinks([
    { label: t('nav.home'), path: '/dashboard' },
    { label: t('dashboard.quick.students'), path: '/students' },
    { label: t('dashboard.quick.check'), path: '/check' },
    { label: t('nav.behavior'), path: '/behavior', active: true }
  ])}
  <section class="segmented report-tabs behavior-tabs">
    <button type="button" class="is-active" data-mode="record">${escapeHtml(t('behavior.tabRecord'))}</button>
    <button type="button" data-mode="history">${escapeHtml(t('behavior.tabHistory'))}</button>
  </section>
  <div id="behRecordPanel" class="behavior-record-panel">
    <section class="filter-panel glass-card">
      <label class="field behavior-date-field">
        <span>${escapeHtml(t('common.date'))}</span>
        <input type="date" id="behDate" class="input-field" value="${today}" />
      </label>
      <div class="filter-grid">
        <label class="field"><span>${escapeHtml(t('common.level'))}</span><select id="behLevel" class="select-field"><option value="">${escapeHtml(t('common.select'))}</option></select></label>
        <label class="field"><span>${escapeHtml(t('common.room'))}</span><select id="behRoom" class="select-field" disabled><option value="">${escapeHtml(t('common.select'))}</option></select></label>
      </div>
      <input class="input-field behavior-search" id="behSearch" placeholder="${escapeHtml(t('check.searchPlaceholder'))}" disabled />
      <button type="button" class="button-primary" id="behLoadBtn" disabled>${escapeHtml(t('behavior.loadClass'))}</button>
    </section>
    <div id="behContextBar" class="behavior-context-bar" hidden></div>
    <section id="behBody">${renderEmpty(t('behavior.pickClass'), t('behavior.pickClassHint'))}</section>
    <footer class="attendance-save-footer" id="behFooter" hidden>
      <button type="button" class="attendance-save-btn button-primary" id="behSaveBtn">${escapeHtml(t('common.save'))}</button>
    </footer>
  </div>
  <div id="behHistoryPanel" class="behavior-history-panel" hidden>
    <section class="reports-toolbar glass-card behavior-history-toolbar">
      <div class="reports-toolbar__filters">
        <label class="field reports-toolbar__field">
          <span>${escapeHtml(t('common.fromDate'))}</span>
          <input type="date" id="behHistFrom" class="input-field" value="${today}" />
        </label>
        <label class="field reports-toolbar__field">
          <span>${escapeHtml(t('common.toDate'))}</span>
          <input type="date" id="behHistTo" class="input-field" value="${today}" />
        </label>
        <label class="field reports-toolbar__field">
          <span>${escapeHtml(t('common.level'))}</span>
          <select id="behHistLevel" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
        <label class="field reports-toolbar__field">
          <span>${escapeHtml(t('common.room'))}</span>
          <select id="behHistRoom" class="select-field" disabled><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
      </div>
      <input class="input-field" id="behHistSearch" placeholder="${escapeHtml(t('check.searchPlaceholder'))}" />
      <button type="button" class="button-primary" id="behHistRefresh">${escapeHtml(t('behavior.historyRefresh'))}</button>
    </section>
    <section id="behHistoryBody">${renderEmpty(t('behavior.historyEmpty'))}</section>
  </div>`;

  bindPageHeaderActions(container, {
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  const headerDate = container.querySelector('.dash-header__date');
  const recordPanel = container.querySelector('#behRecordPanel');
  const historyPanel = container.querySelector('#behHistoryPanel');
  const body = container.querySelector('#behBody');
  const historyBody = container.querySelector('#behHistoryBody');
  const contextBar = container.querySelector('#behContextBar');
  const footer = container.querySelector('#behFooter');
  const dateInput = container.querySelector('#behDate');
  const levelSel = container.querySelector('#behLevel');
  const roomSel = container.querySelector('#behRoom');
  const searchInput = container.querySelector('#behSearch');
  const loadBtn = container.querySelector('#behLoadBtn');
  const histFromInput = container.querySelector('#behHistFrom');
  const histToInput = container.querySelector('#behHistTo');
  const histLevelSel = container.querySelector('#behHistLevel');
  const histRoomSel = container.querySelector('#behHistRoom');
  const histSearchInput = container.querySelector('#behHistSearch');

  if (!isGasConfigured() || !isDisciplineScoringEnabled()) {
    if (body) {
      body.innerHTML = renderEmpty(
        !isGasConfigured() ? t('check.gasNotConfigured') : t('behavior.scoringDisabled'),
        !isGasConfigured() ? t('check.gasHint') : t('behavior.scoringDisabledHint')
      );
    }
    return;
  }

  function updateHeaderDate() {
    if (headerDate) headerDate.textContent = formatDateWithDayThai(dateKey);
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

  function summarizePendingChanges() {
    return summarizeDisciplineChanges(students, discipline, baselineDiscipline, studentFullName, {
      trackFlags: false,
      trackBehaviors: true
    });
  }

  function paintContextBar() {
    if (!contextBar) return;
    if (!loaded || !level || !room) {
      contextBar.hidden = true;
      contextBar.innerHTML = '';
      return;
    }
    const classKey = buildAttendanceClassKey(level, room);
    const { items, totalDelta } = summarizePendingChanges();
    const pendingHtml =
      items.length > 0
        ? `<span class="behavior-context-bar__pending">${escapeHtml(t('behavior.pendingChanges', { count: items.length, points: formatDisciplineScore(totalDelta) }))}</span>`
        : `<span class="behavior-context-bar__idle">${escapeHtml(t('behavior.noPending'))}</span>`;
    contextBar.hidden = false;
    contextBar.innerHTML = `
      <div class="behavior-context-bar__main">
        <span class="behavior-context-bar__class">${escapeHtml(classKey)}</span>
        <span class="behavior-context-bar__date">${escapeHtml(formatDateWithDayThai(dateKey))}</span>
      </div>
      ${pendingHtml}`;
  }

  function setMode(next) {
    mode = next;
    container.querySelectorAll('.behavior-tabs [data-mode]').forEach((tab) => {
      tab.classList.toggle('is-active', tab.getAttribute('data-mode') === mode);
    });
    if (recordPanel) recordPanel.hidden = mode !== 'record';
    if (historyPanel) historyPanel.hidden = mode !== 'history';
    if (footer) footer.hidden = mode !== 'record' || !loaded;
    if (mode === 'history') void loadHistory();
  }

  function behaviorWasSaved(studentId, kind) {
    const base = baselineDiscipline[studentId] || emptyDisciplineEntry();
    return (base.behaviors || []).some((b) => b.kind === kind);
  }

  function removeBehaviorEntry(studentId, kind) {
    if (!discipline[studentId]) discipline[studentId] = emptyDisciplineEntry();
    const entry = {
      ...discipline[studentId],
      behaviors: (discipline[studentId].behaviors || []).filter((b) => b.kind !== kind)
    };
    discipline[studentId] = entry;
    const scrollEl = body?.querySelector('#behStudentList');
    if (scrollEl) updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
    paintContextBar();
    return entry;
  }

  function confirmPinAndRun(title, hint, run) {
    openPinConfirmModal({
      title,
      hint: hint || undefined,
      onConfirm: async (pin) => {
        await run(pin);
      },
      onError: (err) => {
        onToast?.(err instanceof Error ? err.message : t('behavior.saveFailed'));
      }
    });
  }

  function revertBehavior(studentId, kind) {
    if (!loaded || !studentId || !kind) return;
    const wasSaved = behaviorWasSaved(studentId, kind);
    const entry = discipline[studentId] || emptyDisciplineEntry();
    if (!(entry.behaviors || []).some((b) => b.kind === kind)) return;

    const runRevert = async (pin = '') => {
      if (wasSaved) {
        removeBehaviorEntry(studentId, kind);
        await saveBehaviors(pin, { quiet: true });
        onToast?.(t('behavior.returned'));
        return;
      }
      removeBehaviorEntry(studentId, kind);
    };

    if (wasSaved) {
      confirmPinAndRun(t('behavior.returnTitle'), '', runRevert);
      return;
    }

    void runRevert();
  }

  function openBehaviorModal(studentId, kind, existing) {
    const scrollEl = body?.querySelector('#behStudentList');
    if (!discipline[studentId]) discipline[studentId] = emptyDisciplineEntry();
    const entry = { ...discipline[studentId], behaviors: [...(discipline[studentId].behaviors || [])] };

    openBehaviorEntryModal({
      title: kind === 'good' ? t('discipline.goodDeed') : t('discipline.badDeed'),
      kind,
      defaultNote: existing?.note || '',
      defaultPoints: existing?.points,
      isEdit: Boolean(existing),
      onRemove: () => {
        entry.behaviors = entry.behaviors.filter((b) => b.kind !== kind);
        discipline[studentId] = entry;
        if (scrollEl) updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
        paintContextBar();
      },
      onConfirm: ({ note, points }) => {
        entry.behaviors = [...entry.behaviors.filter((b) => b.kind !== kind), { kind, note, points }];
        discipline[studentId] = entry;
        if (scrollEl) updateStudentDisciplineUI(scrollEl, studentId, entry, dateKey);
        paintContextBar();
      }
    });
  }

  function focusStudentCard() {
    if (!focusStudentId || !body) return;
    const scrollEl = body.querySelector('#behStudentList');
    const card = scrollEl?.querySelector(
      `.behavior-student-card[data-student-id="${CSS.escape(focusStudentId)}"]`
    );
    if (!card) return;
    card.classList.add('behavior-student-card--focus');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStudentId = '';
    setTimeout(() => card.classList.remove('behavior-student-card--focus'), 3200);
  }

  function renderList() {
    if (!body || !loaded) return;
    paintContextBar();
    const q = searchInput?.value.trim().toLowerCase() || '';
    const filtered = q
      ? students.filter((s) => {
          const name = studentFullName(s).toLowerCase();
          return name.includes(q) || String(s.student_id).toLowerCase().includes(q);
        })
      : students;

    if (!filtered.length) {
      body.innerHTML = renderEmpty(t('students.emptyClass'));
      return;
    }

    const withBehaviors = filtered.filter((s) => (discipline[s.student_id]?.behaviors || []).length > 0).length;

    body.innerHTML = `<p class="behavior-class-line"><strong>${escapeHtml(level)}/${escapeHtml(room)}</strong> · ${filtered.length} ${escapeHtml(t('check.studentsCount'))}${withBehaviors ? ` · ${escapeHtml(t('behavior.recordedCount', { count: withBehaviors }))}` : ''}</p>
      <div class="behavior-students-list" id="behStudentList">${renderBehaviorStudentCardListMarkup(filtered, discipline, true, dateKey)}</div>`;
    bindBehaviorInteractions();
    requestAnimationFrame(() => focusStudentCard());
  }

  function bindBehaviorInteractions() {
    const scrollEl = body?.querySelector('#behStudentList');
    if (!scrollEl) return;

    bindDisciplinePickers(
      scrollEl,
      (studentId, action) => {
        if (action.type !== 'behavior' || !action.kind) return;
        const entry = discipline[studentId] || emptyDisciplineEntry();
        const existing = (entry.behaviors || []).find((b) => b.kind === action.kind);
        openBehaviorModal(studentId, action.kind, existing);
      },
      { behavior: true }
    );

    if (!scrollEl.dataset.returnBound) {
      scrollEl.dataset.returnBound = '1';
      scrollEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.behavior-block__return-btn[data-student-id][data-return-kind]');
        if (!(btn instanceof HTMLButtonElement)) return;
        e.preventDefault();
        e.stopPropagation();
        revertBehavior(btn.dataset.studentId || '', btn.dataset.returnKind || '');
      });
    }
  }

  async function populateRooms(selectEl, lvl, selectedRoom = '') {
    if (!selectEl || !lvl) return;
    if (schoolWide) {
      const rooms = await fetchRoomOptions(lvl);
      selectEl.innerHTML =
        `<option value="">${escapeHtml(t('common.select'))}</option>` +
        rooms
          .map(
            (r) =>
              `<option value="${escapeHtml(r)}"${r === selectedRoom ? ' selected' : ''}>${escapeHtml(r)}</option>`
          )
          .join('');
    } else {
      const roomsByLevel = JSON.parse(levelSel?.dataset.rooms || '{}');
      const rooms = roomsByLevel[lvl] || [];
      selectEl.innerHTML =
        `<option value="">${escapeHtml(t('common.select'))}</option>` +
        rooms
          .map(
            (r) =>
              `<option value="${escapeHtml(r)}"${r === selectedRoom ? ' selected' : ''}>${escapeHtml(r)}</option>`
          )
          .join('');
    }
    selectEl.disabled = false;
  }

  async function populateHistoryRooms(lvl) {
    if (!histRoomSel) return;
    if (!lvl) {
      histRoomSel.disabled = true;
      histRoomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      return;
    }
    if (schoolWide) {
      const rooms = await fetchRoomOptions(lvl);
      histRoomSel.innerHTML =
        `<option value="">${escapeHtml(t('common.all'))}</option>` +
        rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    } else {
      const roomsByLevel = JSON.parse(histLevelSel?.dataset.rooms || '{}');
      const rooms = roomsByLevel[lvl] || [];
      histRoomSel.innerHTML =
        `<option value="">${escapeHtml(t('common.all'))}</option>` +
        rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    }
    histRoomSel.disabled = false;
    if (historyRoom) histRoomSel.value = historyRoom;
  }

  async function loadClass() {
    if (!level || !room) return;
    const classKey = buildAttendanceClassKey(level, room);
    if (!canManageBehaviorForClass(session, classKey)) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }
    if (!isDisciplineActiveDate(dateKey)) {
      if (body) body.innerHTML = renderEmpty(t('behavior.inactiveDate'), t('behavior.inactiveDateHint'));
      loaded = false;
      if (footer) footer.hidden = true;
      return;
    }

    if (body) body.innerHTML = renderLoading(t('students.loading'));
    try {
      students = await fetchStudentsByClass(level, room);
      const records = await getAttendanceForClassOnDate(classKey, dateKey);
      attendance = recordsToAttendanceMap(records);
      discipline = recordsToDisciplineMap(records);
      baselineDiscipline = cloneDisciplineMap(discipline);
      for (const s of students) {
        const sid = String(s.student_id);
        if (!discipline[sid]) discipline[sid] = emptyDisciplineEntry();
      }
      loaded = true;
      dismissSaveResultBadge();
      if (footer) footer.hidden = false;
      renderList();
    } catch (err) {
      if (body) body.innerHTML = renderEmpty(t('behavior.loadFailed'), err?.message || '');
      onToast?.(err?.message || t('behavior.loadFailed'));
    }
  }

  async function saveBehaviors(pin, { quiet = false } = {}) {
    if (!loaded || !students.length || !session) {
      throw new Error(t('behavior.saveFailed'));
    }
    const classKey = buildAttendanceClassKey(level, room);
    await verifyBehaviorWritePin(session, pin);

    const studentsPayload = students.map((s) => {
      const sid = String(s.student_id);
      const disc = discipline[sid] || emptyDisciplineEntry();
      const status = normalizeAttendanceStatus(attendance[sid] || CHECK_DEFAULT_STATUS);
      return {
        student_id: sid,
        first_name: String(s.first_name ?? ''),
        last_name: String(s.last_name ?? ''),
        student_name: studentFullName(s),
        status,
        ...disciplineEntryToFirestore(disc)
      };
    });

    await saveClassAttendance({
      classKey,
      teacherName,
      attendanceDate: dateKey,
      students: studentsPayload
    });
    await syncClassPointTransactions({
      classKey,
      date: dateKey,
      teacherName,
      students: studentsPayload
    });

    const summary = summarizePendingChanges();
    baselineDiscipline = cloneDisciplineMap(discipline);
    paintContextBar();
    if (!quiet) {
      showSaveResultBadge({
        classKey,
        dateLabel: formatDateWithDayThai(dateKey),
        totalDelta: summary.totalDelta,
        items: summary.items
      });
      onToast?.(t('behavior.saved'));
    }
  }

  function renderHistoryLedger(list) {
    if (!historyBody) return;
    if (!list.length) {
      historyBody.innerHTML = renderEmpty(t('behavior.historyEmpty'));
      return;
    }
    const totalPts = list.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
    const cards = list
      .map((row, idx) => {
        const ptsNum = Number(row.points) || 0;
        const pts = formatDisciplineScore(ptsNum);
        const ptsClass =
          ptsNum < 0
            ? 'points-entry-card__score--neg'
            : ptsNum > 0
              ? 'points-entry-card__score--pos'
              : 'points-entry-card__score--zero';
        const note = String(row.note || '').trim();
        return `<article class="behavior-history-card points-entry-card glass-card" data-idx="${idx}">
          <div class="points-entry-card__score ${ptsClass}">${escapeHtml(pts)}</div>
          <div class="points-entry-card__body">
            <div class="points-entry-card__top">
              <strong class="points-entry-card__name">${escapeHtml(row.student_name || row.student_id)}</strong>
              <span class="points-entry-card__class">${escapeHtml(row.class || '')}</span>
            </div>
            <div class="points-entry-card__meta">
              <span>${escapeHtml(row.transactionDate || row.date || '')}</span>
              <span class="points-entry-card__cat points-entry-card__cat--behavior">${escapeHtml(reasonLabel(row.reason, 'behavior'))}</span>
            </div>
            <p class="points-entry-card__teacher">${escapeHtml(t('pointsReport.recordedBy'))}: ${escapeHtml(row.teacherName || '—')}</p>
            ${note ? `<p class="points-entry-card__note">${escapeHtml(note)}</p>` : ''}
            <div class="behavior-history-card__actions">
              <button type="button" class="button-secondary button-secondary--sm behavior-history-card__edit-btn" data-action="edit" data-idx="${idx}">${escapeHtml(t('behavior.editEntry'))}</button>
              <button type="button" class="button-ghost button-secondary--sm behavior-history-card__return-btn" data-action="return" data-idx="${idx}">${escapeHtml(t('behavior.returnPoints'))}</button>
            </div>
          </div>
        </article>`;
      })
      .join('');
    historyBody.innerHTML = `
      <p class="points-ledger-summary">${escapeHtml(t('pointsReport.summaryBar', { count: list.length, total: formatDisciplineScore(totalPts) }))}</p>
      <div class="points-ledger-cards behavior-history-cards">${cards}</div>`;

    historyBody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-idx'));
        const row = historyRows[idx];
        if (row) void jumpToRecord(row);
      });
    });

    historyBody.querySelectorAll('[data-action="return"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-idx'));
        const row = historyRows[idx];
        if (row) void revertFromHistory(row);
      });
    });
  }

  async function revertFromHistory(row) {
    const classKey = String(row.class || '');
    const parts = classKeyToParts(classKey);
    const sid = String(row.student_id || '');
    const kind = String(row.reason || '');
    const rowDate = String(row.transactionDate || row.date || today);
    if (!parts.level || !parts.room || !sid || (kind !== 'good' && kind !== 'bad')) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }

    confirmPinAndRun(t('behavior.returnTitle'), '', async (pin) => {
      dateKey = rowDate;
      level = parts.level;
      room = parts.room;
      if (dateInput instanceof HTMLInputElement) dateInput.value = dateKey;
      updateHeaderDate();
      setMode('record');
      if (levelSel) levelSel.value = level;
      roomSel.disabled = !level;
      searchInput.disabled = !level;
      loadBtn.disabled = !room;
      await populateRooms(roomSel, level, room);
      await loadClass();
      const entry = discipline[sid] || emptyDisciplineEntry();
      if (!(entry.behaviors || []).some((b) => b.kind === kind)) {
        onToast?.(t('behavior.historyEmpty'));
        return;
      }
      removeBehaviorEntry(sid, kind);
      await saveBehaviors(pin, { quiet: true });
      onToast?.(t('behavior.returned'));
      void loadHistory();
    });
  }

  async function loadHistory() {
    if (!historyBody) return;
    const seq = ++historySeq;
    historyBody.innerHTML = renderLoading(t('students.loading'));
    try {
      const rows = await queryPointsInRangeForSession(session, {
        from: historyFrom,
        to: historyTo,
        level: historyLevel || undefined,
        room: historyRoom || undefined,
        category: 'behavior',
        search: histSearchInput?.value.trim() || undefined
      });
      if (seq !== historySeq) return;
      historyRows = rows;
      renderHistoryLedger(rows);
    } catch (err) {
      if (seq !== historySeq) return;
      historyBody.innerHTML = renderEmpty(t('behavior.historyFailed'), err?.message || '');
    }
  }

  async function jumpToRecord(row) {
    const classKey = String(row.class || '');
    const parts = classKeyToParts(classKey);
    if (!parts.level || !parts.room) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }

    focusStudentId = String(row.student_id || '');
    dateKey = String(row.transactionDate || row.date || today);
    level = parts.level;
    room = parts.room;

    if (dateInput instanceof HTMLInputElement) dateInput.value = dateKey;
    updateHeaderDate();

    setMode('record');

    if (levelSel) levelSel.value = level;
    roomSel.disabled = !level;
    searchInput.disabled = !level;
    loadBtn.disabled = !room;
    await populateRooms(roomSel, level, room);

    if (!canViewLevelRoom(session, level, room)) {
      if (body) body.innerHTML = renderEmpty(t('toast.classNotAllowed'));
      return;
    }

    loaded = false;
    if (footer) footer.hidden = true;
    await loadClass();
  }

  async function loadLevels() {
    if (schoolWide) {
      const levels = await fetchLevelOptions();
      const opts =
        `<option value="">${escapeHtml(t('common.select'))}</option>` +
        levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      if (levelSel) levelSel.innerHTML = opts;
      if (histLevelSel) {
        histLevelSel.innerHTML =
          `<option value="">${escapeHtml(t('common.all'))}</option>` +
          levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      }
      return;
    }
    const keys = viewKeys || [];
    const { levels, roomsByLevel } = classKeysToPickerOptions(keys);
    const recordOpts =
      `<option value="">${escapeHtml(t('common.select'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    const histOpts =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    if (levelSel) {
      levelSel.innerHTML = recordOpts;
      levelSel.dataset.rooms = JSON.stringify(roomsByLevel);
    }
    if (histLevelSel) {
      histLevelSel.innerHTML = histOpts;
      histLevelSel.dataset.rooms = JSON.stringify(roomsByLevel);
    }
  }

  container.querySelectorAll('.behavior-tabs [data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.getAttribute('data-mode') || 'record'));
  });

  dateInput?.addEventListener('change', () => {
    dateKey = dateInput.value || today;
    updateHeaderDate();
    loaded = false;
    if (footer) footer.hidden = true;
    paintContextBar();
    if (level && room && body) {
      if (body) body.innerHTML = renderEmpty(t('behavior.pickClass'), t('behavior.dateChangedHint'));
    }
  });

  levelSel?.addEventListener('change', async () => {
    level = levelSel.value;
    room = '';
    roomSel.disabled = !level;
    searchInput.disabled = !level;
    loadBtn.disabled = true;
    loaded = false;
    if (footer) footer.hidden = true;
    if (!level) {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.select'))}</option>`;
      if (body) body.innerHTML = renderEmpty(t('behavior.pickClass'), t('behavior.pickClassHint'));
      return;
    }
    await populateRooms(roomSel, level);
    if (body) body.innerHTML = renderEmpty(t('behavior.pickClass'), t('behavior.pickClassHint'));
  });

  roomSel?.addEventListener('change', () => {
    room = roomSel.value;
    loadBtn.disabled = !room;
    loaded = false;
    if (footer) footer.hidden = true;
    if (!room) {
      if (body) body.innerHTML = renderEmpty(t('behavior.pickClass'), t('behavior.pickClassHint'));
      return;
    }
    if (!canViewLevelRoom(session, level, room)) {
      if (body) body.innerHTML = renderEmpty(t('toast.classNotAllowed'));
      return;
    }
    if (body) body.innerHTML = renderEmpty(t('behavior.pickClass'), t('behavior.pickClassHint'));
  });

  histLevelSel?.addEventListener('change', async () => {
    historyLevel = histLevelSel.value;
    historyRoom = '';
    await populateHistoryRooms(historyLevel);
    void loadHistory();
  });

  histRoomSel?.addEventListener('change', () => {
    historyRoom = histRoomSel.value;
    void loadHistory();
  });

  histFromInput?.addEventListener('change', () => {
    historyFrom = histFromInput.value || today;
    void loadHistory();
  });

  histToInput?.addEventListener('change', () => {
    historyTo = histToInput.value || today;
    void loadHistory();
  });

  histSearchInput?.addEventListener('input', () => void loadHistory());
  container.querySelector('#behHistRefresh')?.addEventListener('click', () => void loadHistory());

  searchInput?.addEventListener('input', () => renderList());
  loadBtn?.addEventListener('click', () => void loadClass());

  container.querySelector('#behSaveBtn')?.addEventListener('click', () => {
    const needsPin = session && !session.isAdmin;
    const runSave = (pin = '') => saveBehaviors(pin).catch((err) => onToast?.(err?.message || t('behavior.saveFailed')));

    const pinModalOpts = {
      onConfirm: async (pin) => {
        await runSave(pin);
      },
      onError: (err) => {
        onToast?.(err instanceof Error ? err.message : t('behavior.saveFailed'));
      }
    };

    if (needsPin) {
      openPinConfirmModal({
        title: t('behavior.pinTitle'),
        hint: t('behavior.pinHint'),
        ...pinModalOpts
      });
      return;
    }

    openPinConfirmModal({
      title: t('behavior.adminPinTitle'),
      hint: t('behavior.adminPinHint'),
      ...pinModalOpts
    });
  });

  async function applyDeepLink() {
    const qs = getHashQuery();
    const qDate = qs.get('date');
    const qClass = qs.get('class');
    const qStudent = qs.get('student');
    if (!qDate || !qClass) return;
    await jumpToRecord({
      transactionDate: qDate,
      date: qDate,
      class: qClass,
      student_id: qStudent || ''
    });
  }

  void initAppSettings()
    .then(() => loadLevels())
    .then(() => applyDeepLink())
    .catch((err) => onToast?.(err?.message));
  container.__behaviorCleanup = () => {};
}
