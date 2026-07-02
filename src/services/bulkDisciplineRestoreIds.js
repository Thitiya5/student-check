/**
 * Generate operation ID before execution: BR-YYYYMMDD-xxxx
 * @param {string} [date] yyyy-MM-dd
 */
export function createBulkRestoreOperationId(date = '') {
  const compact = String(date || '').replace(/-/g, '') || '00000000';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BR-${compact}-${suffix}`;
}

/**
 * @param {import('./teacherAuth.js').TeacherAuthSession|null|undefined} session
 * @param {{ level?: string, room?: string }} scope
 */
export function describeBulkRestoreScope(scope = {}) {
  const level = String(scope.level || '').trim();
  const room = String(scope.room || '').trim();
  if (level && room) return `${level}/${room}`;
  if (level) return level;
  return 'ทั้งโรงเรียน';
}

/**
 * @param {import('./bulkDisciplineRestoreService.js').BulkRestorePreview} preview
 */
export function buildAffectedStudentsAudit(preview) {
  return (preview.students || []).map((student) => {
    const points = (student.transactions || []).reduce(
      (sum, txn) => sum + Math.abs(Number(txn.points) || 0),
      0
    );
    return {
      studentId: student.studentId,
      studentName: student.studentName,
      classKey: student.classKey,
      flagIds: [...(student.flagIds || [])],
      points,
      transactionIds: (student.transactions || []).map((txn) => txn.id).filter(Boolean)
    };
  });
}
