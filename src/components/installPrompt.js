import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';

/** @type {BeforeInstallPromptEvent|null} */
let deferredPrompt = null;

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-install-state-changed'));
  });
}

/** @returns {boolean} */
export function isAppInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    /** @type {unknown} */ (window.navigator).standalone === true
  );
}

/** @returns {boolean} */
function isIos() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * @returns {'installed'|'ready'|'ios'|'browser'}
 */
export function getInstallUIState() {
  if (isAppInstalled()) return 'installed';
  if (deferredPrompt) return 'ready';
  if (isIos()) return 'ios';
  return 'browser';
}

function openInstallHelpModal(kind) {
  const message =
    kind === 'ios' ? t('pwa.iosSteps') : t('pwa.browserSteps');

  const root = document.createElement('div');
  root.className = 'modal-backdrop confirm-modal-backdrop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet glass-card confirm-modal pwa-install-modal';
  sheet.innerHTML = `
    <h2 class="confirm-modal__title">${escapeHtml(t('pwa.howToInstall'))}</h2>
    <div class="confirm-modal__message pwa-install-modal__body">${message}</div>
    <div class="modal-actions confirm-modal__actions">
      <button type="button" class="button-primary" id="pwaHelpClose">${escapeHtml(t('common.confirm'))}</button>
    </div>`;

  root.appendChild(sheet);
  document.body.appendChild(root);

  const close = () => root.remove();
  root.querySelector('#pwaHelpClose')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
}

/**
 * @param {(msg: string) => void} [onToast]
 * @returns {Promise<boolean>}
 */
export async function handleInstallAction(onToast) {
  if (isAppInstalled()) {
    onToast?.(t('pwa.alreadyInstalled'));
    return false;
  }

  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      window.dispatchEvent(new CustomEvent('pwa-install-state-changed'));

      if (outcome === 'accepted') {
        onToast?.(t('pwa.installStarted'));
        return true;
      }
      onToast?.(t('pwa.installCancelled'));
      return false;
    } catch (err) {
      console.error('[pwa] install prompt failed', err);
      onToast?.(t('pwa.installFailed'));
      openInstallHelpModal(getInstallUIState() === 'ios' ? 'ios' : 'browser');
      return false;
    }
  }

  const kind = getInstallUIState();
  openInstallHelpModal(kind === 'ready' ? 'browser' : kind);
  return false;
}

/**
 * @param {HTMLElement} container
 * @param {(msg: string) => void} [onToast]
 */
export function bindSettingsInstall(container, onToast) {
  const btn = container.querySelector('#settingsInstallApp');
  const hint = container.querySelector('#settingsInstallHint');
  if (!btn || !hint) return () => {};

  function refresh() {
    const state = getInstallUIState();
    if (!(btn instanceof HTMLButtonElement)) return;

    if (state === 'installed') {
      btn.disabled = true;
      btn.textContent = t('pwa.installed');
      hint.textContent = t('pwa.installedHint');
      return;
    }

    btn.disabled = false;
    btn.textContent = state === 'ready' ? t('pwa.install') : t('pwa.howToInstall');

    if (state === 'ready') {
      hint.textContent = t('pwa.installHintShort');
    } else if (state === 'ios') {
      hint.textContent = t('pwa.iosHint');
    } else {
      hint.textContent = t('pwa.browserHint');
    }
  }

  const onState = () => refresh();
  window.addEventListener('pwa-install-available', onState);
  window.addEventListener('pwa-install-state-changed', onState);

  btn.addEventListener('click', () => {
    void handleInstallAction(onToast).then(() => refresh());
  });

  refresh();

  return () => {
    window.removeEventListener('pwa-install-available', onState);
    window.removeEventListener('pwa-install-state-changed', onState);
  };
}
