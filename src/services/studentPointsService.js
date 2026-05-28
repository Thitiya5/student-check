import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import {
  getDisciplineChecks,
  normalizeDisciplineFlags
} from '../data/disciplineChecks.js';
import {
  canRecordDisciplineOnDate,
  isAttendanceScoringEnabled,
  getAttendancePenaltyPoints,
  getDisciplineDeductionPoints,
  getBehaviorGoodPoints,
  getBehaviorBadPoints
} from '../services/appSettingsService.js';
import { t } from '../i18n/index.js';

const COLLECTION = 'student_points';
const BATCH_LIMIT = 450;

/** @typedef {'attendance'|'discipline'|'behavior'|'manual'} PointCategory */

/**
 * @typedef {object} PointTransaction
 * @property {string} id
 * @property {string} student_id
 * @property {string} student_name
 * @property {string} class
 * @property {PointCategory} category
 * @property {string} reason
 * @property {number} points
 * @property {string} note
 * @property {string} transactionDate
 * @property {string} teacherName
 * @property {'system'|'manual'} source
 * @property {string|null} createdAt
 * @property {Array<object>} [editHistory]
 */

function colRef() {
  return collection(db, COLLECTION);
}

function mapTxnDoc(docSnap) {
  const data = docSnap.data();
  const createdAt = data.createdAt?.toDate?.() ?? null;
  const transactionDate = String(data.transactionDate ?? data.date ?? '');
  const category = /** @type {PointCategory} */ (
    data.category || data.type || 'manual'
  );
  return {
    id: docSnap.id,
    student_id: String(data.student_id ?? ''),
    student_name: String(data.student_name ?? ''),
    class: String(data.class ?? ''),
    category,
    type: category,
    reason: String(data.reason ?? ''),
    points: Number(data.points) || 0,
    note: String(data.note ?? ''),
    date: transactionDate,
    transactionDate,
    teacherName: String(data.teacherName ?? ''),
    source: data.source === 'manual' ? 'manual' : 'system',
    createdAt: createdAt ? createdAt.toISOString() : null,
    editHistory: Array.isArray(data.editHistory) ? data.editHistory : []
  };
}

/**
 * @param {string} studentId
 * @param {string} date
 * @param {PointCategory} category
 * @param {string} reason
 */
export function systemTransactionId(studentId, date, category, reason) {
  const safeStudent = String(studentId).replace(/[/\s]/g, '_');
  const safeReason = String(reason).replace(/[/\s]/g, '_');
  return `${safeStudent}__${date}__${category}__${safeReason}`;
}

export function manualTransactionId() {
  return `manual__${Date.now()}__${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {string} reason @param {PointCategory} [category] */
export function reasonLabel(reason, category = 'discipline') {
  if (category === 'attendance') {
    if (reason === 'absent') return t('status.absent');
    if (reason === 'late') return t('status.late');
  }
  if (category === 'behavior') {
    if (reason === 'good') return t('discipline.goodDeed');
    if (reason === 'bad') return t('discipline.badDeed');
  }
  const rule = getDisciplineChecks().find((r) => r.id === reason);
  if (rule) return t(rule.labelKey);
  if (reason === 'restore') return t('points.restore');
  if (reason === 'inspection_auto') return t('points.inspectionAuto');
  return reason;
}

function txnPayload(base) {
  return {
    student_id: base.student_id,
    student_name: base.student_name,
    class: base.class,
    category: base.category,
    type: base.category,
    reason: base.reason,
    points: base.points,
    note: base.note || '',
    transactionDate: base.transactionDate,
    date: base.transactionDate,
    teacherName: base.teacherName,
    source: base.source || 'system'
  };
}

/**
 * @param {object} p
 */
export function buildExpectedTransactionsForDay({
  studentId,
  date,
  status,
  flags = [],
  behaviors = [],
  autoFailInspection = false
}) {
  /** @type {Array<{ id: string, category: PointCategory, reason: string, points: number, note: string }>} */
  const out = [];
  const key = normalizeAttendanceStatus(status);

  if (isAttendanceScoringEnabled()) {
    if (key === 'absent') {
      const pts = getAttendancePenaltyPoints('absent');
      if (pts) {
        out.push({
          id: systemTransactionId(studentId, date, 'attendance', 'absent'),
          category: 'attendance',
          reason: 'absent',
          points: pts,
          note: ''
        });
      }
    } else if (key === 'late') {
      const pts = getAttendancePenaltyPoints('late');
      if (pts) {
        out.push({
          id: systemTransactionId(studentId, date, 'attendance', 'late'),
          category: 'attendance',
          reason: 'late',
          points: pts,
          note: ''
        });
      }
    }
  }

  if (canRecordDisciplineOnDate(date)) {
    const rules = getDisciplineChecks();
    const flagSet = autoFailInspection
      ? rules.map((r) => r.id)
      : normalizeDisciplineFlags(flags);

    for (const flagId of flagSet) {
      const pts = getDisciplineDeductionPoints(flagId);
      if (!pts) continue;
      out.push({
        id: systemTransactionId(studentId, date, 'discipline', flagId),
        category: 'discipline',
        reason: flagId,
        points: pts,
        note: ''
      });
    }

    const behaviorList = autoFailInspection ? [] : behaviors;
    for (const b of behaviorList) {
      if (b.kind !== 'good' && b.kind !== 'bad') continue;
      const note = String(b.note ?? '').trim();
      const pts = b.kind === 'good' ? getBehaviorGoodPoints() : getBehaviorBadPoints();
      if (!pts) continue;
      out.push({
        id: systemTransactionId(studentId, date, 'behavior', b.kind),
        category: 'behavior',
        reason: b.kind,
        points: pts,
        note
      });
    }
  }

  return out;
}

/**
 * @param {PointTransaction[]} transactions
 */
export function sumTransactionPoints(transactions) {
  return transactions.reduce((sum, row) => sum + (Number(row.points) || 0), 0);
}

export async function queryPointsByClassAndDate(classKey, date) {
  const q = query(
    colRef(),
    where('class', '==', classKey),
    where('transactionDate', '==', date)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(mapTxnDoc);
  } catch {
    const qLegacy = query(colRef(), where('class', '==', classKey), where('date', '==', date));
    const snap = await getDocs(qLegacy);
    return snap.docs.map(mapTxnDoc);
  }
}

export async function queryStudentTransactions(studentId, from, to) {
  const q = query(
    colRef(),
    where('student_id', '==', String(studentId)),
    where('transactionDate', '>=', from),
    where('transactionDate', '<=', to),
    orderBy('transactionDate', 'desc')
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(mapTxnDoc);
  } catch {
    const qLegacy = query(
      colRef(),
      where('student_id', '==', String(studentId)),
      where('date', '>=', from),
      where('date', '<=', to),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(qLegacy);
    return snap.docs.map(mapTxnDoc);
  }
}

/**
 * Class-scoped point transactions in a date range (Spark-friendly).
 * @param {string} classKey
 * @param {string} from yyyy-MM-dd
 * @param {string} to yyyy-MM-dd
 */
export async function queryClassPointsInRange(classKey, from, to) {
  const q = query(
    colRef(),
    where('class', '==', String(classKey)),
    where('transactionDate', '>=', from),
    where('transactionDate', '<=', to)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(mapTxnDoc);
  } catch {
    const qLegacy = query(
      colRef(),
      where('class', '==', String(classKey)),
      where('date', '>=', from),
      where('date', '<=', to)
    );
    const snap = await getDocs(qLegacy);
    return snap.docs.map(mapTxnDoc);
  }
}

export async function queryRecentStudentTransactions(studentId, max = 150) {
  const q = query(
    colRef(),
    where('student_id', '==', String(studentId)),
    orderBy('transactionDate', 'desc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map(mapTxnDoc);
}

export async function syncClassPointTransactions(payload) {
  const { classKey, date, teacherName, students } = payload;
  const existing = await queryPointsByClassAndDate(classKey, date);
  const existingSystem = existing.filter((r) => r.source === 'system');

  /** @type {Map<string, PointTransaction[]>} */
  const byStudent = new Map();
  for (const row of existingSystem) {
    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, []);
    byStudent.get(row.student_id).push(row);
  }

  /** @type {Array<{ ref: import('firebase/firestore').DocumentReference, data?: object, delete?: boolean }>} */
  const ops = [];

  for (const s of students) {
    const sid = String(s.student_id);
    const studentName =
      String(s.student_name ?? '').trim() ||
      `${String(s.first_name ?? '').trim()} ${String(s.last_name ?? '').trim()}`.trim();

    const expected = buildExpectedTransactionsForDay({
      studentId: sid,
      date,
      status: s.status,
      flags: s.disciplineFlags || [],
      behaviors: s.disciplineBehaviors || s.behaviors || []
    });
    const expectedIds = new Set(expected.map((e) => e.id));

    for (const txn of expected) {
      ops.push({
        ref: doc(db, COLLECTION, txn.id),
        data: {
          ...txnPayload({
            student_id: sid,
            student_name: studentName,
            class: classKey,
            category: txn.category,
            reason: txn.reason,
            points: txn.points,
            note: txn.note,
            transactionDate: date,
            teacherName,
            source: 'system'
          }),
          createdAt: serverTimestamp()
        }
      });
    }

    for (const old of byStudent.get(sid) || []) {
      if (!expectedIds.has(old.id)) {
        ops.push({ ref: doc(db, COLLECTION, old.id), delete: true });
      }
    }
  }

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    for (const op of chunk) {
      if (op.delete) batch.delete(op.ref);
      else batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function syncInspectionPointTransactions(payload) {
  const students = payload.students.map((s) => ({
    student_id: s.student_id,
    student_name: s.student_name,
    status: s.status,
    disciplineFlags: s.autoFail
      ? getDisciplineChecks().map((r) => r.id)
      : normalizeDisciplineFlags(s.flags),
    disciplineBehaviors: []
  }));
  await syncClassPointTransactions({
    classKey: payload.classKey,
    date: payload.date,
    teacherName: payload.teacherName,
    students
  });
}

export async function createManualTransaction(txn) {
  const id = txn.id || manualTransactionId();
  const ref = doc(db, COLLECTION, id);
  const transactionDate = String(txn.transactionDate ?? txn.date);
  await setDoc(
    ref,
    {
      ...txnPayload({
        student_id: txn.student_id,
        student_name: txn.student_name,
        class: txn.class,
        category: txn.category || 'manual',
        reason: txn.reason,
        points: txn.points,
        note: txn.note,
        transactionDate,
        teacherName: txn.teacherName,
        source: 'manual'
      }),
      createdAt: serverTimestamp(),
      editHistory: []
    },
    { merge: true }
  );
  return id;
}

export async function deletePointTransaction(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function updatePointTransaction(id, updates, editorName = '') {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const payload = {};
  if (updates.points !== undefined) payload.points = Number(updates.points);
  if (updates.reason !== undefined) payload.reason = String(updates.reason);
  if (updates.note !== undefined) payload.note = String(updates.note);
  if (updates.teacherName !== undefined) payload.teacherName = String(updates.teacherName);

  const history = Array.isArray(prev.editHistory) ? [...prev.editHistory] : [];
  if (editorName) {
    history.push({
      at: new Date().toISOString(),
      by: editorName,
      points: prev.points,
      reason: prev.reason,
      note: prev.note
    });
    payload.editHistory = history.slice(-20);
  }

  await setDoc(ref, payload, { merge: true });
}
