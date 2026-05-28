import { escapeHtml } from '../utils/html.js';
import { t, statusLabel } from '../i18n/index.js';

import { ATTENDANCE_STATUS_KEYS } from '../data/attendanceStatuses.js';

const STATUS_OPTIONS = ATTENDANCE_STATUS_KEYS;

/**
 * @param {{
 *   record: { id: string, student_name?: string, student_id?: string, class?: string, status?: string, attendanceDate?: string, teacherName?: string },
 *   allowDateEdit?: boolean,
 *   allowTeacherEdit?: boolean,
 *   onSave: (updates: { status: string, attendanceDate?: string, teacherName?: string }) => void | Promise<void>,
 *   onCancel?: () => void
 * }} opts
 */
export function openEditAttendanceModal(opts) {
  const { record, allowDateEdit = false, allowTeacherEdit = false, onSave, onCancel } = opts;
  const root = document.createElement('div');
  root.className = 'modal-backdrop edit-modal-backdrop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet glass-card edit-modal';
  sheet.innerHTML = `
    <h2 class="edit-modal__title">${escapeHtml(t('admin.editTitle'))}</h2>
    <p class="edit-modal__meta">${escapeHtml(record.student_name || record.student_id || '')} · ${escapeHtml(record.class || '')}</p>
    <form class="edit-modal__form" id="editAttendanceForm">
      <label class="field">
        <span>${escapeHtml(t('common.status'))}</span>
        <select id="editStatus" class="select-field">
          ${STATUS_OPTIONS.map(
            (s) =>
              `<option value="${s}" ${s === record.status ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`
          ).join('')}
        </select>
      </label>
      <label class="field">
        <span>${escapeHtml(t('common.date'))}</span>
        <input type="date" id="editDate" class="input-field" value="${escapeHtml(record.attendanceDate || '')}" ${allowDateEdit ? '' : 'readonly'} />
      </label>
      <label class="field" ${allowTeacherEdit ? '' : 'hidden'}>
        <span>${escapeHtml(t('common.teacher'))}</span>
        <input type="text" id="editTeacher" class="input-field" value="${escapeHtml(record.teacherName || '')}" ${allowTeacherEdit ? '' : 'readonly'} />
      </label>
      <div class="modal-actions edit-modal__actions">
        <button type="button" class="button-secondary" id="editCancel">${escapeHtml(t('common.cancel'))}</button>
        <button type="submit" class="button-primary" id="editSave">${escapeHtml(t('common.save'))}</button>
      </div>
    </form>`;

  root.appendChild(sheet);
  document.body.appendChild(root);

  const close = () => {
    root.remove();
    onCancel?.();
  };

  root.querySelector('#editCancel')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  root.querySelector('#editAttendanceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = root.querySelector('#editStatus');
    const dateEl = root.querySelector('#editDate');
    const teacherEl = root.querySelector('#editTeacher');
    const saveBtn = root.querySelector('#editSave');
    if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;
    try {
      await onSave({
        status: statusEl instanceof HTMLSelectElement ? statusEl.value : 'present',
        attendanceDate: dateEl instanceof HTMLInputElement ? dateEl.value : undefined,
        teacherName: teacherEl instanceof HTMLInputElement ? teacherEl.value.trim() : undefined
      });
      root.remove();
    } finally {
      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
    }
  });

  return close;
}
