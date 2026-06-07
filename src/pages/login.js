import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { renderSchoolBrand } from '../components/schoolLogo.js';
import { checkTeacherRequiresPin } from '../services/teachersService.js';

/**
 * @param {HTMLElement} container
 * @param {{ onLogin: (identifier: string, pin: string) => void | Promise<void>, initialName?: string }} ctx
 */
export function renderLoginPage(container, { onLogin, initialName = '' }) {
  container.innerHTML = `
    <article class="login-screen">
      <span class="login-screen__glow login-screen__glow--a" aria-hidden="true"></span>
      <span class="login-screen__glow login-screen__glow--b" aria-hidden="true"></span>

      <div class="login-brand-hero">
        ${renderSchoolBrand({ variant: 'login', showEnglish: true })}
      </div>

      <section class="login-card login-card--animated">
        <h2 class="login-welcome">${escapeHtml(t('login.title'))}</h2>
        <form class="login-form" id="loginForm" novalidate>
          <label class="field login-field" for="loginTeacherName">
            <span>${escapeHtml(t('login.teacherLabel'))}</span>
            <input
              id="loginTeacherName"
              class="input-field login-input"
              type="text"
              name="loginIdentifier"
              autocomplete="username"
              value="${escapeHtml(initialName)}"
              required
            />
          </label>
          <label class="field login-field login-pin-field" id="loginPinField" for="loginTeacherPin" hidden>
            <span>${escapeHtml(t('login.adminPinLabel'))}</span>
            <input
              id="loginTeacherPin"
              class="input-field login-input"
              type="password"
              name="adminPin"
              inputmode="numeric"
              autocomplete="current-password"
              maxlength="12"
              placeholder="${escapeHtml(t('login.adminPinPlaceholder'))}"
            />
            <p class="field-hint">${escapeHtml(t('login.adminPinHint'))}</p>
          </label>
          <button type="submit" class="button-primary login-submit" id="loginSubmitBtn">
            <span class="login-submit__label">${escapeHtml(t('login.submit'))}</span>
          </button>
          <p class="login-status" id="loginStatus" hidden aria-live="polite"></p>
        </form>
      </section>

      <footer class="login-screen__credit">
        <p>จัดทำโดย นางสาวเกศจุฬา ภูนาเมือง</p>
      </footer>
    </article>
  `;

  const form = container.querySelector('#loginForm');
  const input = container.querySelector('#loginTeacherName');
  const pinField = container.querySelector('#loginPinField');
  const pinInput = container.querySelector('#loginTeacherPin');
  const submitBtn = container.querySelector('#loginSubmitBtn');
  const statusEl = container.querySelector('#loginStatus');
  const submitLabel = submitBtn?.querySelector('.login-submit__label');

  let pinRequired = false;
  let pinCheckToken = 0;

  function setPinFieldVisible(visible) {
    pinRequired = visible;
    if (pinField instanceof HTMLElement) {
      pinField.hidden = !visible;
    }
    if (pinInput instanceof HTMLInputElement) {
      pinInput.required = visible;
      if (!visible) pinInput.value = '';
    }
  }

  async function refreshPinRequirement() {
    const name = input instanceof HTMLInputElement ? input.value.trim() : '';
    const token = ++pinCheckToken;
    if (name.length < 2) {
      setPinFieldVisible(false);
      return;
    }
    const result = await checkTeacherRequiresPin(name);
    if (token !== pinCheckToken) return;
    setPinFieldVisible(Boolean(result.requiresPin));
    if (result.ambiguous && pinField instanceof HTMLElement) {
      pinField.querySelector('.field-hint')?.replaceChildren();
      const hint = document.createElement('p');
      hint.className = 'field-hint';
      hint.textContent = t('login.ambiguousName');
      pinField.appendChild(hint);
    }
  }

  function setLoading(loading) {
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = loading;
    if (input instanceof HTMLInputElement) input.disabled = loading;
    if (pinInput instanceof HTMLInputElement) pinInput.disabled = loading;
    if (statusEl) {
      statusEl.hidden = !loading;
      statusEl.textContent = loading ? t('login.loading') : '';
    }
    if (submitLabel) {
      submitLabel.textContent = loading ? t('login.loading') : t('login.submit');
    }
  }

  input?.addEventListener('input', () => {
    void refreshPinRequirement();
  });
  input?.addEventListener('blur', () => {
    void refreshPinRequirement();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = input instanceof HTMLInputElement ? input.value.trim() : '';
    if (!identifier) {
      alert(t('login.nameRequired'));
      input?.focus();
      return;
    }
    setLoading(true);
    try {
      await refreshPinRequirement();
      const pin = pinInput instanceof HTMLInputElement ? pinInput.value.trim() : '';
      if (pinRequired && !pin) {
        setPinFieldVisible(true);
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = t('login.adminPinRequired');
        }
        pinInput?.focus();
        return;
      }
      await onLogin(identifier, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('login.failed');
      if (/pin/i.test(message)) {
        setPinFieldVisible(true);
        await refreshPinRequirement();
      }
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = message;
      }
    } finally {
      setLoading(false);
    }
  });

  requestAnimationFrame(() => {
    input?.focus();
    if (initialName) void refreshPinRequirement();
  });
}
