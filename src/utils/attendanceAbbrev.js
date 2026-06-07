import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';

/**
 * ตัวย่อสถานะการมาเรียนสำหรับตาราง PDF รายเดือน
 * ลากิจ = ก | ลากิจกรรม = ร (จาก กิจกรรม — ไม่ซ้ำกับ ก)
 */
export const ATTENDANCE_ABBREV = {
  present: 'ม',
  late: 'ส',
  absent: 'ข',
  sick: 'ป',
  errand: 'ก',
  activity: 'ร',
  leave: 'ล'
};

/** @type {Array<[keyof typeof ATTENDANCE_ABBREV, string]>} */
export const ATTENDANCE_ABBREV_LEGEND = [
  ['present', 'มาเรียน'],
  ['late', 'มาสาย'],
  ['absent', 'ขาด'],
  ['sick', 'ลาป่วย'],
  ['errand', 'ลากิจ'],
  ['activity', 'ลากิจกรรม'],
  ['leave', 'ลา']
];

/**
 * @param {string} status
 * @returns {string}
 */
export function attendanceStatusAbbrev(status) {
  const key = normalizeAttendanceStatus(status);
  return ATTENDANCE_ABBREV[key] || '';
}

/**
 * @param {(key: string, label?: string) => string} t
 */
export function formatAbbrevLegend(t) {
  return ATTENDANCE_ABBREV_LEGEND.map(([key, fallback]) => {
    const abbrev = ATTENDANCE_ABBREV[key];
    const label = typeof t === 'function' ? t(`status.${key}`, fallback) : fallback;
    return `${abbrev}=${label}`;
  }).join(' · ');
}
