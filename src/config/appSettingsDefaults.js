/** @typedef {'monthly'|'weekly'|'custom'} InspectionMode */
/** @typedef {'first_school_day'|'day_of_month'} InspectionDayType */

/**
 * Default school settings (used when Firestore doc is missing or partial).
 * @type {import('../services/appSettingsService.js').AppSettings}
 */
export const DEFAULT_APP_SETTINGS = {
  attendance: {
    enabled: true,
    absentDeduction: 1,
    lateDeduction: 1
  },
  discipline: {
    enabled: true,
    startDate: '2026-06-05',
    uniformDeduction: 5,
    hairDeduction: 5,
    nailsDeduction: 5,
    accessoryDeduction: 5,
    goodBehaviorReward: 5,
    badBehaviorDeduction: 5
  },
  inspection: {
    mode: 'monthly',
    inspectionDayType: 'first_school_day',
    dayOfMonth: 5,
    dayOfWeek: 1,
    customDates: []
  },
  attendanceWarning: {
    thresholdPercent: 60
  },
  scoring: {
    startingScore: 100
  }
};
