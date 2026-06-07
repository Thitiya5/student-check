import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { openConfirmModal } from '../components/confirmModal.js';
import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';
import {
  initAppSettings,
  getDefaultAppSettings,
  saveAppSettings,
  normalizeAppSettings,
  isInspectionDayFromSettings
} from '../services/appSettingsService.js';
import { getTodayDate, parseIsoDateKeys } from '../utils/dateIso.js';

/**
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderSettingsAdminPage(container, { state = {}, onNavigate, onToast, onLogout, onBack } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!isAdminSession(session)) {
    container.innerHTML = `${renderPageHeader({ title: t('settingsAdmin.title'), topAction: 'back' })}
      <div class="ui-empty"><p class="ui-empty__title">${escapeHtml(t('admin.denied'))}</p></div>`;
    bindPageHeaderActions(container, { onBack: () => onBack?.('/dashboard'), onNavigate });
    return;
  }

  /** @type {import('../services/appSettingsService.js').AppSettings|null} */
  let draft = null;
  let defaults = getDefaultAppSettings();

  container.innerHTML = `${renderPageHeader({
    title: t('settingsAdmin.title'),
    subtitle: t('settingsAdmin.subtitle'),
    topAction: 'back'
  })}
  <div id="settingsAdminRoot" class="settings-admin">${renderLoading()}</div>
  <footer class="settings-admin-footer" id="settingsAdminFooter" hidden>
    <button type="button" class="button-secondary" id="settingsResetBtn">${escapeHtml(t('settingsAdmin.reset'))}</button>
    <button type="button" class="button-primary" id="settingsSaveBtn">${escapeHtml(t('settingsAdmin.save'))}</button>
  </footer>`;

  bindPageHeaderActions(container, {
    onBack: () => onBack?.('/admin'),
    onNavigate
  });

  const root = container.querySelector('#settingsAdminRoot');
  const footer = container.querySelector('#settingsAdminFooter');

  function switchRow(label, hint, id, checked) {
    return `<div class="settings-admin-row settings-admin-row--switch">
      <div>
        <p class="settings-admin-row__label">${escapeHtml(label)}</p>
        ${hint ? `<p class="settings-admin-row__hint">${escapeHtml(hint)}</p>` : ''}
      </div>
      <label class="settings-switch" aria-label="${escapeHtml(label)}">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
        <span class="settings-switch__slider"></span>
      </label>
    </div>`;
  }

  function numberRow(label, id, value, min = 0, max = 100, step = 1) {
    return `<label class="settings-admin-row settings-admin-row--number field">
      <span class="settings-admin-row__label">${escapeHtml(label)}</span>
      <input type="number" class="input-field" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}" />
    </label>`;
  }

  function paint() {
    if (!draft || !root) return;
    root.innerHTML = `
      <section class="settings-admin-card glass-card">
        <h2 class="settings-admin-card__title">${escapeHtml(t('settingsAdmin.attendanceTitle'))}</h2>
        <p class="settings-admin-card__desc">${escapeHtml(t('settingsAdmin.attendanceDesc'))}</p>
        ${switchRow(t('settingsAdmin.attendanceEnabled'), t('settingsAdmin.attendanceEnabledHint'), 'attEnabled', draft.attendance.enabled)}
        <label class="settings-admin-row field">
          <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.attendanceStart'))}</span>
          <p class="settings-admin-row__hint">${escapeHtml(t('settingsAdmin.attendanceStartHint'))}</p>
          <input type="date" class="input-field" id="attStart" value="${escapeHtml(draft.attendance.startDate)}" />
        </label>
        ${numberRow(t('settingsAdmin.absentDeduction'), 'attAbsent', draft.attendance.absentDeduction, 0, 50)}
        ${numberRow(t('settingsAdmin.lateDeduction'), 'attLate', draft.attendance.lateDeduction, 0, 50)}
      </section>

      <section class="settings-admin-card glass-card">
        <h2 class="settings-admin-card__title">${escapeHtml(t('settingsAdmin.disciplineTitle'))}</h2>
        <p class="settings-admin-card__desc">${escapeHtml(t('settingsAdmin.disciplineDesc'))}</p>
        ${switchRow(t('settingsAdmin.disciplineEnabled'), '', 'discEnabled', draft.discipline.enabled)}
        <label class="settings-admin-row field">
          <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.disciplineStart'))}</span>
          <input type="date" class="input-field" id="discStart" value="${escapeHtml(draft.discipline.startDate)}" />
        </label>
        <div class="settings-admin-grid">
          ${numberRow(t('discipline.uniform'), 'discUniform', draft.discipline.uniformDeduction)}
          ${numberRow(t('discipline.hair'), 'discHair', draft.discipline.hairDeduction)}
          ${numberRow(t('discipline.nails'), 'discNails', draft.discipline.nailsDeduction)}
          ${numberRow(t('discipline.accessories'), 'discAccessory', draft.discipline.accessoryDeduction)}
        </div>
        <div class="settings-admin-grid">
          ${numberRow(t('settingsAdmin.goodReward'), 'discGood', draft.discipline.goodBehaviorReward)}
          ${numberRow(t('settingsAdmin.badDeduction'), 'discBad', draft.discipline.badBehaviorDeduction)}
        </div>
        ${numberRow(t('settingsAdmin.startingScore'), 'scoreStart', draft.scoring.startingScore, 1, 999)}
      </section>

      <section class="settings-admin-card glass-card">
        <h2 class="settings-admin-card__title">${escapeHtml(t('settingsAdmin.inspectionTitle'))}</h2>
        <label class="settings-admin-row field">
          <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.inspectionMode'))}</span>
          <select class="select-field" id="inspMode">
            <option value="monthly" ${draft.inspection.mode === 'monthly' ? 'selected' : ''}>${escapeHtml(t('settingsAdmin.modeMonthly'))}</option>
            <option value="weekly" ${draft.inspection.mode === 'weekly' ? 'selected' : ''}>${escapeHtml(t('settingsAdmin.modeWeekly'))}</option>
            <option value="custom" ${draft.inspection.mode === 'custom' ? 'selected' : ''}>${escapeHtml(t('settingsAdmin.modeCustom'))}</option>
          </select>
        </label>
        <div id="inspMonthlyFields" ${draft.inspection.mode !== 'monthly' ? 'hidden' : ''}>
          <label class="settings-admin-row field">
            <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.inspectionDayType'))}</span>
            <select class="select-field" id="inspDayType">
              <option value="first_school_day" ${draft.inspection.inspectionDayType === 'first_school_day' ? 'selected' : ''}>${escapeHtml(t('settingsAdmin.firstSchoolDay'))}</option>
              <option value="day_of_month" ${draft.inspection.inspectionDayType === 'day_of_month' ? 'selected' : ''}>${escapeHtml(t('settingsAdmin.dayOfMonth'))}</option>
            </select>
          </label>
          <label class="settings-admin-row field" id="inspDayOfMonthWrap" ${draft.inspection.inspectionDayType !== 'day_of_month' ? 'hidden' : ''}>
            <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.dayOfMonthLabel'))}</span>
            <input type="range" class="settings-admin-range" id="inspDayOfMonth" min="1" max="31" value="${draft.inspection.dayOfMonth}" />
            <output id="inspDayOfMonthOut" class="settings-admin-range__out">${draft.inspection.dayOfMonth}</output>
          </label>
        </div>
        <div id="inspWeeklyFields" ${draft.inspection.mode !== 'weekly' ? 'hidden' : ''}>
          <label class="settings-admin-row field">
            <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.weekday'))}</span>
            <select class="select-field" id="inspWeekday">
              ${[1, 2, 3, 4, 5].map((d) => `<option value="${d}" ${draft.inspection.dayOfWeek === d ? 'selected' : ''}>${escapeHtml(t(`settingsAdmin.weekday${d}`))}</option>`).join('')}
            </select>
          </label>
        </div>
        <div id="inspCustomFields" ${draft.inspection.mode !== 'custom' ? 'hidden' : ''}>
          <label class="settings-admin-row field">
            <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.customDates'))}</span>
            <textarea class="input-field settings-admin-textarea" id="inspCustomDates" rows="3" placeholder="YYYY-MM-DD">${escapeHtml((draft.inspection.customDates || []).join('\n'))}</textarea>
          </label>
          <button type="button" class="button-secondary button-secondary--sm" id="inspAddTodayBtn">${escapeHtml(t('settingsAdmin.addToday'))}</button>
        </div>
        <p class="settings-admin-today-ok" id="inspTodayStatus" hidden></p>
      </section>

      <section class="settings-admin-card glass-card">
        <h2 class="settings-admin-card__title">${escapeHtml(t('settingsAdmin.warningTitle'))}</h2>
        <p class="settings-admin-card__desc">${escapeHtml(t('settingsAdmin.warningDesc'))}</p>
        <label class="settings-admin-row field">
          <span class="settings-admin-row__label">${escapeHtml(t('settingsAdmin.warningThreshold'))}</span>
          <input type="range" class="settings-admin-range" id="warnThreshold" min="0" max="100" value="${draft.attendanceWarning.thresholdPercent}" />
          <output id="warnThresholdOut" class="settings-admin-range__out">${draft.attendanceWarning.thresholdPercent}%</output>
        </label>
      </section>`;

    if (footer) footer.hidden = false;
    bindForm();
  }

  function readForm() {
    const customRaw = root.querySelector('#inspCustomDates')?.value || '';
    const customDates = parseIsoDateKeys(customRaw);

    return normalizeAppSettings({
      attendance: {
        enabled: root.querySelector('#attEnabled')?.checked ?? true,
        startDate: root.querySelector('#attStart')?.value || defaults.attendance.startDate,
        absentDeduction: Number(root.querySelector('#attAbsent')?.value),
        lateDeduction: Number(root.querySelector('#attLate')?.value)
      },
      discipline: {
        enabled: root.querySelector('#discEnabled')?.checked ?? true,
        startDate: root.querySelector('#discStart')?.value || defaults.discipline.startDate,
        uniformDeduction: Number(root.querySelector('#discUniform')?.value),
        hairDeduction: Number(root.querySelector('#discHair')?.value),
        nailsDeduction: Number(root.querySelector('#discNails')?.value),
        accessoryDeduction: Number(root.querySelector('#discAccessory')?.value),
        goodBehaviorReward: Number(root.querySelector('#discGood')?.value),
        badBehaviorDeduction: Number(root.querySelector('#discBad')?.value)
      },
      inspection: {
        mode: root.querySelector('#inspMode')?.value || 'monthly',
        inspectionDayType: root.querySelector('#inspDayType')?.value || 'first_school_day',
        dayOfMonth: Number(root.querySelector('#inspDayOfMonth')?.value) || 5,
        dayOfWeek: Number(root.querySelector('#inspWeekday')?.value) || 1,
        customDates
      },
      attendanceWarning: {
        thresholdPercent: Number(root.querySelector('#warnThreshold')?.value)
      },
      scoring: {
        startingScore: Number(root.querySelector('#scoreStart')?.value)
      }
    });
  }

  function updateTodayStatus() {
    const el = root.querySelector('#inspTodayStatus');
    if (!el) return;
    try {
      const settings = readForm();
      const today = getTodayDate();
      const active = isInspectionDayFromSettings(today, settings);
      if (active) {
        el.textContent = t('settingsAdmin.todayOk', { date: today });
        el.hidden = false;
      } else {
        el.textContent = '';
        el.hidden = true;
      }
    } catch {
      el.hidden = true;
    }
  }

  function updateInspectionVisibility() {
    const mode = root.querySelector('#inspMode')?.value;
    root.querySelector('#inspMonthlyFields')?.toggleAttribute('hidden', mode !== 'monthly');
    root.querySelector('#inspWeeklyFields')?.toggleAttribute('hidden', mode !== 'weekly');
    root.querySelector('#inspCustomFields')?.toggleAttribute('hidden', mode !== 'custom');
    const dayType = root.querySelector('#inspDayType')?.value;
    root.querySelector('#inspDayOfMonthWrap')?.toggleAttribute('hidden', dayType !== 'day_of_month');
    updateTodayStatus();
  }

  function bindForm() {
    root.querySelector('#inspMode')?.addEventListener('change', updateInspectionVisibility);
    root.querySelector('#inspDayType')?.addEventListener('change', updateInspectionVisibility);
    root.querySelector('#inspCustomDates')?.addEventListener('input', updateTodayStatus);

    root.querySelector('#inspAddTodayBtn')?.addEventListener('click', () => {
      const modeSel = root.querySelector('#inspMode');
      if (modeSel) modeSel.value = 'custom';
      updateInspectionVisibility();
      const ta = root.querySelector('#inspCustomDates');
      const today = getTodayDate();
      const existing = parseIsoDateKeys(ta?.value || '');
      if (!existing.includes(today)) existing.push(today);
      if (ta) ta.value = existing.sort().join('\n');
      updateTodayStatus();
    });

    const dayRange = root.querySelector('#inspDayOfMonth');
    const dayOut = root.querySelector('#inspDayOfMonthOut');
    dayRange?.addEventListener('input', () => {
      if (dayOut) dayOut.textContent = dayRange.value;
    });

    const warnRange = root.querySelector('#warnThreshold');
    const warnOut = root.querySelector('#warnThresholdOut');
    warnRange?.addEventListener('input', () => {
      if (warnOut) warnOut.textContent = `${warnRange.value}%`;
    });

    updateTodayStatus();
  }

  footer?.querySelector('#settingsSaveBtn')?.addEventListener('click', async () => {
    const btn = footer.querySelector('#settingsSaveBtn');
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      draft = readForm();
      await saveAppSettings(draft);
      onToast?.(t('settingsAdmin.saved'));
      paint();
    } catch (err) {
      onToast?.(err?.message || t('settingsAdmin.saveFailed'));
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });

  footer?.querySelector('#settingsResetBtn')?.addEventListener('click', () => {
    openConfirmModal({
      title: t('settingsAdmin.resetTitle'),
      message: t('settingsAdmin.resetMessage'),
      confirmLabel: t('settingsAdmin.reset'),
      cancelLabel: t('common.cancel'),
      danger: true,
      onConfirm: () => {
        draft = structuredClone(defaults);
        paint();
        onToast?.(t('settingsAdmin.resetDone'));
      }
    });
  });

  async function load() {
    try {
      defaults = getDefaultAppSettings();
      draft = await initAppSettings({ force: true });
      paint();
    } catch (err) {
      if (root) {
        root.innerHTML = renderEmpty(t('settingsAdmin.loadFailed'), err?.message || '');
      }
    }
  }

  void load();
  container.__settingsAdminCleanup = () => {};
}
