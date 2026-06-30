import { parseClassKey } from '../../services/attendanceService.js';

/**
 * Display class key for executive UI (M1/3 → ม.1/3).
 * @param {string} classKey
 */
export function formatExecutiveClassLabel(classKey) {
  const { level, room } = parseClassKey(classKey);
  const normalized = String(level || '').trim();
  const m = normalized.match(/^M(\d+)$/i);
  const levelLabel = m ? `ม.${m[1]}` : normalized;
  const rm = String(room || '').trim();
  return rm ? `${levelLabel}/${rm}` : levelLabel;
}
