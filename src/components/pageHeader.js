import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { renderSchoolLogo } from './schoolLogo.js';

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   extraHtml?: string,
 *   topAction?: 'logout' | 'back' | 'none',
 *   backLabel?: string,
 *   sticky?: boolean
 * }} opts
 */
export function renderPageHeader({
  title,
  subtitle = '',
  extraHtml = '',
  topAction = 'logout',
  backLabel = '',
  sticky = true
} = {}) {
  const stickyClass = sticky ? ' page-app-header--sticky' : '';

  let topActionHtml = '';
  if (topAction === 'logout') {
    topActionHtml = `<button type="button" class="dash-header__logout" id="logoutButton" aria-label="${escapeHtml(t('dashboard.logout'))}">${escapeHtml(t('dashboard.logout'))}</button>`;
  } else if (topAction === 'back') {
    const label = backLabel || t('common.back');
    topActionHtml = `<button type="button" class="dash-header__logout dash-header__back" id="pageHeaderBack" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  }

  const subtitleHtml = subtitle
    ? `<p class="dash-header__date">${escapeHtml(subtitle)}</p>`
    : '';
  const extra = extraHtml ? `<div class="dash-header__extra">${extraHtml}</div>` : '';

  return `<header class="dash-header page-app-header${stickyClass}">
    <div class="dash-header__top">
      <div class="dash-header__brand">
        ${renderSchoolLogo({ size: 'md' })}
        <div class="dash-header__school">
          <p class="dash-header__school-name">${escapeHtml(t('school.name'))}</p>
        </div>
      </div>
      ${topActionHtml}
    </div>
    <div class="dash-header__greeting">
      <h1 class="dash-header__hello">${escapeHtml(title)}</h1>
      ${subtitleHtml}
      ${extra}
    </div>
  </header>`;
}

/**
 * Quick links row under header.
 * @param {Array<{ label: string, path: string, active?: boolean }>} links
 */
export function renderNavQuickLinks(links = []) {
  if (!links.length) return '';
  const items = links
    .map(
      (link) =>
        `<button type="button" class="nav-quick-link${link.active ? ' is-active' : ''}" data-nav-target="${escapeHtml(link.path)}">${escapeHtml(link.label)}</button>`
    )
    .join('');
  return `<nav class="nav-quick-links" aria-label="${escapeHtml(t('nav.quickLinks'))}">${items}</nav>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ onLogout?: () => void, onBack?: () => void, onNavigate?: (path: string) => void }} handlers
 */
export function bindPageHeaderActions(container, { onLogout, onBack, onNavigate } = {}) {
  container.querySelector('#logoutButton')?.addEventListener('click', () => onLogout?.());
  container.querySelector('#pageHeaderBack')?.addEventListener('click', () => onBack?.());

  container.querySelectorAll('[data-nav-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-nav-target');
      if (path) onNavigate?.(path);
    });
  });
}
