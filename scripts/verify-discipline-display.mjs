/**
 * Regression checks for discipline deduction signs and save-badge deltas.
 * Run: npm run test:discipline
 */
import assert from 'node:assert/strict';
import { formatDisciplineScore, summarizeDisciplineChanges, emptyDisciplineEntry } from '../src/data/disciplineChecks.js';
import { getDisciplineDeductionPoints } from '../src/services/appSettingsService.js';

const students = [{ student_id: 'S1', first_name: 'A', last_name: 'B' }];
assert.equal(getDisciplineDeductionPoints('uniform'), -5);
assert.equal(getDisciplineDeductionPoints('hair'), -5);
assert.equal(getDisciplineDeductionPoints('nails'), -5);
assert.equal(getDisciplineDeductionPoints('accessories'), -5);

assert.equal(formatDisciplineScore(-5), '-5');
assert.equal(formatDisciplineScore(5), '+5');
assert.equal(formatDisciplineScore(-705), '-705');

const name = (s) => `${s.first_name} ${s.last_name}`;

const addFlag = summarizeDisciplineChanges(
  students,
  { S1: { ...emptyDisciplineEntry(), flags: ['uniform'] } },
  { S1: emptyDisciplineEntry() },
  name
);
assert.equal(addFlag.totalDelta, -5);
assert.equal(addFlag.items[0]?.points, -5);
assert.equal(formatDisciplineScore(addFlag.items[0]?.points), '-5');

const removeFlag = summarizeDisciplineChanges(
  students,
  { S1: emptyDisciplineEntry() },
  { S1: { ...emptyDisciplineEntry(), flags: ['uniform'] } },
  name
);
assert.equal(removeFlag.totalDelta, 5);
assert.equal(removeFlag.items[0]?.points, 5);

// Status-driven clear without baseline sync would falsely report restoration (+5).
const staleBaseline = summarizeDisciplineChanges(
  students,
  { S1: { ...emptyDisciplineEntry(), flags: [] } },
  { S1: { ...emptyDisciplineEntry(), flags: ['uniform', 'hair', 'nails', 'accessories'] } },
  name
);
assert.ok(staleBaseline.totalDelta > 0, 'stale baseline should inflate positive delta');

// After baseline matches present-state flags, save should not report discipline delta.
const syncedBaseline = summarizeDisciplineChanges(
  students,
  { S1: { ...emptyDisciplineEntry(), flags: [] } },
  { S1: { ...emptyDisciplineEntry(), flags: [] } },
  name
);
assert.equal(syncedBaseline.totalDelta, 0);
assert.equal(syncedBaseline.items.length, 0);

console.log('discipline-display: all checks passed');
