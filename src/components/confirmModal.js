import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';

/**
 * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string, onConfirm: () => void, onCancel?: () => void, danger?: boolean }} opts
 */
export function openConfirmModal(opts) {
  const {
    title,
    message,
    confirmLabel = t('common.confirm'),
    cancelLabel = t('common.cancel'),
    onConfirm,
    onCancel,
    danger = false
  } = opts;

  const root = document.createElement('div');
  root.className = 'modal-backdrop confirm-modal-backdrop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet glass-card confirm-modal';
  sheet.innerHTML = `
    <h2 class="confirm-modal__title">${escapeHtml(title)}</h2>
    <p class="confirm-modal__message">${escapeHtml(message)}</p>
    <div class="modal-actions confirm-modal__actions">
      <button type="button" class="button-secondary" id="confirmCancel">${escapeHtml(cancelLabel)}</button>
      <button type="button" class="button-primary ${danger ? 'button-danger' : ''}" id="confirmOk">${escapeHtml(confirmLabel)}</button>
    </div>`;

  root.appendChild(sheet);
  document.body.appendChild(root);

  const close = () => root.remove();

  root.querySelector('#confirmCancel')?.addEventListener('click', () => {
    onCancel?.();
    close();
  });

  root.querySelector('#confirmOk')?.addEventListener('click', () => {
    onConfirm();
    close();
  });

  root.addEventListener('click', (e) => {
    if (e.target === root) {
      onCancel?.();
      close();
    }
  });

  return close;
}
