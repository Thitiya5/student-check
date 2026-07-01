/**
 * Build-time feature flags (Vite env).
 * Set VITE_ENABLE_EXECUTIVE=false to hide Executive Dashboard quickly.
 */

/** @returns {boolean} */
export function isExecutiveEnabled() {
  const raw = String(import.meta.env.VITE_ENABLE_EXECUTIVE ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  return true;
}
