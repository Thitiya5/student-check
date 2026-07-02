import { buildAttendanceClassKey, recordsToAttendanceMap } from '../../services/attendanceService.js';
import { filterAttendanceRows, filterRoster } from './executiveAggregates.js';
import { formatExecutiveClassLabel } from './executiveClassLabel.js';

/**
 * @typedef {object} ExecutiveRoomCompletionState
 * @property {string} classKey
 * @property {string} displayLabel
 * @property {boolean} submitted
 * @property {string|null} lastTimestamp
 * @property {string} teacherName
 * @property {number} studentCount
 */

/**
 * @param {{ updatedAt?: string|null, createdAt?: string|null, submittedAt?: string|null }} row
 * @returns {string|null}
 */
export function attendanceRowTimestamp(row) {
  const submitted = row?.submittedAt ? String(row.submittedAt) : '';
  if (submitted) return submitted;
  const updated = row?.updatedAt ? String(row.updatedAt) : '';
  if (updated) return updated;
  const created = row?.createdAt ? String(row.createdAt) : '';
  return created || null;
}

/**
 * A classroom is submitted when every roster student has an explicit save marker,
 * or (legacy) when every roster student has any attendance record.
 * @param {Array<{ student_id: string }>} roster
 * @param {Array<{ student_id: string, attendanceSubmitted?: boolean }>} classRows
 */
export function isClassAttendanceSubmitted(roster, classRows) {
  if (!roster.length) return false;

  const usesExplicitMarker = classRows.some((row) => row.attendanceSubmitted === true);
  if (usesExplicitMarker) {
    const rowByStudent = new Map(classRows.map((row) => [String(row.student_id || ''), row]));
    return roster.every((student) => {
      const row = rowByStudent.get(String(student.student_id || ''));
      return row?.attendanceSubmitted === true;
    });
  }

  const statusByStudent = recordsToAttendanceMap(classRows);
  return roster.every((student) => Boolean(statusByStudent[String(student.student_id || '')]));
}

/**
 * @param {Array<{ teacherName?: string, submittedBy?: string, attendanceSubmitted?: boolean, createdAt?: string|null, updatedAt?: string|null, submittedAt?: string|null }>} classRows
 */
export function pickClassSubmissionMeta(classRows) {
  if (!classRows.length) {
    return { lastTimestamp: null, teacherName: '' };
  }

  const submittedRows = classRows.filter((row) => row.attendanceSubmitted === true);
  const candidates = submittedRows.length ? submittedRows : classRows;

  let latestRow = candidates[0];
  let latestTs = attendanceRowTimestamp(latestRow) || '';

  for (const row of candidates) {
    const ts = attendanceRowTimestamp(row) || '';
    if (ts && ts >= latestTs) {
      latestTs = ts;
      latestRow = row;
    }
  }

  return {
    lastTimestamp: latestTs || null,
    teacherName: String(latestRow?.submittedBy || latestRow?.teacherName || '').trim()
  };
}

/**
 * @param {Array<{ student_id: string, level?: string, room?: string }>} roster
 * @param {Array<{ student_id: string, class?: string, teacherName?: string, createdAt?: string|null, updatedAt?: string|null }>} rows
 * @param {{ grade?: string, room?: string }} [filters]
 * @returns {ExecutiveRoomCompletionState[]}
 */
export function buildRoomCompletionStates(roster, rows, filters = {}) {
  const students = filterRoster(roster, filters);
  const attendanceRows = filterAttendanceRows(rows, filters);

  /** @type {Map<string, { classKey: string, roster: typeof students }>} */
  const rooms = new Map();
  for (const student of students) {
    const level = String(student.level || '').trim();
    const room = String(student.room || '').trim();
    if (!level || !room) continue;
    const classKey = buildAttendanceClassKey(level, room);
    if (!rooms.has(classKey)) {
      rooms.set(classKey, { classKey, roster: [] });
    }
    rooms.get(classKey).roster.push(student);
  }

  /** @type {Map<string, typeof attendanceRows>} */
  const rowsByClass = new Map();
  for (const row of attendanceRows) {
    const classKey = String(row.class || '');
    if (!classKey) continue;
    if (!rowsByClass.has(classKey)) rowsByClass.set(classKey, []);
    rowsByClass.get(classKey).push(row);
  }

  const states = [];
  for (const { classKey, roster: classRoster } of rooms.values()) {
    if (!classRoster.length) continue;

    const classRows = rowsByClass.get(classKey) || [];
    const submitted = isClassAttendanceSubmitted(classRoster, classRows);
    const meta = submitted ? pickClassSubmissionMeta(classRows) : { lastTimestamp: null, teacherName: '' };

    states.push({
      classKey,
      displayLabel: formatExecutiveClassLabel(classKey),
      submitted,
      lastTimestamp: meta.lastTimestamp,
      teacherName: meta.teacherName,
      studentCount: classRoster.length
    });
  }

  return states.sort((a, b) =>
    a.classKey.localeCompare(b.classKey, undefined, { numeric: true })
  );
}

/**
 * @param {ExecutiveRoomCompletionState[]} states
 */
function activeRoomStates(states) {
  return states.filter((state) => (state.studentCount ?? 0) > 0);
}

export function summarizeRoomCompletion(states) {
  const active = activeRoomStates(states);
  const totalRooms = active.length;
  const checkedRooms = active.filter((s) => s.submitted).length;
  const pendingRooms = totalRooms - checkedRooms;
  const completionPercent = totalRooms
    ? Math.round((checkedRooms / totalRooms) * 1000) / 10
    : 0;

  return { totalRooms, checkedRooms, pendingRooms, completionPercent };
}

/**
 * @param {ExecutiveRoomCompletionState[]} states
 */
export function listPendingRooms(states) {
  return activeRoomStates(states)
    .filter((s) => !s.submitted)
    .map((s) => ({
      classKey: s.classKey,
      displayLabel: s.displayLabel
    }));
}

/**
 * @param {ExecutiveRoomCompletionState[]} states
 */
export function findLastCompletedRoom(states) {
  const submitted = states.filter((s) => s.submitted && s.lastTimestamp);
  if (!submitted.length) {
    return { classKey: '', displayLabel: '—', teacherName: '—', timestamp: null };
  }

  const latest = submitted.reduce((best, current) => {
    const bestTs = best.lastTimestamp || '';
    const curTs = current.lastTimestamp || '';
    return curTs >= bestTs ? current : best;
  });

  return {
    classKey: latest.classKey,
    displayLabel: latest.displayLabel,
    teacherName: latest.teacherName || '—',
    timestamp: latest.lastTimestamp
  };
}

/**
 * @param {{ completionPercent: number, pendingRooms: number, totalRooms: number }} summary
 */
export function deriveOperationalStatus(summary) {
  const { completionPercent, pendingRooms, totalRooms } = summary;

  if (!totalRooms) {
    return { level: 'warn', messageKey: 'executive.completion.statusNoRooms' };
  }
  if (completionPercent >= 100) {
    return { level: 'ok', messageKey: 'executive.completion.statusDone' };
  }
  if (completionPercent < 50) {
    return {
      level: 'critical',
      messageKey: 'executive.completion.statusLow',
      percent: completionPercent
    };
  }
  return {
    level: 'warn',
    messageKey: 'executive.completion.statusPending',
    count: pendingRooms
  };
}
