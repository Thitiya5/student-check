import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  isPastoralSession,
  canManageBehaviorSession,
  canReturnDisciplinePointsSession
} from '../services/teacherAuth.js';
import { canViewDisciplineReportSession } from '../services/disciplineReportService.js';

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderMenuPage(container, { state = {}, onNavigate, onBack, onLogout } = {}) {
  container.classList.add('menu-page');
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const pastoral = isPastoralSession(session);
  const showBehavior = canManageBehaviorSession(session);
  const showDisciplineReport = canViewDisciplineReportSession(session);
  const showDisciplineRecords = canReturnDisciplinePointsSession(session);

  /** @type {{ title: string, sub?: string, target: string, icon: string }[]} */
  const links = [
    { title: t('nav.history'), sub: t('menu.historySub'), target: '/history', icon: '◷' },
    { title: t('nav.students'), sub: t('menu.studentsSub'), target: '/students', icon: '👤' },
    ...(showBehavior
      ? [{ title: t('nav.behavior'), sub: t('menu.behaviorSub'), target: '/behavior', icon: '✿' }]
      : []),
    ...(showDisciplineReport
      ? [
          {
            title: t('disciplineReport.open'),
            sub: t('menu.disciplineReportSub'),
            target: '/discipline-report',
            icon: '☑'
          }
        ]
      : []),
    ...(showDisciplineRecords && pastoral && !admin
      ? [
          {
            title: t('disciplineRecords.open'),
            sub: t('disciplineRecords.settingsHint'),
            target: '/admin-discipline',
            icon: '↩'
          }
        ]
      : []),
    ...(admin
      ? [{ title: t('nav.admin'), sub: t('menu.adminSub'), target: '/admin', icon: '⚡' }]
      : []),
    { title: t('nav.settings'), sub: t('menu.settingsSub'), target: '/settings', icon: '⚙' }
  ];

  const cards = links
    .map(
      (item) => `<button type="button" class="menu-link-card glass-card" data-target="${escapeHtml(item.target)}">
        <span class="menu-link-card__icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <span class="menu-link-card__text">
          <strong class="menu-link-card__title">${escapeHtml(item.title)}</strong>
          ${item.sub ? `<span class="menu-link-card__sub">${escapeHtml(item.sub)}</span>` : ''}
        </span>
        <span class="menu-link-card__arrow" aria-hidden="true">›</span>
      </button>`
    )
    .join('');

  container.innerHTML = `${renderPageHeader({
    title: t('menu.title'),
    subtitle: t('menu.subtitle'),
    topAction: 'back'
  })}
  <nav class="menu-link-grid" aria-label="${escapeHtml(t('menu.title'))}">${cards}</nav>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  container.querySelectorAll('[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) onNavigate?.(target);
    });
  });

  container.__menuCleanup = () => {};
}
