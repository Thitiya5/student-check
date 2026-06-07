/** School calendar timezone — all attendance dates use this. */
export const BANGKOK_TZ = 'Asia/Bangkok';

/**
 * Format a Date as yyyy-MM-dd in Asia/Bangkok.
 * @param {Date} [d]
 */
export function formatDateInBangkok(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Today's attendance date (yyyy-MM-dd) in Asia/Bangkok.
 * Use this everywhere instead of `new Date()` for attendance.
 */
export function getTodayDate() {
  return formatDateInBangkok(new Date());
}

/** @param {Date} [d] */
export function toDateKey(d = new Date()) {
  return formatDateInBangkok(d);
}

/** Alias for getTodayDate — legacy imports */
export function getTodayDateKey() {
  return getTodayDate();
}

/**
 * @param {string} dateKey yyyy-MM-dd
 * @param {number} days
 */
export function addDaysToDateKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateInBangkok(d);
}

/** Monday–Sunday week containing dateKey (Asia/Bangkok). */
export function weekRangeContaining(dateKey = getTodayDate()) {
  const d = new Date(`${dateKey}T12:00:00`);
  const dow = d.getDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + toMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: formatDateInBangkok(monday), to: formatDateInBangkok(sunday) };
}

/** @param {string} from yyyy-MM-dd @param {string} to yyyy-MM-dd */
export function enumerateDateKeys(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysToDateKey(cur, 1);
  }
  return out;
}

/**
 * Split [from, to] into chunks of at most maxDays (inclusive) for Firestore range limits.
 * @param {string} from @param {string} to @param {number} [maxDays]
 */
export function chunkDateRange(from, to, maxDays = 35) {
  if (!from || !to || from > to) return [];
  const span = enumerateDateKeys(from, to).length;
  if (span <= maxDays) return [{ from, to }];
  const chunks = [];
  let cur = from;
  while (cur <= to) {
    const end = addDaysToDateKey(cur, maxDays - 1);
    const chunkTo = end > to ? to : end;
    chunks.push({ from: cur, to: chunkTo });
    cur = addDaysToDateKey(chunkTo, 1);
  }
  return chunks;
}

const ISO_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} value */
export function isIsoDateKey(value) {
  return ISO_DATE_KEY_RE.test(String(value ?? '').trim());
}

/**
 * Parse newline/comma-separated yyyy-MM-dd strings.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseIsoDateKeys(raw) {
  return [...new Set(
    String(raw || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(isIsoDateKey)
  )].sort();
}

/** @param {string} dateKey */
export function formatWeekdayShortTh(dateKey) {
  return new Intl.DateTimeFormat('th-TH', {
    weekday: 'short',
    timeZone: BANGKOK_TZ
  }).format(new Date(`${dateKey}T12:00:00`));
}
