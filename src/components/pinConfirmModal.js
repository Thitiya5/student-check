import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';

/**
 * @param {{ title: string, hint?: string, onConfirm: (pin: string) => void | Promise<void>, onCancel?: () => void, onError?: (err: unknown) => void }} opts
 */
export function openPinConfirmModal({ title, hint = '', onConfirm, onCancel, onError }) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-sheet glass-card">
      <h2 class="confirm-modal__title">${escapeHtml(title)}</h2>
      ${hint ? `<p class="modal-hint">${escapeHtml(hint)}</p>` : ''}
      <label class="field">
        <span>${escapeHtml(t('behavior.pinLabel'))}</span>
        <input type="password" class="input-field" id="pinConfirmInput" inputmode="numeric" autocomplete="one-time-code" />
      </label>
      <div class="modal-actions">
        <button type="button" class="button-secondary" id="pinConfirmCancel">${escapeHtml(t('common.cancel'))}</button>
        <button type="button" class="button-primary" id="pinConfirmOk">${escapeHtml(t('common.confirm'))}</button>
      </div>
    </div>`;

  document.body.appendChild(root);
  const input = root.querySelector('#pinConfirmInput');
  if (input instanceof HTMLInputElement) {
    setTimeout(() => input.focus(), 50);
  }

  const close = () => {
    root.remove();
    onCancel?.();
  };

  root.querySelector('#pinConfirmCancel')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  const submit = async () => {
    const pin = root.querySelector('#pinConfirmInput')?.value?.trim() || '';
    if (!pin) {
      if (input instanceof HTMLInputElement) input.focus();
      return;
    }
    const okBtn = root.querySelector('#pinConfirmOk');
    if (okBtn instanceof HTMLButtonElement) okBtn.disabled = true;
    root.remove();
    try {
      await onConfirm(pin);
    } catch (err) {
      onError?.(err);
    }
  };

  root.querySelector('#pinConfirmOk')?.addEventListener('click', () => void submit());
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  });
}
