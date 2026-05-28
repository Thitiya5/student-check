/** Default status when opening check page (no saved record yet). */
export const CHECK_DEFAULT_STATUS = 'absent';

/** Status keys used in UI (check, history, reports, edit, student profile). */
export const ATTENDANCE_STATUS_KEYS = [
  'present',
  'late',
  'absent',
  'sick',
  'errand',
  'activity'
];

/** @deprecated Use ATTENDANCE_STATUS_KEYS */
export const CHECK_ATTENDANCE_STATUS_KEYS = ATTENDANCE_STATUS_KEYS;

/** Legacy Firestore values — not selectable; still readable via statusLabel(). */
export const LEGACY_ATTENDANCE_STATUSES = ['leave'];

const ALL_KNOWN_STATUSES = [...ATTENDANCE_STATUS_KEYS, ...LEGACY_ATTENDANCE_STATUSES];

/** @type {Record<string, string>} */
export const attendanceStatusLabels = {
  present: 'มา',
  late: 'สาย',
  absent: 'ขาด',
  leave: 'ลา',
  errand: 'ลากิจ',
  activity: 'ลากิจกรรม',
  sick: 'ลาป่วย'
};

/** @type {Record<string, string>} */
export const attendanceStatusLabelsEn = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'Leave',
  errand: 'Personal leave',
  activity: 'Activity leave',
  sick: 'Sick leave'
};

/**
 * Normalize status from Firestore / Sheets / UI to a canonical key.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeAttendanceStatus(value) {
  const raw = String(value ?? 'present').trim();
  const s = raw.toLowerCase();

  if (ALL_KNOWN_STATUSES.includes(s)) return s;

  if (raw === 'มา' || s === 'p') return 'present';
  if (raw === 'สาย' || s === 'l') return 'late';
  if (raw === 'ขาด' || s === 'a') return 'absent';
  if (raw === 'ลา') return 'leave';
  if (raw === 'ลากิจ') return 'errand';
  if (raw === 'ลากิจกรรม') return 'activity';
  if (raw === 'ลาป่วย' || raw === 'ป่วย') return 'sick';

  return 'present';
}

/**
 * Label for display / Sheets export (Thai).
 * @param {string} key
 */
export function attendanceStatusDisplayTh(key) {
  return attendanceStatusLabels[normalizeAttendanceStatus(key)] || key;
}
