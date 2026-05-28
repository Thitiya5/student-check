import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { DEFAULT_APP_SETTINGS } from '../config/appSettingsDefaults.js';
import { formatDateInBangkok, parseIsoDateKeys } from '../utils/dateIso.js';

const COLLECTION = 'app_settings';
const DOC_ID = 'school';
const CACHE_KEY = 'student_check_app_settings_v1';

/** @typedef {typeof DEFAULT_APP_SETTINGS} AppSettings */

/** @type {AppSettings|null} */
let memoryCache = null;

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

  merged.attendance.enabled = Boolean(merged.attendance.enabled);
  merged.attendance.absentDeduction = Math.max(0, Number(merged.attendance.absentDeduction) || 0);
  merged.attendance.lateDeduction = Math.max(0, Number(merged.attendance.lateDeduction) || 0);

  merged.discipline.enabled = Boolean(merged.discipline.enabled);
  merged.discipline.startDate = String(merged.discipline.startDate || DEFAULT_APP_SETTINGS.discipline.startDate);
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

  merged.attendanceWarning.thresholdPercent = Math.min(
    100,
    Math.max(0, Number(merged.attendanceWarning.thresholdPercent) || 60)
  );

  merged.scoring.startingScore = Math.max(
    1,
    Number(merged.scoring.startingScore) || DEFAULT_APP_SETTINGS.scoring.startingScore
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
  if (memoryCache && !opts.force) return memoryCache;

  const cached = readLocalCache();
  if (cached && !opts.force) {
    memoryCache = cached;
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
  return normalized;
}

export function getDefaultAppSettings() {
  return normalizeAppSettings(null);
}

export function getStartingScore() {
  return getAppSettings().scoring.startingScore;
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
 * @param {string} date yyyy-MM-dd
 * @param {AppSettings} [settings]
 */
export function isInspectionDayFromSettings(date, settings = getAppSettings()) {
  const insp = settings.inspection;
  const dateStr = String(date || '');

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
  return dateStr === getFirstSchoolDayOfMonth(yearMonth);
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
      let key = '';
      if (insp.inspectionDayType === 'day_of_month') {
        key = `${ym}-${String(insp.dayOfMonth).padStart(2, '0')}`;
      } else {
        key = getFirstSchoolDayOfMonth(ym);
      }
      dates.add(key);
    }
  }
  return [...dates].sort();
}
