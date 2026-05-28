export const THEME_STORAGE_KEY = 'theme';
const LEGACY_THEME_KEY = 'student-check-theme';

/** @type {'light'|'dark'} */
let currentTheme = 'light';

/** @type {Set<() => void>} */
const listeners = new Set();

export function initTheme() {
  try {
    const saved =
      localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      currentTheme = saved;
    }
  } catch {
    currentTheme = 'light';
  }
  applyThemeToDocument(currentTheme);
}

/**
 * @param {'light'|'dark'} theme
 */
export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  currentTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem(LEGACY_THEME_KEY, theme);
  } catch {
    // ignore
  }
  applyThemeToDocument(theme);
  listeners.forEach((fn) => fn());
}

export function getTheme() {
  return currentTheme;
}

export function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  return currentTheme;
}

function applyThemeToDocument(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0f0b1f' : '#6c4cff');
  }
}

/**
 * @param {() => void} fn
 */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
