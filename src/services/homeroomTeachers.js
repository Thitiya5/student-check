import { fetchTeachers } from './teachersService.js';
import { classKeysMatch, parseAssignedClasses, toCanonicalClassKey } from './teacherAuth.js';

/**
 * ครูที่ ASSIGNED_CLASSES ตรงกับห้อง (อาจมีมากกว่า 1 คน)
 * @param {string} classKey เช่น M1/1
 * @returns {Promise<string[]>}
 */
export async function findHomeroomTeachersForClass(classKey) {
  const target = toCanonicalClassKey(classKey);
  if (!target) return [];

  const teachers = await fetchTeachers();
  const names = new Set();

  for (const teacher of teachers) {
    if (teacher.active === false) continue;
    const classes = parseAssignedClasses(teacher.assigned_classes);
    if (classes.includes('ALL')) continue;
    if (classes.some((c) => classKeysMatch(c, target))) {
      const name = String(teacher.teacher_name || '').trim();
      if (name) names.add(name);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'th'));
}
