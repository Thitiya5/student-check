/**
 * Sprint 2.5 — Classroom attendance completion (read-only, in-memory aggregation).
 */
import { fetchExecutiveDayContext } from './executiveDayContext.js';
import { getAppSettings } from '../appSettingsService.js';
import {
  deriveOperationalStatus,
  findLastCompletedRoom,
  listPendingRooms,
  summarizeNonRequiredAttendanceDay,
  summarizeRoomCompletion
} from '../../utils/executive/executiveCompletionAggregates.js';
import { getSchoolHoliday, isAttendanceRequiredDate } from '../../utils/schoolHolidays.js';

/**
 * @typedef {object} ExecutiveCompletionStatus
 * @property {number} totalRooms
 * @property {number} checkedRooms
 * @property {number} pendingRooms
 * @property {number} completionPercent
 */

/**
 * @typedef {object} ExecutiveCompletionBundle
 * @property {ExecutiveCompletionStatus} status
 * @property {Array<{ classKey: string, displayLabel: string }>} pendingRooms
 * @property {{ classKey: string, displayLabel: string, teacherName: string, timestamp: string|null }} lastCompleted
 * @property {{ level: string, messageKey: string, count?: number, percent?: number, holidayName?: string }} operationalStatus
 * @property {boolean} attendanceRequired
 * @property {import('../../utils/schoolHolidays.js').SchoolHoliday|null} holiday
 */

/**
 * Build completion snapshot from an in-memory day context.
 * Room submission flags are never rewritten for non-attendance days.
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} context
 * @param {import('../appSettingsService.js').AppSettings} [settings]
 */
export function buildCompletionMeta(context, settings = getAppSettings()) {
  const attendanceRequired = isAttendanceRequiredDate(context.date, settings);
  const holiday = getSchoolHoliday(context.date, settings);
  const roomStates = context.roomStates;
  const status = attendanceRequired
    ? summarizeRoomCompletion(roomStates)
    : summarizeNonRequiredAttendanceDay(roomStates);
  const pendingRooms = attendanceRequired ? listPendingRooms(roomStates) : [];
  const lastCompleted = findLastCompletedRoom(roomStates);
  const operationalStatus = attendanceRequired
    ? deriveOperationalStatus(status)
    : {
        level: 'ok',
        messageKey: holiday
          ? 'executive.completion.statusHoliday'
          : 'executive.completion.statusNonSchoolDay',
        holidayName: holiday?.name || ''
      };

  return {
    status,
    pendingRooms,
    lastCompleted,
    operationalStatus,
    attendanceRequired,
    holiday
  };
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 * @returns {Promise<ExecutiveCompletionStatus>}
 */
export async function getCompletionStatus(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return buildCompletionMeta(context).status;
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 */
export async function getPendingRooms(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return buildCompletionMeta(context).pendingRooms;
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 */
export async function getLastCompletedRoom(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return buildCompletionMeta(context).lastCompleted;
}

/**
 * Full completion snapshot for the command-center UI (single context pass).
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 * @returns {Promise<ExecutiveCompletionBundle>}
 */
export async function getCompletionBundle(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return buildCompletionMeta(context);
}
