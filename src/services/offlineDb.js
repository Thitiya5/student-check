/**
 * IndexedDB — offline student cache + pending attendance uploads.
 */
import { openDB } from 'idb';

const DB_NAME = 'student-check-offline';
const DB_VERSION = 1;

const STORES = {
  pending: 'pending-attendance',
  students: 'students-cache',
  sessions: 'class-sessions'
};

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORES.pending)) {
        const pending = database.createObjectStore(STORES.pending, { keyPath: 'id' });
        pending.createIndex('byStatus', 'status');
        pending.createIndex('byDate', 'attendanceDate');
      }
      if (!database.objectStoreNames.contains(STORES.students)) {
        database.createObjectStore(STORES.students, { keyPath: 'classKey' });
      }
      if (!database.objectStoreNames.contains(STORES.sessions)) {
        database.createObjectStore(STORES.sessions, { keyPath: 'key' });
      }
    }
  });
}

/**
 * @param {object} payload
 */
export function buildPendingId(payload) {
  const { classKey, attendanceDate } = payload;
  return `${classKey}__${attendanceDate}__${Date.now()}`;
}

/**
 * Stable key to avoid duplicate queue entries for same class/day.
 * @param {string} classKey
 * @param {string} attendanceDate
 */
export function sessionQueueKey(classKey, attendanceDate) {
  return `${classKey}__${attendanceDate}`;
}

/**
 * @param {object} item
 */
export async function enqueuePendingAttendance(item) {
  const database = await db();
  const existing = await database.getAll(STORES.pending);
  const key = sessionQueueKey(item.classKey, item.attendanceDate);
  const dup = existing.find(
    (r) => r.sessionKey === key && (r.status === 'pending' || r.status === 'failed')
  );
  if (dup) {
    await database.put(STORES.pending, {
      ...dup,
      ...item,
      id: dup.id,
      status: 'pending',
      updatedAt: new Date().toISOString()
    });
    return dup.id;
  }
  await database.put(STORES.pending, {
    ...item,
    sessionKey: key,
    status: 'pending',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return item.id;
}

export async function getPendingAttendance() {
  const database = await db();
  return database.getAll(STORES.pending);
}

export async function getPendingCount() {
  const all = await getPendingAttendance();
  return all.filter((r) => r.status === 'pending' || r.status === 'failed').length;
}

/**
 * @param {string} id
 * @param {string} status
 */
export async function updatePendingStatus(id, status) {
  const database = await db();
  const row = await database.get(STORES.pending, id);
  if (!row) return;
  await database.put(STORES.pending, { ...row, status, updatedAt: new Date().toISOString() });
}

/** @param {string} id */
export async function removePending(id) {
  const database = await db();
  await database.delete(STORES.pending, id);
}

/**
 * @param {string} classKey
 * @param {object[]} students
 */
export async function cacheStudentsForClass(classKey, students) {
  const database = await db();
  await database.put(STORES.students, {
    classKey,
    students,
    cachedAt: new Date().toISOString()
  });
}

/** @param {string} classKey */
export async function getCachedStudentsForClass(classKey) {
  const database = await db();
  const row = await database.get(STORES.students, classKey);
  return row?.students ?? null;
}

/**
 * @param {string} classKey
 * @param {string} attendanceDate
 * @param {object} data
 */
export async function cacheClassSession(classKey, attendanceDate, data) {
  const database = await db();
  const key = sessionQueueKey(classKey, attendanceDate);
  await database.put(STORES.sessions, {
    key,
    classKey,
    attendanceDate,
    ...data,
    cachedAt: new Date().toISOString()
  });
}

/**
 * @param {string} classKey
 * @param {string} attendanceDate
 */
export async function getCachedClassSession(classKey, attendanceDate) {
  const database = await db();
  const key = sessionQueueKey(classKey, attendanceDate);
  return database.get(STORES.sessions, key);
}

export async function clearOfflineData() {
  const database = await db();
  await Promise.all([
    database.clear(STORES.pending),
    database.clear(STORES.students),
    database.clear(STORES.sessions)
  ]);
}
