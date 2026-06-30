import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';

/**
 * @param {{ message?: string, isRosterError?: boolean }} opts
 */
export function renderExecutiveErrorState({ message = '', isRosterError = false } = {}) {
  const title = isRosterError
    ? t('executive.error.rosterTitle')
    : t('executive.error.loadTitle');
  const detail = message || t('executive.error.loadBody');

  return `<section class="exec-error glass-card" role="alert">
    <h2 class="exec-error__title">${escapeHtml(title)}</h2>
    <p class="exec-error__message">${escapeHtml(detail)}</p>
    <button type="button" class="button-secondary exec-error__retry" id="execRetryLoad">
      ${escapeHtml(t('common.retry'))}
    </button>
  </section>`;
}

/**
 * @param {HTMLElement} root
 * @param {() => void} onRetry
 */
export function bindExecutiveErrorState(root, onRetry) {
  root.querySelector('#execRetryLoad')?.addEventListener('click', () => onRetry?.());
}
