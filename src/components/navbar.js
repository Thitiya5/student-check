import { t } from '../i18n/index.js';

/**
 * @param {string} currentRoute
 * @param {{ isAdmin?: boolean }} [opts]
 */
export function renderBottomNav(currentRoute, { isAdmin = false } = {}) {
  const items = [
    { labelKey: 'nav.home', icon: '◉', target: '/dashboard' },
    { labelKey: 'nav.attendance', icon: '✦', target: '/check' },
    { labelKey: 'nav.history', icon: '◷', target: '/history' },
    { labelKey: 'nav.reports', icon: '⌗', target: '/reports' },
    ...(isAdmin ? [{ labelKey: 'nav.admin', icon: '⚡', target: '/admin' }] : []),
    { labelKey: 'nav.settings', icon: '⚙', target: '/settings' }
  ];

  const navClass = items.length >= 6 ? 'bottom-nav--six' : 'bottom-nav--five';

  return `
    <div class="bottom-nav-wrap">
      <nav class="bottom-nav ${navClass}">
        ${items
          .map(
            (item) => `
          <button type="button" class="bottom-nav-button ${
            currentRoute === item.target ? 'active' : ''
          }" data-target="${item.target}">
            <span class="bottom-nav-icon" aria-hidden="true">${item.icon}</span>
            <span class="bottom-nav-label">${t(item.labelKey)}</span>
          </button>`
          )
          .join('')}
      </nav>
    </div>
  `;
}
