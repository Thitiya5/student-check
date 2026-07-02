/**
 * Bulk discipline point restore — admin-only, inspection categories only.
 * Uses attendance waive + point sync (same as per-student returnDisciplinePointsForStudent).
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { queryAttendanceByDateSchoolWide } from './attendanceService.js';
import { bulkReturnDisciplinePointsForClass } from './disciplineReturnService.js';
import { queryPointsInRangeForSession, reasonLabel } from './studentPointsService.js';
import { isAdminSession } from './teacherAuth.js';
import { initAppSettings } from './appSettingsService.js';
import {
  buildAffectedStudentsAudit,
  createBulkRestoreOperationId,
  describeBulkRestoreScope
} from './bulkDisciplineRestoreIds.js';

export const INSPECTION_DISCIPLINE_FLAG_IDS = ['uniform', 'hair', 'nails', 'accessories'];

const BULK_RESTORE_COLLECTION = 'bulk_discipline_restores';

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null|undefined} session
 */
function assertAdmin(session) {
  if (!isAdminSession(session)) {
    const err = new Error('เฉพาะผู้ดูแลระบบเท่านั้น');
    err.code = 'bulk-restore-denied';
    throw err;
  }
}

export function createBulkRestoreId(date) {
  return createBulkRestoreOperationId(date);
}

/**
 * @param {string} classKey
 * @param {string} [level]
 * @param {string} [room]
 */
function matchesClassFilter(classKey, level, room) {
  const [lvl = '', rm = ''] = String(classKey || '').split('/');
  if (level && lvl !== level) return false;
  if (room && rm !== room) return false;
  return true;
}

/**
 * @param {object} row
 */
function isEligibleDisciplinePointRow(row) {
  if ((row.category || row.type) !== 'discipline') return false;
  if (Number(row.points) >= 0) return false;
  if (row.source === 'manual') return false;
  return INSPECTION_DISCIPLINE_FLAG_IDS.includes(String(row.reason || ''));
}

/**
 * @param {object|undefined|null} rec
 * @returns {'waived'|'bulk-restored'|null}
 */
function attendanceSkipReason(rec) {
  if (!rec) return null;
  if (rec.disciplineWaived) return 'waived';
  if (String(rec.bulkRestoreId || '').trim()) return 'bulk-restored';
  return null;
}

/**
 * @typedef {object} BulkRestorePreviewStudent
 * @property {string} studentId
 * @property {string} studentName
 * @property {string} classKey
 * @property {string[]} flagIds
 * @property {Array<{ id: string, reason: string, points: number }>} transactions
 */

/**
 * @typedef {object} BulkRestorePreview
 * @property {string} date
 * @property {string} level
 * @property {string} room
 * @property {number} studentCount
 * @property {number} transactionCount
 * @property {number} totalPointsToRestore
 * @property {Array<{ label: string, count: number, points: number }>} byCategory
 * @property {Array<{ classKey: string, students: number, transactions: number }>} byClass
 * @property {Array<{ level: string, students: number }>} byLevel
 * @property {number} skippedWaived
 * @property {number} skippedBulk
 * @property {BulkRestorePreviewStudent[]} students
 * @property {string[]} transactionIds
 * @property {string} operationId
 */

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ date?: string, level?: string, room?: string }} opts
 * @returns {Promise<BulkRestorePreview>}
 */
export async function previewBulkDisciplineRestore(session, opts = {}) {
  assertAdmin(session);
  await initAppSettings();

  const date = String(opts.date || '').trim();
  const level = String(opts.level || '').trim();
  const room = String(opts.room || '').trim();
  if (!date) {
    throw new Error('กรุณาเลือกวันที่ตรวจ');
  }

  const pointRows = await queryPointsInRangeForSession(session, {
    from: date,
    to: date,
    level: level || undefined,
    room: room || undefined,
    category: 'discipline',
    deductionsOnly: true
  });

  const eligiblePoints = pointRows.filter(isEligibleDisciplinePointRow);
  const attendanceRows = await queryAttendanceByDateSchoolWide(date);
  /** @type {Map<string, object>} */
  const attendanceByKey = new Map();
  for (const row of attendanceRows) {
    if (!matchesClassFilter(row.class, level, room)) continue;
    attendanceByKey.set(`${row.class}::${row.student_id}`, row);
  }

  /** @type {Map<string, BulkRestorePreviewStudent>} */
  const studentMap = new Map();
  let skippedWaived = 0;
  let skippedBulk = 0;

  for (const row of eligiblePoints) {
    const classKey = String(row.class || '');
    const studentId = String(row.student_id || '');
    if (!classKey || !studentId) continue;

    const key = `${classKey}::${studentId}`;
    const rec = attendanceByKey.get(key);
    const skip = attendanceSkipReason(rec);
    if (skip === 'waived') {
      skippedWaived += 1;
      continue;
    }
    if (skip === 'bulk-restored') {
      skippedBulk += 1;
      continue;
    }

    if (!studentMap.has(key)) {
      studentMap.set(key, {
        studentId,
        studentName: String(row.student_name || studentId),
        classKey,
        flagIds: [],
        transactions: []
      });
    }

    const entry = studentMap.get(key);
    const reason = String(row.reason || '');
    if (!entry.flagIds.includes(reason)) entry.flagIds.push(reason);
    entry.transactions.push({
      id: String(row.id || ''),
      reason,
      points: Number(row.points) || 0
    });
  }

  const students = [...studentMap.values()];
  const transactions = students.flatMap((s) => s.transactions);
  const totalPointsToRestore = transactions.reduce((sum, txn) => sum + Math.abs(Number(txn.points) || 0), 0);

  /** @type {Record<string, { label: string, count: number, points: number }>} */
  const byCategoryMap = {};
  for (const txn of transactions) {
    const label = reasonLabel(txn.reason, 'discipline');
    if (!byCategoryMap[label]) {
      byCategoryMap[label] = { label, count: 0, points: 0 };
    }
    byCategoryMap[label].count += 1;
    byCategoryMap[label].points += Math.abs(Number(txn.points) || 0);
  }

  /** @type {Record<string, { classKey: string, students: Set<string>, transactions: number }>} */
  const byClassMap = {};
  for (const student of students) {
    if (!byClassMap[student.classKey]) {
      byClassMap[student.classKey] = {
        classKey: student.classKey,
        students: new Set(),
        transactions: 0
      };
    }
    byClassMap[student.classKey].students.add(student.studentId);
    byClassMap[student.classKey].transactions += student.transactions.length;
  }

  /** @type {Record<string, number>} */
  const byLevelMap = {};
  for (const student of students) {
    const lvl = student.classKey.split('/')[0] || '—';
    byLevelMap[lvl] = (byLevelMap[lvl] || 0) + 1;
  }

  return {
    date,
    level,
    room,
    operationId: createBulkRestoreOperationId(date),
    studentCount: students.length,
    transactionCount: transactions.length,
    totalPointsToRestore,
    byCategory: Object.values(byCategoryMap).sort((a, b) => a.label.localeCompare(b.label, 'th')),
    byClass: Object.values(byClassMap)
      .map((row) => ({
        classKey: row.classKey,
        students: row.students.size,
        transactions: row.transactions
      }))
      .sort((a, b) => a.classKey.localeCompare(b.classKey, 'th')),
    byLevel: Object.entries(byLevelMap)
      .map(([lvl, count]) => ({ level: lvl, students: count }))
      .sort((a, b) => a.level.localeCompare(b.level, 'th')),
    skippedWaived,
    skippedBulk,
    students,
    transactionIds: transactions.map((txn) => txn.id).filter(Boolean)
  };
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{
 *   date?: string,
 *   level?: string,
 *   room?: string,
 *   restoreReason?: string,
 *   teacherName?: string,
 *   preview?: BulkRestorePreview,
 *   operationId?: string,
 *   onProgress?: (progress: { done: number, total: number, classKey?: string }) => void
 * }} opts
 */
export async function executeBulkDisciplineRestore(session, opts = {}) {
  assertAdmin(session);
  await initAppSettings();

  const restoreReason = String(opts.restoreReason || '').trim();
  if (!restoreReason) {
    throw new Error('กรุณาระบุเหตุผลการคืนคะแนน');
  }

  const preview = opts.preview || (await previewBulkDisciplineRestore(session, opts));
  if (!preview.studentCount) {
    throw new Error('ไม่มีรายการที่คืนได้ — อาจคืนไปแล้วหรือไม่มีข้อมูลในวันที่เลือก');
  }

  const bulkRestoreId = String(
    opts.operationId || preview.operationId || createBulkRestoreOperationId(preview.date)
  );
  const teacherName = String(opts.teacherName || session?.teacherName || '').trim();
  const adminId = String(session?.userId || session?.username || teacherName || '').trim();
  const returnedAt = new Date().toISOString();
  const scopeLabel = describeBulkRestoreScope({ level: preview.level, room: preview.room });
  const affectedStudents = buildAffectedStudentsAudit(preview);
  const affectedClasses = preview.byClass.map((row) => row.classKey);

  /** @type {Map<string, Array<{ studentId: string, flagIds: string[] }>>} */
  const byClass = new Map();
  for (const student of preview.students) {
    if (!byClass.has(student.classKey)) byClass.set(student.classKey, []);
    byClass.get(student.classKey).push({
      studentId: student.studentId,
      flagIds: [...student.flagIds]
    });
  }

  const classKeys = [...byClass.keys()].sort((a, b) => a.localeCompare(b, 'th'));
  /** @type {Array<{ classKey: string, message: string }>} */
  const classErrors = [];
  let done = 0;

  for (const classKey of classKeys) {
    opts.onProgress?.({ done, total: classKeys.length, classKey });
    try {
      await bulkReturnDisciplinePointsForClass({
        classKey,
        date: preview.date,
        teacherName,
        bulkRestoreId,
        restoreReason,
        returnedAt,
        targets: byClass.get(classKey) || []
      });
    } catch (err) {
      classErrors.push({
        classKey,
        message: err instanceof Error ? err.message : String(err)
      });
    }
    done += 1;
    opts.onProgress?.({ done, total: classKeys.length, classKey });
  }

  if (classErrors.length === classKeys.length) {
    throw new Error('คืนคะแนนไม่สำเร็จทุกห้อง — ไม่มีการบันทึก audit');
  }

  const result = {
    operationId: bulkRestoreId,
    bulkRestoreId,
    date: preview.date,
    scope: {
      level: preview.level || '',
      room: preview.room || '',
      label: scopeLabel
    },
    level: preview.level,
    room: preview.room,
    restoreReason,
    adminName: teacherName,
    adminId,
    restoredBy: teacherName,
    restoredAt: returnedAt,
    studentCount: preview.studentCount,
    transactionCount: preview.transactionCount,
    totalPointsRestored: preview.totalPointsToRestore,
    byCategory: preview.byCategory,
    byClass: preview.byClass,
    byLevel: preview.byLevel,
    affectedStudents,
    affectedClasses,
    transactionIds: preview.transactionIds,
    originalTransactionIds: preview.transactionIds,
    classesProcessed: classKeys.length - classErrors.length,
    classErrors
  };

  await setDoc(doc(db, BULK_RESTORE_COLLECTION, bulkRestoreId), {
    ...result,
    createdAt: serverTimestamp()
  });

  return result;
}

/**
 * @param {object} summary
 * @returns {string}
 */
export function buildBulkRestoreSummaryText(summary) {
  const lines = [
    'คืนคะแนนระเบียบทั้งโรงเรียน — สรุป',
    `เลขที่รายการ: ${summary.operationId || summary.bulkRestoreId || '—'}`,
    `ขอบเขต: ${summary.scope?.label || describeBulkRestoreScope(summary)}`,
    `วันที่ตรวจ: ${summary.date || '—'}`,
    `เหตุผล: ${summary.restoreReason || '—'}`,
    `ดำเนินการโดย: ${summary.restoredBy || '—'}`,
    `เวลา: ${summary.restoredAt || '—'}`,
    `นักเรียน: ${summary.studentCount ?? 0}`,
    `รายการ: ${summary.transactionCount ?? 0}`,
    `คะแนนที่คืนรวม: ${summary.totalPointsRestored ?? 0}`,
    '',
    'ตามหมวด:',
    ...(summary.byCategory || []).map(
      (row) => `- ${row.label}: ${row.count} รายการ (${row.points} คะแนน)`
    ),
    '',
    'ตามห้อง:',
    ...(summary.byClass || []).map(
      (row) => `- ${row.classKey}: ${row.students} คน · ${row.transactions} รายการ`
    )
  ];
  if (summary.classErrors?.length) {
    lines.push('', 'ข้อผิดพลาด:');
    for (const err of summary.classErrors) {
      lines.push(`- ${err.classKey}: ${err.message}`);
    }
  }
  return lines.join('\n');
}
