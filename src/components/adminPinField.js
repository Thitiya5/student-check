import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';

/**
 * Admin PIN field markup (optional when admin has no PIN in sheet).
 * @param {{ id?: string, hint?: string }} [opts]
 */
export function renderAdminPinField(opts = {}) {
  const id = opts.id || 'adminConfirmPin';
  return `
    <label class="field">
      <span>${escapeHtml(t('adminTeachers.adminPin'))}</span>
      <input type="password" id="${escapeHtml(id)}" class="input-field" inputmode="numeric" maxlength="12" autocomplete="current-password" />
      <p class="field-hint">${escapeHtml(opts.hint || t('adminCrud.pinHint'))}</p>
    </label>`;
}

/**
 * @param {ParentNode} root
 * @param {string} [id]
 */
export function readAdminPin(root, id = 'adminConfirmPin') {
  const el = root.querySelector(`#${id}`);
  return el instanceof HTMLInputElement ? el.value.trim() : '';
}
