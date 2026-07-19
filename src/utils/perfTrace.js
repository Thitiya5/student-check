/**
 * Lightweight route performance timing — development builds only.
 */

/** @type {Map<string, number>} */
const routeStarts = new Map();

/**
 * @param {string} label
 */
export function perfMarkStart(label) {
  if (!import.meta.env.DEV) return;
  routeStarts.set(label, performance.now());
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} [meta]
 */
export function perfMarkEnd(label, meta = {}) {
  if (!import.meta.env.DEV) return;
  const start = routeStarts.get(label);
  if (start == null) return;
  routeStarts.delete(label);
  const ms = Math.round(performance.now() - start);
  console.info(`[perf] ${label}: ${ms}ms`, meta);
}
