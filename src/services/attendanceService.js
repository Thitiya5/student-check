import {
  collection,
  doc,
  query,
  where,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { getTodayDate, chunkDateRange } from '../utils/dateIso.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { parseDisciplineFromRecord } from '../data/disciplineChecks.js';
import {
  filterRowsByAssignedClasses,
  isAdminSession,
  isSchoolWideViewSession,
  getHomeroomClassKeys,
  canAccessClass
} from './teacherAuth.js';

const COLLECTION = 'attendance';

/** Firestore `in` supports up to 30 values. */
const FIRESTORE_IN_MAX = 30;

/** Max calendar days for school-wide range queries without a class filter. */
export const MAX_UNSCOPED_RANGE_DAYS = 35;

export function buildAttendanceClassKey(level, room) {
  return `${String(level).trim()}/${String(room).trim()}`;
}

export function parseClassKey(classKey) {
  const [level = '', room = ''] = String(classKey).split('/');
  return { level, room };
}

function attendanceDocId(classKey, studentId, attendanceDate) {
  const safeClass = String(classKey).replace(/\//g, '-');
  const safeStudent = String(studentId).replace(/[/\s]/g, '_');
  return `${safeClass}__${safeStudent}__${attendanceDate}`;
}

function mapAttendanceDoc(docSnap) {
  const data = docSnap.data();
  const createdAt = data.createdAt?.toDate?.() ?? null;
  return {
    id: docSnap.id,
    student_id: String(data.student_id ?? ''),
    student_name: String(data.student_name ?? ''),
    class: String(data.class ?? ''),
    status: normalizeAttendanceStatus(data.status),
    teacherName: String(data.teacherName ?? data.teacher ?? ''),
    attendanceDate: String(data.attendanceDate ?? ''),
    disciplineFlags: Array.isArray(data.disciplineFlags) ? data.disciplineFlags.map(String) : [],
    disciplineBehaviors: Array.isArray(data.disciplineBehaviors) ? data.disciplineBehaviors : [],
    disciplineAdjust: Number(data.disciplineAdjust) || 0,
    disciplineNote: String(data.disciplineNote ?? ''),
    disciplineWaived: Boolean(data.disciplineWaived),
    disciplineReturnedBy: String(data.disciplineReturnedBy ?? ''),
    disciplineReturnedAt: (() => {
      const raw = data.disciplineReturnedAt;
      if (!raw) return null;
      if (typeof raw?.toDate === 'function') return raw.toDate().toISOString();
      return String(raw);
    })(),
    createdAt: createdAt ? createdAt.toISOString() : null
  };
}

function isFirestoreIndexError(err) {
  return err?.code === 'failed-precondition';
}

function wrapFirestoreError(err) {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return new Error(
      'Firestore blocked access. Enable test mode rules or allow read/write on the "attendance" collection.'
    );
  }
  if (code === 'failed-precondition') {
    return new Error(
      'Firestore ต้องการดัชนี (index) — รัน firebase deploy --only firestore:indexes หรือสร้าง index ตามลิงก์ใน Console'
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * @param {string} [from] yyyy-MM-dd
 * @param {string} [to] yyyy-MM-dd
 */
export function daysBetweenInclusive(from, to) {
  if (!from || !to) return 0;
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

/**
 * @param {import('firebase/firestore').Query} q
 */
async function runQuery(q) {
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapAttendanceDoc);
}

/**
 * @param {string[]} classKeys
 */
function uniqueClassKeys(classKeys) {
  return [...new Set(classKeys.map((k) => String(k).trim()).filter(Boolean))];
}

/**
 * @param {string} attendanceDate
 * @param {string[]} classKeys
 */
async function queryByDateAndClasses(attendanceDate, classKeys) {
  const date = String(attendanceDate);
  const keys = uniqueClassKeys(classKeys);
  if (!keys.length) return [];

  if (keys.length === 1) {
    return getAttendanceForClassOnDate(keys[0], date);
  }

  /** @type {ReturnType<typeof mapAttendanceDoc>[]} */
  const rows = [];
  for (let i = 0; i < keys.length; i += FIRESTORE_IN_MAX) {
    const batch = keys.slice(i, i + FIRESTORE_IN_MAX);
    const q = query(
      collection(db, COLLECTION),
      where('attendanceDate', '==', date),
      where('class', 'in', batch)
    );
    rows.push(...(await runQuery(q)));
  }
  return rows;
}

/**
 * @param {string} classKey
 * @param {string} from yyyy-MM-dd
 * @param {string} to yyyy-MM-dd
 * @param {string} [teacherName]
 */
async function queryByClassAndDateRange(classKey, from, to, teacherName) {
  const constraints = [
    where('class', '==', String(classKey)),
    where('attendanceDate', '>=', String(from)),
    where('attendanceDate', '<=', String(to))
  ];
  if (teacherName) constraints.push(where('teacherName', '==', String(teacherName)));

  try {
    return await runQuery(query(collection(db, COLLECTION), ...constraints));
  } catch (err) {
    if (!isFirestoreIndexError(err)) throw wrapFirestoreError(err);
    const q = query(
      collection(db, COLLECTION),
      where('class', '==', String(classKey)),
      where('attendanceDate', '>=', String(from)),
      where('attendanceDate', '<=', String(to))
    );
    let rows = await runQuery(q);
    if (teacherName) rows = rows.filter((r) => r.teacherName === String(teacherName));
    return rows;
  }
}

/**
 * @param {string[]} classKeys
 * @param {string} from
 * @param {string} to
 * @param {string} [teacherName]
 */
async function queryByClassesAndDateRange(classKeys, from, to, teacherName) {
  const keys = uniqueClassKeys(classKeys);
  if (!keys.length) return [];

  const parts = await Promise.all(
    keys.map((ck) => queryByClassAndDateRange(ck, from, to, teacherName))
  );
  return parts.flat();
}

/** @param {ReturnType<typeof mapAttendanceDoc>[]} records */
export function recordsToDisciplineMap(records) {
  /** @type {Record<string, import('../data/disciplineChecks.js').emptyDisciplineEntry>} */
  const map = {};
  for (const row of records) {
    map[row.student_id] = parseDisciplineFromRecord(row);
  }
  return map;
}

/**
 * @param {ReturnType<typeof mapAttendanceDoc>[]} rows
 * @param {string} [from] yyyy-MM-dd
 * @param {string} [to] yyyy-MM-dd
 */
function filterRowsByDateRange(rows, from, to) {
  if (!from && !to) return rows;
  return rows.filter((r) => {
    const d = String(r.attendanceDate || '');
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function recordsToAttendanceMap(records) {
  const sorted = [...records].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  /** @type {Record<string, string>} */
  const map = {};
  for (const row of sorted) {
    map[row.student_id] = row.status;
  }
  return map;
}

export function summarizeAttendance(records) {
  const byStudent = recordsToAttendanceMap(records);
  const statuses = Object.values(byStudent);
  const total = statuses.length;
  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    errand: 0,
    activity: 0,
    sick: 0
  };
  for (const st of statuses) {
    const key = normalizeAttendanceStatus(st);
    if (key in counts) counts[key] += 1;
  }
  const presentLike = counts.present + counts.late;
  return {
    total,
    checked: total,
    present: counts.present,
    late: counts.late,
    absent: counts.absent,
    errand: counts.errand,
    activity: counts.activity,
    sick: counts.sick,
    percent: total ? Math.round((presentLike / total) * 100) : 0
  };
}

/**
 * @param {string} classKey
 * @param {string} attendanceDate yyyy-MM-dd
 */
export async function getAttendanceForClassOnDate(classKey, attendanceDate) {
  const q = query(
    collection(db, COLLECTION),
    where('class', '==', String(classKey)),
    where('attendanceDate', '==', String(attendanceDate))
  );
  try {
    return await runQuery(q);
  } catch (err) {
    console.error('[attendance] load class/date failed:', err);
    throw wrapFirestoreError(err);
  }
}

/**
 * One day, scoped to session (teachers: assigned classes only; admin: that day school-wide).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} [attendanceDate]
 */
export async function queryAttendanceByDateForSession(
  session,
  attendanceDate = getTodayDate()
) {
  const date = String(attendanceDate || getTodayDate());
  if (!session) return [];

  if (isAdminSession(session)) {
    const q = query(collection(db, COLLECTION), where('attendanceDate', '==', date));
    return runQuery(q);
  }

  const keys = getHomeroomClassKeys(session);
  return queryByDateAndClasses(date, keys);
}

/**
 * Filtered single-day query (always requires attendanceDate).
 * @param {{ attendanceDate: string, classKey?: string, teacherName?: string, searchName?: string }} opts
 */
export async function queryAttendanceRecords({
  attendanceDate,
  classKey,
  teacherName,
  searchName
} = {}) {
  const date = attendanceDate ? String(attendanceDate) : '';
  if (!date) {
    console.warn('[attendance] queryAttendanceRecords requires attendanceDate');
    return [];
  }

  const constraints = [where('attendanceDate', '==', date)];
  if (classKey) constraints.push(where('class', '==', String(classKey)));
  if (teacherName) constraints.push(where('teacherName', '==', String(teacherName)));

  let rows = await runQuery(query(collection(db, COLLECTION), ...constraints));

  if (searchName) {
    const term = searchName.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student_name.toLowerCase().includes(term) || r.student_id.toLowerCase().includes(term)
    );
  }
  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Upsert attendance (one doc per student + class + date).
 */
export async function saveClassAttendance({ classKey, teacherName, attendanceDate, students }) {
  if (!students?.length) {
    return [];
  }

  const dateKey = attendanceDate || getTodayDate();
  const col = collection(db, COLLECTION);
  const ids = [];

  try {
    for (const student of students) {
      const studentName =
        String(student.student_name ?? '').trim() ||
        `${String(student.first_name ?? '').trim()} ${String(student.last_name ?? '').trim()}`.trim();
      const docId = attendanceDocId(classKey, student.student_id, dateKey);
      const docRef = doc(col, docId);
      await setDoc(
        docRef,
        {
          student_id: String(student.student_id),
          student_name: studentName,
          class: String(classKey),
          status: normalizeAttendanceStatus(student.status),
          teacherName: String(teacherName || ''),
          attendanceDate: dateKey,
          disciplineFlags: Array.isArray(student.disciplineFlags) ? student.disciplineFlags : [],
          disciplineBehaviors: Array.isArray(student.disciplineBehaviors)
            ? student.disciplineBehaviors
            : [],
          disciplineAdjust: Number(student.disciplineAdjust) || 0,
          disciplineNote: String(student.disciplineNote ?? ''),
          disciplineWaived: Boolean(student.disciplineWaived),
          disciplineReturnedBy: String(student.disciplineReturnedBy ?? ''),
          disciplineReturnedAt:
            student.disciplineReturnedAt != null && student.disciplineReturnedAt !== ''
              ? student.disciplineReturnedAt
              : student.disciplineReturnedBy
                ? serverTimestamp()
                : null,
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      ids.push(docId);
    }
    return ids;
  } catch (err) {
    console.error('[attendance] save failed:', err);
    throw wrapFirestoreError(err);
  }
}

export async function updateAttendanceRecord(id, updates) {
  const ref = doc(db, COLLECTION, id);
  /** @type {Record<string, unknown>} */
  const payload = { createdAt: serverTimestamp() };
  if (updates.status != null) payload.status = normalizeAttendanceStatus(updates.status);
  if (updates.student_name != null) payload.student_name = String(updates.student_name);
  if (updates.teacherName != null) payload.teacherName = String(updates.teacherName);
  if (updates.class != null) payload.class = String(updates.class);
  if (updates.attendanceDate != null) payload.attendanceDate = String(updates.attendanceDate);
  await setDoc(ref, payload, { merge: true });
}

export async function deleteAttendanceRecord(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Dashboard: today's attendance for assigned classes only (admin: all classes that day).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {string} [attendanceDate]
 */
export async function getDashboardDataForSession(session, attendanceDate = getTodayDate()) {
  const date = String(attendanceDate || getTodayDate());
  if (!session) {
    return { date, summary: summarizeAttendance([]), rows: [] };
  }

  const rows = (await queryAttendanceByDateForSession(session, date)).sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  return { date, summary: summarizeAttendance(rows), rows };
}

/**
 * History — requires date; uses class filter when set, else teacher's assigned classes (batched).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 */
export async function queryAttendanceRecordsForSession(session, opts = {}) {
  if (!session) return [];
  const date = opts.attendanceDate ? String(opts.attendanceDate) : '';
  if (!date) return [];

  const classKey = opts.classKey ? String(opts.classKey) : '';
  const searchName = opts.searchName;

  if (classKey && !canAccessClass(session, classKey)) {
    return [];
  }

  if (isAdminSession(session)) {
    return queryAttendanceRecords({
      attendanceDate: date,
      classKey: classKey || undefined,
      teacherName: opts.teacherName || undefined,
      searchName
    });
  }

  const keys = getHomeroomClassKeys(session);
  if (!keys.length) return [];

  let rows;
  if (classKey) {
    rows = await getAttendanceForClassOnDate(classKey, date);
  } else {
    rows = await queryByDateAndClasses(date, keys);
  }

  if (searchName) {
    const term = searchName.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student_name.toLowerCase().includes(term) || r.student_id.toLowerCase().includes(term)
    );
  }

  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Reports — date range + class scope; never scans the full collection.
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 */
export async function queryAttendanceInRangeForSession(session, opts = {}) {
  if (!session) return [];

  const from = opts.from ? String(opts.from) : getTodayDate();
  const to = opts.to ? String(opts.to) : from;
  const spanDays = daysBetweenInclusive(from, to);

  let classFilter = opts.classKey ? String(opts.classKey) : '';
  if (!classFilter && opts.level && opts.room) {
    classFilter = buildAttendanceClassKey(opts.level, opts.room);
  }

  if (classFilter && !canAccessClass(session, classFilter)) {
    return [];
  }

  const teacherName = opts.teacherName ? String(opts.teacherName) : '';

  if (!isSchoolWideViewSession(session)) {
    const keys = classFilter ? [classFilter] : getHomeroomClassKeys(session);
    if (!keys.length) return [];
    let rows = await queryByClassesAndDateRange(keys, from, to, teacherName || undefined);
    if (opts.level && !opts.room) {
      const prefix = `${String(opts.level).trim()}/`;
      rows = rows.filter((r) => r.class.startsWith(prefix));
    }
    return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  if (!classFilter && !opts.level && spanDays > MAX_UNSCOPED_RANGE_DAYS) {
    const err = new Error(
      `ช่วงวันที่ยาวเกิน ${MAX_UNSCOPED_RANGE_DAYS} วัน — กรุณาเลือกชั้นเรียน (LEVEL/ROOM) ก่อนดูรายงาน`
    );
    err.code = 'range-too-wide';
    throw err;
  }

  if (classFilter) {
    return queryAttendanceInRange({ from, to, classKey: classFilter, teacherName });
  }

  return queryAttendanceInRange({ from, to, level: opts.level, teacherName });
}

/**
 * Full semester (or long range) for session — school-wide uses date chunks; homeroom uses class-scoped queries.
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {{ from: string, to: string }} range
 */
export async function querySemesterAttendanceForSession(session, range) {
  if (!session) return [];
  const from = String(range.from || getTodayDate());
  const to = String(range.to || from);

  if (!isSchoolWideViewSession(session)) {
    return queryAttendanceInRangeForSession(session, { from, to });
  }

  const chunks = chunkDateRange(from, to, MAX_UNSCOPED_RANGE_DAYS);
  const parts = await Promise.all(
    chunks.map(({ from: f, to: t }) =>
      queryAttendanceInRange({ from: f, to: t }).catch((err) => {
        console.warn('[attendance] semester chunk failed', f, t, err);
        return [];
      })
    )
  );
  return parts.flat().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * One student, date range (indexed query — no full student history scan).
 * @param {string} studentId
 * @param {{ from: string, to: string, classKey?: string }} opts
 */
export async function queryStudentAttendanceInRange(studentId, { from, to, classKey } = {}) {
  const sid = String(studentId);
  const fromKey = from ? String(from) : '';
  const toKey = to ? String(to) : '';
  const classFilter = classKey ? String(classKey) : '';

  if (!fromKey || !toKey) return [];

  const constraints = [
    where('student_id', '==', sid),
    where('attendanceDate', '>=', fromKey),
    where('attendanceDate', '<=', toKey)
  ];

  try {
    let rows = await runQuery(query(collection(db, COLLECTION), ...constraints));
    if (classFilter) rows = rows.filter((r) => r.class === classFilter);
    return rows.sort((a, b) => String(b.attendanceDate).localeCompare(String(a.attendanceDate)));
  } catch (err) {
    if (classFilter && isFirestoreIndexError(err)) {
      let rows = await queryByClassAndDateRange(classFilter, fromKey, toKey);
      rows = rows.filter((r) => r.student_id === sid);
      return rows.sort((a, b) => String(b.attendanceDate).localeCompare(String(a.attendanceDate)));
    }
    throw wrapFirestoreError(err);
  }
}

/**
 * School-wide or class-scoped range (admin). Requires from/to; never loads whole collection.
 * @param {{ from?: string, to?: string, teacherName?: string, classKey?: string, level?: string, room?: string }} opts
 */
export async function queryAttendanceInRange({
  from,
  to,
  teacherName,
  classKey,
  level,
  room
} = {}) {
  const fromKey = from ? String(from) : getTodayDate();
  const toKey = to ? String(to) : fromKey;

  let classFilter = classKey ? String(classKey) : '';
  if (!classFilter && level && room) {
    classFilter = buildAttendanceClassKey(level, room);
  }

  if (classFilter) {
    let rows = await queryByClassAndDateRange(
      classFilter,
      fromKey,
      toKey,
      teacherName || undefined
    );
    if (level && !room) {
      const prefix = `${String(level).trim()}/`;
      rows = rows.filter((r) => r.class.startsWith(prefix));
    }
    return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  const spanDays = daysBetweenInclusive(fromKey, toKey);
  if (spanDays > MAX_UNSCOPED_RANGE_DAYS) {
    const err = new Error(
      `ช่วงวันที่ยาวเกิน ${MAX_UNSCOPED_RANGE_DAYS} วัน — กรุณาเลือกชั้นเรียนก่อนดูรายงาน`
    );
    err.code = 'range-too-wide';
    throw err;
  }

  const constraints = [
    where('attendanceDate', '>=', fromKey),
    where('attendanceDate', '<=', toKey)
  ];
  if (teacherName) constraints.push(where('teacherName', '==', String(teacherName)));

  let rows = await runQuery(query(collection(db, COLLECTION), ...constraints));

  if (level) {
    const prefix = `${String(level).trim()}/`;
    rows = rows.filter((r) => r.class.startsWith(prefix));
  }

  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
