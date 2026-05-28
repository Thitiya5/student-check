export const LAST_LOGIN_KEY = 'student-check-last-login';

export function recordLoginTime() {
  try {
    localStorage.setItem(LAST_LOGIN_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

export function getLastLoginTime() {
  try {
    return localStorage.getItem(LAST_LOGIN_KEY) || '';
  } catch {
    return '';
  }
}

export function clearLastLoginTime() {
  try {
    localStorage.removeItem(LAST_LOGIN_KEY);
  } catch {
    // ignore
  }
}

/**
 * @param {string} iso
 * @param {'th'|'en'} [lang]
 */
export function formatLastLogin(iso, lang = 'th') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === 'en' ? 'en-US' : 'th-TH';
  return d.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
