import { escapeHtml } from '../utils/html.js';
import { t, getLanguage, setLanguage, getLanguageLabel } from '../i18n/index.js';
import { getTheme, setTheme, onThemeChange } from '../services/theme.js';
import { getLastLoginTime, formatLastLogin } from '../services/session.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { bindSettingsInstall } from '../components/installPrompt.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import { isPinLoginEnabled } from '../services/appConfig.js';

const APP_VERSION = '2.0.0';

export function renderSettingsPage(container, ctx = {}) {
  const { state = {}, onLogout, onToast, onLocaleChange, onNavigate, onBack } = ctx;
  const admin = isAdminSession(state.teacherAuth || loadTeacherAuthSession());
  const teacherName = String(state.teacherName || '').trim();
  const lang = getLanguage();
  const theme = getTheme();
  const lastLogin = formatLastLogin(getLastLoginTime(), lang);

  container.innerHTML = `${renderPageHeader({
    title: t('settings.title'),
    topAction: 'back'
  })}

  <section class="settings-group glass-card">
    <h2 class="settings-group__title">${escapeHtml(t('settings.profile'))}</h2>
    <div class="settings-row">
      <span class="settings-row__label">${escapeHtml(t('settings.teacherName'))}</span>
      <span class="settings-row__value">${escapeHtml(teacherName || '—')}</span>
    </div>
    <div class="settings-row">
      <span class="settings-row__label">${escapeHtml(t('settings.currentLanguage'))}</span>
      <span class="settings-row__value">${escapeHtml(getLanguageLabel(lang))}</span>
    </div>
    <div class="settings-row">
      <span class="settings-row__label">${escapeHtml(t('settings.lastLogin'))}</span>
      <span class="settings-row__value">${escapeHtml(lastLogin || t('settings.never'))}</span>
    </div>
  </section>

  <section class="settings-group glass-card">
    <h2 class="settings-group__title">${escapeHtml(t('settings.language'))}</h2>
    <div class="settings-segmented" role="group" aria-label="${escapeHtml(t('settings.language'))}">
      <button type="button" class="settings-segment ${lang === 'th' ? 'is-active' : ''}" data-lang="th">${escapeHtml(t('settings.langTh'))}</button>
      <button type="button" class="settings-segment ${lang === 'en' ? 'is-active' : ''}" data-lang="en">${escapeHtml(t('settings.langEn'))}</button>
    </div>
  </section>

  <section class="settings-group glass-card">
    <h2 class="settings-group__title">${escapeHtml(t('settings.appearance'))}</h2>
    <div class="settings-toggle-row" id="themeToggleRow">
      <div>
        <p class="settings-toggle__label" id="themeToggleLabel">${escapeHtml(t('settings.darkMode'))}</p>
        <p class="settings-toggle__hint" id="themeToggleHint">${escapeHtml(theme === 'dark' ? t('settings.themeDarkHint') : t('settings.themeLightHint'))}</p>
      </div>
      <label class="settings-switch" aria-label="${escapeHtml(t('settings.darkMode'))}">
        <input type="checkbox" id="themeToggle" ${theme === 'dark' ? 'checked' : ''} />
        <span class="settings-switch__slider"></span>
      </label>
    </div>
  </section>

  <section class="settings-group glass-card">
    <h2 class="settings-group__title">${escapeHtml(t('changePin.title'))}</h2>
    <button type="button" class="settings-action-row" id="settingsChangePinLink">
      <span class="settings-action-row__text">
        <span class="settings-action-row__title">${escapeHtml(t('changePin.open'))}</span>
      </span>
      <span class="settings-action-row__arrow" aria-hidden="true">›</span>
    </button>
  </section>

  ${
    admin
      ? `<section class="settings-group glass-card">
    <h2 class="settings-group__title">${escapeHtml(t('settingsAdmin.open'))}</h2>
    <button type="button" class="settings-action-row" id="settingsAdminLink">
      <span class="settings-action-row__text">
        <span class="settings-action-row__title">${escapeHtml(t('settingsAdmin.manage'))}</span>
        <span class="settings-action-row__hint">${escapeHtml(t('settingsAdmin.subtitle'))}</span>
      </span>
      <span class="settings-action-row__arrow" aria-hidden="true">›</span>
    </button>
  </section>`
      : ''
  }

  <section class="settings-group glass-card" id="settingsPwaSection">
    <h2 class="settings-group__title">${escapeHtml(t('pwa.title'))}</h2>
    <button type="button" class="settings-action-row" id="settingsInstallApp">
      <span class="settings-action-row__text">
        <span class="settings-action-row__title">${escapeHtml(t('pwa.install'))}</span>
        <span class="settings-action-row__hint" id="settingsInstallHint">${escapeHtml(t('pwa.installHintShort'))}</span>
      </span>
      <span class="settings-action-row__arrow" aria-hidden="true">›</span>
    </button>
  </section>

  <section class="settings-group glass-card settings-group--danger">
    <button type="button" class="settings-action-row settings-action-row--danger" id="settingsLogout">
      <span class="settings-action-row__text">
        <span class="settings-action-row__title">${escapeHtml(t('settings.logout'))}</span>
      </span>
      <span class="settings-action-row__arrow" aria-hidden="true">›</span>
    </button>
  </section>

  <footer class="settings-version">
    <span>${escapeHtml(t('settings.version'))}</span>
    <strong>v${APP_VERSION}</strong>
  </footer>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  const themeToggle = container.querySelector('#themeToggle');
  const themeHint = container.querySelector('#themeToggleHint');

  function syncThemeUi() {
    const dark = getTheme() === 'dark';
    if (themeToggle instanceof HTMLInputElement) themeToggle.checked = dark;
    if (themeHint) {
      themeHint.textContent = dark ? t('settings.themeDarkHint') : t('settings.themeLightHint');
    }
  }

  const offThemeChange = onThemeChange(syncThemeUi);
  const offInstall = bindSettingsInstall(container, onToast);

  container.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-lang');
      if (next !== 'th' && next !== 'en') return;
      setLanguage(next);
      onToast?.(t('settings.languageChanged'));
      onLocaleChange?.();
    });
  });

  themeToggle?.addEventListener('change', (e) => {
    const dark = e.target instanceof HTMLInputElement && e.target.checked;
    setTheme(dark ? 'dark' : 'light');
    onToast?.(t('settings.themeChanged'));
  });

  container.querySelector('#settingsAdminLink')?.addEventListener('click', () => {
    onNavigate?.('/settings-admin');
  });
  if (isPinLoginEnabled()) {
    container.querySelector('#settingsChangePinLink')?.addEventListener('click', () => {
      onNavigate?.('/change-pin');
    });
  }

  container.querySelector('#settingsLogout')?.addEventListener('click', () => {
    onLogout?.();
  });

  container.__settingsCleanup = () => {
    offThemeChange();
    offInstall();
  };
}
