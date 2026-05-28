import { escapeHtml } from '../utils/html.js';
import { getLanguage, t } from '../i18n/index.js';
import { SCHOOL_LOGO_SRC, SCHOOL_NAME_TH } from '../config/schoolBranding.js';

/**
 * Circular school emblem.
 * @param {{ size?: 'sm'|'md'|'lg'|'xl', className?: string, decorative?: boolean }} [opts]
 */
export function renderSchoolLogo({ size = 'md', className = '', decorative = false } = {}) {
  const alt = escapeHtml(SCHOOL_NAME_TH);
  return `<div class="school-logo school-logo--${size} ${className}" ${decorative ? 'aria-hidden="true"' : ''}>
    <img src="${SCHOOL_LOGO_SRC}" alt="${decorative ? '' : alt}" width="96" height="96" decoding="async" />
  </div>`;
}

/**
 * Logo + school name block for login / headers.
 * @param {{ variant?: 'login'|'header'|'strip', showEnglish?: boolean }} [opts]
 */
export function renderSchoolBrand({ variant = 'login', showEnglish } = {}) {
  const lang = getLanguage();
  const en = showEnglish ?? lang === 'en';
  const logoSize = variant === 'login' ? 'xl' : variant === 'header' ? 'md' : 'sm';
  const name = escapeHtml(t('school.name'));
  const tagline = escapeHtml(t('school.tagline'));
  const nameEn = escapeHtml(t('school.nameEn'));

  return `<div class="school-brand school-brand--${variant}">
    ${renderSchoolLogo({ size: logoSize, decorative: variant === 'strip' })}
    <div class="school-brand__text">
      <p class="school-brand__name">${name}</p>
      ${variant !== 'strip' ? `<p class="school-brand__tagline">${tagline}</p>` : ''}
      ${en && variant === 'login' ? `<p class="school-brand__name-en">${nameEn}</p>` : ''}
    </div>
  </div>`;
}

/** Compact strip for mobile app header (all logged-in pages). */
export function renderAppBrandStrip() {
  return `<header class="app-brand-strip" aria-label="${escapeHtml(SCHOOL_NAME_TH)}">
    ${renderSchoolBrand({ variant: 'strip' })}
  </header>`;
}

