/**
 * Lightweight PDF export gate — no html2pdf / jsPDF imports.
 */

/**
 * @param {object|null|undefined} data
 */
export function canExportExecutivePdf(data) {
  if (!data || data.error) return false;
  if (!data.summary || !data.charts || !data.completion || !data.insights) return false;
  if (!Array.isArray(data.comparisonTable)) return false;
  return true;
}
