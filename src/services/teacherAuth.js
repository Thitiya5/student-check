/**
 * Teacher authorization — assigned classes from Google Sheets TEACHERS tab.
 */

import { buildAttendanceClassKey } from './attendanceService.js';

export const TEACHER_AUTH_STORAGE_KEY = 'student-check-teacher-auth';

const TEACHER_PREFIX = 'ครู';

/** Not valid as login unless TEACHER_NAME in sheet is exactly this */
const RESERVED_LOGIN_TERMS = new Set([
  'admin',
  'adnim',
  'administrator',
  'teacher',
  'ครู',
  'all',
  'root',
  'superuser'
]);

/** ROLE values that grant school-wide access (from TEACHERS sheet only) */
const ADMIN_ROLE_VALUES = new Set(['admin', 'adnim', 'administrator']);

/** Thai honorifics often in TEACHER_NAME column */
const THAI_HONORIFICS = ['นางสาว', 'นาง', 'นาย', 'ดร.', 'ผศ.', 'รศ.', 'ศ.', 'อ.', TEACHER_PREFIX];

/**
 * @param {string} input
 */
export function isReservedLoginTerm(input) {
  return RESERVED_LOGIN_TERMS.has(normalizeTeacherName(input).toLowerCase());
}

/**
 * @param {string} role from TEACHERS sheet ROLE column
 */
export function isAdminRoleFromSheet(role) {
  return ADMIN_ROLE_VALUES.has(String(role ?? '').trim().toLowerCase());
}

/**
 * Exact TEACHER_NAME match only (for reserved terms / strict verify).
 * @param {string} sheetName
 * @param {string} input
 */
export function teacherNamesExactMatch(sheetName, input) {
  const a = normalizeTeacherName(sheetName).toLowerCase();
  const b = normalizeTeacherName(input).toLowerCase();
  return Boolean(a && b && a === b);
}

/**
 * Normalize teacher name for login compare (trim, spaces, invisible chars).
 * @param {string} name
 * @returns {string}
 */
export function normalizeTeacherName(name) {
  return String(name ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC');
}

/**
 * Core name without นางสาว / นาย / ครู (for search).
 * @param {string} name
 */
export function getTeacherNameCore(name) {
  return stripHonorifics(normalizeTeacherName(name).toLowerCase());
}

/**
 * @param {string} name lowercased, normalized
 */
function stripHonorifics(name) {
  let s = String(name ?? '').trim();
  const sorted = [...THAI_HONORIFICS].sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const title of sorted) {
      const t = title.toLowerCase();
      if (s.startsWith(t)) {
        s = s.slice(t.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/**
 * Match login input to TEACHER_NAME in sheet.
 * - Exact / case-insensitive
 * - With or without ครู / นางสาว / นาย
 * - First name only e.g. "เกศจุฬา" → "นางสาวเกศจุฬา ภูนาเมือง"
 * @param {string} sheetName
 * @param {string} input
 */
export function teacherNamesMatch(sheetName, input) {
  const a = normalizeTeacherName(sheetName).toLowerCase();
  const b = normalizeTeacherName(input).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const aCore = stripHonorifics(a);
  const bCore = stripHonorifics(b);
  if (aCore && bCore && aCore === bCore) return true;
  if (aCore === b || bCore === a) return true;

  const aFirst = aCore.split(/\s+/)[0] || '';
  const bFirst = bCore.split(/\s+/)[0] || '';
  if (bFirst.length >= 2 && aFirst === bFirst) return true;
  if (aFirst.length >= 2 && b === aFirst) return true;

  if (b.length >= 2 && aCore.includes(b)) return true;
  if (bCore.length >= 2 && bCore.includes(aCore)) return true;

  const bWords = bCore.split(/\s+/).filter((w) => w.length >= 2);
  if (bWords.length && bWords.every((w) => aCore.includes(w))) return true;

  return false;
}

/**
 * @param {string} sheetName
 * @param {string} input
 * @returns {number} 0 = no match, higher = stronger
 */
export function teacherNameMatchScore(sheetName, input) {
  if (!teacherNamesMatch(sheetName, input)) return 0;
  const a = stripHonorifics(normalizeTeacherName(sheetName).toLowerCase());
  const b = stripHonorifics(normalizeTeacherName(input).toLowerCase());
  if (a === b) return 100;
  if (a.startsWith(b) || b.startsWith(a)) return 80;
  return 50;
}

/**
 * @typedef {object} TeacherAuthSession
 * @property {string} teacherName
 * @property {string} [username]
 * @property {string} [userId]
 * @property {string} role
 * @property {string[]} assignedClasses normalized keys e.g. ["M2/1","M2/2"] or ["ALL"]
 * @property {boolean} isAdmin
 * @property {boolean} [mustChangePin]
 */

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeClassKey(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
}

/**
 * Students sheet LEVEL uses M1, M2 — TEACHERS tab may use ม.1/1.
 * @param {string} level
 * @returns {string}
 */
export function normalizeSheetLevel(level) {
  let s = String(level ?? '').trim().replace(/\s+/g, '');
  if (!s) return '';

  const thNum = s.match(/^ม\.?(\d+)$/u);
  if (thNum) return `M${thNum[1]}`;

  const enNum = s.match(/^m\.?(\d+)$/i);
  if (enNum) return `M${enNum[1]}`;

  return s;
}

/**
 * Canonical class key for API / Firestore (M1/2).
 * @param {string} classKey
 */
export function toCanonicalClassKey(classKey) {
  const parts = classKeyToParts(classKey);
  if (!parts.room) return normalizeClassKey(classKey);
  return `${parts.level}/${parts.room}`;
}

/**
 * @param {string} a
 * @param {string} b
 */
export function classKeysMatch(a, b) {
  return toCanonicalClassKey(a) === toCanonicalClassKey(b);
}

/**
 * @param {string} raw ASSIGNED_CLASSES cell
 * @returns {string[]}
 */
export function parseAssignedClasses(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.toUpperCase() === 'ALL') return ['ALL'];
  return [...new Set(s.split(/[,;]/).map((p) => toCanonicalClassKey(p)).filter(Boolean))];
}

/**
 * @param {string} classKey e.g. M2/1
 * @returns {{ level: string, room: string }}
 */
export function classKeyToParts(classKey) {
  const key = normalizeClassKey(classKey);
  const slash = key.indexOf('/');
  if (slash < 0) return { level: normalizeSheetLevel(key), room: '' };
  return {
    level: normalizeSheetLevel(key.slice(0, slash)),
    room: key.slice(slash + 1).trim()
  };
}

/**
 * @param {TeacherAuthSession|null|undefined} session
 */
export function isAdminSession(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  if (isAdminRoleFromSheet(session.role)) return true;
  return session.assignedClasses?.some((c) => normalizeClassKey(c).toUpperCase() === 'ALL');
}

/**
 * @param {TeacherAuthSession|null|undefined} session
 * @param {string} classKey
 */
export function canAccessClass(session, classKey) {
  if (!session) return false;
  if (isAdminSession(session)) return true;
  const key = toCanonicalClassKey(classKey);
  if (!key) return false;
  return (session.assignedClasses || []).some((c) => classKeysMatch(c, key));
}

/**
 * @param {TeacherAuthSession|null|undefined} session
 * @returns {string[]|null} null = unrestricted (admin)
 */
export function getAllowedClassKeys(session) {
  if (!session) return [];
  if (isAdminSession(session)) return null;
  return getHomeroomClassKeys(session);
}

/**
 * Homeroom / assigned classes (excludes ALL sentinel).
 * @param {TeacherAuthSession|null|undefined} session
 * @returns {string[]}
 */
export function getHomeroomClassKeys(session) {
  if (!session?.assignedClasses?.length) return [];
  return session.assignedClasses.filter((c) => normalizeClassKey(c).toUpperCase() !== 'ALL');
}

/**
 * @param {Array<{ class?: string }>} rows
 * @param {TeacherAuthSession|null|undefined} session
 */
export function filterRowsByAssignedClasses(rows, session) {
  if (!session || isAdminSession(session)) return rows;
  const allowed = new Set(getAllowedClassKeys(session));
  if (!allowed.size) return [];
  return rows.filter((r) => [...allowed].some((k) => classKeysMatch(k, r.class)));
}

/**
 * Build level/room options from assigned class keys.
 * @param {string[]} classKeys
 * @returns {{ levels: string[], roomsByLevel: Record<string, string[]> }}
 */
export function classKeysToPickerOptions(classKeys) {
  /** @type {Record<string, Set<string>>} */
  const roomsByLevel = {};
  for (const key of classKeys) {
    const { level, room } = classKeyToParts(key);
    if (!level || !room) continue;
    if (!roomsByLevel[level]) roomsByLevel[level] = new Set();
    roomsByLevel[level].add(room);
  }
  const levels = Object.keys(roomsByLevel).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const lvl of levels) {
    out[lvl] = [...roomsByLevel[lvl]].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  return { levels, roomsByLevel: out };
}

/**
 * @param {TeacherAuthSession} session
 */
export function saveTeacherAuthSession(session) {
  try {
    localStorage.setItem(TEACHER_AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('[teacherAuth] save failed', err);
  }
}

/**
 * @returns {TeacherAuthSession|null}
 */
export function loadTeacherAuthSession() {
  try {
    const raw = localStorage.getItem(TEACHER_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const assignedClasses = Array.isArray(data.assignedClasses)
      ? data.assignedClasses.map(normalizeClassKey)
      : parseAssignedClasses(data.assignedClasses);
    const hasAll = assignedClasses.includes('ALL');
    const isAdmin = Boolean(data.isAdmin) || isAdminSession({ ...data, assignedClasses });
    const classesForSession = hasAll
      ? ['ALL']
      : assignedClasses.length
        ? assignedClasses
        : isAdmin
          ? ['ALL']
          : [];
    return {
      teacherName: String(data.teacherName ?? '').trim(),
      username: String(data.username ?? '').trim(),
      userId: String(data.userId ?? '').trim(),
      role: String(data.role ?? 'teacher').trim(),
      assignedClasses: classesForSession,
      isAdmin,
      mustChangePin: Boolean(data.mustChangePin)
    };
  } catch {
    return null;
  }
}

export function clearTeacherAuthSession() {
  try {
    localStorage.removeItem(TEACHER_AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * @param {TeacherAuthSession|null} session
 * @param {string} level
 * @param {string} room
 */
export function canAccessLevelRoom(session, level, room) {
  return canAccessClass(session, buildAttendanceClassKey(level, room));
}
