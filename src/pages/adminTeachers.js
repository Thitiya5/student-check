import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import { fetchTeachers, adminResetTeacherPin } from '../services/teachersService.js';

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
  <section class="glass-card admin-teachers-search">
    <label class="field">
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
    return teachers.filter((t) => {
      const name = String(t.teacher_name || '').toLowerCase();
      const user = String(t.username || '').toLowerCase();
      const classes = String(t.assigned_classes || '').toLowerCase();
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
        const mustChange = Boolean(teacher.mustChangePin);
        return `<article class="admin-teacher-card glass-card ${inactive ? 'admin-teacher-card--inactive' : ''}" data-username="${escapeHtml(username)}">
        <div class="admin-teacher-card__head">
          <h3 class="admin-teacher-card__name">${escapeHtml(teacher.teacher_name || '—')}</h3>
          <div class="admin-teacher-card__badges">
          ${
            mustChange
              ? `<span class="admin-teacher-card__badge">${escapeHtml(t('adminTeachers.mustChange'))}</span>`
              : ''
          }
          ${
            inactive
              ? `<span class="admin-teacher-card__badge admin-teacher-card__badge--off">${escapeHtml(t('adminTeachers.inactive'))}</span>`
              : ''
          }
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
        <button type="button" class="button-secondary admin-teacher-reset" data-username="${escapeHtml(username)}" data-name="${escapeHtml(teacher.teacher_name || '')}" ${!username || inactive ? 'disabled' : ''}>
          ${escapeHtml(t('adminTeachers.resetBtn'))}
        </button>
      </article>`;
      })
      .join('');
  }

  function openResetModal(targetUsername, teacherName) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop confirm-modal-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-card confirm-modal admin-reset-modal';
    sheet.innerHTML = `
      <h2 class="confirm-modal__title">${escapeHtml(t('adminTeachers.resetTitle'))}</h2>
      <p class="confirm-modal__message">${escapeHtml(t('adminTeachers.resetMessage', { name: teacherName, username: targetUsername }))}</p>
      <form id="adminResetForm" class="admin-reset-form">
        <label class="field">
          <span>${escapeHtml(t('adminTeachers.adminPin'))}</span>
          <input type="password" id="adminResetAdminPin" class="input-field" inputmode="numeric" maxlength="12" autocomplete="current-password" required />
        </label>
        <label class="field">
          <span>${escapeHtml(t('adminTeachers.tempPin'))}</span>
          <input type="password" id="adminResetTempPin" class="input-field" inputmode="numeric" maxlength="12" placeholder="${escapeHtml(t('adminTeachers.tempPinPlaceholder'))}" />
          <p class="field-hint">${escapeHtml(t('adminTeachers.tempPinHint'))}</p>
        </label>
        <div class="modal-actions confirm-modal__actions">
          <button type="button" class="button-secondary" id="adminResetCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="submit" class="button-primary" id="adminResetSubmit">${escapeHtml(t('adminTeachers.resetConfirm'))}</button>
        </div>
      </form>`;

    root.appendChild(sheet);
    document.body.appendChild(root);

    const close = () => root.remove();

    root.querySelector('#adminResetCancel')?.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });

    root.querySelector('#adminResetForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const adminPin = /** @type {HTMLInputElement|null} */ (root.querySelector('#adminResetAdminPin'))?.value?.trim() || '';
      const newPin = /** @type {HTMLInputElement|null} */ (root.querySelector('#adminResetTempPin'))?.value?.trim() || '';
      const submitBtn = root.querySelector('#adminResetSubmit');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const result = await adminResetTeacherPin(session, {
          adminPin,
          targetUsername,
          newPin
        });
        close();
        openResultModal(result);
        void load();
      } catch (err) {
        onToast?.(err instanceof Error ? err.message : t('adminTeachers.resetFailed'));
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });

    root.querySelector('#adminResetAdminPin')?.focus();
  }

  /**
   * @param {{ username: string, teacherName: string, tempPin: string }} result
   */
  function openResultModal(result) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop confirm-modal-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet glass-card confirm-modal admin-reset-result';
    sheet.innerHTML = `
      <h2 class="confirm-modal__title">${escapeHtml(t('adminTeachers.resultTitle'))}</h2>
      <dl class="admin-reset-result__box">
        <div class="admin-teacher-card__row">
          <dt>${escapeHtml(t('adminTeachers.resultName'))}</dt>
          <dd><strong>${escapeHtml(result.teacherName || '—')}</strong></dd>
        </div>
        <div class="admin-teacher-card__row">
          <dt>${escapeHtml(t('adminTeachers.username'))}</dt>
          <dd><strong>${escapeHtml(result.username)}</strong></dd>
        </div>
        <div class="admin-teacher-card__row">
          <dt>${escapeHtml(t('adminTeachers.resultPin'))}</dt>
          <dd><strong class="admin-reset-result__pin">${escapeHtml(result.tempPin)}</strong></dd>
        </div>
      </dl>
      <p class="confirm-modal__message">${escapeHtml(t('adminTeachers.resultHint'))}</p>
      <div class="modal-actions confirm-modal__actions">
        <button type="button" class="button-primary" id="adminResetResultOk">${escapeHtml(t('common.confirm'))}</button>
      </div>`;

    root.appendChild(sheet);
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelector('#adminResetResultOk')?.addEventListener('click', close);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
  }

  async function load() {
    if (listEl) listEl.innerHTML = renderLoading(t('adminTeachers.loading'));
    try {
      teachers = await fetchTeachers();
      teachers = teachers
        .filter((t) => String(t.username || '').trim())
        .sort((a, b) => String(a.teacher_name || '').localeCompare(String(b.teacher_name || ''), 'th'));
      renderList();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = renderEmpty(t('adminTeachers.loadFailed'), err?.message);
      }
    }
  }

  listEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.admin-teacher-reset');
    if (!btn || btn.disabled) return;
    const username = btn.getAttribute('data-username') || '';
    const name = btn.getAttribute('data-name') || '';
    if (!username) return;
    openResetModal(username, name);
  });

  searchInput?.addEventListener('input', () => {
    search = searchInput.value.trim();
    renderList();
  });

  void load();
  container.__adminTeachersCleanup = () => {};
}
