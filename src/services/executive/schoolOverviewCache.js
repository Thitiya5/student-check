/**
 * School Overview cache — memory + sessionStorage, keyed by attendance date.
 * Reduces repeated GAS roster + Firestore school-wide reads within TTL.
 */

/** @typedef {'memory' | 'sessionStorage'} SchoolOverviewCacheSource */

/** @typedef {object} SchoolOverviewCacheEntry
 * @property {Array<object>} roster
 * @property {Array<object>} allRows
 * @property {number} cachedAt
 */

/** @typedef {SchoolOverviewCacheEntry & { fromCache: true, source: SchoolOverviewCacheSource }} SchoolOverviewCacheHit */

export const SCHOOL_OVERVIEW_CACHE_TTL_MS = 3 * 60 * 1000;

const SESSION_STORAGE_PREFIX = 'student-check-school-overview-';

/** @type {Map<string, SchoolOverviewCacheEntry>} */
const memoryCache = new Map();

/** @type {Map<string, Promise<SchoolOverviewCacheEntry>>} */
const inflightFetches = new Map();

/**
 * @param {string} date
 */
function normalizeDateKey(date) {
  return String(date || '').trim();
}

/**
 * @param {number} cachedAt
 */
function isFresh(cachedAt) {
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < SCHOOL_OVERVIEW_CACHE_TTL_MS;
}

/**
 * @param {string} date
 * @returns {SchoolOverviewCacheEntry|null}
 */
function readSessionEntry(date) {
  const key = normalizeDateKey(date);
  if (!key) return null;

  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      !Array.isArray(parsed.roster) ||
      !Array.isArray(parsed.allRows) ||
      !isFresh(parsed.cachedAt)
    ) {
      sessionStorage.removeItem(SESSION_STORAGE_PREFIX + key);
      return null;
    }
    return {
      roster: parsed.roster,
      allRows: parsed.allRows,
      cachedAt: parsed.cachedAt
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} date
 * @param {SchoolOverviewCacheEntry} entry
 */
function writeSessionEntry(date, entry) {
  const key = normalizeDateKey(date);
  if (!key) return;

  try {
    sessionStorage.setItem(SESSION_STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded — memory cache still helps this tab session.
  }
}

/**
 * Immediate cache read (memory → sessionStorage). No network.
 * @param {string} date
 * @returns {SchoolOverviewCacheHit|null}
 */
export function peekSchoolOverviewCache(date) {
  const key = normalizeDateKey(date);
  if (!key) return null;

  const memory = memoryCache.get(key);
  if (memory && isFresh(memory.cachedAt)) {
    return { ...memory, fromCache: true, source: 'memory' };
  }

  const session = readSessionEntry(key);
  if (!session) return null;

  memoryCache.set(key, session);
  return { ...session, fromCache: true, source: 'sessionStorage' };
}

/**
 * @param {string} date
 * @returns {{ cached: boolean, ageMs: number|null, source: SchoolOverviewCacheSource|null }}
 */
export function getSchoolOverviewCacheMeta(date) {
  const hit = peekSchoolOverviewCache(date);
  if (!hit) {
    return { cached: false, ageMs: null, source: null };
  }
  return {
    cached: true,
    ageMs: Date.now() - hit.cachedAt,
    source: hit.source
  };
}

/**
 * @param {string} date
 * @param {{ roster: Array<object>, allRows: Array<object> }} payload
 */
export function setSchoolOverviewCache(date, { roster, allRows }) {
  const key = normalizeDateKey(date);
  if (!key) return;

  const entry = {
    roster: Array.isArray(roster) ? roster : [],
    allRows: Array.isArray(allRows) ? allRows : [],
    cachedAt: Date.now()
  };

  memoryCache.set(key, entry);
  writeSessionEntry(key, entry);
}

/**
 * @param {string} [date] Omit to clear all cached dates.
 */
export function clearSchoolOverviewCache(date) {
  if (date) {
    const key = normalizeDateKey(date);
    memoryCache.delete(key);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_PREFIX + key);
    } catch {
      // ignore
    }
    return;
  }

  memoryCache.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const storageKey = sessionStorage.key(i);
      if (storageKey?.startsWith(SESSION_STORAGE_PREFIX)) {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Dedupe concurrent fetches for the same date within one tab.
 * @param {string} date
 * @param {() => Promise<{ roster: Array<object>, allRows: Array<object> }>} fetcher
 * @returns {Promise<SchoolOverviewCacheEntry>}
 */
export async function fetchSchoolOverviewWithCache(date, fetcher, { forceRefresh = false } = {}) {
  const key = normalizeDateKey(date);
  if (!key) {
    throw new Error('School overview cache requires a date');
  }

  if (!forceRefresh) {
    const cached = peekSchoolOverviewCache(key);
    if (cached) {
      return {
        roster: cached.roster,
        allRows: cached.allRows,
        cachedAt: cached.cachedAt
      };
    }
  } else {
    clearSchoolOverviewCache(key);
  }

  const inflight = inflightFetches.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const { roster, allRows } = await fetcher();
    const entry = {
      roster: Array.isArray(roster) ? roster : [],
      allRows: Array.isArray(allRows) ? allRows : [],
      cachedAt: Date.now()
    };
    setSchoolOverviewCache(key, entry);
    return entry;
  })().finally(() => {
    inflightFetches.delete(key);
  });

  inflightFetches.set(key, promise);
  return promise;
}
