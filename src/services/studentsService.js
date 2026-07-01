/**
 * Student roster from Google Sheets (Apps Script Web App).
 * Attendance remains in Firebase Firestore (attendanceService.js).
 */

import {
  fetchStudentsGas,
  fetchClassOptionsGas,
  isGasConfigured,
  normalizeStudentRow,
  adminCreateStudentGas,
  adminUpdateStudentGas,
  adminDeleteStudentGas
} from './googleAppsScript.js';
import { isAdminSession } from './teacherAuth.js';
import { buildAttendanceClassKey } from './attendanceService.js';
import { cacheStudentsForClass, getCachedStudentsForClass } from './offlineDb.js';
import { isOnline } from './offlineSync.js';

const STUDENTS_LS_PREFIX = 'student-check-roster-';
const CLASS_OPTIONS_LS_KEY = 'student-check-class-options';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {{ levels: string[], roomsByLevel: Record<string, string[]> } | null} */
let classOptionsCache = null;

/** @type {Map<string, object[]>} */
const studentsByClassCache = new Map();

/** @type {Map<string, Promise<object[]>>} */
const studentsByClassInflight = new Map();

/** @type {Map<string, Promise<object[]>>} */
const studentsByClassRefreshInflight = new Map();

function classCacheKey(level, room) {
  return `${String(level).trim()}|${String(room).trim()}`;
}

/**
 * @param {string} key
 * @returns {{ data: unknown, t: number }|null}
 */
function readLsEntryMeta(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== 'number') return null;
    if (Date.now() - parsed.t > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { data: parsed.data ?? null, t: parsed.t };
  } catch {
    return null;
  }
}

function readLsEntry(key) {
  const meta = readLsEntryMeta(key);
  return meta?.data ?? null;
}

function writeLsEntry(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // quota exceeded — in-memory cache still helps this session
  }
}

function requireGasConfigured() {
  if (!isGasConfigured()) {
    throw new Error('ยังไม่ได้ตั้งค่า Google Sheets — ผู้ดูแลระบบต้องตั้งค่า VITE_GAS_WEB_APP_URL ใน .env');
  }
}

/**
 * Immediate roster read (memory → localStorage). No network.
 * @param {string} level
 * @param {string} room
 * @returns {{ students: object[], fromCache: boolean, cacheAgeMs: number|null }}
 */
export function peekStudentsByClass(level, room) {
  const lvl = String(level).trim();
  const rm = String(room).trim();
  if (!lvl || !rm) {
    return { students: [], fromCache: false, cacheAgeMs: null };
  }

  const key = classCacheKey(lvl, rm);
  if (studentsByClassCache.has(key)) {
    const list = studentsByClassCache.get(key);
    if (Array.isArray(list)) {
      const meta = readLsEntryMeta(STUDENTS_LS_PREFIX + key);
      return {
        students: list,
        fromCache: true,
        cacheAgeMs: meta ? Date.now() - meta.t : null
      };
    }
  }

  const meta = readLsEntryMeta(STUDENTS_LS_PREFIX + key);
  if (Array.isArray(meta?.data)) {
    studentsByClassCache.set(key, meta.data);
    return {
      students: meta.data,
      fromCache: true,
      cacheAgeMs: Date.now() - meta.t
    };
  }

  return { students: [], fromCache: false, cacheAgeMs: null };
}

/**
 * @param {string} level
 * @param {string} room
 */
export function invalidateClassRosterCache(level, room) {
  const key = classCacheKey(String(level).trim(), String(room).trim());
  studentsByClassCache.delete(key);
  studentsByClassInflight.delete(key);
  studentsByClassRefreshInflight.delete(key);
  try {
    localStorage.removeItem(STUDENTS_LS_PREFIX + key);
  } catch {
    // ignore
  }
}

/**
 * Fetch roster from GAS and update caches (blocking).
 * @param {string} level
 * @param {string} room
 */
async function fetchStudentsFromNetwork(level, room) {
  const lvl = String(level).trim();
  const rm = String(room).trim();
  const key = classCacheKey(lvl, rm);
  const lsKey = STUDENTS_LS_PREFIX + key;
  const classKey = buildAttendanceClassKey(lvl, rm);

  if (!isOnline()) {
    const cached =
      studentsByClassCache.get(key) || (await getCachedStudentsForClass(classKey));
    if (cached?.length) {
      studentsByClassCache.set(key, cached);
      return cached;
    }
    throw new Error('ออฟไลน์ — ยังไม่มีรายชื่อนักเรียนที่แคชไว้ กรุณาโหลดห้องนี้ตอนมีอินเทอร์เน็ต');
  }

  const list = await fetchStudentsGas({ level: lvl, room: rm });
  studentsByClassCache.set(key, list);
  writeLsEntry(lsKey, list);
  if (list.length) {
    await cacheStudentsForClass(classKey, list);
  }
  return list;
}

/**
 * Background refresh — deduped per class; updates memory + localStorage.
 * @param {string} level
 * @param {string} room
 */
export async function refreshStudentsByClassInBackground(level, room) {
  const lvl = String(level).trim();
  const rm = String(room).trim();
  if (!lvl || !rm || !isOnline()) return peekStudentsByClass(lvl, rm).students;

  requireGasConfigured();
  const key = classCacheKey(lvl, rm);
  const inflight = studentsByClassRefreshInflight.get(key);
  if (inflight) return inflight;

  const promise = fetchStudentsFromNetwork(lvl, rm)
    .catch((err) => {
      console.warn('[students] background refresh failed', err);
      return studentsByClassCache.get(key) ?? peekStudentsByClass(lvl, rm).students;
    })
    .finally(() => {
      studentsByClassRefreshInflight.delete(key);
    });

  studentsByClassRefreshInflight.set(key, promise);
  return promise;
}

export function clearStudentsCache() {
  classOptionsCache = null;
  studentsByClassCache.clear();
  studentsByClassInflight.clear();
  studentsByClassRefreshInflight.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(STUDENTS_LS_PREFIX) || k === CLASS_OPTIONS_LS_KEY) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}

export function studentFullName(s) {
  const prefix = String(s.prefix ?? '').trim();
  const name = `${String(s.first_name ?? '').trim()} ${String(s.last_name ?? '').trim()}`.trim();
  return prefix ? `${prefix}${name}` : name;
}

async function ensureClassOptions() {
  requireGasConfigured();
  if (classOptionsCache?.levels?.length) return classOptionsCache;

  const cached = readLsEntry(CLASS_OPTIONS_LS_KEY);
  if (cached?.levels?.length) {
    classOptionsCache = cached;
    return classOptionsCache;
  }

  classOptionsCache = null;
  const options = await fetchClassOptionsGas();
  if (!options.levels?.length) {
    throw new Error('ไม่พบ LEVEL ใน Google Sheets — ตรวจสอบคอลัมน์ LEVEL / ROOM');
  }
  classOptionsCache = options;
  writeLsEntry(CLASS_OPTIONS_LS_KEY, options);
  return classOptionsCache;
}

/**
 * Distinct LEVEL values from Google Sheets (metadata only).
 */
export async function fetchLevelOptions() {
  try {
    const { levels } = await ensureClassOptions();
    return levels;
  } catch (err) {
    console.error('[students] fetch levels failed:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * @param {string} level
 */
export async function fetchRoomOptions(level) {
  const lvl = String(level).trim();
  if (!lvl) return [];
  try {
    const { roomsByLevel } = await ensureClassOptions();
    return roomsByLevel[lvl] ?? [];
  } catch (err) {
    console.error('[students] fetch rooms failed:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Load students for one class. Uses cache when available unless forceRefresh.
 * @param {string} level
 * @param {string} room
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function fetchStudentsByClass(level, room, opts = {}) {
  const lvl = String(level).trim();
  const rm = String(room).trim();
  if (!lvl || !rm) return [];

  requireGasConfigured();

  const key = classCacheKey(lvl, rm);

  if (!opts.forceRefresh) {
    const peek = peekStudentsByClass(lvl, rm);
    if (peek.fromCache) {
      return peek.students;
    }
  } else {
    invalidateClassRosterCache(lvl, rm);
  }

  const inflight = studentsByClassInflight.get(key);
  if (inflight) return inflight;

  const loadPromise = (async () => {
    try {
      return await fetchStudentsFromNetwork(lvl, rm);
    } catch (err) {
      const classKey = buildAttendanceClassKey(lvl, rm);
      const cached =
        studentsByClassCache.get(key) || (await getCachedStudentsForClass(classKey));
      if (cached?.length) {
        studentsByClassCache.set(key, cached);
        return cached;
      }
      console.error('[students] load failed:', err);
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      studentsByClassInflight.delete(key);
    }
  })();

  studentsByClassInflight.set(key, loadPromise);
  return loadPromise;
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {string} adminPin
 */
function buildStudentAdminAuth(session, adminPin) {
  if (!isAdminSession(session)) {
    throw new Error('ไม่มีสิทธิ์ผู้ดูแลระบบ');
  }
  return {
    adminUsername: String(session?.username ?? '').trim(),
    adminTeacherName: String(session?.teacherName ?? '').trim(),
    adminPin: String(adminPin ?? '').trim()
  };
}

/**
 * Load all students (admin roster management).
 */
export async function fetchAllStudents() {
  requireGasConfigured();
  return fetchStudentsGas({});
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, student_id: string, prefix?: string, first_name: string, last_name?: string, level: string, room: string, number?: string, parent_name?: string, parent_phone?: string }} payload
 */
export async function adminCreateStudent(session, payload) {
  const studentId = String(payload?.student_id ?? '').trim();
  const firstName = String(payload?.first_name ?? '').trim();
  const level = String(payload?.level ?? '').trim();
  const room = String(payload?.room ?? '').trim();
  if (!studentId) throw new Error('กรุณาระบุรหัสนักเรียน');
  if (!firstName) throw new Error('กรุณาระบุชื่อ');
  if (!level || !room) throw new Error('กรุณาเลือกชั้นและห้อง');

  try {
    const out = await adminCreateStudentGas({
      ...buildStudentAdminAuth(session, payload.adminPin),
      student_id: studentId,
      prefix: String(payload?.prefix ?? '').trim(),
      first_name: firstName,
      last_name: String(payload?.last_name ?? '').trim(),
      level,
      room,
      number: String(payload?.number ?? '').trim(),
      parent_name: String(payload?.parent_name ?? '').trim(),
      parent_phone: String(payload?.parent_phone ?? '').trim()
    });
    clearStudentsCache();
    return {
      student: normalizeStudentRow(out?.student ?? payload),
      numbersShifted: Number(out?.numbers_shifted ?? 0)
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unknown action')) {
      throw new Error('เซิร์ฟเวอร์ยังไม่รองรับการจัดการนักเรียน — Deploy Web App จาก Code.gs ล่าสุด');
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, student_id: string, prefix?: string, first_name?: string, last_name?: string, level?: string, room?: string, number?: string, parent_name?: string, parent_phone?: string }} payload
 */
export async function adminUpdateStudent(session, payload) {
  const studentId = String(payload?.student_id ?? '').trim();
  if (!studentId) throw new Error('กรุณาระบุรหัสนักเรียน');

  try {
    const out = await adminUpdateStudentGas({
      ...buildStudentAdminAuth(session, payload.adminPin),
      student_id: studentId,
      prefix: payload?.prefix,
      first_name: payload?.first_name,
      last_name: payload?.last_name,
      level: payload?.level,
      room: payload?.room,
      number: payload?.number,
      parent_name: payload?.parent_name,
      parent_phone: payload?.parent_phone
    });
    clearStudentsCache();
    return {
      student: normalizeStudentRow(out?.student ?? payload),
      numbersShifted: Number(out?.numbers_shifted ?? 0)
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unknown action')) {
      throw new Error('เซิร์ฟเวอร์ยังไม่รองรับการจัดการนักเรียน — Deploy Web App จาก Code.gs ล่าสุด');
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession} session
 * @param {{ adminPin: string, student_id: string }} payload
 */
export async function adminDeleteStudent(session, payload) {
  const studentId = String(payload?.student_id ?? '').trim();
  if (!studentId) throw new Error('กรุณาระบุรหัสนักเรียน');

  try {
    const out = await adminDeleteStudentGas({
      ...buildStudentAdminAuth(session, payload.adminPin),
      student_id: studentId
    });
    clearStudentsCache();
    return { deleted: true, numbersShifted: Number(out?.numbers_shifted ?? 0) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unknown action')) {
      throw new Error('เซิร์ฟเวอร์ยังไม่รองรับการจัดการนักเรียน — Deploy Web App จาก Code.gs ล่าสุด');
    }
    throw err instanceof Error ? err : new Error(message);
  }
}
