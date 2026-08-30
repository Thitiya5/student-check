/**
 * Filter unofficial / test students from score and roster views.
 */

/**
 * @param {{ student_id?: string, studentId?: string, student_name?: string, studentName?: string, first_name?: string, last_name?: string }} record
 */
export function isTestStudentRecord(record = {}) {
  const id = String(record.student_id || record.studentId || '').trim();
  const name = [
    record.student_name,
    record.studentName,
    record.first_name,
    record.last_name
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (/ทดสอบ|test\s*student|^test[\s_-]|^demo[\s_-]/i.test(name)) return true;
  if (/^TEST[\d_-]*$/i.test(id) || /^DEMO[\d_-]*$/i.test(id)) return true;
  return false;
}

/**
 * @param {string} classKey e.g. M1/4
 */
export function parseClassKeyParts(classKey) {
  const ck = String(classKey || '').trim();
  const slash = ck.indexOf('/');
  if (slash <= 0) return { level: '', room: '' };
  return { level: ck.slice(0, slash), room: ck.slice(slash + 1) };
}

/**
 * @param {string[]} classKeys
 * @param {(level: string, room: string) => Promise<object[]>} fetchRoster
 */
export async function loadOfficialRosterForClassKeys(classKeys, fetchRoster) {
  /** @type {Map<string, object>} student_id -> roster row */
  const byId = new Map();
  const unique = [...new Set(classKeys.map((k) => String(k || '').trim()).filter(Boolean))];

  await Promise.all(
    unique.map(async (classKey) => {
      const { level, room } = parseClassKeyParts(classKey);
      if (!level || !room) return;
      try {
        const students = await fetchRoster(level, room);
        for (const s of students) {
          const sid = String(s.student_id || '').trim();
          if (!sid || isTestStudentRecord(s)) continue;
          byId.set(sid, { ...s, class: classKey });
        }
      } catch (err) {
        console.warn('[roster] load failed for score filter', classKey, err);
      }
    })
  );

  return [...byId.values()];
}

/**
 * @param {Array<{ studentId?: string, studentName?: string, classKey?: string }>} reports
 * @param {object[]} [officialRoster]
 */
export function filterScoreReportsToOfficialRoster(reports, officialRoster = []) {
  let list = (reports || []).filter((r) => !isTestStudentRecord(r));
  if (!officialRoster.length) return list;

  const allowed = new Set(
    officialRoster
      .map((s) => String(s.student_id || '').trim())
      .filter(Boolean)
  );
  if (!allowed.size) return list;

  return list.filter((r) => allowed.has(String(r.studentId || '').trim()));
}
