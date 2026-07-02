import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';
import { canExportExecutivePdf } from '../../services/executive/executivePdfExportGate.js';

/**
 * @param {{ canExport?: boolean }} [opts]
 */
export function renderExecutiveExportBar({ canExport = false } = {}) {
  const disabled = !canExport;
  const disabledAttr = disabled ? ' disabled aria-disabled="true"' : '';
  const hintKey = disabled ? 'executive.export.hintDisabled' : 'executive.export.hintReady';
  const soonHtml = disabled
    ? `<span class="exec-export__soon">${escapeHtml(t('executive.export.soon'))}</span>`
    : '';

  return `<section class="exec-export glass-card">
    <div class="exec-export__text">
      <h2 class="exec-section-title">${escapeHtml(t('executive.export.title'))}</h2>
      <p class="exec-export__hint">${escapeHtml(t(hintKey))}</p>
    </div>
    <div class="exec-export__action">
      <button type="button" class="button-primary exec-export__btn" id="execExportPdf"${disabledAttr}>
        ${escapeHtml(t('executive.export.pdf'))}
      </button>
      ${soonHtml}
    </div>
  </section>`;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   data: object|null|undefined,
 *   filters: import('../../hooks/executive/useExecutiveFilters.js').ExecutiveFilters,
 *   onToast?: (msg: string) => void,
 *   session?: object|null
 * }} opts
 */
export function bindExecutiveExportBar(root, { data, filters, onToast, session }) {
  const btn = root.querySelector('#execExportPdf');
  if (!(btn instanceof HTMLButtonElement)) return;

  if (!canExportExecutivePdf(data, session)) {
    return;
  }

  btn.replaceWith(btn.cloneNode(true));
  const freshBtn = root.querySelector('#execExportPdf');
  if (!(freshBtn instanceof HTMLButtonElement)) return;

  freshBtn.disabled = false;
  freshBtn.removeAttribute('aria-disabled');

  freshBtn.addEventListener('click', async () => {
    if (!canExportExecutivePdf(data, session) || freshBtn.disabled) {
      onToast?.(t('executive.export.failed'));
      return;
    }

    freshBtn.disabled = true;
    freshBtn.setAttribute('aria-busy', 'true');
    const prevLabel = freshBtn.textContent;
    freshBtn.textContent = t('executive.export.generating');

    try {
      const { exportExecutiveDashboardPdf } = await import('../../services/executive/executivePdfService.js');
      await exportExecutiveDashboardPdf({ data, filters, session });
      onToast?.(t('executive.export.done'));
    } catch (err) {
      onToast?.(err?.message || t('executive.export.failed'));
    } finally {
      freshBtn.disabled = false;
      freshBtn.removeAttribute('aria-busy');
      freshBtn.textContent = prevLabel || t('executive.export.pdf');
    }
  });
}
