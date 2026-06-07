import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { DEFAULT_APP_SETTINGS } from '../config/appSettingsDefaults.js';
import { formatDateInBangkok, isIsoDateKey, parseIsoDateKeys } from '../utils/dateIso.js';

const COLLECTION = 'app_settings';
const DOC_ID = 'school';
const CACHE_KEY = 'student_check_app_settings_v1';

/** @typedef {typeof DEFAULT_APP_SETTINGS} AppSettings */

/** @type {AppSettings|null} */
let memoryCache = null;

/** True after Firestore (or explicit force reload) has been fetched at least once. */
let firestoreSettingsLoaded = false;

/** @param {unknown} value */
function coerceEnabledFlag(value, fallback = true) {
  if (value === false || value === 0 || value === '0') return false;
  if (value === 'false' || value === 'off' || value === 'no') return false;
  if (value === true || value === 1 || value === '1') return true;
  if (value === 'true' || value === 'on' || value === 'yes') return true;
  if (value == null) return fallback;
  return Boolean(value);
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return structuredClone(base);
  const out = structuredClone(base);
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key], val);
    } else if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {AppSettings}
 */
export function normalizeAppSettings(raw) {
  const merged = deepMerge(DEFAULT_APP_SETTINGS, raw && typeof raw === 'object' ? raw : {});

  merged.attendance.enabled = coerceEnabledFlag(
    merged.attendance.enabled,
    DEFAULT_APP_SETTINGS.attendance.enabled
  );
  merged.attendance.absentDeduction = Math.max(0, Number(merged.attendance.absentDeduction) || 0);
  merged.attendance.lateDeduction = Math.max(0, Number(merged.attendance.lateDeduction) || 0);
  const rawAttStart = merged.attendance.startDate;
  merged.attendance.startDate = isIsoDateKey(rawAttStart)
    ? String(rawAttStart).trim()
    : DEFAULT_APP_SETTINGS.attendance.startDate;

  merged.discipline.enabled = coerceEnabledFlag(
    merged.discipline.enabled,
    DEFAULT_APP_SETTINGS.discipline.enabled
  );
  const rawStart = merged.discipline.startDate;
  merged.discipline.startDate = isIsoDateKey(rawStart)
    ? String(rawStart).trim()
    : DEFAULT_APP_SETTINGS.discipline.startDate;
  merged.discipline.uniformDeduction = Math.max(0, Number(merged.discipline.uniformDeduction) || 0);
  merged.discipline.hairDeduction = Math.max(0, Number(merged.discipline.hairDeduction) || 0);
  merged.discipline.nailsDeduction = Math.max(0, Number(merged.discipline.nailsDeduction) || 0);
  merged.discipline.accessoryDeduction = Math.max(0, Number(merged.discipline.accessoryDeduction) || 0);
  merged.discipline.goodBehaviorReward = Math.max(0, Number(merged.discipline.goodBehaviorReward) || 0);
  merged.discipline.badBehaviorDeduction = Math.max(0, Number(merged.discipline.badBehaviorDeduction) || 0);

  const mode = merged.inspection.mode;
  merged.inspection.mode =
    mode === 'weekly' || mode === 'custom' ? mode : 'monthly';
  merged.inspection.inspectionDayType =
    merged.inspection.inspectionDayType === 'day_of_month'
      ? 'day_of_month'
      : 'first_school_day';
  merged.inspection.dayOfMonth = Math.min(
    31,
    Math.max(1, Number(merged.inspection.dayOfMonth) || 5)
  );
  merged.inspection.dayOfWeek = Math.min(
    7,
    Math.max(1, Number(merged.inspection.dayOfWeek) || 1)
  );
  merged.inspection.customDates = Array.isArray(merged.inspection.customDates)
    ? parseIsoDateKeys(merged.inspection.customDates.join('\n'))
    : [];
  const kickoffDate = String(merged.discipline.startDate || '').trim();
  if (kickoffDate && !merged.inspection.customDates.includes(kickoffDate)) {
    merged.inspection.customDates.push(kickoffDate);
    merged.inspection.customDates.sort();
  }

  merged.attendanceWarning.thresholdPercent = Math.min(
    100,
    Math.max(0, Number(merged.attendanceWarning.thresholdPercent) || 60)
  );

  merged.scoring.startingScore = Math.max(
    1,
    Number(merged.scoring.startingScore) || DEFAULT_APP_SETTINGS.scoring.startingScore
  );
  merged.scoring.communityServiceThreshold = Math.min(
    merged.scoring.startingScore,
    Math.max(0, Number(merged.scoring.communityServiceThreshold) ?? DEFAULT_APP_SETTINGS.scoring.communityServiceThreshold)
  );

  return merged;
}

function readLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return normalizeAppSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalCache(settings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[settings] local cache write failed', err);
  }
}

/**
 * Synchronous access to cached settings (defaults if not loaded yet).
 * @returns {AppSettings}
 */
export function getAppSettings() {
  if (!memoryCache) {
    memoryCache = readLocalCache() || normalizeAppSettings(null);
  }
  return memoryCache;
}

/**
 * @param {AppSettings} settings
 */
function setMemoryCache(settings) {
  memoryCache = normalizeAppSettings(settings);
  writeLocalCache(memoryCache);
}

/**
 * Load settings from Firestore (falls back to cache / defaults).
 * @param {{ force?: boolean }} [opts]
 */
export async function initAppSettings(opts = {}) {
  if (firestoreSettingsLoaded && memoryCache && !opts.force) return memoryCache;

  if (opts.force) {
    firestoreSettingsLoaded = false;
  }

  const cached = readLocalCache();
  if (!memoryCache) {
    memoryCache = cached || normalizeAppSettings(null);
  }

  try {
    const ref = doc(db, COLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    let data = snap.exists() ? snap.data() : null;

    if (!data) {
      const legacyRef = doc(db, COLLECTION, 'inspection_schedule');
      const legacySnap = await getDoc(legacyRef);
      const legacyDates = legacySnap.data()?.dates;
      if (Array.isArray(legacyDates) && legacyDates.length) {
        data = deepMerge(DEFAULT_APP_SETTINGS, {
          inspection: {
            mode: 'custom',
            customDates: legacyDates.map(String).filter(Boolean)
          }
        });
      }
    }

    const normalized = normalizeAppSettings(data);
    setMemoryCache(normalized);
    firestoreSettingsLoaded = true;
    return normalized;
  } catch (err) {
    console.warn('[settings] Firestore load failed, using cache/defaults', err);
    if (!memoryCache) {
      memoryCache = cached || normalizeAppSettings(null);
    }
    return memoryCache;
  }
}

/**
 * @param {AppSettings} settings
 */
export async function saveAppSettings(settings) {
  const normalized = normalizeAppSettings(settings);
  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(
    ref,
    {
      ...normalized,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
  setMemoryCache(normalized);
  firestoreSettingsLoaded = true;
  return normalized;
}

export function getDefaultAppSettings() {
  return normalizeAppSettings(null);
}

export function getStartingScore() {
  return getAppSettings().scoring.startingScore;
}

export function getCommunityServiceThreshold() {
  return getAppSettings().scoring.communityServiceThreshold;
}

export function getDisciplineStartDate() {
  return getAppSettings().discipline.startDate;
}

export function getParentMeetingThresholdPercent() {
  return getAppSettings().attendanceWarning.thresholdPercent;
}

export function isAttendanceScoringEnabled() {
  return getAppSettings().attendance.enabled;
}

export function getAttendanceScoringStartDate() {
  return getAppSettings().attendance.startDate;
}

/**
 * Whether absent/late point deductions apply on this date.
 * @param {string} [date] yyyy-MM-dd
 */
export function canApplyAttendancePenaltyOnDate(date) {
  if (!isAttendanceScoringEnabled()) return false;
  const start = getAttendanceScoringStartDate();
  return !start || String(date || '') >= start;
}

export function isDisciplineScoringEnabled() {
  return getAppSettings().discipline.enabled;
}

/**
 * @param {string} [date] yyyy-MM-dd
 */
export function isDisciplineActiveDate(date) {
  const d = getAppSettings().discipline;
  if (!d.enabled) return false;
  return String(date || '') >= d.startDate;
}

/**
 * Whether teachers can record discipline/behavior on attendance (check) or sync points.
 * True on inspection days even before discipline.startDate.
 * @param {string} [date] yyyy-MM-dd
 * @param {AppSettings} [settings]
 */
export function canRecordDisciplineOnDate(date, settings = getAppSettings()) {
  if (!settings.discipline.enabled) return false;
  const dateStr = String(date || '');
  if (!dateStr) return false;
  if (dateStr >= settings.discipline.startDate) return true;
  return isInspectionDayFromSettings(dateStr, settings);
}

/**
 * Show discipline chips + inspection banner on the check page (inspection days only).
 * @param {string} [date] yyyy-MM-dd
 * @param {AppSettings} [settings]
 */
export function canShowDisciplineOnCheck(date, settings = getAppSettings()) {
  if (!settings.discipline.enabled) return false;
  const dateStr = String(date || '');
  if (!dateStr) return false;
  return isInspectionDayFromSettings(dateStr, settings);
}

/**
 * Active discipline rule ids from configured deduction amounts (ignores enabled flag).
 * Used for absent-on-inspection auto-fail when settings cache may be stale.
 * @param {AppSettings} [settings]
 * @returns {string[]}
 */
export function getDisciplineDeductionRuleIds(settings = getAppSettings()) {
  const d = settings.discipline;
  /** @type {string[]} */
  const ids = [];
  if (Math.abs(Number(d.uniformDeduction) || 0) > 0) ids.push('uniform');
  if (Math.abs(Number(d.hairDeduction) || 0) > 0) ids.push('hair');
  if (Math.abs(Number(d.nailsDeduction) || 0) > 0) ids.push('nails');
  if (Math.abs(Number(d.accessoryDeduction) || 0) > 0) ids.push('accessories');
  return ids;
}

/**
 * @param {string} flagId
 */
export function getDisciplineDeductionPoints(flagId) {
  const d = getAppSettings().discipline;
  const map = {
    uniform: d.uniformDeduction,
    hair: d.hairDeduction,
    nails: d.nailsDeduction,
    accessories: d.accessoryDeduction
  };
  const amount = Math.abs(Number(map[flagId]) || 0);
  return amount > 0 ? -amount : 0;
}

export function getBehaviorGoodPoints() {
  return Math.abs(getAppSettings().discipline.goodBehaviorReward);
}

export function getBehaviorBadPoints() {
  return -Math.abs(getAppSettings().discipline.badBehaviorDeduction);
}

/**
 * @param {string} status
 */
export function getAttendancePenaltyPoints(status) {
  const att = getAppSettings().attendance;
  if (!att.enabled) return 0;
  if (status === 'absent') return -Math.abs(att.absentDeduction);
  if (status === 'late') return -Math.abs(att.lateDeduction);
  return 0;
}

/**
 * @returns {Array<{ id: string, labelKey: string, points: number }>}
 */
export function getDisciplineCheckRules() {
  const d = getAppSettings().discipline;
  if (!d.enabled) return [];
  return [
    { id: 'uniform', labelKey: 'discipline.uniform', points: -Math.abs(d.uniformDeduction) },
    { id: 'hair', labelKey: 'discipline.hair', points: -Math.abs(d.hairDeduction) },
    { id: 'nails', labelKey: 'discipline.nails', points: -Math.abs(d.nailsDeduction) },
    {
      id: 'accessories',
      labelKey: 'discipline.accessories',
      points: -Math.abs(d.accessoryDeduction)
    }
  ].filter((r) => r.points !== 0);
}

/**
 * @returns {Array<{ id: string, labelKey: string, points: number }>}
 */
export function getBehaviorKindRules() {
  const d = getAppSettings().discipline;
  if (!d.enabled) return [];
  return [
    { id: 'good', labelKey: 'discipline.goodDeed', points: getBehaviorGoodPoints() },
    { id: 'bad', labelKey: 'discipline.badDeed', points: getBehaviorBadPoints() }
  ];
}

/**
 * @param {string} yearMonth YYYY-MM
 */
export function getFirstSchoolDayOfMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  for (let day = 1; day <= 31; day += 1) {
    const dt = new Date(y, m - 1, day);
    if (dt.getMonth() !== m - 1) break;
    const dow = dt.getDay();
    if (dow >= 1 && dow <= 5) {
      return formatDateInBangkok(dt);
    }
  }
  return `${yearMonth}-01`;
}

/**
 * Monthly inspection date for a calendar month (first school day, or discipline start if later in kickoff month).
 * @param {string} yearMonth YYYY-MM
 * @param {AppSettings} [settings]
 */
export function getMonthlyInspectionDate(yearMonth, settings = getAppSettings()) {
  const insp = settings.inspection;
  if (insp.inspectionDayType === 'day_of_month') {
    return `${yearMonth}-${String(insp.dayOfMonth).padStart(2, '0')}`;
  }
  const firstSchool = getFirstSchoolDayOfMonth(yearMonth);
  const startDate = String(settings.discipline?.startDate || '');
  if (startDate && startDate.slice(0, 7) === yearMonth && startDate > firstSchool) {
    return startDate;
  }
  return firstSchool;
}

/**
 * @param {string} date yyyy-MM-dd
 * @param {AppSettings} [settings]
 */
export function isInspectionDayFromSettings(date, settings = getAppSettings()) {
  const insp = settings.inspection;
  const dateStr = String(date || '');
  if (!dateStr) return false;

  const kickoffDate = String(settings.discipline?.startDate || '').trim();
  if (kickoffDate && dateStr === kickoffDate) {
    return true;
  }

  if (insp.mode === 'custom') {
    return (insp.customDates || []).includes(dateStr);
  }

  if (insp.mode === 'weekly') {
    const dt = new Date(`${dateStr}T12:00:00`);
    const jsDow = dt.getDay();
    const target = insp.dayOfWeek ?? 1;
    const targetJs = target >= 1 && target <= 5 ? target : 1;
    return jsDow === targetJs;
  }

  if (insp.inspectionDayType === 'day_of_month') {
    return Number(dateStr.slice(8, 10)) === insp.dayOfMonth;
  }

  const yearMonth = dateStr.slice(0, 7);
  if (dateStr === getMonthlyInspectionDate(yearMonth, settings)) {
    return true;
  }

  // Monthly on the same day-of-month as discipline.startDate (e.g. every 5th after kickoff).
  if (kickoffDate && dateStr >= kickoffDate) {
    const startDom = Number(kickoffDate.slice(8, 10));
    if (startDom && Number(dateStr.slice(8, 10)) === startDom) {
      return true;
    }
  }

  if (insp.dayOfMonth && Number(dateStr.slice(8, 10)) === insp.dayOfMonth) {
    return true;
  }

  return false;
}

/**
 * @param {AppSettings} [settings]
 * @returns {string[]}
 */
export function listUpcomingInspectionDates(settings = getAppSettings(), monthsAhead = 3) {
  const insp = settings.inspection;
  if (insp.mode === 'custom') {
    return [...(insp.customDates || [])].sort();
  }

  const dates = new Set();
  const now = new Date();
  for (let m = 0; m < monthsAhead; m += 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const ym = formatDateInBangkok(dt).slice(0, 7);
    if (insp.mode === 'weekly') {
      for (let day = 1; day <= 31; day += 1) {
        const d = new Date(dt.getFullYear(), dt.getMonth(), day);
        if (d.getMonth() !== dt.getMonth()) break;
        const key = formatDateInBangkok(d);
        if (isInspectionDayFromSettings(key, settings)) dates.add(key);
      }
    } else {
      dates.add(getMonthlyInspectionDate(ym, settings));
    }
  }
  return [...dates].sort();
}

/**
 * All inspection dates within an inclusive yyyy-MM-dd range.
 * @param {string} from
 * @param {string} to
 * @param {AppSettings} [settings]
 * @returns {string[]}
 */
export function listInspectionDatesInRange(from, to, settings = getAppSettings()) {
  const start = String(from || '').trim();
  const end = String(to || '').trim();
  if (!start || !end || start > end) return [];

  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    if (isInspectionDayFromSettings(cursor, settings)) dates.push(cursor);
    const next = new Date(`${cursor}T12:00:00`);
    next.setDate(next.getDate() + 1);
    cursor = formatDateInBangkok(next);
  }
  return dates;
}
