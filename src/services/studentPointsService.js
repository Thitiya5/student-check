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
  normalizeDisciplineFlags,
  resolveBehaviorEntryPoints,
  resolveDisciplineFlagsForScoring,
  shouldApplyInspectionAutoFail
} from '../data/disciplineChecks.js';
import {
  canRecordDisciplineOnDate,
  isAttendanceScoringEnabled,
  canApplyAttendancePenaltyOnDate,
  getAttendancePenaltyPoints,
  getDisciplineDeductionPoints,
  getDisciplineDeductionRuleIds,
  initAppSettings
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
  autoFailInspection = false,
  disciplineWaived = false
}) {
  /** @type {Array<{ id: string, category: PointCategory, reason: string, points: number, note: string }>} */
  const out = [];
  const key = normalizeAttendanceStatus(status);
  const waivedOpts = { disciplineWaived };
  const resolvedFlags = resolveDisciplineFlagsForScoring(status, date, flags, waivedOpts);
  const autoFail =
    autoFailInspection || shouldApplyInspectionAutoFail(status, date, resolvedFlags, waivedOpts);

  if (isAttendanceScoringEnabled() && canApplyAttendancePenaltyOnDate(date)) {
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

  const needsDiscipline =
    autoFail || canRecordDisciplineOnDate(date) || (key === 'absent' && resolvedFlags.length > 0);

  if (needsDiscipline) {
    const rules = getDisciplineChecks();
    const deductionIds = getDisciplineDeductionRuleIds();
    const flagSet = autoFail
      ? rules.length
        ? rules.map((r) => r.id)
        : deductionIds
      : normalizeDisciplineFlags(resolvedFlags);

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

    const behaviorList = autoFail ? [] : behaviors;
    for (const b of behaviorList) {
      if (b.kind !== 'good' && b.kind !== 'bad') continue;
      const note = String(b.note ?? '').trim();
      const pts = resolveBehaviorEntryPoints(b);
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
/**
 * Class keys visible to session (optionally one level/room).
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 * @param {{ level?: string, room?: string }} [opts]
 */
export async function listSessionClassKeys(session, opts = {}) {
  const { fetchLevelOptions, fetchRoomOptions } = await import('./studentsService.js');
  const { buildAttendanceClassKey } = await import('./attendanceService.js');
  const {
    isSchoolWideViewSession,
    getViewClassKeys,
    canViewLevelRoom
  } = await import('./teacherAuth.js');

  const level = String(opts.level || '').trim();
  const room = String(opts.room || '').trim();
  if (level && room) return [buildAttendanceClassKey(level, room)];
  if (level) {
    const rooms = await fetchRoomOptions(level);
    return rooms.map((r) => buildAttendanceClassKey(level, r));
  }

  if (isSchoolWideViewSession(session)) {
    const levels = await fetchLevelOptions();
    const keys = [];
    for (const lvl of levels) {
      const rooms = await fetchRoomOptions(lvl);
      for (const rm of rooms) keys.push(buildAttendanceClassKey(lvl, rm));
    }
    return keys;
  }

  return getViewClassKeys(session) || [];
}

/**
 * Point transactions for session scope in a date range.
 * @param {import('./teacherAuth.js').TeacherAuthSession|null} session
 */
export async function queryPointsInRangeForSession(session, opts = {}) {
  const from = String(opts.from || '');
  const to = String(opts.to || from);
  if (!from || !to || !session) return [];

  const { canViewLevelRoom } = await import('./teacherAuth.js');
  const { buildAttendanceClassKey } = await import('./attendanceService.js');

  let classKeys = opts.classKey
    ? [String(opts.classKey)]
    : await listSessionClassKeys(session, { level: opts.level, room: opts.room });

  classKeys = classKeys.filter((key) => {
    const slash = key.indexOf('/');
    if (slash < 0) return false;
    return canViewLevelRoom(session, key.slice(0, slash), key.slice(slash + 1));
  });

  if (!classKeys.length) return [];

  const chunks = await Promise.all(
    classKeys.map((k) => queryClassPointsInRange(k, from, to).catch(() => []))
  );
  let rows = chunks.flat();

  if (opts.category) {
    const cat = String(opts.category);
    rows = rows.filter((r) => (r.category || r.type) === cat);
  }
  if (opts.teacherName) {
    const teacher = String(opts.teacherName);
    rows = rows.filter((r) => r.teacherName === teacher);
  }
  if (opts.deductionsOnly) {
    rows = rows.filter((r) => Number(r.points) < 0);
  }
  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student_name.toLowerCase().includes(q) || r.student_id.toLowerCase().includes(q)
    );
  }

  return rows.sort((a, b) => {
    const byDate = (b.transactionDate || b.date || '').localeCompare(a.transactionDate || a.date || '');
    if (byDate) return byDate;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

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

/**
 * Ensure absent + inspection day students carry full discipline flags before save/sync.
 * @param {Array<object>} students
 * @param {string} date yyyy-MM-dd
 */
export function enrichStudentsForPointSync(students, date) {
  return (students || []).map((s) => {
    const status = normalizeAttendanceStatus(s.status);
    const disciplineWaived = Boolean(s.disciplineWaived);
    const rawFlags = s.disciplineFlags || s.flags || [];
    const disciplineFlags = resolveDisciplineFlagsForScoring(status, date, rawFlags, { disciplineWaived });
    return {
      ...s,
      status,
      disciplineFlags,
      disciplineWaived
    };
  });
}

export async function syncClassPointTransactions(payload) {
  await initAppSettings();
  const { classKey, date, teacherName } = payload;
  const students = enrichStudentsForPointSync(payload.students, date);
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

    const status = normalizeAttendanceStatus(s.status);
    const disciplineWaived = Boolean(s.disciplineWaived);
    const flags = resolveDisciplineFlagsForScoring(
      status,
      date,
      s.disciplineFlags || s.flags || [],
      { disciplineWaived }
    );
    const autoFail = shouldApplyInspectionAutoFail(status, date, flags, { disciplineWaived });
    const expected = buildExpectedTransactionsForDay({
      studentId: sid,
      date,
      status,
      flags,
      behaviors: s.disciplineBehaviors || s.behaviors || [],
      autoFailInspection: autoFail,
      disciplineWaived
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

  const payloadStudentIds = new Set(students.map((s) => String(s.student_id)));
  for (const [sid, oldRows] of byStudent) {
    if (payloadStudentIds.has(sid)) continue;
    for (const old of oldRows) {
      ops.push({ ref: doc(db, COLLECTION, old.id), delete: true });
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

/**
 * Remove all system-generated point rows for one class/day (e.g. attendance fully cleared).
 * @returns {Promise<number>} rows deleted
 */
export async function purgeSystemPointTransactionsForClassDay(classKey, date) {
  const existing = await queryPointsByClassAndDate(classKey, date);
  const systemRows = existing.filter((r) => r.source !== 'manual');
  if (!systemRows.length) return 0;

  for (let i = 0; i < systemRows.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of systemRows.slice(i, i + BATCH_LIMIT)) {
      batch.delete(doc(db, COLLECTION, row.id));
    }
    await batch.commit();
  }
  return systemRows.length;
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
