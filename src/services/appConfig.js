/**
 * Google Apps Script credentials — environment variables only.
 * Set in .env (never expose URL in the UI):
 *   VITE_GAS_WEB_APP_URL or VITE_GOOGLE_SCRIPT_URL
 *   VITE_GAS_SECRET (optional)
 */

/**
 * Strip accidental spaces / Thai chars pasted into .env URL values.
 * @param {string} raw
 */
function sanitizeGasUrl(raw) {
  let url = String(raw ?? '').trim();
  // Remove trailing non-URL characters (e.g. accidental Thai keyboard input "ื")
  url = url.replace(/[^\w\-./:?#&=%]+$/g, '');
  if (url && !/^https?:\/\//i.test(url)) {
    console.warn('[config] GAS URL should start with https://');
  }
  return url;
}

/** @returns {{ gasUrl: string, gasSecret: string, gasDirectUrl: string }} */
export function loadConfig() {
  const gasDirectUrl = sanitizeGasUrl(
    import.meta.env.VITE_GAS_WEB_APP_URL ?? import.meta.env.VITE_GOOGLE_SCRIPT_URL ?? ''
  );
  const gasSecret = import.meta.env.VITE_GAS_SECRET?.trim?.() ?? '';
  // Dev: same-origin proxy avoids browser CORS on script.google.com redirects
  const gasUrl =
    import.meta.env.DEV && gasDirectUrl && !gasDirectUrl.startsWith('/api/gas')
      ? '/api/gas'
      : gasDirectUrl;
  if (import.meta.env.DEV && gasDirectUrl) {
    console.log('[config] GAS via', gasUrl === '/api/gas' ? 'dev proxy /api/gas' : 'direct URL');
  }
  return { gasUrl, gasSecret, gasDirectUrl };
}

/** PIN login only when VITE_ENABLE_PIN_LOGIN=true in build .env */
export function isPinLoginEnabled() {
  return import.meta.env.VITE_ENABLE_PIN_LOGIN === 'true';
}
