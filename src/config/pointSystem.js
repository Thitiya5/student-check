/** สถานะที่นับใน % เฝ้าระวัง (ขาด สาย ลากิจ ลาป่วย + ลา ข้อมูลเก่า — ไม่รวมลากิจกรรม) */
export const PARENT_RISK_STATUS_KEYS = ['absent', 'late', 'errand', 'sick', 'leave'];

export {
  getStartingScore,
  getCommunityServiceThreshold,
  getDisciplineStartDate,
  getParentMeetingThresholdPercent,
  isDisciplineActiveDate
} from '../services/appSettingsService.js';
