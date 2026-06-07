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

function classCacheKey(level, room) {
  return `${String(level).trim()}|${String(room).trim()}`;
}

function readLsEntry(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== 'number') return null;
    if (Date.now() - parsed.t > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
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

export function clearStudentsCache() {
  classOptionsCache = null;
  studentsByClassCache.clear();
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
 * Load students for one class from Google Sheets API.
 * @param {string} level
 * @param {string} room
 */
export async function fetchStudentsByClass(level, room) {
  const lvl = String(level).trim();
  const rm = String(room).trim();
  if (!lvl || !rm) return [];

  requireGasConfigured();

  const key = classCacheKey(lvl, rm);
  if (studentsByClassCache.has(key)) {
    const cached = studentsByClassCache.get(key);
    if (cached?.length) return cached;
    studentsByClassCache.delete(key);
  }

  const lsKey = STUDENTS_LS_PREFIX + key;
  const cachedLs = readLsEntry(lsKey);
  if (Array.isArray(cachedLs) && cachedLs.length) {
    studentsByClassCache.set(key, cachedLs);
    return cachedLs;
  }

  try {
    if (!isOnline()) {
      const cached =
        studentsByClassCache.get(key) ||
        (await getCachedStudentsForClass(buildAttendanceClassKey(lvl, rm)));
      if (cached?.length) return cached;
      throw new Error('ออฟไลน์ — ยังไม่มีรายชื่อนักเรียนที่แคชไว้ กรุณาโหลดห้องนี้ตอนมีอินเทอร์เน็ต');
    }

    const list = await fetchStudentsGas({ level: lvl, room: rm });
    if (list.length) {
      studentsByClassCache.set(key, list);
      writeLsEntry(lsKey, list);
      await cacheStudentsForClass(buildAttendanceClassKey(lvl, rm), list);
    }
    return list;
  } catch (err) {
    const classKey = buildAttendanceClassKey(lvl, rm);
    const cached = studentsByClassCache.get(key) || (await getCachedStudentsForClass(classKey));
    if (cached?.length) return cached;
    console.error('[students] load failed:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
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
