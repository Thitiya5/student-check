import { normalizeAttendanceStatus } from './attendanceStatuses.js';
import {
  getDisciplineCheckRules,
  getBehaviorKindRules,
  getAttendancePenaltyPoints,
  getDisciplineDeductionPoints,
  getBehaviorGoodPoints,
  getBehaviorBadPoints,
  canRecordDisciplineOnDate
} from '../services/appSettingsService.js';

/** @type {Record<string, string>} legacy Firestore flag ids */
export const DISCIPLINE_FLAG_ALIASES = {
  device: 'accessories',
  shoes: 'accessories',
  socks: 'accessories'
};

/** @returns {Array<{ id: string, labelKey: string, points: number }>} */
export function getDisciplineChecks() {
  return getDisciplineCheckRules();
}

/** @returns {Array<{ id: string, labelKey: string, points: number }>} */
export function getBehaviorKinds() {
  return getBehaviorKindRules();
}

export function getDisciplineCheckPoints(flagId) {
  return getDisciplineDeductionPoints(flagId);
}

export function getBehaviorGoodPointsValue() {
  return getBehaviorGoodPoints();
}

export function getBehaviorBadPointsValue() {
  return getBehaviorBadPoints();
}

/**
 * @param {string} status
 */
export function attendancePointPenalty(status) {
  const key = normalizeAttendanceStatus(status);
  if (key === 'absent') return getAttendancePenaltyPoints('absent');
  if (key === 'late') return getAttendancePenaltyPoints('late');
  return 0;
}

/**
 * @param {string[]} flags
 */
export function normalizeDisciplineFlags(flags = []) {
  const rules = getDisciplineCheckRules();
  const out = [];
  for (const raw of flags) {
    const id = DISCIPLINE_FLAG_ALIASES[String(raw)] || String(raw);
    if (rules.some((r) => r.id === id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * @param {number} score
 */
export function formatDisciplineScore(score) {
  const n = Number(score) || 0;
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * @param {{ flags?: string[], behaviors?: Array<{ kind: string, note?: string }> }} entry
 * @param {string} [date]
 */
export function calcDayBehaviorDelta(entry = {}, date) {
  if (!date || !canRecordDisciplineOnDate(date)) return 0;
  let total = 0;
  const flags = normalizeDisciplineFlags(entry.flags || []);
  for (const id of flags) {
    total += getDisciplineDeductionPoints(id);
  }
  for (const b of entry.behaviors || []) {
    if (b.kind === 'good') total += getBehaviorGoodPoints();
    if (b.kind === 'bad') total += getBehaviorBadPoints();
  }
  return total;
}

/** @deprecated use calcDayBehaviorDelta */
export function calcDisciplineScore(flags = [], _adjust = 0, _status, date) {
  return calcDayBehaviorDelta({ flags, behaviors: [] }, date);
}

/**
 * @param {unknown} raw
 */
export function parseDisciplineFromRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return { flags: [], behaviors: [], note: '' };
  }
  const rawFlags = Array.isArray(raw.flags)
    ? raw.flags.map((f) => String(f)).filter(Boolean)
    : Array.isArray(raw.disciplineFlags)
      ? raw.disciplineFlags.map((f) => String(f)).filter(Boolean)
      : [];
  const flags = normalizeDisciplineFlags(rawFlags);

  /** @type {Array<{ kind: string, note: string }>} */
  let behaviors = [];
  if (Array.isArray(raw.behaviors)) {
    behaviors = raw.behaviors
      .map((b) => ({
        kind: b.kind === 'good' || b.kind === 'bad' ? b.kind : '',
        note: String(b.note ?? '').trim()
      }))
      .filter((b) => b.kind);
  } else if (raw.behaviorKind === 'good' || raw.behaviorKind === 'bad') {
    behaviors = [
      {
        kind: raw.behaviorKind,
        note: String(raw.behaviorNote ?? raw.note ?? '').trim()
      }
    ];
  }

  const note = String(raw.note ?? raw.disciplineNote ?? '').trim();
  return { flags, behaviors, note };
}

export function emptyDisciplineEntry() {
  return { flags: [], behaviors: [], note: '' };
}

export function disciplineEntryToFirestore(entry = {}) {
  const flags = normalizeDisciplineFlags(Array.isArray(entry.flags) ? [...entry.flags] : []);
  const behaviors = Array.isArray(entry.behaviors)
    ? entry.behaviors
        .filter((b) => b && (b.kind === 'good' || b.kind === 'bad'))
        .map((b) => ({ kind: b.kind, note: String(b.note ?? '').trim() }))
    : [];
  const note = String(entry.note ?? '').trim();
  return {
    disciplineFlags: flags,
    disciplineBehaviors: behaviors,
    disciplineNote: note
  };
}

export { canRecordDisciplineOnDate, isDisciplineActiveDate } from '../services/appSettingsService.js';
