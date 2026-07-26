import { addDaysToDateKey, formatDateInBangkok, isIsoDateKey, isSchoolDay } from './dateIso.js';
import { getAppSettings } from '../services/appSettingsService.js';

/**
 * @typedef {{ id: string, name: string, startDate: string, endDate: string }} SchoolHoliday
 */

/** @type {Map<string, SchoolHoliday>|null} */
let holidayLookupCache = null;
/** @type {unknown} */
let holidayLookupSettingsRef = null;

function generateHolidayId() {
  return `hol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} raw
 * @returns {SchoolHoliday[]}
 */
export function normalizeSchoolHolidays(raw) {
  if (!Array.isArray(raw)) return [];

  const seenIds = new Set();
  /** @type {SchoolHoliday[]} */
  const out = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim();
    const startDate = isIsoDateKey(item.startDate) ? String(item.startDate).trim() : '';
    const endDate = isIsoDateKey(item.endDate) ? String(item.endDate).trim() : '';
    if (!name || !startDate || !endDate || startDate > endDate) continue;

    let id = String(item.id || '').trim();
    if (!id || seenIds.has(id)) {
      id = generateHolidayId();
      while (seenIds.has(id)) id = generateHolidayId();
    }
    seenIds.add(id);
    out.push({ id, name, startDate, endDate });
  }

  return out.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'th')
  );
}

/**
 * @param {{ schoolHolidays?: SchoolHoliday[] }} settings
 * @returns {Map<string, SchoolHoliday>}
 */
function buildHolidayLookup(settings) {
  /** @type {Map<string, SchoolHoliday>} */
  const byDate = new Map();
  const holidays = settings?.schoolHolidays || [];

  for (const holiday of holidays) {
    let cursor = holiday.startDate;
    while (cursor <= holiday.endDate) {
      if (!byDate.has(cursor)) byDate.set(cursor, holiday);
      const next = new Date(`${cursor}T12:00:00`);
      next.setDate(next.getDate() + 1);
      cursor = formatDateInBangkok(next);
    }
  }

  return byDate;
}

/**
 * @param {{ schoolHolidays?: SchoolHoliday[] }} settings
 */
function getHolidayLookup(settings) {
  if (holidayLookupSettingsRef === settings && holidayLookupCache) {
    return holidayLookupCache;
  }
  holidayLookupSettingsRef = settings;
  holidayLookupCache = buildHolidayLookup(settings);
  return holidayLookupCache;
}

export function invalidateSchoolHolidayLookupCache() {
  holidayLookupCache = null;
  holidayLookupSettingsRef = null;
}

/**
 * @param {string} dateKey yyyy-MM-dd
 * @param {{ schoolHolidays?: SchoolHoliday[] }} [settings]
 * @returns {SchoolHoliday|null}
 */
export function getSchoolHoliday(dateKey, settings) {
  const s = settings || getAppSettings();
  const key = String(dateKey || '').trim();
  if (!key) return null;
  return getHolidayLookup(s).get(key) || null;
}

/**
 * @param {string} dateKey yyyy-MM-dd
 * @param {{ schoolHolidays?: SchoolHoliday[] }} [settings]
 */
export function isConfiguredSchoolHoliday(dateKey, settings) {
  return Boolean(getSchoolHoliday(dateKey, settings));
}

/**
 * Attendance is required on weekdays that are not configured holidays.
 * @param {string} dateKey yyyy-MM-dd
 * @param {{ schoolHolidays?: SchoolHoliday[] }} [settings]
 */
export function isAttendanceRequiredDate(dateKey, settings) {
  return isSchoolDay(dateKey) && !isConfiguredSchoolHoliday(dateKey, settings);
}

/**
 * @param {SchoolHoliday} holiday
 */
export function countHolidayDays(holiday) {
  if (!holiday?.startDate || !holiday?.endDate) return 0;
  let count = 0;
  let cursor = holiday.startDate;
  while (cursor <= holiday.endDate) {
    count += 1;
    const next = new Date(`${cursor}T12:00:00`);
    next.setDate(next.getDate() + 1);
    cursor = formatDateInBangkok(next);
  }
  return count;
}

/**
 * @param {string} dateKey yyyy-MM-dd
 */
function formatThaiShortDate(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok'
  }).format(new Date(y, m - 1, d));
}

/**
 * Compact range for admin list, e.g. 29–30 ก.ค. 2569 · 2 วัน
 * @param {SchoolHoliday} holiday
 * @param {(key: string, params?: object) => string} [translate]
 */
export function formatHolidayDateRangeShort(holiday, translate) {
  const days = countHolidayDays(holiday);
  const start = formatThaiShortDate(holiday.startDate);
  if (holiday.startDate === holiday.endDate) {
    return translate
      ? translate('schoolHolidays.singleDayShort', { date: start, days })
      : `${start} · ${days} วัน`;
  }

  const end = formatThaiShortDate(holiday.endDate);
  const startParts = start.split(' ');
  const endParts = end.split(' ');
  const sameMonthYear =
    holiday.startDate.slice(0, 7) === holiday.endDate.slice(0, 7);
  const rangeLabel = sameMonthYear
    ? `${startParts[0]}–${endParts[0]} ${endParts.slice(1).join(' ')}`
    : `${start} – ${end}`;

  return translate
    ? translate('schoolHolidays.rangeShort', { range: rangeLabel, days })
    : `${rangeLabel} · ${days} วัน`;
}

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * @param {string} dateKey yyyy-MM-dd
 */
function formatDateThaiLong(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  const monthName = THAI_MONTH_NAMES[parseInt(month, 10) - 1] || month;
  return `${Number(day)} ${monthName} ${parseInt(year, 10) + 543}`;
}

/**
 * Long range for check banner, e.g. 29–30 กรกฎาคม 2569 · 2 วัน
 * @param {SchoolHoliday} holiday
 * @param {(key: string, params?: object) => string} [translate]
 */
export function formatHolidayDateRangeLong(holiday, translate) {
  const days = countHolidayDays(holiday);
  const start = formatDateThaiLong(holiday.startDate);
  if (holiday.startDate === holiday.endDate) {
    return translate
      ? translate('schoolHolidays.singleDayLong', { date: start, days })
      : `${start} · ${days} วัน`;
  }

  const end = formatDateThaiLong(holiday.endDate);
  const [startDay] = holiday.startDate.split('-').slice(2);
  const [endDay] = holiday.endDate.split('-').slice(2);
  const sameMonthYear =
    holiday.startDate.slice(0, 7) === holiday.endDate.slice(0, 7);
  const rangeLabel = sameMonthYear
    ? `${Number(startDay)}–${Number(endDay)} ${end.split(' ').slice(1).join(' ')}`
    : `${start} – ${end}`;

  return translate
    ? translate('schoolHolidays.rangeLong', { range: rangeLabel, days })
    : `${rangeLabel} · ${days} วัน`;
}

/**
 * @param {SchoolHoliday} holiday
 * @param {(key: string, params?: object) => string} translate
 */
export function formatHolidayBannerTitle(holiday, translate) {
  return translate('check.holidayBannerTitle', { name: holiday.name });
}

/**
 * @typedef {'today'|'upcoming'} DashboardHolidayReminderState
 */

/**
 * @typedef {object} DashboardHolidayReminder
 * @property {DashboardHolidayReminderState} state
 * @property {SchoolHoliday} holiday
 * @property {number} daysUntil
 * @property {number} durationDays
 * @property {string} dateRangeLabel
 */

/**
 * Calendar days from fromKey (exclusive progress) until toKey.
 * @param {string} fromKey yyyy-MM-dd
 * @param {string} toKey yyyy-MM-dd
 */
export function daysUntilDateKey(fromKey, toKey) {
  const from = String(fromKey || '').trim();
  const to = String(toKey || '').trim();
  if (!isIsoDateKey(from) || !isIsoDateKey(to) || from >= to) return 0;

  let count = 0;
  let cursor = from;
  while (cursor < to) {
    count += 1;
    cursor = addDaysToDateKey(cursor, 1);
  }
  return count;
}

/**
 * Date/date-range label for dashboard reminder (no duration suffix).
 * @param {SchoolHoliday} holiday
 */
export function formatHolidayDashboardDateRange(holiday) {
  const start = formatThaiShortDate(holiday.startDate);
  if (holiday.startDate === holiday.endDate) return start;

  const end = formatThaiShortDate(holiday.endDate);
  const startParts = start.split(' ');
  const endParts = end.split(' ');
  const sameMonthYear = holiday.startDate.slice(0, 7) === holiday.endDate.slice(0, 7);
  return sameMonthYear
    ? `${startParts[0]}–${endParts[0]} ${endParts.slice(1).join(' ')}`
    : `${start} – ${end}`;
}

/**
 * Nearest relevant holiday reminder for Dashboard (display only).
 * Priority: in-progress holiday, then nearest upcoming holiday within window.
 * @param {string} dateKey yyyy-MM-dd
 * @param {{ schoolHolidays?: SchoolHoliday[] }} [settings]
 * @param {number} [reminderWindowDays]
 * @returns {DashboardHolidayReminder|null}
 */
export function getDashboardHolidayReminder(dateKey, settings = getAppSettings(), reminderWindowDays = 7) {
  const today = String(dateKey || '').trim();
  if (!isIsoDateKey(today)) return null;

  const holidays = settings?.schoolHolidays || [];
  if (!holidays.length) return null;

  for (const holiday of holidays) {
    if (today >= holiday.startDate && today <= holiday.endDate) {
      return {
        state: 'today',
        holiday,
        daysUntil: 0,
        durationDays: countHolidayDays(holiday),
        dateRangeLabel: formatHolidayDashboardDateRange(holiday)
      };
    }
  }

  /** @type {SchoolHoliday|null} */
  let nearest = null;
  let nearestDaysUntil = Infinity;

  for (const holiday of holidays) {
    if (today >= holiday.startDate) continue;
    const daysUntil = daysUntilDateKey(today, holiday.startDate);
    if (daysUntil <= 0 || daysUntil > reminderWindowDays) continue;
    if (
      daysUntil < nearestDaysUntil ||
      (daysUntil === nearestDaysUntil && holiday.startDate < String(nearest?.startDate || '9999'))
    ) {
      nearest = holiday;
      nearestDaysUntil = daysUntil;
    }
  }

  if (!nearest) return null;

  return {
    state: 'upcoming',
    holiday: nearest,
    daysUntil: nearestDaysUntil,
    durationDays: countHolidayDays(nearest),
    dateRangeLabel: formatHolidayDashboardDateRange(nearest)
  };
}
