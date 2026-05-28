/** Middle dot for UI separators (avoids encoding issues with literal · in source files). */
export const MIDDOT = '\u00B7';

/**
 * @param {string[]} parts
 */
export function joinWithDot(...parts) {
  return parts.filter(Boolean).join(` ${MIDDOT} `);
}
