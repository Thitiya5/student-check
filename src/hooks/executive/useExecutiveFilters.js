/**
 * Sprint 1 — filter state for executive dashboard (UI only).
 */

import { getTodayDate } from '../../utils/dateIso.js';

/**
 * @typedef {object} ExecutiveFilters
 * @property {string} date
 * @property {string} month
 * @property {string} semester
 * @property {string} academicYear
 * @property {string} grade
 * @property {string} room
 */

/**
 * @param {Partial<ExecutiveFilters>} [initial]
 */
export function createExecutiveFilters(initial = {}) {
  const today = getTodayDate();
  /** @type {ExecutiveFilters} */
  const state = {
    date: initial.date || today,
    month: initial.month || today.slice(0, 7),
    semester: initial.semester || '1',
    academicYear: initial.academicYear || String(Number(today.slice(0, 4)) + 543),
    grade: initial.grade || '',
    room: initial.room || ''
  };

  /** @type {(() => void) | null} */
  let listener = null;

  return {
    getState() {
      return { ...state };
    },
    /**
     * @param {Partial<ExecutiveFilters>} patch
     */
    setState(patch) {
      Object.assign(state, patch);
      listener?.();
    },
    /**
     * @param {() => void} fn
     */
    subscribe(fn) {
      listener = fn;
    }
  };
}
