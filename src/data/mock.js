import { getStoredTeacherName } from '../services/teacherName.js';
import { loadTeacherAuthSession } from '../services/teacherAuth.js';
import { getTodayDate, getTodayDateKey } from '../utils/dateIso.js';
import { syncStateToToday } from '../services/appDay.js';

export const STORAGE_KEY = 'student-check-state';

export function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultAppState();
    }
    const parsed = JSON.parse(raw);
    parsed.classConfirmed = Boolean(parsed.classConfirmed);
    parsed.attendanceHistory = Array.isArray(parsed.attendanceHistory) ? parsed.attendanceHistory : [];
    parsed.attendanceRecords = parsed.attendanceRecords || {};
    const { state: synced, dayChanged } = syncStateToToday(parsed);
    Object.assign(parsed, synced);
    if (dayChanged) {
      console.log('[state] new calendar day — attendance UI reset for', parsed.currentDate);
    }
    parsed.teacherName =
      String(parsed.teacherName ?? '').trim() ||
      String(parsed.currentUser?.username ?? '').trim() ||
      getStoredTeacherName();
    const auth = loadTeacherAuthSession();
    if (auth) {
      parsed.teacherAuth = auth;
      parsed.isAdmin = auth.isAdmin;
      parsed.assignedClasses = auth.assignedClasses;
      parsed.teacherRole = auth.role;
      if (!parsed.teacherName) parsed.teacherName = auth.teacherName;
    }
    return parsed;
  } catch (error) {
    console.warn('[state] load failed, using defaults', error);
    return getDefaultAppState();
  }
}

export function getDefaultAppState() {
  const auth = loadTeacherAuthSession();
  return {
    teacherName: auth?.teacherName || getStoredTeacherName(),
    teacherAuth: auth,
    teacherRole: auth?.role ?? '',
    assignedClasses: auth?.assignedClasses ?? [],
    isAdmin: Boolean(auth?.isAdmin),
    attendance: {},
    attendanceHistory: [],
    attendanceRecords: {},
    currentLevel: '',
    currentRoom: '',
    currentDate: getTodayDateKey(),
    classConfirmed: false,
    historyDate: '',
    historyClass: '',
    historyTeacher: ''
  };
}

export { getTodayDate, getTodayDateKey } from '../utils/dateIso.js';

export function saveAppState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
