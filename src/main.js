import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import './services/firebaseClient.js';
import { initI18n, t, onLanguageChange, getLanguage } from './i18n/index.js';
import { updateDocumentBranding } from './config/schoolBranding.js';
import { renderAppBrandStrip } from './components/schoolLogo.js';
import { initTheme } from './services/theme.js';
import { renderLoginPage } from './pages/login.js';
import { renderLoading } from './utils/ui.js';
import { escapeHtml } from './utils/html.js';
import { initAppSettings } from './services/appSettingsService.js';
import { syncClassPointTransactions, enrichStudentsForPointSync } from './services/studentPointsService.js';
import { renderBottomNav } from './components/navbar.js';
import { openConfirmModal } from './components/confirmModal.js';
import { loadAppState, saveAppState, getTodayDateKey, getDefaultAppState, STORAGE_KEY } from './data/mock.js';
import { syncStateToToday, startDayRolloverWatch } from './services/appDay.js';
import {
  buildAttendanceClassKey,
  getAttendanceForClassOnDate,
  recordsToAttendanceMap,
  saveClassAttendance
} from './services/attendanceService.js';
import {
  getStoredTeacherName,
  isLoggedIn,
  login as loginTeacher,
  logout as logoutTeacher,
  persistTeacherName
} from './services/teacherName.js';
import { recordLoginTime, clearLastLoginTime } from './services/session.js';
import { verifyFirestoreConnection } from './services/firebaseClient.js';
import { isGasConfigured, pingGas } from './services/googleAppsScript.js';
import { clearStudentsCache } from './services/studentsService.js';
import {
  loadTeacherAuthSession,
  canAccessLevelRoom,
  isAdminSession,
  canManageBehaviorSession,
  canViewPointsReportSession,
  canReturnDisciplinePointsSession,
  saveTeacherAuthSession
} from './services/teacherAuth.js';
import { canViewDisciplineReportSession } from './services/disciplineReportService.js';
import { resolveTeacherLogin, refreshTeacherSessionFromSheet, changeTeacherPin } from './services/teachersService.js';
import { normalizeAttendanceStatus, CHECK_DEFAULT_STATUS } from './data/attendanceStatuses.js';
import { disciplineEntryToFirestore } from './data/disciplineChecks.js';
import {
  buildPendingId,
  enqueuePendingAttendance,
  cacheClassSession
} from './services/offlineDb.js';
import {
  isOnline,
  notifyOfflineStatus,
  startAutoSync,
  flushPendingAttendance
} from './services/offlineSync.js';
import { renderOfflineBarMarkup, bindOfflineBar } from './components/offlineBar.js';
import { initInstallPrompt } from './components/installPrompt.js';
import {
  navigateTo,
  goBack,
  restoreScrollForRoute,
  getRoutePath
} from './services/navigation.js';

registerSW({
  immediate: true,
  onOfflineReady() {
    console.log('[pwa] offline shell ready');
  }
});

initInstallPrompt();

initI18n();
initTheme();
updateDocumentBranding(getLanguage());

const app = document.getElementById('app');
let state = loadAppState();
let authRedirectPending = false;
let pageCleanup = null;
let stopDayWatch = null;

state.currentLevel = state.currentLevel ?? '';
state.currentRoom = state.currentRoom ?? '';
state.classConfirmed = Boolean(state.classConfirmed);
state.teacherName = getStoredTeacherName() || String(state.teacherName ?? '').trim();

function syncTeacherFromStorage() {
  const stored = getStoredTeacherName();
  if (stored) state.teacherName = stored;
  const auth = loadTeacherAuthSession();
  if (auth) {
    state.teacherAuth = auth;
    state.teacherName = auth.teacherName || state.teacherName;
    state.username = auth.username || state.username;
    state.teacherRole = auth.role;
    state.assignedClasses = auth.assignedClasses;
    state.isAdmin = auth.isAdmin;
    state.isPastoral = auth.isPastoral;
    state.mustChangePin = false;
  }
}

function applyTodayToState({ rerender = false } = {}) {
  const { state: next, dayChanged } = syncStateToToday(state);
  if (next.currentDate !== state.currentDate || dayChanged) {
    state = next;
    saveAppState(state);
    if (rerender) renderApp();
    return true;
  }
  return dayChanged;
}

function startDayWatch() {
  stopDayWatch?.();
  stopDayWatch = startDayRolloverWatch(() => {
    if (applyTodayToState({ rerender: true })) {
      console.log('[app] calendar day changed — using', state.currentDate);
    }
  });
}

function ensureTeacherAuth() {
  if (!isLoggedIn()) return true;
  const auth = loadTeacherAuthSession();
  if (auth) return true;
  showToast(t('toast.loginRequired'));
  performLogout();
  return false;
}

function runPageCleanup() {
  if (!pageCleanup) return;
  try {
    pageCleanup();
  } catch (err) {
    console.warn('[app] page cleanup failed:', err);
  }
  pageCleanup = null;
}

function bindPageCleanup(pageContent) {
  const cleanups = [
    pageContent.__dashboardCleanup,
    pageContent.__checkCleanup,
    pageContent.__historyCleanup,
    pageContent.__studentsCleanup,
    pageContent.__settingsCleanup,
    pageContent.__studentProfileCleanup,
    pageContent.__inspectionCleanup,
    pageContent.__behaviorCleanup,
    pageContent.__pointsReportCleanup,
    pageContent.__disciplineReportCleanup,
    pageContent.__settingsAdminCleanup,
    pageContent.__menuCleanup
  ].filter((fn) => typeof fn === 'function');

  if (cleanups.length) {
    pageCleanup = () => cleanups.forEach((fn) => fn());
  }
}

onLanguageChange(() => {
  updateDocumentBranding(getLanguage());
  if (isLoggedIn() || getRoute() === '/login') {
    renderApp();
  }
});

window.addEventListener('hashchange', () => {
  authRedirectPending = false;
  renderApp();
});

syncTeacherFromStorage();
applyTodayToState();
startDayWatch();
renderApp();
void bootstrapApp();

async function bootstrapApp() {
  try {
    await initAppSettings();
    console.log('[settings] loaded');
  } catch (err) {
    console.warn('[settings] init failed', err?.message || err);
  }

  startAutoSync((result) => {
    if (result.synced > 0) {
      showToast(t('offline.syncedCount', { count: result.synced }));
    }
  });

  try {
    await verifyFirestoreConnection();
    console.log('[firebase] connection verified');
  } catch (err) {
    console.warn('[firebase] connection check failed:', err?.message || err);
    if (isLoggedIn()) {
      showToast(t('toast.firebaseFailed'));
    }
  }

  if (isGasConfigured()) {
    try {
      const ping = await pingGas();
      console.log('[GAS] connected:', ping?.message || 'ok');
    } catch (err) {
      console.warn('[GAS] connection failed:', err?.message);
      clearStudentsCache();
    }
  } else {
    console.warn('[GAS] not configured — set VITE_GAS_WEB_APP_URL or VITE_GOOGLE_SCRIPT_URL in .env');
  }

  if (isLoggedIn() && isGasConfigured()) {
    try {
      const verified = await refreshTeacherSessionFromSheet(state.teacherName);
      if (!verified) {
        console.warn('[auth] session invalid — removed from TEACHERS sheet');
        performLogout();
        window.location.hash = '/login';
        return;
      }
      syncTeacherFromStorage();
      applyTodayToState();
      saveAppState(state);
      renderApp();
    } catch (err) {
      console.warn('[auth] session verify skipped:', err?.message || err);
    }
  }
}

function getRoute() {
  const hash = window.location.hash.replace('#', '');
  const path = hash.split('?')[0];
  if (!path || path === '/') {
    return isLoggedIn() ? '/dashboard' : '/login';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function readProfileStudentFromStorage() {
  try {
    const raw = sessionStorage.getItem('profileStudent');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setState(updates, { rerender = true } = {}) {
  state = { ...state, ...updates };
  if ('teacherName' in updates && isLoggedIn()) {
    state.teacherName = persistTeacherName(state.teacherName);
  }
  saveAppState(state);
  if (rerender) renderApp();
}

async function loginUser(teacherName, pin = '') {
  const session = await resolveTeacherLogin(teacherName, pin);
  clearStudentsCache();
  const name = loginTeacher(session.teacherName);
  if (!name) return;
  state = {
    ...state,
    teacherName: name,
    username: session.username || state.username || '',
    teacherAuth: session,
    teacherRole: session.role,
    assignedClasses: session.assignedClasses,
    isAdmin: session.isAdmin,
    mustChangePin: false,
    currentLevel: '',
    currentRoom: '',
    classConfirmed: false
  };
  recordLoginTime();
  applyTodayToState();
  saveAppState(state);
  authRedirectPending = false;
  window.location.hash = '/dashboard';
}

function performLogout() {
  runPageCleanup();
  stopDayWatch?.();
  stopDayWatch = null;
  logoutTeacher();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  clearLastLoginTime();
  state = getDefaultAppState();
  authRedirectPending = false;
  saveAppState(state);
  startDayWatch();
  window.location.hash = '/login';
  renderApp();
}

function requestLogout() {
  openConfirmModal({
    title: t('settings.logoutTitle'),
    message: t('settings.logoutMessage'),
    confirmLabel: t('settings.logoutConfirm'),
    cancelLabel: t('common.cancel'),
    danger: true,
    onConfirm: performLogout
  });
}

/** Persist class picker without re-rendering (keeps in-progress attendance UI). */
function persistCheckDate(dateKey) {
  const date = String(dateKey || getTodayDateKey()).trim();
  state = { ...state, currentDate: date };
  saveAppState(state);
}

function persistClassSelection(level, room, { classConfirmed } = {}) {
  state = {
    ...state,
    currentLevel: String(level ?? '').trim(),
    currentRoom: String(room ?? '').trim(),
    ...(classConfirmed !== undefined ? { classConfirmed: Boolean(classConfirmed) } : {})
  };
  saveAppState(state);
}

function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast-message';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

async function loadClassAttendance(level, room, dateKey = getTodayDateKey()) {
  const classKey = buildAttendanceClassKey(level, room);
  const records = await getAttendanceForClassOnDate(classKey, dateKey);
  return recordsToAttendanceMap(records);
}

/**
 * @returns {Promise<boolean>}
 */
async function submitAttendance(
  attendance,
  {
    teacherName: teacherNameOverride,
    navigateAfterSave = false,
    classStudents = [],
    discipline = {},
    attendanceDate,
    level: levelOverride,
    room: roomOverride
  } = {}
) {
  const level = levelOverride ?? state.currentLevel;
  const room = roomOverride ?? state.currentRoom;
  const teacherName = String(teacherNameOverride ?? state.teacherName ?? getStoredTeacherName()).trim();
  const dateKey = attendanceDate || getTodayDateKey();

  if (!teacherName) {
    showToast(t('toast.loginRequired'));
    window.location.hash = '/login';
    return false;
  }

  if (!level || !room) {
    showToast(t('toast.pickClass'));
    return false;
  }

  if (!classStudents.length) {
    showToast(t('toast.noStudents'));
    return false;
  }

  const auth = state.teacherAuth || loadTeacherAuthSession();
  if (auth && !canAccessLevelRoom(auth, level, room)) {
    showToast(t('toast.classNotAllowed'));
    return false;
  }

  await initAppSettings();

  const studentsPayload = enrichStudentsForPointSync(
    classStudents.map((s) => {
      const sid = String(s.student_id);
      const disc = discipline[sid] || { flags: [], behaviors: [], note: '' };
      const status = normalizeAttendanceStatus(attendance[sid] || CHECK_DEFAULT_STATUS);
      return {
        student_id: sid,
        first_name: String(s.first_name ?? ''),
        last_name: String(s.last_name ?? ''),
        student_name: `${String(s.first_name ?? '').trim()} ${String(s.last_name ?? '').trim()}`.trim(),
        status,
        ...disciplineEntryToFirestore(disc)
      };
    }),
    dateKey
  );

  const classKey = buildAttendanceClassKey(level, room);
  const savePayload = {
    classKey,
    teacherName,
    attendanceDate: dateKey,
    students: studentsPayload
  };

  await cacheClassSession(classKey, dateKey, {
    attendance,
    discipline,
    students: classStudents
  });

  const syncPoints = async () => {
    await syncClassPointTransactions({
      classKey,
      date: dateKey,
      teacherName,
      students: studentsPayload
    });
  };

  if (!isOnline()) {
    await enqueuePendingAttendance({
      id: buildPendingId(savePayload),
      ...savePayload
    });
    notifyOfflineStatus();
    state = {
      ...state,
      attendance,
      teacherName: persistTeacherName(teacherName),
      currentDate: dateKey,
      currentLevel: level,
      currentRoom: room,
      classConfirmed: navigateAfterSave ? true : state.classConfirmed
    };
    saveAppState(state);
    showToast(t('offline.savedLocally'));
    if (navigateAfterSave) {
      window.location.hash = '/dashboard';
      return true;
    }
    renderApp();
    return true;
  }

  try {
    await saveClassAttendance(savePayload);
  } catch (err) {
    console.error('[attendance] save failed, queueing:', err);
    await enqueuePendingAttendance({
      id: buildPendingId(savePayload),
      ...savePayload
    });
    notifyOfflineStatus();
    showToast(t('offline.savedQueued'));
    return false;
  }
  try {
    await syncPoints();
    void flushPendingAttendance();
  } catch (err) {
    console.error('[attendance] point sync failed:', err);
    showToast(t('check.pointSyncFailed'));
  }

  state = {
    ...state,
    attendance,
    teacherName: persistTeacherName(teacherName),
    currentDate: dateKey,
    currentLevel: level,
    currentRoom: room,
    classConfirmed: navigateAfterSave ? true : state.classConfirmed
  };
  saveAppState(state);
  showToast(t('check.saveSuccess'));

  if (navigateAfterSave) {
    window.location.hash = '/dashboard';
    return true;
  }

  renderApp();
  return true;
}

function renderApp() {
  void renderAppAsync();
}

let renderAppSeq = 0;

/**
 * @param {HTMLElement} pageContent
 * @param {string} currentRoute
 * @param {object} pageCtx
 */
async function renderRoutePage(pageContent, currentRoute, pageCtx) {
  switch (currentRoute) {
    case '/dashboard': {
      const { renderDashboardPage } = await import('./pages/dashboard.js');
      renderDashboardPage(pageContent, pageCtx);
      break;
    }
    case '/check': {
      const { renderCheckPage } = await import('./pages/check.js');
      renderCheckPage(pageContent, {
        ...pageCtx,
        submitAttendance,
        loadClassAttendance,
        persistClassSelection,
        persistCheckDate
      });
      break;
    }
    case '/history': {
      const { renderHistoryPage } = await import('./pages/history.js');
      renderHistoryPage(pageContent, pageCtx);
      break;
    }
    case '/students': {
      const { renderStudentsPage } = await import('./pages/students.js');
      renderStudentsPage(pageContent, pageCtx);
      break;
    }
    case '/reports': {
      const { renderReportsPage } = await import('./pages/reports.js');
      renderReportsPage(pageContent, pageCtx);
      break;
    }
    case '/menu': {
      const { renderMenuPage } = await import('./pages/menu.js');
      renderMenuPage(pageContent, pageCtx);
      break;
    }
    case '/admin': {
      const { renderAdminPage } = await import('./pages/admin.js');
      renderAdminPage(pageContent, pageCtx);
      break;
    }
    case '/admin-teachers': {
      pageContent.classList.add('page-content--admin-teachers');
      const { renderAdminTeachersPage } = await import('./pages/adminTeachers.js');
      renderAdminTeachersPage(pageContent, pageCtx);
      break;
    }
    case '/admin-students': {
      pageContent.classList.add('page-content--admin-students');
      const { renderAdminStudentsPage } = await import('./pages/adminStudents.js');
      renderAdminStudentsPage(pageContent, pageCtx);
      break;
    }
    case '/inspection': {
      const { renderInspectionPage } = await import('./pages/inspection.js');
      renderInspectionPage(pageContent, pageCtx);
      break;
    }
    case '/admin-discipline': {
      const { renderDisciplineRecordsPage } = await import('./pages/disciplineRecords.js');
      renderDisciplineRecordsPage(pageContent, pageCtx);
      break;
    }
    case '/behavior': {
      const { renderBehaviorPage } = await import('./pages/behavior.js');
      renderBehaviorPage(pageContent, pageCtx);
      break;
    }
    case '/points-report': {
      const { renderPointsReportPage } = await import('./pages/pointsReport.js');
      renderPointsReportPage(pageContent, pageCtx);
      break;
    }
    case '/discipline-report': {
      const { renderDisciplineReportPage } = await import('./pages/disciplineReport.js');
      renderDisciplineReportPage(pageContent, pageCtx);
      break;
    }
    case '/student-profile': {
      const { renderStudentProfilePage } = await import('./pages/studentProfile.js');
      renderStudentProfilePage(pageContent, {
        ...pageCtx,
        state: { ...state, profileStudent: readProfileStudentFromStorage() }
      });
      break;
    }
    case '/settings': {
      const { renderSettingsPage } = await import('./pages/settings.js');
      renderSettingsPage(pageContent, pageCtx);
      break;
    }
    case '/change-pin': {
      const { renderChangePinPage } = await import('./pages/changePin.js');
      renderChangePinPage(pageContent, {
        ...pageCtx,
        onSubmit: async ({ currentPin, newPin }) => {
          const auth = state.teacherAuth || loadTeacherAuthSession();
          if (!auth) throw new Error(t('toast.loginRequired'));
          if (!isAdminSession(auth)) throw new Error(t('admin.denied'));
          await changeTeacherPin(auth, { currentPin, newPin });
          navigateTo('/settings');
        }
      });
      break;
    }
    case '/settings-admin': {
      pageContent.classList.add('page-content--settings-admin');
      const { renderSettingsAdminPage } = await import('./pages/settingsAdmin.js');
      renderSettingsAdminPage(pageContent, pageCtx);
      break;
    }
    default:
      pageContent.innerHTML = `<div class="ui-empty"><p class="ui-empty__title">${t('common.notFound')}</p></div>`;
  }
}

async function renderAppAsync() {
  syncTeacherFromStorage();
  applyTodayToState();
  runPageCleanup();

  const loggedIn = isLoggedIn();
  let currentRoute = getRoute();

  if (loggedIn && currentRoute !== '/login' && !ensureTeacherAuth()) {
    return;
  }

  if (!loggedIn && currentRoute !== '/login') {
    if (!authRedirectPending) {
      authRedirectPending = true;
      window.location.hash = '/login';
    }
    return;
  }

  if (loggedIn && currentRoute === '/login') {
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/change-pin' && !isAdminSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('admin.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/admin' && !isAdminSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('admin.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/inspection' && !isAdminSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('admin.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/admin-discipline' && !canReturnDisciplinePointsSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('disciplineRecords.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/settings-admin' && !isAdminSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('admin.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/admin-teachers' && !isAdminSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('admin.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/admin-students' && !isAdminSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('admin.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/behavior' && !canManageBehaviorSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('behavior.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/points-report' && !canViewPointsReportSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('pointsReport.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  if (loggedIn && currentRoute === '/discipline-report' && !canViewDisciplineReportSession(state.teacherAuth || loadTeacherAuthSession())) {
    showToast(t('disciplineReport.denied'));
    window.location.hash = '/dashboard';
    return;
  }

  authRedirectPending = false;
  const shell = document.createElement('div');
  shell.className = 'page-shell';

  const pageContent = document.createElement('main');
  pageContent.className = [
    'page-content',
    currentRoute === '/check' || currentRoute === '/behavior' ? 'has-fixed-save' : '',
    currentRoute === '/login' ? 'page-content--login' : '',
    currentRoute === '/dashboard' ? 'page-content--dashboard' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const pageCtx = {
    state,
    onNavigate: (path, opts) => navigateTo(path, opts),
    onBack: (fallback = '/dashboard') => goBack(fallback),
    onToast: showToast,
    onLogout: requestLogout,
    onLocaleChange: () => renderApp()
  };

  if (currentRoute === '/login') {
    renderLoginPage(pageContent, {
      onLogin: async (name, pin) => {
        try {
          await loginUser(name, pin);
        } catch (err) {
          showToast(err?.message || t('login.failed'));
          throw err;
        }
      },
      onToast: showToast,
      initialName: state.username || state.teacherName
    });
    shell.appendChild(pageContent);
    app.innerHTML = '';
    app.appendChild(shell);
    return;
  }

  const authSession = state.teacherAuth || loadTeacherAuthSession();
  const navbar = document.createElement('div');
  navbar.innerHTML = renderBottomNav(currentRoute, {
    showPointsReport: canViewPointsReportSession(authSession)
  });
  navbar.addEventListener('click', (e) => {
    const button = e.target.closest('.bottom-nav-button');
    if (button?.dataset.target) {
      navigateTo(button.dataset.target);
    }
  });

  pageContent.innerHTML = renderLoading(t('common.loading'));

  shell.insertAdjacentHTML('afterbegin', renderOfflineBarMarkup());
  shell.appendChild(pageContent);
  shell.appendChild(navbar);
  app.innerHTML = '';
  app.appendChild(shell);
  bindOfflineBar(showToast);

  const renderSeq = ++renderAppSeq;
  try {
    await renderRoutePage(pageContent, currentRoute, pageCtx);
  } catch (err) {
    if (renderSeq !== renderAppSeq) return;
    console.error('[app] route render failed', err);
    pageContent.innerHTML = `<div class="ui-empty"><p class="ui-empty__title">${t('common.loadFailed')}</p><p class="ui-empty__hint">${escapeHtml(String(err?.message || ''))}</p></div>`;
  }
  if (renderSeq !== renderAppSeq) return;

  bindPageCleanup(pageContent);
  pageContent.insertAdjacentHTML('afterbegin', renderAppBrandStrip());
  restoreScrollForRoute(getRoutePath(currentRoute));
}
