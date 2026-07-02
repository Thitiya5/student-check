import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { verifyBehaviorWritePin } from '../services/teachersService.js';

/**
 * Final confirmation modal for bulk discipline restore.
 * @param {{
 *   session: object,
 *   operationId: string,
 *   date: string,
 *   studentCount: number,
 *   transactionCount: number,
 *   totalPointsLabel: string,
 *   onConfirm: () => void | Promise<void>,
 *   onCancel?: () => void,
 *   onError?: (err: unknown) => void
 * }} opts
 */
export function openBulkRestoreConfirmModal(opts) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop bulk-restore-modal-backdrop';
  root.innerHTML = `
    <div class="modal-sheet glass-card bulk-restore-modal" role="dialog" aria-modal="true" aria-labelledby="bulkRestoreModalTitle">
      <h2 id="bulkRestoreModalTitle" class="bulk-restore-modal__title">${escapeHtml(t('bulkRestore.modalTitle'))}</h2>
      <p class="bulk-restore-modal__warning" role="alert">${escapeHtml(t('bulkRestore.warningBody'))}</p>
      <dl class="bulk-restore-modal__summary">
        <div><dt>${escapeHtml(t('bulkRestore.operationId'))}</dt><dd><code>${escapeHtml(opts.operationId)}</code></dd></div>
        <div><dt>${escapeHtml(t('bulkRestore.inspectionDate'))}</dt><dd>${escapeHtml(opts.date)}</dd></div>
        <div><dt>${escapeHtml(t('bulkRestore.statStudents'))}</dt><dd>${opts.studentCount}</dd></div>
        <div><dt>${escapeHtml(t('bulkRestore.statTransactions'))}</dt><dd>${opts.transactionCount}</dd></div>
        <div><dt>${escapeHtml(t('bulkRestore.statPoints'))}</dt><dd>${escapeHtml(opts.totalPointsLabel)}</dd></div>
      </dl>
      <label class="field bulk-restore-modal__pin">
        <span>${escapeHtml(t('bulkRestore.pinLabel'))}</span>
        <input type="password" class="input-field" id="bulkRestorePinInput" inputmode="numeric" autocomplete="one-time-code" />
      </label>
      <div class="modal-actions bulk-restore-modal__actions">
        <button type="button" class="button-secondary" id="bulkRestoreModalCancel">${escapeHtml(t('common.cancel'))}</button>
        <button type="button" class="button-primary bulk-restore-modal__confirm" id="bulkRestoreModalConfirm">${escapeHtml(t('bulkRestore.execute'))}</button>
      </div>
    </div>`;

  document.body.appendChild(root);
  const pinInput = root.querySelector('#bulkRestorePinInput');
  if (pinInput instanceof HTMLInputElement) {
    setTimeout(() => pinInput.focus(), 50);
  }

  const close = () => {
    root.remove();
    opts.onCancel?.();
  };

  root.querySelector('#bulkRestoreModalCancel')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  const submit = async () => {
    const pin = pinInput instanceof HTMLInputElement ? pinInput.value.trim() : '';
    if (!pin) {
      pinInput?.focus();
      return;
    }
    const confirmBtn = root.querySelector('#bulkRestoreModalConfirm');
    if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
    try {
      await verifyBehaviorWritePin(opts.session, pin);
      root.remove();
      await opts.onConfirm();
    } catch (err) {
      if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = false;
      opts.onError?.(err);
    }
  };

  root.querySelector('#bulkRestoreModalConfirm')?.addEventListener('click', () => void submit());
  pinInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  });
}
