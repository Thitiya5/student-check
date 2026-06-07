import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty, statusBadgeClass } from '../utils/ui.js';
import {
  queryAttendanceRecordsForSession,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  buildAttendanceClassKey
} from '../services/attendanceService.js';
import { resyncPointsAfterHistoryChange, resyncPointsForDateScope } from '../services/historyPointSync.js';
import { openEditAttendanceModal } from '../components/editAttendanceModal.js';
import { openConfirmModal } from '../components/confirmModal.js';
import { fetchLevelOptions, fetchRoomOptions } from '../services/studentsService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  getAllowedClassKeys,
  classKeysToPickerOptions,
  canAccessClass,
  filterRowsByAssignedClasses
} from '../services/teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';
import { ATTENDANCE_STATUS_KEYS } from '../data/attendanceStatuses.js';
import { t, statusLabel } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
const STATUS_OPTIONS = ATTENDANCE_STATUS_KEYS;

export function renderHistoryPage(container, { state = {}, onToast, onLogout, onBack, onNavigate } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const allowedKeys = getAllowedClassKeys(session);
  const today = getTodayDate();

  let filters = {
    attendanceDate: state.historyDate || today,
    classKey: state.historyClass || '',
    teacherName: admin ? state.historyTeacher || '' : session?.teacherName || '',
    search: ''
  };
  let rows = [];

  container.innerHTML = `${renderPageHeader({
    title: t('history.title'),
    subtitle: t('history.subtitle'),
    topAction: 'back'
  })}
  <p class="history-points-hint glass-card">${escapeHtml(t('history.pointsHint'))}</p>
  <section class="filter-panel glass-card">
    <div class="filter-grid">
      <label class="field"><span>${escapeHtml(t('common.date'))}</span><input type="date" id="histDate" class="input-field" value="${escapeHtml(filters.attendanceDate)}" /></label>
      <label class="field"><span>${escapeHtml(t('history.levelCol'))}</span><select id="histLevel" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      <label class="field"><span>${escapeHtml(t('common.roomLabel'))}</span><select id="histRoom" class="select-field" disabled><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      <label class="field" ${admin ? '' : 'hidden'}><span>${escapeHtml(t('common.teacher'))}</span><input id="histTeacher" class="input-field" placeholder="${escapeHtml(t('common.teacherName'))}" value="${escapeHtml(filters.teacherName)}" /></label>
    </div>
    <label class="field"><span>${escapeHtml(t('history.searchStudent'))}</span><input id="histSearch" class="input-field" placeholder="${escapeHtml(t('common.nameOrId'))}" /></label>
  </section>
  <section id="historyList">${renderLoading(t('history.loading'))}</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  const listEl = container.querySelector('#historyList');
  const dateInput = container.querySelector('#histDate');
  const levelSel = container.querySelector('#histLevel');
  const roomSel = container.querySelector('#histRoom');
  const teacherInput = container.querySelector('#histTeacher');
  const searchInput = container.querySelector('#histSearch');

  if (!admin && teacherInput) {
    teacherInput.value = session?.teacherName || '';
    teacherInput.readOnly = true;
  }

  function applyAccessFilter(list) {
    return filterRowsByAssignedClasses(list, session);
  }

  function renderRows() {
    if (!listEl) return;
    let visible = applyAccessFilter(rows);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      visible = visible.filter(
        (r) =>
          r.student_name.toLowerCase().includes(term) || r.student_id.toLowerCase().includes(term)
      );
    }
    if (!visible.length) {
      listEl.innerHTML = renderEmpty(t('history.empty'), t('history.emptyHint'));
      return;
    }
    listEl.innerHTML = visible
      .map(
        (r) => `<article class="history-card glass-card" data-id="${escapeHtml(r.id)}">
      <div class="history-card__top">
        <div>
          <h3 class="history-card__name">${escapeHtml(r.student_name || r.student_id)}</h3>
          <p class="history-card__meta">${escapeHtml(r.class)} · ${escapeHtml(r.attendanceDate)} · ${escapeHtml(r.teacherName)}</p>
        </div>
        <span class="${statusBadgeClass(r.status)}">${escapeHtml(statusLabel(r.status))}</span>
      </div>
      <div class="history-card__actions history-card__actions--compact">
        ${
          admin
            ? `<button type="button" class="button-secondary button-secondary--sm hist-edit" data-id="${escapeHtml(r.id)}">${escapeHtml(t('admin.edit'))}</button>`
            : `<select class="select-field hist-status" data-id="${escapeHtml(r.id)}">
          ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`).join('')}
        </select>
        <button type="button" class="button-secondary button-secondary--sm hist-save" data-id="${escapeHtml(r.id)}">${escapeHtml(t('common.save'))}</button>`
        }
        <button type="button" class="button-secondary button-secondary--sm hist-delete" data-id="${escapeHtml(r.id)}">${escapeHtml(t('history.delete'))}</button>
      </div>
    </article>`
      )
      .join('');
  }

  async function loadLevels() {
    try {
      if (!levelSel) return;
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
    } catch (err) {
      onToast?.(err?.message || t('history.loadLevelsFailed'));
    }
  }

  async function loadRooms(level) {
    if (!roomSel) return;
    if (!level) {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      roomSel.disabled = true;
      return;
    }
    roomSel.disabled = false;
    let rooms = [];
    if (admin) {
      rooms = await fetchRoomOptions(level);
    } else {
      try {
        const map = JSON.parse(levelSel?.dataset.rooms || '{}');
        rooms = map[level] || [];
      } catch {
        rooms = [];
      }
    }
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  async function refresh() {
    if (listEl) listEl.innerHTML = renderLoading();
    try {
      const classKey =
        filters.classKey ||
        (levelSel?.value && roomSel?.value
          ? buildAttendanceClassKey(levelSel.value, roomSel.value)
          : '');

      if (classKey && !canAccessClass(session, classKey)) {
        rows = [];
        renderRows();
        onToast?.(t('toast.classNotAllowed'));
        return;
      }

      rows = await queryAttendanceRecordsForSession(session, {
        attendanceDate: filters.attendanceDate,
        classKey: classKey || undefined,
        teacherName: admin ? filters.teacherName || undefined : undefined
      });
      if (!rows.length) {
        await resyncPointsForDateScope(session, {
          date: filters.attendanceDate,
          classKey: classKey || undefined,
          level: levelSel?.value || '',
          room: roomSel?.value || '',
          teacherName: session?.teacherName || ''
        });
      }
      renderRows();
    } catch (err) {
      console.error('[history] load failed', err);
      if (listEl) listEl.innerHTML = renderEmpty(t('history.loadFailed'), err?.message);
    }
  }

  dateInput?.addEventListener('change', () => {
    filters.attendanceDate = dateInput.value || today;
    void refresh();
  });

  levelSel?.addEventListener('change', async () => {
    await loadRooms(levelSel.value);
    filters.classKey =
      levelSel.value && roomSel?.value ? buildAttendanceClassKey(levelSel.value, roomSel.value) : '';
    void refresh();
  });

  roomSel?.addEventListener('change', () => {
    filters.classKey =
      levelSel?.value && roomSel?.value ? buildAttendanceClassKey(levelSel.value, roomSel.value) : '';
    void refresh();
  });

  teacherInput?.addEventListener('change', () => {
    if (!admin) return;
    filters.teacherName = teacherInput.value.trim();
    void refresh();
  });

  searchInput?.addEventListener('input', () => {
    filters.search = searchInput.value.trim();
    renderRows();
  });

  listEl?.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.hist-save');
    const editBtn = e.target.closest('.hist-edit');
    const delBtn = e.target.closest('.hist-delete');
    const id = saveBtn?.dataset.id || editBtn?.dataset.id || delBtn?.dataset.id;
    if (!id) return;

    const record = rows.find((r) => r.id === id);
    if (record && !canAccessClass(session, record.class)) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }

    if (delBtn) {
      openConfirmModal({
        title: t('admin.deleteTitle'),
        message: t('admin.deleteMessage'),
        danger: true,
        onConfirm: async () => {
          try {
            await deleteAttendanceRecord(id);
            await resyncPointsAfterHistoryChange(record, {}, session?.teacherName || '');
            onToast?.(t('history.deleted'));
            void refresh();
          } catch (err) {
            onToast?.(err?.message || t('history.deleteFailed'));
          }
        }
      });
      return;
    }

    if (editBtn && admin) {
      openEditAttendanceModal({
        record,
        allowDateEdit: true,
        allowTeacherEdit: true,
        onSave: async (updates) => {
          await updateAttendanceRecord(id, updates);
          await resyncPointsAfterHistoryChange(record, updates, session?.teacherName || '');
          onToast?.(t('history.updated'));
          void refresh();
        }
      });
      return;
    }

    if (saveBtn) {
      const sel = listEl.querySelector(`.hist-status[data-id="${CSS.escape(id)}"]`);
      const status = sel instanceof HTMLSelectElement ? sel.value : 'present';
      try {
        await updateAttendanceRecord(id, { status });
        await resyncPointsAfterHistoryChange(record, { status }, session?.teacherName || '');
        onToast?.(t('history.updated'));
        void refresh();
      } catch (err) {
        onToast?.(err?.message || t('history.saveFailed'));
      }
    }
  });

  void loadLevels();
  void refresh();

  container.__historyCleanup = () => {};
}
