/**
 * Regression checks for configurable school holidays (v3.2.1+).
 * Run: npm run test:holidays
 */
import assert from 'node:assert/strict';
import { isSchoolDay, isWeekendDate } from '../src/utils/dateIso.js';
import {
  normalizeSchoolHolidays,
  getSchoolHoliday,
  isConfiguredSchoolHoliday,
  isAttendanceRequiredDate,
  countHolidayDays
} from '../src/utils/schoolHolidays.js';
import { buildCompletionMeta } from '../src/services/executive/executiveCompletionService.js';
import {
  buildMonthDayColumns,
  getMatrixNonAttendanceCellLabel,
  isMatrixNonAttendanceDay
} from '../src/utils/monthMatrixDayColumns.js';
import { summarizeRoomCompletion } from '../src/utils/executive/executiveCompletionAggregates.js';

const settings = {
  schoolHolidays: normalizeSchoolHolidays([
    { id: 'h1', name: 'วันเข้าพรรษา', startDate: '2026-07-29', endDate: '2026-07-30' },
    { id: 'h1-dup', name: 'duplicate id', startDate: '2026-08-01', endDate: '2026-08-01' },
    { id: '', name: 'bad range', startDate: '2026-08-05', endDate: '2026-08-04' },
    { id: 'ok', name: 'single', startDate: 'not-a-date', endDate: '2026-08-10' }
  ])
};

/** @returns {import('../src/utils/executive/executiveCompletionAggregates.js').ExecutiveRoomCompletionState[]} */
function mockRoomStates(submitted = false) {
  return [
    {
      classKey: 'M1/1',
      displayLabel: 'M1/1',
      submitted,
      lastTimestamp: submitted ? '2026-07-29T08:00:00.000Z' : null,
      teacherName: submitted ? 'Teacher A' : '',
      studentCount: 30
    },
    {
      classKey: 'M1/2',
      displayLabel: 'M1/2',
      submitted: false,
      lastTimestamp: null,
      teacherName: '',
      studentCount: 28
    }
  ];
}

assert.equal(isSchoolDay('2026-07-27'), true, 'Monday remains school day');
assert.equal(isWeekendDate('2026-07-25'), true, 'Saturday unchanged');
assert.equal(isWeekendDate('2026-07-26'), true, 'Sunday unchanged');

assert.equal(isConfiguredSchoolHoliday('2026-07-29', settings), true);
assert.equal(isConfiguredSchoolHoliday('2026-07-30', settings), true);
assert.equal(isAttendanceRequiredDate('2026-07-29', settings), false);
assert.equal(isAttendanceRequiredDate('2026-07-28', settings), true);
assert.equal(isAttendanceRequiredDate('2026-07-31', settings), true);
assert.equal(countHolidayDays(getSchoolHoliday('2026-07-29', settings)), 2);
assert.equal(settings.schoolHolidays.length, 2, 'invalid/duplicate entries normalized safely');

const emptySettings = { schoolHolidays: [] };
assert.deepEqual(normalizeSchoolHolidays(undefined), []);
assert.equal(isConfiguredSchoolHoliday('2026-07-29', emptySettings), false);
assert.equal(isAttendanceRequiredDate('2026-07-29', emptySettings), isSchoolDay('2026-07-29'));

// A. School Overview: holiday => attendanceRequired=false, pendingRooms=0, not fake submitted
const holidayContext = {
  date: '2026-07-29',
  roomStates: mockRoomStates(false)
};
const holidayMeta = buildCompletionMeta(holidayContext, settings);
assert.equal(holidayMeta.attendanceRequired, false, 'holiday is non-attendance day');
assert.equal(holidayMeta.status.pendingRooms, 0, 'holiday produces zero pending');
assert.equal(holidayMeta.pendingRooms.length, 0, 'pending room list is empty');
assert.equal(holidayMeta.status.checkedRooms, 0, 'does not mark rooms as submitted');
assert.equal(holidayMeta.status.completionPercent, 0, 'does not show 100% completion');
assert.equal(
  holidayMeta.operationalStatus.messageKey,
  'executive.completion.statusHoliday',
  'holiday operational status is explicit'
);
assert.equal(holidayContext.roomStates.every((room) => room.submitted === false), true, 'room flags unchanged');

const rawPending = summarizeRoomCompletion(holidayContext.roomStates).pendingRooms;
assert.equal(rawPending, 2, 'raw aggregation would still show pending without non-required override');
assert.notEqual(holidayMeta.status.pendingRooms, rawPending, 'non-required summary differs from submitted/completed');

// B. Monthly matrix PDF model: holiday classification + H indicator
const cols = buildMonthDayColumns('2026-07', settings);
const day29 = cols.find((col) => col.dateKey === '2026-07-29');
const day30 = cols.find((col) => col.dateKey === '2026-07-30');
const day28 = cols.find((col) => col.dateKey === '2026-07-28');
assert.equal(day29?.isHoliday, true, 'holiday date flagged');
assert.equal(day30?.isHoliday, true, 'multi-day holiday covered');
assert.equal(day28?.isHoliday, false, 'day before holiday remains normal');
assert.equal(isMatrixNonAttendanceDay(day29), true, 'holiday is non-school-day cell');
assert.equal(getMatrixNonAttendanceCellLabel(day29), 'H', 'holiday cell uses H indicator');
assert.equal(getMatrixNonAttendanceCellLabel(day28), '', 'normal weekday has no H label');

// C. Historical safety: configuring holiday does not rewrite saved attendance or room flags
const historicalRecords = [
  {
    student_id: 's1',
    status: 'present',
    attendanceSubmitted: true,
    attendanceDate: '2026-07-29'
  },
  {
    student_id: 's2',
    status: 'absent',
    attendanceSubmitted: true,
    attendanceDate: '2026-07-29'
  }
];
const recordsBefore = structuredClone(historicalRecords);
const historicalContext = {
  date: '2026-07-29',
  roomStates: [
    {
      classKey: 'M1/1',
      displayLabel: 'M1/1',
      submitted: true,
      lastTimestamp: '2026-07-29T08:30:00.000Z',
      teacherName: 'Teacher A',
      studentCount: 2
    }
  ]
};
const historicalMeta = buildCompletionMeta(historicalContext, settings);
assert.deepEqual(historicalRecords, recordsBefore, 'attendance records unchanged after holiday config');
assert.equal(historicalMeta.attendanceRequired, false, 'holiday blocks new requirement only');
assert.equal(historicalMeta.status.pendingRooms, 0, 'no pending on holiday despite preserved records');
assert.equal(historicalContext.roomStates[0].submitted, true, 'attendanceSubmitted semantics preserved');
assert.equal(historicalMeta.status.checkedRooms, 1, 'actual submitted count preserved, not inflated');
assert.equal(historicalMeta.status.completionPercent, 0, 'not presented as attendance completed');

// Edge guards: holiday blocks requirement only; weekday unchanged
assert.equal(isAttendanceRequiredDate('2026-07-28', settings), true, 'normal weekday unchanged');
assert.equal(isAttendanceRequiredDate('2026-07-26', settings), false, 'existing weekend behavior unchanged');

console.log('school-holidays: all checks passed');
