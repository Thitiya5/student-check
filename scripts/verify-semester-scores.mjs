/**
 * Regression checks for semester-based score accumulation.
 * Run: npm run test:scores
 */
import assert from 'node:assert/strict';
import {
  computeScoreFromTransactions,
  computeScoreBreakdownFromTransactions
} from '../src/utils/pointCalculations.js';
import { getSemesterDateRange } from '../src/utils/studentAttendanceSummary.js';
import {
  buildStudentScoreReport,
  filterCommunityServiceReports,
  requiresCommunityService,
  filterScoreReports,
  sortScoreReportsByClassThenScore,
  buildClassScoreReports
} from '../src/services/studentScoreService.js';
import {
  isTestStudentRecord,
  filterScoreReportsToOfficialRoster
} from '../src/utils/studentRosterFilter.js';
import { shouldAutoLoadDashboardScores } from '../src/pages/dashboard.js';
import { getHomeroomClassKeys, isSchoolWideViewSession } from '../src/services/teacherAuth.js';

const monthA = [
  { category: 'attendance', points: -5, transactionDate: '2026-06-10' },
  { category: 'discipline', points: -10, transactionDate: '2026-06-15', reason: 'uniform' }
];

const monthB = [
  { category: 'behavior', points: 5, transactionDate: '2026-07-02', reason: 'good' },
  { category: 'attendance', points: -2, transactionDate: '2026-07-05' }
];

const semesterTxns = [...monthA, ...monthB];
const semesterScore = computeScoreFromTransactions(semesterTxns);
assert.equal(semesterScore.totalScore, 88, 'Month A deductions remain in Month B');

const monthBOnly = computeScoreFromTransactions(monthB);
assert.equal(monthBOnly.totalScore, 103, 'Month B alone should not include Month A');

const breakdown = computeScoreBreakdownFromTransactions(semesterTxns);
assert.equal(breakdown.attendanceDeductions, 7);
assert.equal(breakdown.disciplineDeductions, 10);
assert.equal(breakdown.behaviorPositive, 5);
assert.equal(breakdown.behaviorNegative, 0);
assert.equal(breakdown.totalScore, 88);

const report = buildStudentScoreReport({
  studentId: 'S1',
  studentName: 'Test Student',
  classKey: '1/1',
  attendanceRows: [],
  transactions: semesterTxns
});
assert.equal(report.totalScore, 88);
assert.equal(report.startingScore, 100);

const sem1 = getSemesterDateRange('2026-06-15');
assert.equal(sem1.from, '2026-05-01');
assert.equal(sem1.to, '2026-10-31');

const sem2Active = getSemesterDateRange('2026-01-20');
assert.equal(sem2Active.from, '2025-11-01');
assert.equal(sem2Active.to, '2026-04-30');

const sem2Start = getSemesterDateRange('2026-11-15');
assert.equal(sem2Start.from, '2026-11-01');
assert.equal(sem2Start.to, '2027-04-30');

const prevSemesterTxns = [
  { category: 'attendance', points: -20, transactionDate: '2025-12-01' }
];
const newSemesterTxns = [{ category: 'attendance', points: -3, transactionDate: '2026-06-01' }];
const newSemOnly = computeScoreFromTransactions(newSemesterTxns);
assert.equal(newSemOnly.totalScore, 97, 'Previous semester excluded when querying new semester only');

const csList = filterCommunityServiceReports([
  { studentId: 'a', totalScore: 45 },
  { studentId: 'b', totalScore: 59 },
  { studentId: 'c', totalScore: 60 },
  { studentId: 'd', totalScore: 72 }
]);
assert.deepEqual(
  csList.map((r) => r.studentId),
  ['a', 'b'],
  'Only scores strictly below 60'
);
assert.equal(requiresCommunityService(60), false);
assert.equal(requiresCommunityService(59), true);

const filtered = filterScoreReports(
  [
    { studentId: '1', studentName: 'Ann', classKey: '1/1', totalScore: 55 },
    { studentId: '2', studentName: 'Bob', classKey: '1/2', totalScore: 80 }
  ],
  { classKey: '1/1', communityServiceOnly: true }
);
assert.equal(filtered.length, 1);
assert.equal(filtered[0].studentId, '1');

const classOrder = sortScoreReportsByClassThenScore([
  { studentId: 'a', classKey: 'M1/7', totalScore: 50, studentName: 'G' },
  { studentId: 'b', classKey: 'M1/4', totalScore: 80, studentName: 'A' },
  { studentId: 'c', classKey: 'M1/5', totalScore: 60, studentName: 'B' },
  { studentId: 'd', classKey: 'M1/4', totalScore: 55, studentName: 'C' }
]);
assert.deepEqual(
  classOrder.map((r) => r.classKey),
  ['M1/4', 'M1/4', 'M1/5', 'M1/7'],
  'Rooms sorted numerically before score'
);

const adminSession = { isAdmin: true, assignedClasses: ['ALL'] };
const homeroomSession = { role: 'teacher', assignedClasses: ['1/1'] };
assert.equal(shouldAutoLoadDashboardScores(adminSession), false);
assert.equal(shouldAutoLoadDashboardScores(homeroomSession), true);
assert.equal(isSchoolWideViewSession(adminSession), true);
assert.equal(getHomeroomClassKeys(homeroomSession).length, 1);

assert.equal(isTestStudentRecord({ student_name: 'นักเรียนทดสอบ' }), true);
assert.equal(isTestStudentRecord({ student_id: 'TEST01' }), true);
assert.equal(isTestStudentRecord({ student_name: 'สมชาย ใจดี', student_id: '12345' }), false);

const ghostReports = buildClassScoreReports(
  [{ student_id: 'GHOST', student_name: 'นักเรียนทดสอบ', class: 'M1/1', attendanceDate: '2026-06-01', status: 'present' }],
  [{ student_id: 'GHOST', student_name: 'นักเรียนทดสอบ', class: 'M1/1', points: -5, category: 'attendance' }],
  [{ student_id: 'REAL1', first_name: 'สม', last_name: 'ชาย', class: 'M1/1' }],
  { officialRosterOnly: true }
);
assert.equal(ghostReports.length, 1);
assert.equal(ghostReports[0].studentId, 'REAL1');

const filteredOfficial = filterScoreReportsToOfficialRoster(
  [
    { studentId: 'REAL1', studentName: 'สม ชาย' },
    { studentId: 'GHOST', studentName: 'นักเรียนทดสอบ' }
  ],
  [{ student_id: 'REAL1', first_name: 'สม', last_name: 'ชาย' }]
);
assert.deepEqual(filteredOfficial.map((r) => r.studentId), ['REAL1']);

console.log('semester-scores: all checks passed');
