import { t } from '../i18n/index.js';
import { escapeHtml } from '../utils/html.js';

/** Routes that highlight the Menu tab in bottom nav. */
export const MENU_SECONDARY_ROUTES = new Set([
  '/menu',
  '/history',
  '/settings',
  '/students',
  '/behavior',
  '/admin',
  '/admin-teachers',
  '/admin-students',
  '/admin-discipline',
  '/inspection',
  '/discipline-report',
  '/settings-admin',
  '/change-pin',
  '/student-profile'
]);

/**
 * @param {string} currentRoute
 * @param {{ showPointsReport?: boolean }} [opts]
 */
export function renderBottomNav(currentRoute, { showPointsReport = false } = {}) {
  const routePath = currentRoute.split('?')[0];
  const items = [
    { labelKey: 'nav.home', icon: '◉', target: '/dashboard' },
    { labelKey: 'nav.attendance', icon: '✦', target: '/check' },
    ...(showPointsReport
      ? [{ labelKey: 'nav.pointsReport', icon: '▤', target: '/points-report' }]
      : []),
    { labelKey: 'nav.reports', icon: '⌗', target: '/reports' },
    { labelKey: 'nav.menu', icon: '☰', target: '/menu', secondary: true }
  ];

  const count = items.length;
  const navClass = count <= 4 ? 'bottom-nav--four' : 'bottom-nav--five';

  return `
    <div class="bottom-nav-wrap">
      <nav class="bottom-nav ${navClass}" aria-label="${escapeHtml(t('nav.main'))}">
        ${items
          .map((item) => {
            const active =
              routePath === item.target ||
              (item.secondary && MENU_SECONDARY_ROUTES.has(routePath));
            return `
          <button type="button" class="bottom-nav-button ${active ? 'active' : ''}" data-target="${item.target}">
            <span class="bottom-nav-icon" aria-hidden="true">${item.icon}</span>
            <span class="bottom-nav-label">${t(item.labelKey)}</span>
          </button>`;
          })
          .join('')}
      </nav>
    </div>
  `;
}
