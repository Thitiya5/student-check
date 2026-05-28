import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty, statusBadgeClass } from '../utils/ui.js';
import {
  queryAttendanceRecords,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  buildAttendanceClassKey
} from '../services/attendanceService.js';
import { fetchLevelOptions, fetchRoomOptions } from '../services/studentsService.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';
import { openEditAttendanceModal } from '../components/editAttendanceModal.js';
import { openConfirmModal } from '../components/confirmModal.js';
import { t, statusLabel } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';

/**
 * Admin-only attendance management.
 * @param {HTMLElement} container
 * @param {{ state: object, onNavigate: (path: string) => void, onToast?: (msg: string) => void }} ctx
 */
export function renderAdminPage(container, { state, onNavigate, onToast, onLogout, onBack }) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!isAdminSession(session)) {
    container.innerHTML = renderEmpty(t('admin.denied'), t('admin.deniedHint'));
    container.querySelector('.ui-empty')?.addEventListener('click', () => onNavigate('/dashboard'));
    return;
  }

  const today = getTodayDate();
  let filters = {
    attendanceDate: today,
    teacherName: '',
    search: ''
  };
  let rows = [];

  container.innerHTML = `${renderPageHeader({
    title: t('admin.title'),
    topAction: 'back'
  })}
  <section class="admin-quick-actions glass-card admin-quick-actions--grid">
    <button type="button" class="button-primary" id="adminInspectionBtn">${escapeHtml(t('inspection.open'))}</button>
    <button type="button" class="button-secondary" id="adminTeachersBtn">${escapeHtml(t('adminTeachers.open'))}</button>
    <button type="button" class="button-secondary" id="adminSettingsBtn">${escapeHtml(t('settingsAdmin.open'))}</button>
  </section>
  <section class="filter-panel glass-card">
    <div class="filter-grid">
      <label class="field"><span>${escapeHtml(t('common.date'))}</span><input type="date" id="admDate" class="input-field" value="${escapeHtml(today)}" /></label>
      <label class="field"><span>${escapeHtml(t('history.levelCol'))}</span><select id="admLevel" class="select-field"><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      <label class="field"><span>${escapeHtml(t('common.roomLabel'))}</span><select id="admRoom" class="select-field" disabled><option value="">${escapeHtml(t('common.all'))}</option></select></label>
      <label class="field"><span>${escapeHtml(t('common.teacher'))}</span><input id="admTeacher" class="input-field" placeholder="${escapeHtml(t('common.teacherName'))}" /></label>
    </div>
    <label class="field"><span>${escapeHtml(t('history.searchStudent'))}</span><input id="admSearch" class="input-field" placeholder="${escapeHtml(t('common.nameOrId'))}" /></label>
  </section>
  <section id="adminList">${renderLoading(t('history.loading'))}</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  container.querySelector('#adminInspectionBtn')?.addEventListener('click', () => {
    onNavigate?.('/inspection');
  });

  container.querySelector('#adminTeachersBtn')?.addEventListener('click', () => {
    onNavigate?.('/admin-teachers');
  });

  container.querySelector('#adminSettingsBtn')?.addEventListener('click', () => {
    onNavigate?.('/settings-admin');
  });

  const listEl = container.querySelector('#adminList');
  const dateInput = container.querySelector('#admDate');
  const levelSel = container.querySelector('#admLevel');
  const roomSel = container.querySelector('#admRoom');
  const teacherInput = container.querySelector('#admTeacher');
  const searchInput = container.querySelector('#admSearch');

  function renderRows() {
    if (!listEl) return;
    let visible = rows;
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
        (r) => `<article class="history-card glass-card admin-card" data-id="${escapeHtml(r.id)}">
      <div class="history-card__top">
        <div>
          <h3 class="history-card__name">${escapeHtml(r.student_name || r.student_id)}</h3>
          <p class="history-card__meta">${escapeHtml(r.class)} · ${escapeHtml(r.attendanceDate)} · ${escapeHtml(r.teacherName)}</p>
        </div>
        <span class="${statusBadgeClass(r.status)}">${escapeHtml(statusLabel(r.status))}</span>
      </div>
      <div class="history-card__actions">
        <button type="button" class="button-secondary adm-edit" data-id="${escapeHtml(r.id)}">${escapeHtml(t('admin.edit'))}</button>
        <button type="button" class="button-secondary adm-delete" data-id="${escapeHtml(r.id)}">${escapeHtml(t('history.delete'))}</button>
      </div>
    </article>`
      )
      .join('');
  }

  async function loadLevels() {
    const levels = await fetchLevelOptions();
    levelSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }

  async function loadRooms(level) {
    if (!level) {
      roomSel.disabled = true;
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      return;
    }
    roomSel.disabled = false;
    const rooms = await fetchRoomOptions(level);
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  async function refresh() {
    if (listEl) listEl.innerHTML = renderLoading();
    try {
      const classKey =
        levelSel?.value && roomSel?.value
          ? buildAttendanceClassKey(levelSel.value, roomSel.value)
          : undefined;
      rows = await queryAttendanceRecords({
        attendanceDate: filters.attendanceDate,
        classKey,
        teacherName: filters.teacherName || undefined,
      });
      renderRows();
    } catch (err) {
      listEl.innerHTML = renderEmpty(t('admin.loadFailed'), err?.message);
    }
  }

  listEl?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.adm-edit');
    const delBtn = e.target.closest('.adm-delete');
    const id = editBtn?.dataset.id || delBtn?.dataset.id;
    if (!id) return;
    const record = rows.find((r) => r.id === id);
    if (!record) return;

    if (delBtn) {
      openConfirmModal({
        title: t('admin.deleteTitle'),
        message: t('admin.deleteMessage'),
        danger: true,
        onConfirm: async () => {
          try {
            await deleteAttendanceRecord(id);
            onToast?.(t('history.deleted'));
            void refresh();
          } catch (err) {
            onToast?.(err?.message || t('admin.saveFailed'));
          }
        }
      });
      return;
    }

    if (editBtn) {
      openEditAttendanceModal({
        record,
        allowDateEdit: true,
        allowTeacherEdit: true,
        onSave: async (updates) => {
          try {
            await updateAttendanceRecord(id, updates);
            onToast?.(t('history.updated'));
            void refresh();
          } catch (err) {
            onToast?.(err?.message || t('admin.saveFailed'));
            throw err;
          }
        }
      });
    }
  });

  dateInput?.addEventListener('change', () => {
    filters.attendanceDate = dateInput.value || today;
    void refresh();
  });
  levelSel?.addEventListener('change', async () => {
    await loadRooms(levelSel.value);
    void refresh();
  });
  roomSel?.addEventListener('change', () => void refresh());
  teacherInput?.addEventListener('change', () => {
    filters.teacherName = teacherInput.value.trim();
    void refresh();
  });
  searchInput?.addEventListener('input', () => {
    filters.search = searchInput.value.trim();
    renderRows();
  });

  void loadLevels();
  void refresh();

  container.__adminCleanup = () => {};
}
