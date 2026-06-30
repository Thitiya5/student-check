/**
 * Sprint 2.5 — Classroom attendance completion (read-only, in-memory aggregation).
 */
import { fetchExecutiveDayContext } from './executiveDayContext.js';
import {
  deriveOperationalStatus,
  findLastCompletedRoom,
  listPendingRooms,
  summarizeRoomCompletion
} from '../../utils/executive/executiveCompletionAggregates.js';

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
 * @property {{ level: string, messageKey: string, count?: number, percent?: number }} operationalStatus
 */

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 * @returns {Promise<ExecutiveCompletionStatus>}
 */
export async function getCompletionStatus(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return summarizeRoomCompletion(context.roomStates);
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 */
export async function getPendingRooms(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return listPendingRooms(context.roomStates);
}

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, grade?: string, room?: string }} [opts]
 * @param {import('./executiveDayContext.js').ExecutiveDayContext} [ctx]
 */
export async function getLastCompletedRoom(session, opts = {}, ctx) {
  const context = ctx || (await fetchExecutiveDayContext(session, opts));
  return findLastCompletedRoom(context.roomStates);
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
  const status = summarizeRoomCompletion(context.roomStates);
  const pendingRooms = listPendingRooms(context.roomStates);
  const lastCompleted = findLastCompletedRoom(context.roomStates);
  const operationalStatus = deriveOperationalStatus(status);

  return {
    status,
    pendingRooms,
    lastCompleted,
    operationalStatus
  };
}
