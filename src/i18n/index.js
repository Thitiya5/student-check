import { translations } from './translations.js';

export const LANGUAGE_STORAGE_KEY = 'student-check-language';

/** @type {'th'|'en'} */
let currentLang = 'th';

/** @type {Set<() => void>} */
const listeners = new Set();

export function initI18n() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'en' || saved === 'th') {
      currentLang = saved;
    }
  } catch {
    currentLang = 'th';
  }
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'th';
}

/**
 * @param {'th'|'en'} lang
 */
export function setLanguage(lang) {
  if (lang !== 'th' && lang !== 'en') return;
  currentLang = lang;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  document.documentElement.lang = lang === 'en' ? 'en' : 'th';
  listeners.forEach((fn) => fn());
}

/** @returns {'th'|'en'} */
export function getLanguage() {
  return currentLang;
}

export function getLanguageLabel(lang = currentLang) {
  return lang === 'en' ? 'English' : 'ไทย';
}

/**
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 */
export function t(key, params) {
  const table = translations[currentLang] || translations.th;
  let text = table[key] ?? translations.th[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }
  return text;
}

import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';

/**
 * @param {string} statusKey
 */
export function statusLabel(statusKey) {
  const key = normalizeAttendanceStatus(statusKey);
  const label = t(`status.${key}`);
  if (label !== `status.${key}`) return label;
  return key;
}

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyLanguageChange() {
  listeners.forEach((fn) => fn());
}
