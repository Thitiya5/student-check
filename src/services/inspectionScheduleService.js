import {
  getAppSettings,
  isInspectionDayFromSettings,
  listUpcomingInspectionDates,
  initAppSettings
} from './appSettingsService.js';
import { getTodayDate } from '../utils/dateIso.js';

/**
 * @returns {Promise<string[]>}
 */
export async function getInspectionDates() {
  await initAppSettings();
  return listUpcomingInspectionDates(getAppSettings(), 6);
}

/**
 * @param {string} [date]
 */
export async function isInspectionDay(date = getTodayDate()) {
  await initAppSettings();
  return isInspectionDayFromSettings(date);
}

/**
 * Sync helper — uses in-memory cache only (no Firestore).
 * @param {string} [date]
 */
export function isInspectionDayCached(date = getTodayDate()) {
  return isInspectionDayFromSettings(date);
}
