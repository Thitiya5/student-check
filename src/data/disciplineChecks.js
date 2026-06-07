import { normalizeAttendanceStatus } from './attendanceStatuses.js';
import {
  getDisciplineCheckRules,
  getBehaviorKindRules,
  getAttendancePenaltyPoints,
  getDisciplineDeductionPoints,
  getDisciplineDeductionRuleIds,
  getBehaviorGoodPoints,
  getBehaviorBadPoints,
  canRecordDisciplineOnDate,
  isInspectionDayFromSettings
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
 * Resolve discipline flags before save / point sync.
 * Absent on an inspection day always gets every active discipline rule.
 * @param {string} status
 * @param {string} date yyyy-MM-dd
 * @param {string[]} [rawFlags]
 */
export function resolveDisciplineFlagsForScoring(status, date, rawFlags = [], opts = {}) {
  const key = normalizeAttendanceStatus(status);
  const flags = normalizeDisciplineFlags(rawFlags);
  if (opts.disciplineWaived) return flags;
  if (key !== 'absent') return flags;
  if (shouldApplyInspectionAutoFail(status, date, flags, opts)) {
    const fromRules = getDisciplineChecks().map((r) => r.id);
    const all = fromRules.length ? fromRules : getDisciplineDeductionRuleIds();
    if (all.length) return all;
  }
  return flags;
}

/**
 * Whether discipline deductions should be forced (all rules) for this student/day.
 * @param {string} status
 * @param {string} date yyyy-MM-dd
 * @param {string[]} [rawFlags]
 */
export function shouldApplyInspectionAutoFail(status, date, rawFlags = [], opts = {}) {
  if (opts.disciplineWaived) return false;
  const key = normalizeAttendanceStatus(status);
  if (key !== 'absent') return false;
  const flags = normalizeDisciplineFlags(rawFlags);
  const deductionIds = getDisciplineDeductionRuleIds();
  if (deductionIds.length > 0 && deductionIds.every((id) => flags.includes(id))) return true;
  if (isInspectionDayFromSettings(date)) {
    return deductionIds.length > 0 || getDisciplineChecks().length > 0;
  }
  if (!canRecordDisciplineOnDate(date)) return false;
  const rules = getDisciplineChecks();
  return rules.length > 0 && rules.every((r) => flags.includes(r.id));
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
 * Signed points for one behavior entry (custom or default from settings).
 * @param {{ kind?: string, points?: number }} behavior
 * @param {'good'|'bad'|string} [kind]
 */
export function resolveBehaviorEntryPoints(behavior = {}, kind = behavior?.kind) {
  const k = kind || behavior?.kind;
  const raw = Number(behavior?.points);
  if (Number.isFinite(raw) && raw !== 0) {
    return k === 'bad' ? -Math.abs(raw) : Math.abs(raw);
  }
  if (k === 'good') return getBehaviorGoodPoints();
  if (k === 'bad') return getBehaviorBadPoints();
  return 0;
}

/**
 * @param {{ flags?: string[], behaviors?: Array<{ kind: string, note?: string, points?: number }> }} entry
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
    total += resolveBehaviorEntryPoints(b);
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
    return { flags: [], behaviors: [], note: '', disciplineWaived: false };
  }
  const rawFlags = Array.isArray(raw.flags)
    ? raw.flags.map((f) => String(f)).filter(Boolean)
    : Array.isArray(raw.disciplineFlags)
      ? raw.disciplineFlags.map((f) => String(f)).filter(Boolean)
      : [];
  const flags = normalizeDisciplineFlags(rawFlags);

  /** @type {Array<{ kind: string, note: string, points?: number }>} */
  let behaviors = [];
  const mapBehavior = (b) => {
    const kind = b.kind === 'good' || b.kind === 'bad' ? b.kind : '';
    if (!kind) return null;
    const pts = Number(b.points);
    return {
      kind,
      note: String(b.note ?? '').trim(),
      ...(Number.isFinite(pts) && pts > 0 ? { points: Math.abs(pts) } : {})
    };
  };
  if (Array.isArray(raw.behaviors)) {
    behaviors = raw.behaviors.map(mapBehavior).filter(Boolean);
  } else if (Array.isArray(raw.disciplineBehaviors)) {
    behaviors = raw.disciplineBehaviors.map(mapBehavior).filter(Boolean);
  } else if (raw.behaviorKind === 'good' || raw.behaviorKind === 'bad') {
    const pts = Number(raw.behaviorPoints ?? raw.points);
    behaviors = [
      {
        kind: raw.behaviorKind,
        note: String(raw.behaviorNote ?? raw.note ?? '').trim(),
        ...(Number.isFinite(pts) && pts > 0 ? { points: Math.abs(pts) } : {})
      }
    ];
  }

  const note = String(raw.note ?? raw.disciplineNote ?? '').trim();
  const disciplineWaived = Boolean(raw.disciplineWaived);
  return { flags, behaviors, note, disciplineWaived };
}

export function emptyDisciplineEntry() {
  return { flags: [], behaviors: [], note: '', disciplineWaived: false };
}

/**
 * Diff discipline entries for save confirmation (flags + behaviors).
 * @param {Array<{ student_id: string|number }>} students
 * @param {Record<string, { flags?: string[], behaviors?: Array<{ kind: string, note?: string, points?: number }> }>} current
 * @param {Record<string, { flags?: string[], behaviors?: Array<{ kind: string, note?: string, points?: number }> }>} baseline
 * @param {(student: { student_id: string|number }) => string} getStudentName
 * @param {{ trackFlags?: boolean, trackBehaviors?: boolean }} [opts]
 */
export function summarizeDisciplineChanges(students, current, baseline, getStudentName, opts = {}) {
  const { trackFlags = true, trackBehaviors = true } = opts;
  /** @type {Array<{ name: string, points: number, kind?: 'good'|'bad', label?: string, labelKey?: string }>} */
  const items = [];
  let totalDelta = 0;
  const rules = getDisciplineChecks();

  for (const s of students) {
    const sid = String(s.student_id);
    const now = current[sid] || emptyDisciplineEntry();
    const base = baseline[sid] || emptyDisciplineEntry();
    const name = getStudentName(s);

    if (trackFlags) {
      const baseFlags = new Set(normalizeDisciplineFlags(base.flags || []));
      const nowFlags = new Set(normalizeDisciplineFlags(now.flags || []));
      for (const id of nowFlags) {
        if (baseFlags.has(id)) continue;
        const pts = getDisciplineDeductionPoints(id);
        totalDelta += pts;
        const rule = rules.find((r) => r.id === id);
        items.push({ name, points: pts, labelKey: rule?.labelKey || id });
      }
      for (const id of baseFlags) {
        if (nowFlags.has(id)) continue;
        const pts = -getDisciplineDeductionPoints(id);
        totalDelta += pts;
        const rule = rules.find((r) => r.id === id);
        items.push({ name, points: pts, labelKey: rule?.labelKey || id });
      }
    }

    if (trackBehaviors) {
      const baseByKind = Object.fromEntries((base.behaviors || []).map((b) => [b.kind, b]));
      const nowByKind = Object.fromEntries((now.behaviors || []).map((b) => [b.kind, b]));
      for (const kind of ['good', 'bad']) {
        const bNow = nowByKind[kind];
        const bBase = baseByKind[kind];
        if (bNow && !bBase) {
          const pts = resolveBehaviorEntryPoints(bNow);
          totalDelta += pts;
          items.push({ name, points: pts, kind });
        } else if (!bNow && bBase) {
          const pts = -resolveBehaviorEntryPoints(bBase);
          totalDelta += pts;
          items.push({ name, points: pts, kind });
        } else if (bNow && bBase && JSON.stringify(bNow) !== JSON.stringify(bBase)) {
          const pts = resolveBehaviorEntryPoints(bNow) - resolveBehaviorEntryPoints(bBase);
          if (pts !== 0) {
            totalDelta += pts;
            items.push({ name, points: pts, kind });
          }
        }
      }
    }
  }

  return { items, totalDelta };
}

export function disciplineEntryToFirestore(entry = {}) {
  const flags = normalizeDisciplineFlags(Array.isArray(entry.flags) ? [...entry.flags] : []);
  const behaviors = Array.isArray(entry.behaviors)
    ? entry.behaviors
        .filter((b) => b && (b.kind === 'good' || b.kind === 'bad'))
        .map((b) => {
          const pts = Number(b.points);
          const row = { kind: b.kind, note: String(b.note ?? '').trim() };
          if (Number.isFinite(pts) && pts > 0) row.points = Math.abs(pts);
          return row;
        })
    : [];
  const note = String(entry.note ?? '').trim();
  const disciplineWaived = Boolean(entry.disciplineWaived);
  return {
    disciplineFlags: flags,
    disciplineBehaviors: behaviors,
    disciplineNote: note,
    disciplineWaived
  };
}

export { canRecordDisciplineOnDate, isDisciplineActiveDate } from '../services/appSettingsService.js';
