import { clearTeacherAuthSession, loadTeacherAuthSession } from './teacherAuth.js';

export const TEACHER_NAME_STORAGE_KEY = 'student-check-teacher-name';

export function getStoredTeacherName() {
  try {
    return localStorage.getItem(TEACHER_NAME_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function isLoggedIn() {
  const auth = loadTeacherAuthSession();
  if (auth?.teacherName) return true;
  return Boolean(getStoredTeacherName());
}

/**
 * @param {string} name
 * @returns {string} trimmed name
 */
export function persistTeacherName(name) {
  const trimmed = String(name ?? '').trim();
  try {
    if (trimmed) {
      localStorage.setItem(TEACHER_NAME_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(TEACHER_NAME_STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
  return trimmed;
}

/**
 * @param {string} teacherName
 * @returns {string}
 */
export function login(teacherName) {
  return persistTeacherName(teacherName);
}

export function logout() {
  persistTeacherName('');
  clearTeacherAuthSession();
}

/**
 * @param {string} teacherName
 * @returns {boolean}
 */
export function requireTeacherName(teacherName) {
  if (!String(teacherName ?? '').trim()) {
    alert('กรุณาระบุชื่อครู');
    return false;
  }
  return true;
}
