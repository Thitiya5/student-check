import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';

/**
 * @param {{ title: string, defaultNote?: string, onConfirm: (note: string) => void, onCancel?: () => void }} opts
 */
export function openBehaviorNoteModal({ title, defaultNote = '', onConfirm, onCancel }) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-sheet glass-card">
      <h2 class="confirm-modal__title">${escapeHtml(title)}</h2>
      <label class="field">
        <span>${escapeHtml(t('discipline.note'))}</span>
        <input type="text" class="input-field" id="behaviorNoteInput" value="${escapeHtml(defaultNote)}" placeholder="${escapeHtml(t('discipline.notePlaceholder'))}" />
      </label>
      <p class="modal-hint">${escapeHtml(t('discipline.noteRequired'))}</p>
      <div class="modal-actions">
        <button type="button" class="button-secondary" id="behaviorNoteCancel">${escapeHtml(t('common.cancel'))}</button>
        <button type="button" class="button-primary" id="behaviorNoteOk">${escapeHtml(t('common.save'))}</button>
      </div>
    </div>`;

  document.body.appendChild(root);
  const input = root.querySelector('#behaviorNoteInput');
  if (input instanceof HTMLInputElement) {
    setTimeout(() => input.focus(), 50);
  }

  const close = () => {
    root.remove();
    onCancel?.();
  };

  root.querySelector('#behaviorNoteCancel')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  root.querySelector('#behaviorNoteOk')?.addEventListener('click', () => {
    const note = root.querySelector('#behaviorNoteInput')?.value?.trim() || '';
    if (!note) {
      if (input instanceof HTMLInputElement) input.focus();
      return;
    }
    root.remove();
    onConfirm(note);
  });
}
