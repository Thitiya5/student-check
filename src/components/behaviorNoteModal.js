import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import {
  getBehaviorGoodPointsValue,
  getBehaviorBadPointsValue
} from '../data/disciplineChecks.js';

/**
 * @param {{ title: string, kind: 'good'|'bad', defaultNote?: string, defaultPoints?: number, isEdit?: boolean, onConfirm: (payload: { note: string, points: number }) => void, onRemove?: () => void, onCancel?: () => void }} opts
 */
export function openBehaviorEntryModal({
  title,
  kind,
  defaultNote = '',
  defaultPoints,
  isEdit = false,
  onConfirm,
  onRemove,
  onCancel
}) {
  const defaultPts =
    defaultPoints != null && Number.isFinite(Number(defaultPoints))
      ? Math.abs(Number(defaultPoints))
      : kind === 'good'
        ? Math.abs(getBehaviorGoodPointsValue())
        : Math.abs(getBehaviorBadPointsValue());

  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-sheet glass-card">
      <h2 class="confirm-modal__title">${escapeHtml(title)}</h2>
      <label class="field">
        <span>${escapeHtml(t('discipline.behaviorPoints'))}</span>
        <input type="number" class="input-field" id="behaviorPointsInput" min="1" step="1" value="${defaultPts}" inputmode="numeric" />
      </label>
      <p class="modal-hint">${escapeHtml(kind === 'good' ? t('discipline.behaviorPointsGoodHint') : t('discipline.behaviorPointsBadHint'))}</p>
      <label class="field">
        <span>${escapeHtml(t('discipline.note'))}</span>
        <input type="text" class="input-field" id="behaviorNoteInput" value="${escapeHtml(defaultNote)}" placeholder="${escapeHtml(t('discipline.notePlaceholder'))}" />
      </label>
      <p class="modal-hint">${escapeHtml(t('discipline.noteRequired'))}</p>
      <div class="modal-actions${isEdit ? ' modal-actions--stack' : ''}">
        ${isEdit ? `<button type="button" class="button-danger button-ghost" id="behaviorNoteRemove">${escapeHtml(t('behavior.removeEntry'))}</button>` : ''}
        <div class="modal-actions__row">
          <button type="button" class="button-secondary" id="behaviorNoteCancel">${escapeHtml(t('common.cancel'))}</button>
          <button type="button" class="button-primary" id="behaviorNoteOk">${escapeHtml(t('common.save'))}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(root);
  const noteInput = root.querySelector('#behaviorNoteInput');
  const pointsInput = root.querySelector('#behaviorPointsInput');
  if (pointsInput instanceof HTMLInputElement) {
    setTimeout(() => pointsInput.focus(), 50);
  }

  const close = () => {
    root.remove();
    onCancel?.();
  };

  root.querySelector('#behaviorNoteCancel')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  root.querySelector('#behaviorNoteRemove')?.addEventListener('click', () => {
    root.remove();
    onRemove?.();
  });
  root.querySelector('#behaviorNoteOk')?.addEventListener('click', () => {
    const note = noteInput?.value?.trim() || '';
    const rawPts = Number(pointsInput?.value);
    if (!Number.isFinite(rawPts) || rawPts <= 0) {
      if (pointsInput instanceof HTMLInputElement) pointsInput.focus();
      return;
    }
    if (!note) {
      if (noteInput instanceof HTMLInputElement) noteInput.focus();
      return;
    }
    root.remove();
    onConfirm({ note, points: Math.abs(rawPts) });
  });
}

/** @deprecated use openBehaviorEntryModal */
export function openBehaviorNoteModal({ title, defaultNote = '', onConfirm, onCancel }) {
  openBehaviorEntryModal({
    title,
    kind: 'good',
    defaultNote,
    onConfirm: ({ note }) => onConfirm(note),
    onCancel
  });
}
