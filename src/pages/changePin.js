import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';

/**
 * Admin-only — change own PIN.
 * @param {HTMLElement} container
 * @param {{ state?: object, onSubmit?: (payload: { currentPin: string, newPin: string }) => Promise<void> | void, onNavigate?: (path: string) => void, onBack?: (fallback?: string) => void, onToast?: (msg: string) => void, onLogout?: () => void }} ctx
 */
export function renderChangePinPage(container, { onSubmit, onNavigate, onBack, onToast, onLogout } = {}) {
  container.innerHTML = `
    ${renderPageHeader({
      title: t('changePin.title'),
      subtitle: t('changePin.adminSubtitle'),
      topAction: 'back'
    })}
    <section class="settings-group glass-card">
      <h2 class="settings-group__title">${escapeHtml(t('changePin.formTitle'))}</h2>
      <form id="changePinForm" class="settings-pin-form">
        <label class="field">
          <span>${escapeHtml(t('changePin.currentPin'))}</span>
          <input class="input-field" id="changePinCurrent" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password" required />
        </label>
        <label class="field">
          <span>${escapeHtml(t('changePin.newPin'))}</span>
          <input class="input-field" id="changePinNew" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" required />
        </label>
        <label class="field">
          <span>${escapeHtml(t('changePin.confirmPin'))}</span>
          <input class="input-field" id="changePinConfirm" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" required />
        </label>
        <button type="submit" class="button-primary">${escapeHtml(t('changePin.submit'))}</button>
      </form>
    </section>
  `;

  bindPageHeaderActions(container, {
    onNavigate,
    onBack: () => onBack?.('/settings'),
    onLogout
  });

  const form = container.querySelector('#changePinForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPin = /** @type {HTMLInputElement|null} */ (container.querySelector('#changePinCurrent'))?.value?.trim() || '';
    const newPin = /** @type {HTMLInputElement|null} */ (container.querySelector('#changePinNew'))?.value?.trim() || '';
    const confirmPin = /** @type {HTMLInputElement|null} */ (container.querySelector('#changePinConfirm'))?.value?.trim() || '';

    if (newPin.length < 6) {
      onToast?.(t('changePin.pinTooShort'));
      return;
    }
    if (newPin !== confirmPin) {
      onToast?.(t('changePin.notMatch'));
      return;
    }
    if (!currentPin) {
      onToast?.(t('changePin.currentRequired'));
      return;
    }
    try {
      await onSubmit?.({ currentPin, newPin });
      onToast?.(t('changePin.changed'));
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : t('changePin.failed'));
    }
  });
}
