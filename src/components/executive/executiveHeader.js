import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';
import { SCHOOL_LOGO_SRC, SCHOOL_NAME_TH } from '../../config/schoolBranding.js';
import { BANGKOK_TZ } from '../../utils/dateIso.js';

/**
 * @param {string|null|undefined} iso
 */
function formatExecutiveTimestamp(iso) {
  if (!iso) return t('executive.header.lastUpdatedNone');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t('executive.header.lastUpdatedNone');
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BANGKOK_TZ
  }).format(date);
}

/**
 * @param {{
 *   filters: import('../../hooks/executive/useExecutiveFilters.js').ExecutiveFilters,
 *   todayLabel: string,
 *   lastUpdated?: string|null,
 *   loading?: boolean
 * }} opts
 */
export function renderExecutiveHeader({ filters, todayLabel, lastUpdated = null, loading = false }) {
  const academicYear = String(filters.academicYear || '').trim();
  const semester = String(filters.semester || '').trim();
  const semesterLabel = semester
    ? t('executive.period.semester', { term: semester })
    : '—';
  const yearLabel = academicYear
    ? t('executive.period.academicYear', { year: academicYear })
    : '—';
  const updatedLabel = loading
    ? t('common.loading')
    : formatExecutiveTimestamp(lastUpdated);

  return `<header class="exec-header glass-card">
    <div class="exec-header__brand">
      <img class="exec-header__logo" src="${escapeHtml(SCHOOL_LOGO_SRC)}" alt="" width="48" height="48" decoding="async" />
      <div class="exec-header__brand-text">
        <p class="exec-header__school">${escapeHtml(SCHOOL_NAME_TH)}</p>
        <h1 class="exec-header__title">${escapeHtml(t('executive.title'))}</h1>
      </div>
    </div>
    <div class="exec-header__meta">
      <div class="exec-header__meta-row">
        <span class="exec-header__meta-label">${escapeHtml(t('executive.filters.academicYear'))}</span>
        <span class="exec-header__meta-value">${escapeHtml(yearLabel)}</span>
      </div>
      <div class="exec-header__meta-row">
        <span class="exec-header__meta-label">${escapeHtml(t('executive.filters.semester'))}</span>
        <span class="exec-header__meta-value">${escapeHtml(semesterLabel)}</span>
      </div>
      <div class="exec-header__meta-row">
        <span class="exec-header__meta-label">${escapeHtml(t('executive.header.today'))}</span>
        <span class="exec-header__meta-value">${escapeHtml(todayLabel)}</span>
      </div>
      <div class="exec-header__meta-row">
        <span class="exec-header__meta-label">${escapeHtml(t('executive.header.lastUpdated'))}</span>
        <span class="exec-header__meta-value exec-header__meta-value--muted">${escapeHtml(updatedLabel)}</span>
      </div>
    </div>
  </header>`;
}
