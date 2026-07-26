import { getAppSettings } from '../services/appSettingsService.js';
import { getSchoolHoliday } from './schoolHolidays.js';

/**
 * @param {string} yearMonth yyyy-MM
 * @param {import('../services/appSettingsService.js').AppSettings} [settings]
 * @returns {{ day: number, dateKey: string, isWeekend: boolean, isHoliday: boolean, holidayName: string }[]}
 */
export function buildMonthDayColumns(yearMonth, settings = getAppSettings()) {
  const [y, m] = String(yearMonth).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  /** @type {{ day: number, dateKey: string, isWeekend: boolean, isHoliday: boolean, holidayName: string }[]} */
  const cols = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${yearMonth}-${String(day).padStart(2, '0')}`;
    const dow = new Date(`${dateKey}T12:00:00`).getDay();
    const holiday = getSchoolHoliday(dateKey, settings);
    cols.push({
      day,
      dateKey,
      isWeekend: dow === 0 || dow === 6,
      isHoliday: Boolean(holiday),
      holidayName: holiday?.name || ''
    });
  }
  return cols;
}

/**
 * @param {{ isWeekend?: boolean, isHoliday?: boolean }} col
 */
export function isMatrixNonAttendanceDay(col) {
  return Boolean(col.isWeekend || col.isHoliday);
}

/**
 * @param {{ isHoliday?: boolean }} col
 */
export function getMatrixNonAttendanceCellLabel(col) {
  return col.isHoliday ? 'H' : '';
}
