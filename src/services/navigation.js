const STACK_KEY = 'app_nav_stack';
const SCROLL_PREFIX = 'app_scroll_';
const RETURN_PREFIX = 'app_return_';

function readStack() {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((p) => typeof p === 'string' && p.startsWith('/')) : [];
  } catch {
    return [];
  }
}

function writeStack(stack) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-20)));
  } catch {
    // ignore
  }
}

/**
 * Full hash path including optional query string (e.g. /student-profile?id=123).
 * @param {string} [path]
 */
export function getHashPath(path = '') {
  const raw = (path || window.location.hash.replace('#', '')).trim();
  if (!raw || raw === '/') return '/dashboard';
  const routePart = raw.split('?')[0];
  const queryPart = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  const route =
    !routePart || routePart === '/'
      ? '/dashboard'
      : routePart.startsWith('/')
        ? routePart
        : `/${routePart}`;
  return route + queryPart;
}

/**
 * Route path only (no query), for nav stack and scroll keys.
 * @param {string} [path]
 */
export function getRoutePath(path = '') {
  return getHashPath(path).split('?')[0];
}

function scrollStorageKey(route) {
  return `${SCROLL_PREFIX}${route}`;
}

/**
 * Save scroll position for current route before leaving.
 * @param {string} [route]
 */
export function saveScrollForRoute(route = getRoutePath()) {
  const el = document.querySelector('.page-content');
  if (!el) return;
  try {
    sessionStorage.setItem(scrollStorageKey(route), String(el.scrollTop || 0));
  } catch {
    // ignore
  }
}

/**
 * @param {string} [route]
 */
export function restoreScrollForRoute(route = getRoutePath()) {
  const el = document.querySelector('.page-content');
  if (!el) return;
  try {
    const raw = sessionStorage.getItem(scrollStorageKey(route));
    if (raw == null) return;
    const y = Number(raw);
    requestAnimationFrame(() => {
      el.scrollTop = Number.isFinite(y) ? y : 0;
    });
  } catch {
    // ignore
  }
}

/**
 * @param {string} key e.g. 'profile'
 * @param {string} path
 */
export function setReturnPath(key, path) {
  try {
    sessionStorage.setItem(`${RETURN_PREFIX}${key}`, getRoutePath(path));
  } catch {
    // ignore
  }
}

/**
 * @param {string} key
 * @param {string} [fallback]
 */
export function getReturnPath(key, fallback = '/dashboard') {
  try {
    const v = sessionStorage.getItem(`${RETURN_PREFIX}${key}`);
    return v ? getRoutePath(v) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Navigate with history stack (hash routing).
 * @param {string} path
 * @param {{ replace?: boolean, returnKey?: string }} [opts]
 */
export function navigateTo(path, opts = {}) {
  const targetHash = getHashPath(path);
  const next = getRoutePath(targetHash);
  const current = getRoutePath();
  const currentHash = getHashPath();

  if (current !== next || currentHash !== targetHash) {
    saveScrollForRoute(current);
    if (!opts.replace && current !== next) {
      const stack = readStack();
      if (stack[stack.length - 1] !== current) {
        stack.push(current);
      }
      writeStack(stack);
    }
    if (opts.returnKey) {
      setReturnPath(opts.returnKey, currentHash);
    }
  }

  if (currentHash !== targetHash) {
    window.location.hash = targetHash;
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

/**
 * @param {string} [fallback]
 */
export function goBack(fallback = '/dashboard') {
  const stack = readStack();
  const prev = stack.length ? stack.pop() : fallback;
  writeStack(stack);
  saveScrollForRoute(getRoutePath());
  window.location.hash = prev;
}

/**
 * @param {string} returnKey
 * @param {string} [fallback]
 */
export function goBackTo(returnKey, fallback = '/dashboard') {
  goBack(getReturnPath(returnKey, fallback));
}
