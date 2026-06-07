import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { renderAdminPinField, readAdminPin } from '../components/adminPinField.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import {
  fetchTeachers,
  adminCreateTeacher,
  adminUpdateTeacher,
  adminDeactivateTeacher
} from '../services/teachersService.js';

/**
 * @param {HTMLElement} container
 * @param {{ state: object, onNavigate: (path: string) => void, onToast?: (msg: string) => void, onLogout?: () => void, onBack?: (path?: string) => void }} ctx
 */
export function renderAdminTeachersPage(container, { state, onNavigate, onToast, onLogout, onBack }) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!isAdminSession(session)) {
    container.innerHTML = renderEmpty(t('admin.denied'), t('admin.deniedHint'));
    return;
  }

  let teachers = [];
  let search = '';

  container.innerHTML = `${renderPageHeader({
    title: t('adminTeachers.title'),
    subtitle: t('adminTeachers.subtitle'),
    topAction: 'back'
  })}
  <section class="glass-card admin-toolbar admin-toolbar--sub">
    <button type="button" class="button-primary button-primary--compact" id="adminTeacherAdd">${escapeHtml(t('adminTeachers.add'))}</button>
  </section>
  <section class="glass-card admin-toolbar admin-toolbar--filters">
    <label class="field admin-toolbar__field admin-toolbar__field--search">
      <span>${escapeHtml(t('adminTeachers.search'))}</span>
      <input type="search" id="adminTeachersSearch" class="input-field" placeholder="${escapeHtml(t('adminTeachers.searchPlaceholder'))}" />
    </label>
  </section>
  <section id="adminTeachersList">${renderLoading(t('adminTeachers.loading'))}</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/admin'),
    onNavigate
  });

  const listEl = container.querySelector('#adminTeachersList');
  const searchInput = container.querySelector('#adminTeachersSearch');

  function visibleTeachers() {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((row) => {
      const name = String(row.teacher_name || '').toLowerCase();
      const user = String(row.username || '').toLowerCase();
      const classes = String(row.assigned_classes || '').toLowerCase();
      return name.includes(q) || user.includes(q) || classes.includes(q);
    });
  }

  function renderList() {
    if (!listEl) return;
    const rows = visibleTeachers();
    if (!rows.length) {
      listEl.innerHTML = renderEmpty(
        search ? t('adminTeachers.emptySearch') : t('adminTeachers.empty'),
        t('adminTeachers.emptyHint')
      );
      return;
    }

    listEl.innerHTML = rows
      .map((teacher) => {
        const username = String(teacher.username || '').trim();
        const inactive = teacher.active === false;
        const role = String(teacher.role || '').toLowerCase();
        const isAdminRole = teacher.isAdmin || role === 'admin';
        const isPastoralRole = role === 'pastoral' || teacher.isPastoral;
        return `<article class="admin-teacher-card glass-card ${inactive ? 'admin-teacher-card--inactive' : ''}" data-username="${escapeHtml(username)}">
        <div class="admin-teacher-card__head">
          <h3 class="admin-teacher-card__name">${escapeHtml(teacher.teacher_name || '—')}</h3>
          <div class="admin-teacher-card__badges">
          ${isAdminRole ? `<span class="admin-teacher-card__badge">${escapeHtml(t('adminTeachers.roleAdmin'))}</span>` : ''}
          ${isPastoralRole ? `<span class="admin-teacher-card__badge admin-teacher-card__badge--pastoral">${escapeHtml(t('adminTeachers.rolePastoral'))}</span>` : ''}
          ${inactive ? `<span class="admin-teacher-card__badge admin-teacher-card__badge--off">${escapeHtml(t('adminTeachers.inactive'))}</span>` : ''}
          </div>
        </div>
        <dl class="admin-teacher-card__details">
          <div class="admin-teacher-card__row">
            <dt>${escapeHtml(t('adminTeachers.username'))}</dt>
            <dd>${escapeHtml(username || '—')}</dd>
          </div>
          <div class="admin-teacher-card__row">
            <dt>${escapeHtml(t('adminTeachers.classes'))}</dt>
            <dd>${escapeHtml(teacher.assigned_classes || '—')}</dd>
          </div>
        </dl>
        <div class="admin-teacher-card__actions history-card__actions--compact">
          <button type="button" class="button-secondary button-secondary--sm admin-teacher-edit" data-username="${escapeHtml(username)}" ${!username ? 'disabled' : ''}>${escapeHtml(t('admin.edit'))}</button>
          ${
            inactive
              ? `<button type="button" class="button-secondary button-secondary--sm admin-teacher-activate" data-username="${escapeHtml(username)}" ${!username ? 'disabled' : ''}>${escapeHtml(t('adminTeachers.activate'))}</button>`
              : `<button type="button" class="button-secondary button-secondary--sm admin-teacher-deactivate" data-username="${escapeHtml(username)}" data-name="${escapeHtml(teacher.teacher_name || '')}" ${!username ? 'disabled' : ''}>${escapeHtml(t('adminTeachers.deactivate'))}</button>`
          }
        </div>
      </article>`;
      })
      .join('');
  }

  /**
   * @param {'create'|'edit'} mode
   * @param {object|null} teacher
   */
  function openTeacherModal(mode, teacher = null) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop confirm-modal-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    const isEdit = mode === 'edit';
    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-card confirm-modal admin-form-modal';
    sheet.innerHTML = `
      <h2 class="confirm-modal__title">${escapeHtml(isEdit ? t('adminTeachers.editTitle') : t('adminTeachers.addTitle'))}</h2>
      <form id="adminTeacherForm" class="admin-form">
        <label class="field">
          <span>${escapeHtml(t('adminTeachers.teacherName'))}</span>
          <input type="text" id="tcName" class="input-field" required value="${escapeHtml(teacher?.teacher_name || '')}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminTeachers.username'))}</span>
          <input type="text" id="tcUsername" class="input-field" required ${isEdit ? 'readonly' : ''} value="${escapeHtml(teacher?.username || '')}" autocomplete="off" />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminTeachers.classes'))}</span>
          <input type="text" id="tcClasses" class="input-field" required value="${escapeHtml(teacher?.assigned_classes || '')}" placeholder="${escapeHtml(t('adminTeachers.classesPh'))}" />
          <p class="field-hint">${escapeHtml(t('adminTeachers.classesHint'))}</p>
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminTeachers.role'))}</span>
          <select id="tcRole" class="select-field">
            <option value="teacher" ${teacher?.role !== 'admin' && teacher?.role !== 'pastoral' ? 'selected' : ''}>${escapeHtml(t('adminTeachers.roleTeacher'))}</option>
            <option value="pastoral" ${teacher?.role === 'pastoral' ? 'selected' : ''}>${escapeHtml(t('adminTeachers.rolePastoral'))}</option>
            <option value="admin" ${teacher?.role === 'admin' || teacher?.isAdmin ? 'selected' : ''}>${escapeHtml(t('adminTeachers.roleAdmin'))}</option>
          </select>
        </label>
        ${renderAdminPinField()}
        <div class="modal-actions confirm-modal__actions">
          <button type="button" class="button-secondary" id="adminTeacherCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="submit" class="button-primary">${escapeHtml(t('common.save'))}</button>
        </div>
      </form>`;
    root.appendChild(sheet);
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelector('#adminTeacherCancel')?.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
    root.querySelector('#adminTeacherForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const adminPin = readAdminPin(root);
      const payload = {
        adminPin,
        teacher_name: /** @type {HTMLInputElement} */ (root.querySelector('#tcName')).value.trim(),
        username: /** @type {HTMLInputElement} */ (root.querySelector('#tcUsername')).value.trim().toLowerCase(),
        assigned_classes: /** @type {HTMLInputElement} */ (root.querySelector('#tcClasses')).value.trim(),
        role: /** @type {HTMLSelectElement} */ (root.querySelector('#tcRole')).value
      };
      const submitBtn = root.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        if (isEdit) {
          await adminUpdateTeacher(session, payload);
          onToast?.(t('adminTeachers.saved'));
        } else {
          await adminCreateTeacher(session, payload);
          onToast?.(t('adminTeachers.created'));
        }
        close();
        void load();
      } catch (err) {
        onToast?.(err instanceof Error ? err.message : t('admin.saveFailed'));
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });
  }

  function openDeactivateModal(username, teacherName, activate = false) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop confirm-modal-backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-card confirm-modal admin-form-modal';
    sheet.innerHTML = `
      <h2 class="confirm-modal__title">${escapeHtml(activate ? t('adminTeachers.activateTitle') : t('adminTeachers.deactivateTitle'))}</h2>
      <p class="confirm-modal__message">${escapeHtml(activate ? t('adminTeachers.activateMessage', { name: teacherName }) : t('adminTeachers.deactivateMessage', { name: teacherName }))}</p>
      <form id="adminDeactivateForm" class="admin-form">
        ${renderAdminPinField({ id: 'adminDeactivatePin' })}
        <div class="modal-actions confirm-modal__actions">
          <button type="button" class="button-secondary" id="adminDeactivateCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="submit" class="button-primary">${escapeHtml(t('common.confirm'))}</button>
        </div>
      </form>`;
    root.appendChild(sheet);
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelector('#adminDeactivateCancel')?.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
    root.querySelector('#adminDeactivateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = root.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const adminPin = readAdminPin(root, 'adminDeactivatePin');
        if (activate) {
          await adminUpdateTeacher(session, { adminPin, username, active: true });
          onToast?.(t('adminTeachers.activated'));
        } else {
          await adminDeactivateTeacher(session, { adminPin, username });
          onToast?.(t('adminTeachers.deactivated'));
        }
        close();
        void load();
      } catch (err) {
        onToast?.(err instanceof Error ? err.message : t('admin.saveFailed'));
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });
  }

  async function load() {
    if (listEl) listEl.innerHTML = renderLoading(t('adminTeachers.loading'));
    try {
      teachers = await fetchTeachers();
      teachers = teachers.sort((a, b) =>
        String(a.teacher_name || '').localeCompare(String(b.teacher_name || ''), 'th')
      );
      renderList();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = renderEmpty(t('adminTeachers.loadFailed'), err?.message);
      }
    }
  }

  container.querySelector('#adminTeacherAdd')?.addEventListener('click', () => {
    openTeacherModal('create');
  });

  listEl?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.admin-teacher-edit');
    if (editBtn) {
      const username = editBtn.getAttribute('data-username') || '';
      const teacher = teachers.find((t) => t.username === username);
      if (teacher) openTeacherModal('edit', teacher);
      return;
    }
    const deactBtn = e.target.closest('.admin-teacher-deactivate');
    if (deactBtn && !deactBtn.disabled) {
      openDeactivateModal(deactBtn.getAttribute('data-username') || '', deactBtn.getAttribute('data-name') || '', false);
      return;
    }
    const actBtn = e.target.closest('.admin-teacher-activate');
    if (actBtn && !actBtn.disabled) {
      const teacher = teachers.find((t) => t.username === actBtn.getAttribute('data-username'));
      openDeactivateModal(actBtn.getAttribute('data-username') || '', teacher?.teacher_name || '', true);
    }
  });

  searchInput?.addEventListener('input', () => {
    search = searchInput.value.trim();
    renderList();
  });

  void load();
  container.__adminTeachersCleanup = () => {};
}
