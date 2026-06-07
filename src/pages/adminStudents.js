import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { renderAdminPinField, readAdminPin } from '../components/adminPinField.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import {
  fetchLevelOptions,
  fetchRoomOptions,
  fetchStudentsByClass,
  studentFullName,
  adminCreateStudent,
  adminUpdateStudent,
  adminDeleteStudent
} from '../services/studentsService.js';

/**
 * @param {HTMLElement} container
 * @param {{ state: object, onNavigate: (path: string) => void, onToast?: (msg: string) => void, onLogout?: () => void, onBack?: (path?: string) => void }} ctx
 */
export function renderAdminStudentsPage(container, { state, onNavigate, onToast, onLogout, onBack }) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!isAdminSession(session)) {
    container.innerHTML = renderEmpty(t('admin.denied'), t('admin.deniedHint'));
    return;
  }

  let level = '';
  let room = '';
  let search = '';
  let students = [];

  container.innerHTML = `${renderPageHeader({
    title: t('adminStudents.title'),
    subtitle: t('adminStudents.subtitle'),
    topAction: 'back'
  })}
  <section class="glass-card admin-toolbar admin-toolbar--sub">
    <button type="button" class="button-primary button-primary--compact" id="adminStudentAdd">${escapeHtml(t('adminStudents.add'))}</button>
  </section>
  <section class="glass-card admin-toolbar admin-toolbar--filters">
    <div class="admin-toolbar__grid">
      <label class="field admin-toolbar__field">
        <span>${escapeHtml(t('history.levelCol'))}</span>
        <select id="adminStLevel" class="select-field"><option value="">${escapeHtml(t('adminStudents.pickLevel'))}</option></select>
      </label>
      <label class="field admin-toolbar__field">
        <span>${escapeHtml(t('common.roomLabel'))}</span>
        <select id="adminStRoom" class="select-field" disabled><option value="">${escapeHtml(t('adminStudents.pickRoom'))}</option></select>
      </label>
      <label class="field admin-toolbar__field admin-toolbar__field--search">
        <span>${escapeHtml(t('adminTeachers.search'))}</span>
        <input type="search" id="adminStSearch" class="input-field" placeholder="${escapeHtml(t('adminStudents.searchPlaceholder'))}" />
      </label>
    </div>
  </section>
  <section id="adminStudentsList">${renderEmpty(t('adminStudents.pickBoth'), t('adminStudents.pickHint'))}</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/admin'),
    onNavigate
  });

  const listEl = container.querySelector('#adminStudentsList');
  const levelSel = container.querySelector('#adminStLevel');
  const roomSel = container.querySelector('#adminStRoom');
  const searchInput = container.querySelector('#adminStSearch');

  function visibleStudents() {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = studentFullName(s).toLowerCase();
      const id = String(s.student_id || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }

  function renderList() {
    if (!listEl) return;
    if (!level || !room) {
      listEl.innerHTML = renderEmpty(t('adminStudents.pickBoth'), t('adminStudents.pickHint'));
      return;
    }
    const rows = visibleStudents();
    if (!rows.length) {
      listEl.innerHTML = renderEmpty(
        search ? t('adminStudents.emptySearch') : t('students.emptyClass'),
        t('adminStudents.emptyHint')
      );
      return;
    }

    listEl.innerHTML = rows
      .map((s) => {
        const name = studentFullName(s);
        return `<article class="admin-student-card glass-card" data-id="${escapeHtml(s.student_id)}">
          <div class="admin-student-card__head">
            <h3 class="admin-student-card__name">${escapeHtml(name)}</h3>
            <p class="admin-student-card__meta">${escapeHtml(s.level)}/${escapeHtml(s.room)} · ${escapeHtml(t('adminStudents.idLabel'))} ${escapeHtml(s.student_id)}${s.number ? ` · ${escapeHtml(t('adminStudents.noLabel'))} ${escapeHtml(s.number)}` : ''}</p>
          </div>
          <div class="admin-student-card__actions history-card__actions--compact">
            <button type="button" class="button-secondary button-secondary--sm admin-student-edit" data-id="${escapeHtml(s.student_id)}">${escapeHtml(t('admin.edit'))}</button>
            <button type="button" class="button-secondary button-secondary--sm admin-student-delete" data-id="${escapeHtml(s.student_id)}" data-name="${escapeHtml(name)}">${escapeHtml(t('history.delete'))}</button>
          </div>
        </article>`;
      })
      .join('');
  }

  /**
   * @param {'create'|'edit'} mode
   * @param {object|null} student
   */
  function openStudentModal(mode, student = null) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop confirm-modal-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    const isEdit = mode === 'edit';
    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-card confirm-modal admin-form-modal';
    sheet.innerHTML = `
      <h2 class="confirm-modal__title">${escapeHtml(isEdit ? t('adminStudents.editTitle') : t('adminStudents.addTitle'))}</h2>
      <form id="adminStudentForm" class="admin-form">
        <label class="field">
          <span>${escapeHtml(t('adminStudents.idLabel'))}</span>
          <input type="text" id="stId" class="input-field" required ${isEdit ? 'readonly' : ''} value="${escapeHtml(student?.student_id || '')}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminStudents.prefix'))}</span>
          <input type="text" id="stPrefix" class="input-field" value="${escapeHtml(student?.prefix || '')}" placeholder="${escapeHtml(t('adminStudents.prefixPh'))}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminStudents.firstName'))}</span>
          <input type="text" id="stFirst" class="input-field" required value="${escapeHtml(student?.first_name || '')}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminStudents.lastName'))}</span>
          <input type="text" id="stLast" class="input-field" value="${escapeHtml(student?.last_name || '')}" />
        </label>
        <div class="filter-grid">
          <label class="field">
            <span>${escapeHtml(t('history.levelCol'))}</span>
            <input type="text" id="stLevel" class="input-field" required value="${escapeHtml(student?.level || level || '')}" placeholder="M2" />
          </label>
          <label class="field">
            <span>${escapeHtml(t('common.roomLabel'))}</span>
            <input type="text" id="stRoom" class="input-field" required value="${escapeHtml(student?.room || room || '')}" placeholder="1" />
          </label>
        </div>
        <label class="field">
          <span>${escapeHtml(t('adminStudents.noLabel'))}</span>
          <input type="text" id="stNumber" class="input-field" inputmode="numeric" value="${escapeHtml(student?.number || '')}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('students.parent'))}</span>
          <input type="text" id="stParent" class="input-field" value="${escapeHtml(student?.parent_name || '')}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminStudents.parentPhone'))}</span>
          <input type="tel" id="stPhone" class="input-field" value="${escapeHtml(student?.parent_phone || '')}" />
        </label>
        ${renderAdminPinField()}
        <div class="modal-actions confirm-modal__actions">
          <button type="button" class="button-secondary" id="adminStudentCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="submit" class="button-primary">${escapeHtml(t('common.save'))}</button>
        </div>
      </form>`;

    root.appendChild(sheet);
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelector('#adminStudentCancel')?.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });

    root.querySelector('#adminStudentForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        adminPin: readAdminPin(root),
        student_id: /** @type {HTMLInputElement} */ (root.querySelector('#stId')).value.trim(),
        prefix: /** @type {HTMLInputElement} */ (root.querySelector('#stPrefix')).value.trim(),
        first_name: /** @type {HTMLInputElement} */ (root.querySelector('#stFirst')).value.trim(),
        last_name: /** @type {HTMLInputElement} */ (root.querySelector('#stLast')).value.trim(),
        level: /** @type {HTMLInputElement} */ (root.querySelector('#stLevel')).value.trim(),
        room: /** @type {HTMLInputElement} */ (root.querySelector('#stRoom')).value.trim(),
        number: /** @type {HTMLInputElement} */ (root.querySelector('#stNumber')).value.trim(),
        parent_name: /** @type {HTMLInputElement} */ (root.querySelector('#stParent')).value.trim(),
        parent_phone: /** @type {HTMLInputElement} */ (root.querySelector('#stPhone')).value.trim()
      };
      const submitBtn = root.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        if (isEdit) {
          const result = await adminUpdateStudent(session, payload);
          onToast?.(t('adminStudents.saved'));
          if (result.numbersShifted > 0) {
            onToast?.(t('adminStudents.numbersShifted', { count: result.numbersShifted }));
          }
        } else {
          const result = await adminCreateStudent(session, payload);
          onToast?.(t('adminStudents.created'));
          if (result.numbersShifted > 0) {
            onToast?.(t('adminStudents.numbersShifted', { count: result.numbersShifted }));
          }
        }
        close();
        void loadStudents();
      } catch (err) {
        onToast?.(err instanceof Error ? err.message : t('admin.saveFailed'));
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });
  }

  function openDeleteModal(studentId, studentName) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop confirm-modal-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-card confirm-modal admin-form-modal';
    sheet.innerHTML = `
      <h2 class="confirm-modal__title">${escapeHtml(t('adminStudents.deleteTitle'))}</h2>
      <p class="confirm-modal__message">${escapeHtml(t('adminStudents.deleteMessage', { name: studentName, id: studentId }))}</p>
      <form id="adminStudentDeleteForm" class="admin-form">
        ${renderAdminPinField({ id: 'adminDeletePin' })}
        <div class="modal-actions confirm-modal__actions">
          <button type="button" class="button-secondary" id="adminStudentDeleteCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="submit" class="button-primary button-danger">${escapeHtml(t('history.delete'))}</button>
        </div>
      </form>`;
    root.appendChild(sheet);
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelector('#adminStudentDeleteCancel')?.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
    root.querySelector('#adminStudentDeleteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = root.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const result = await adminDeleteStudent(session, {
          adminPin: readAdminPin(root, 'adminDeletePin'),
          student_id: studentId
        });
        onToast?.(t('adminStudents.deleted'));
        if (result.numbersShifted > 0) {
          onToast?.(t('adminStudents.numbersShifted', { count: result.numbersShifted }));
        }
        close();
        void loadStudents();
      } catch (err) {
        onToast?.(err instanceof Error ? err.message : t('admin.saveFailed'));
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });
  }

  async function loadLevels() {
    const levels = await fetchLevelOptions();
    levelSel.innerHTML =
      `<option value="">${escapeHtml(t('adminStudents.pickLevel'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }

  async function loadRooms() {
    roomSel.disabled = !level;
    if (!level) {
      roomSel.innerHTML = `<option value="">${escapeHtml(t('adminStudents.pickRoom'))}</option>`;
      return;
    }
    const rooms = await fetchRoomOptions(level);
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('adminStudents.pickRoom'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    if (room && rooms.includes(room)) roomSel.value = room;
  }

  async function loadStudents() {
    if (!level || !room) {
      students = [];
      renderList();
      return;
    }
    if (listEl) listEl.innerHTML = renderLoading(t('students.loading'));
    try {
      students = await fetchStudentsByClass(level, room);
      renderList();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = renderEmpty(t('students.loadFailed'), err?.message);
      }
    }
  }

  container.querySelector('#adminStudentAdd')?.addEventListener('click', () => {
    if (!level || !room) {
      onToast?.(t('adminStudents.pickBoth'));
      return;
    }
    openStudentModal('create');
  });

  levelSel?.addEventListener('change', async () => {
    level = levelSel.value.trim();
    room = '';
    await loadRooms();
    void loadStudents();
  });

  roomSel?.addEventListener('change', () => {
    room = roomSel.value.trim();
    void loadStudents();
  });

  searchInput?.addEventListener('input', () => {
    search = searchInput.value.trim();
    renderList();
  });

  listEl?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.admin-student-edit');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id') || '';
      const student = students.find((s) => s.student_id === id);
      if (student) openStudentModal('edit', student);
      return;
    }
    const delBtn = e.target.closest('.admin-student-delete');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id') || '';
      const name = delBtn.getAttribute('data-name') || id;
      openDeleteModal(id, name);
    }
  });

  void loadLevels();
  container.__adminStudentsCleanup = () => {};
}
