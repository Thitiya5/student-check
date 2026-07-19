/**
 * Discipline report cache — memory + sessionStorage.
 * Overview keyed by yearMonth + session scope; detail keyed by class + inspection date.
 */

import { getViewClassKeys, isSchoolWideViewSession } from '../teacherAuth.js';

export const DISCIPLINE_REPORT_CACHE_TTL_MS = 4 * 60 * 1000;

const SESSION_PREFIX = 'student-check-discipline-';

/** @type {Map<string, { payload: object, cachedAt: number }>} */
const memoryCache = new Map();

/** @type {Map<string, Promise<object>>} */
const inflightFetches = new Map();

/**
 * @param {import('../teacherAuth.js').TeacherAuthSession|null} session
 */
export function disciplineScopeKey(session) {
  if (!session) return 'anonymous';
  if (isSchoolWideViewSession(session)) return 'school-wide';
  const keys = getViewClassKeys(session);
  return keys.length ? keys.slice().sort().join('|') : 'none';
}

/**
 * @param {string} yearMonth
 * @param {import('../teacherAuth.js').TeacherAuthSession|null} session
 */
export function disciplineOverviewCacheKey(yearMonth, session) {
  return `overview:${String(yearMonth || '').trim()}::${disciplineScopeKey(session)}`;
}

/**
 * @param {string} classKey
 * @param {string} inspectionDate
 */
export function disciplineDetailCacheKey(classKey, inspectionDate) {
  return `detail:${String(classKey || '').trim()}::${String(inspectionDate || '').trim()}`;
}

/**
 * @param {number} cachedAt
 */
function isFresh(cachedAt) {
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < DISCIPLINE_REPORT_CACHE_TTL_MS;
}

/**
 * @param {string} key
 */
function readSessionEntry(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.payload || !isFresh(parsed.cachedAt)) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {object} payload
 */
function writeSessionEntry(key, payload) {
  try {
    sessionStorage.setItem(
      SESSION_PREFIX + key,
      JSON.stringify({ payload, cachedAt: Date.now() })
    );
  } catch {
    // Quota — memory tier still helps this tab.
  }
}

/**
 * @param {string} key
 * @returns {object|null}
 */
export function peekDisciplineReportCache(key) {
  const normalized = String(key || '').trim();
  if (!normalized) return null;

  const memory = memoryCache.get(normalized);
  if (memory && isFresh(memory.cachedAt)) {
    return memory.payload;
  }

  const session = readSessionEntry(normalized);
  if (!session) return null;

  memoryCache.set(normalized, session);
  return session.payload;
}

/**
 * @param {string} key
 * @param {object} payload
 */
export function setDisciplineReportCache(key, payload) {
  const normalized = String(key || '').trim();
  if (!normalized) return;

  const entry = { payload, cachedAt: Date.now() };
  memoryCache.set(normalized, entry);
  writeSessionEntry(normalized, payload);
}

/**
 * @param {{ inspectionDate?: string, classKey?: string, yearMonth?: string, session?: import('../teacherAuth.js').TeacherAuthSession|null }} [opts]
 */
export function clearDisciplineReportCache(opts = {}) {
  const { inspectionDate, classKey, yearMonth, session } = opts;

  if (classKey && inspectionDate) {
    const detailKey = disciplineDetailCacheKey(classKey, inspectionDate);
    memoryCache.delete(detailKey);
    try {
      sessionStorage.removeItem(SESSION_PREFIX + detailKey);
    } catch {
      // ignore
    }
  }

  if (yearMonth && session) {
    const overviewKey = disciplineOverviewCacheKey(yearMonth, session);
    memoryCache.delete(overviewKey);
    try {
      sessionStorage.removeItem(SESSION_PREFIX + overviewKey);
    } catch {
      // ignore
    }
  }

  if (inspectionDate && !classKey) {
    const suffix = `::${String(inspectionDate).trim()}`;
    for (const key of [...memoryCache.keys()]) {
      if (key.startsWith('detail:') && key.endsWith(suffix)) {
        memoryCache.delete(key);
      }
    }
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const storageKey = sessionStorage.key(i);
        if (storageKey?.startsWith(SESSION_PREFIX + 'detail:') && storageKey.endsWith(suffix)) {
          sessionStorage.removeItem(storageKey);
        }
      }
    } catch {
      // ignore
    }
  }

  if (!inspectionDate && !classKey && !yearMonth) {
    memoryCache.clear();
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const storageKey = sessionStorage.key(i);
        if (storageKey?.startsWith(SESSION_PREFIX)) {
          sessionStorage.removeItem(storageKey);
        }
      }
    } catch {
      // ignore
    }
  }
}

/**
 * @param {string} key
 * @param {() => Promise<object>} fetcher
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function fetchDisciplineReportWithCache(key, fetcher, { forceRefresh = false } = {}) {
  const normalized = String(key || '').trim();
  if (!normalized) {
    throw new Error('Discipline report cache requires a key');
  }

  if (!forceRefresh) {
    const cached = peekDisciplineReportCache(normalized);
    if (cached) return cached;
  } else {
    memoryCache.delete(normalized);
    try {
      sessionStorage.removeItem(SESSION_PREFIX + normalized);
    } catch {
      // ignore
    }
  }

  const inflight = inflightFetches.get(normalized);
  if (inflight) return inflight;

  const promise = fetcher()
    .then((payload) => {
      setDisciplineReportCache(normalized, payload);
      return payload;
    })
    .finally(() => {
      inflightFetches.delete(normalized);
    });

  inflightFetches.set(normalized, promise);
  return promise;
}
