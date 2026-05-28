import { escapeHtml } from './html.js';

export function renderLoading(message = 'กำลังโหลด...') {
  return [
    '<div class="ui-loading" role="status" aria-live="polite">',
    '<div class="ui-spinner" aria-hidden="true"></div>',
    `<p>${escapeHtml(message)}</p>`,
    '</div>'
  ].join('');
}

export function renderEmpty(message, hint = '') {
  const hintHtml = hint ? `<p class="ui-empty__hint">${escapeHtml(hint)}</p>` : '';
  return [
    '<div class="ui-empty">',
    `<p class="ui-empty__title">${escapeHtml(message)}</p>`,
    hintHtml,
    '</div>'
  ].join('');
}

export function renderError(message, hint = '', retryButtonId = 'uiRetryBtn') {
  const hintHtml = hint ? `<p class="ui-empty__hint">${escapeHtml(hint)}</p>` : '';
  return [
    '<div class="ui-error">',
    `<p class="ui-empty__title">${escapeHtml(message)}</p>`,
    hintHtml,
    `<button type="button" class="button-primary ui-retry-btn" id="${escapeHtml(retryButtonId)}">ลองใหม่</button>`,
    '</div>'
  ].join('');
}

export function statusBadgeClass(status) {
  return `status-badge status-badge--${String(status || 'present').toLowerCase()}`;
}
