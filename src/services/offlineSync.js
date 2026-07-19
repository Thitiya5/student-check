/**
 * Flush pending attendance to Firestore when back online.
 */
import { saveClassAttendance } from './attendanceService.js';
import { syncClassPointTransactions } from './studentPointsService.js';
import {
  getPendingAttendance,
  updatePendingStatus,
  removePending,
  getPendingCount
} from './offlineDb.js';
import { clearSchoolOverviewCache } from './executive/schoolOverviewCache.js';
import { clearDisciplineReportCache } from './discipline/disciplineReportCache.js';

/**
 * @param {string} attendanceDate
 * @param {string} classKey
 */
function invalidateReadCachesAfterAttendanceSave(attendanceDate, classKey) {
  const dateKey = String(attendanceDate || '').trim();
  if (!dateKey) return;
  clearSchoolOverviewCache(dateKey);
  if (classKey) {
    clearDisciplineReportCache({ inspectionDate: dateKey, classKey: String(classKey) });
  }
}

let syncing = false;

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function notifyOfflineStatus() {
  window.dispatchEvent(new CustomEvent('offline-status-changed'));
}

/**
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export async function flushPendingAttendance() {
  if (!isOnline() || syncing) {
    return { synced: 0, failed: 0 };
  }

  syncing = true;
  notifyOfflineStatus();

  let synced = 0;
  let failed = 0;

  try {
    const pending = await getPendingAttendance();
    const queue = pending
      .filter((r) => r.status === 'pending' || r.status === 'failed')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    for (const item of queue) {
      if (!isOnline()) break;
      try {
        await updatePendingStatus(item.id, 'syncing');
        await saveClassAttendance({
          classKey: item.classKey,
          teacherName: item.teacherName,
          attendanceDate: item.attendanceDate,
          students: item.students,
          markSubmitted: Boolean(item.markSubmitted)
        });
        await syncClassPointTransactions({
          classKey: item.classKey,
          date: item.attendanceDate,
          teacherName: item.teacherName,
          students: item.students
        });
        await removePending(item.id);
        invalidateReadCachesAfterAttendanceSave(item.attendanceDate, item.classKey);
        synced += 1;
      } catch (err) {
        console.error('[sync] failed for', item.id, err);
        await updatePendingStatus(item.id, 'failed');
        failed += 1;
      }
    }
  } finally {
    syncing = false;
    notifyOfflineStatus();
  }

  return { synced, failed };
}

export async function getSyncState() {
  const pending = await getPendingCount();
  return {
    online: isOnline(),
    pending,
    syncing
  };
}

/** @param {(detail: { synced: number, failed: number }) => void} [onDone] */
export function startAutoSync(onDone) {
  const run = async () => {
    if (!isOnline()) return;
    const result = await flushPendingAttendance();
    if (result.synced > 0 || result.failed > 0) {
      onDone?.(result);
    }
  };

  window.addEventListener('online', () => void run());
  void run();
}
