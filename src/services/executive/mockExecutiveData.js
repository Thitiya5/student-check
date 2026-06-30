/**
 * Sprint 1 — mock analytics data only (no Firestore).
 */

/** @typedef {object} ExecutiveSummary */
/** @typedef {object} ExecutiveGradeRow */
/** @typedef {object} ExecutiveInsights */
/** @typedef {object} ExecutiveSnapshot */

/**
 * @returns {ExecutiveSnapshot}
 */
export function getExecutiveMockSnapshot() {
  return {
    summary: {
      totalStudents: 2047,
      present: 1924,
      absent: 68,
      leave: 41,
      late: 14
    },
    gradeChart: [
      { grade: 'M1', presentPct: 94.2 },
      { grade: 'M2', presentPct: 93.1 },
      { grade: 'M3', presentPct: 95.4 },
      { grade: 'M4', presentPct: 91.8 },
      { grade: 'M5', presentPct: 92.6 },
      { grade: 'M6', presentPct: 90.5 }
    ],
    statusDistribution: [
      { status: 'present', count: 1924, pct: 94.0 },
      { status: 'absent', count: 68, pct: 3.3 },
      { status: 'leave', count: 41, pct: 2.0 },
      { status: 'late', count: 14, pct: 0.7 }
    ],
    trend: [
      { label: 'จ.', presentPct: 93.1 },
      { label: 'อ.', presentPct: 94.5 },
      { label: 'พ.', presentPct: 92.8 },
      { label: 'พฤ.', presentPct: 95.2 },
      { label: 'ศ.', presentPct: 94.0 }
    ],
    comparisonTable: [
      { grade: 'M1', present: 318, absent: 12, leave: 8, late: 3, attendancePct: 94.2 },
      { grade: 'M2', present: 341, absent: 15, leave: 9, late: 2, attendancePct: 93.1 },
      { grade: 'M3', present: 352, absent: 10, leave: 6, late: 4, attendancePct: 95.4 },
      { grade: 'M4', present: 329, absent: 14, leave: 7, late: 2, attendancePct: 91.8 },
      { grade: 'M5', present: 310, absent: 11, leave: 6, late: 3, attendancePct: 92.6 },
      { grade: 'M6', present: 274, absent: 6, leave: 5, late: 0, attendancePct: 90.5 }
    ],
    insights: {
      attendanceRate: 94.0,
      bestPerformingRoom: 'M3/2',
      roomNeedingAttention: 'M6/4'
    }
  };
}
