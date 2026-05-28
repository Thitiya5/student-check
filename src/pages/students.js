import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty, renderError } from '../utils/ui.js';
import {
  fetchLevelOptions,
  fetchRoomOptions,
  fetchStudentsByClass,
  studentFullName
} from '../services/studentsService.js';
import { isGasConfigured } from '../services/googleAppsScript.js';
import {
  buildAttendanceClassKey,
  parseClassKey,
  queryAttendanceInRangeForSession,
  queryStudentAttendanceInRange
} from '../services/attendanceService.js';
import {
  loadTeacherAuthSession,
  isAdminSession,
  getAllowedClassKeys,
  classKeysToPickerOptions,
  canAccessLevelRoom
} from '../services/teacherAuth.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, renderNavQuickLinks, bindPageHeaderActions } from '../components/pageHeader.js';
import {
  getSemesterDateRange,
  dedupeRecordsByDate,
  summarizeStudentAttendance
} from '../utils/studentAttendanceSummary.js';

const STUDENTS_SELECTION_KEY = 'studentsSelectionV1';

function readStudentsSelection() {
  try {
    const raw = sessionStorage.getItem(STUDENTS_SELECTION_KEY);
    if (!raw) return { level: '', room: '' };
    const parsed = JSON.parse(raw);
    return {
      level: String(parsed?.level || ''),
      room: String(parsed?.room || '')
    };
  } catch {
    return { level: '', room: '' };
  }
}

function writeStudentsSelection(level, room) {
  try {
    sessionStorage.setItem(
      STUDENTS_SELECTION_KEY,
      JSON.stringify({
        level: String(level || ''),
        room: String(room || '')
      })
    );
  } catch {
    // ignore
  }
}

/**
 * @param {Array<{ student_id: string, attendanceDate: string, status: string, createdAt?: string|null, disciplineScore?: number }>} rows
 */
function buildClassSummaryCache(rows) {
  /** @type {Map<string, { summary: ReturnType<typeof summarizeStudentAttendance>, recentRecords: typeof rows }>} */
  const cache = new Map();
  /** @type {Map<string, typeof rows>} */
  const byStudent = new Map();
  for (const row of rows) {
    const sid = String(row.student_id);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(row);
  }
  for (const [sid, recs] of byStudent) {
    const days = dedupeRecordsByDate(recs);
    cache.set(sid, {
      summary: summarizeStudentAttendance(days),
      recentRecords: days
    });
  }
  return cache;
}

/**
 * @param {object} s
 * @param {'ok'|'watch'|'alert'|undefined} risk
 */
function studentCard(s, risk) {
  const displayName = studentFullName(s);
  const riskBadge =
    risk === 'alert'
      ? `<span class="student-admin-card__risk student-admin-card__risk--alert">${escapeHtml(t('students.riskBadgeAlert'))}</span>`
      : risk === 'watch'
        ? `<span class="student-admin-card__risk student-admin-card__risk--watch">${escapeHtml(t('students.riskBadgeWatch'))}</span>`
        : '';
  const riskClass = risk && risk !== 'ok' ? ` student-admin-card--${risk}` : '';

  return `<button type="button" class="student-admin-card glass-card${riskClass}" data-id="${escapeHtml(s.student_id)}">
    <div class="student-admin-card__head">
      <div class="student-admin-card__title">
        <span class="student-admin-card__no">เลขที่ ${escapeHtml(s.number || '-')}</span>
        ${riskBadge}
      </div>
      <span class="student-admin-card__chevron" aria-hidden="true">›</span>
    </div>
    <strong class="student-admin-card__name">${escapeHtml(displayName)}</strong>
    <p class="student-admin-card__id">รหัส ${escapeHtml(s.student_id)}${s.class_key ? ` · ${escapeHtml(s.class_key)}` : ''}</p>
    <p class="student-admin-card__meta">${escapeHtml(s.level)}/${escapeHtml(s.room)}</p>
    <p class="student-admin-card__parent">ผู้ปกครอง: ${escapeHtml(s.parent_name || '-')} · ${escapeHtml(s.parent_phone || '-')}</p>
    <p class="student-admin-card__tap">${escapeHtml(t('students.tapForSummary'))}</p>
  </button>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ state?: object, onToast?: (msg: string) => void }} ctx
 */
export function renderStudentsPage(container, { state = {}, onToast, onLogout, onNavigate, onBack } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  const admin = isAdminSession(session);
  const allowedKeys = getAllowedClassKeys(session);
  const savedSelection = readStudentsSelection();

  let level = savedSelection.level;
  let room = savedSelection.room;
  let students = [];
  /** @type {Map<string, { summary: ReturnType<typeof summarizeStudentAttendance>, recentRecords: Array<object> }>} */
  let summaryCache = new Map();
  let profileOpen = false;

  const gasReady = isGasConfigured();

  container.innerHTML = `${renderPageHeader({
    title: t('students.title'),
    topAction: 'back'
  })}
  ${renderNavQuickLinks([
    { label: t('nav.home'), path: '/dashboard' },
    { label: t('dashboard.quick.check'), path: '/check' }
  ])}
  <section class="filter-panel glass-card sticky-filters">
    <div class="filter-grid">
      <label class="field"><span>${escapeHtml(t('common.level'))}</span><select id="stuLevel" class="select-field"><option value="">${escapeHtml(t('common.select'))}</option></select></label>
      <label class="field"><span>${escapeHtml(t('common.room'))}</span><select id="stuRoom" class="select-field" disabled><option value="">${escapeHtml(t('common.select'))}</option></select></label>
    </div>
    <label class="field"><span>${escapeHtml(t('common.search'))}</span><input id="stuSearch" class="input-field" placeholder="${escapeHtml(t('common.nameOrId'))}" disabled /></label>
  </section>
  <section id="studentsList">${
    gasReady
      ? renderEmpty(t('students.pickBoth'))
      : renderError(t('check.gasNotConfigured'), t('check.gasHint'), 'stuSettingsBtn')
  }</section>`;

  bindPageHeaderActions(container, {
    onLogout,
    onBack: () => onBack?.('/dashboard'),
    onNavigate
  });

  const listEl = container.querySelector('#studentsList');
  const levelSel = container.querySelector('#stuLevel');
  const roomSel = container.querySelector('#stuRoom');
  const searchInput = container.querySelector('#stuSearch');

  listEl?.querySelector('#stuSettingsBtn')?.addEventListener('click', () => {
    window.location.hash = '/settings';
  });

  function renderList() {
    if (!listEl) return;
    const q = searchInput?.value.trim().toLowerCase() || '';
    const filtered = q
      ? students.filter((s) => {
          const name = studentFullName(s).toLowerCase();
          return name.includes(q) || String(s.student_id).toLowerCase().includes(q);
        })
      : students;
    if (!level || !room) {
      listEl.innerHTML = renderEmpty(t('students.pickBoth'));
      return;
    }
    if (!canAccessLevelRoom(session, level, room)) {
      listEl.innerHTML = renderEmpty(t('toast.classNotAllowed'));
      return;
    }
    if (!filtered.length) {
      listEl.innerHTML = renderEmpty(t('students.emptyClass'));
      return;
    }
    listEl.innerHTML = filtered
      .map((s) => {
        const cached = summaryCache.get(String(s.student_id));
        const risk = cached?.summary?.risk;
        return studentCard(s, risk);
      })
      .join('');
  }

  async function prefetchSummaries() {
    summaryCache = new Map();
    if (!level || !room) return;
    const range = getSemesterDateRange();
    const classKey = buildAttendanceClassKey(level, room);
    try {
      const rows = await queryAttendanceInRangeForSession(session, {
        from: range.from,
        to: range.to,
        classKey
      });
      summaryCache = buildClassSummaryCache(rows);
    } catch (err) {
      console.warn('[students] summary prefetch failed', err);
    }
  }

  function openStudentProfile(studentId) {
    if (profileOpen) return;
    const student = students.find((s) => String(s.student_id) === String(studentId));
    if (!student) return;

    profileOpen = true;
    const classKey = level && room ? buildAttendanceClassKey(level, room) : '';

    try {
      sessionStorage.setItem('profileStudent', JSON.stringify(student));
    } catch {
      // ignore
    }
    profileOpen = false;
    onNavigate?.(`/student-profile?id=${encodeURIComponent(studentId)}&class=${encodeURIComponent(classKey)}`, {
      returnKey: 'profile'
    });
  }

  listEl?.addEventListener('click', (e) => {
    const card = /** @type {HTMLElement|null} */ (e.target.closest('.student-admin-card'));
    if (!card?.dataset.id) return;
    openStudentProfile(card.dataset.id);
  });

  async function loadLevels() {
    if (!gasReady) return;
    try {
      if (admin) {
        const levels = await fetchLevelOptions();
        levelSel.innerHTML =
          `<option value="">${escapeHtml(t('common.select'))}</option>` +
          levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
        return;
      }
      const keys = allowedKeys || [];
      const { levels, roomsByLevel } = classKeysToPickerOptions(keys);
      levelSel.innerHTML =
        `<option value="">${escapeHtml(t('common.select'))}</option>` +
        levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      levelSel.dataset.rooms = JSON.stringify(roomsByLevel);
    } catch (err) {
      listEl.innerHTML = renderError(t('students.loadFailed'), err?.message, 'stuRetryLevels');
      listEl.querySelector('#stuRetryLevels')?.addEventListener('click', () => void loadLevels());
      onToast?.(err?.message);
    }
  }

  async function bindClass() {
    if (!level || !room) {
      students = [];
      summaryCache = new Map();
      renderList();
      return;
    }
    if (!canAccessLevelRoom(session, level, room)) {
      students = [];
      summaryCache = new Map();
      renderList();
      return;
    }
    listEl.innerHTML = renderLoading(t('students.loading'));
    try {
      students = await fetchStudentsByClass(level, room);
      await prefetchSummaries();
      renderList();
    } catch (err) {
      console.error('[students page] load error', err);
      listEl.innerHTML = renderError(t('students.loadFailed'), err?.message, 'stuRetryClass');
      listEl.querySelector('#stuRetryClass')?.addEventListener('click', () => void bindClass());
      onToast?.(err?.message);
    }
  }

  levelSel?.addEventListener('change', async () => {
    level = levelSel.value;
    room = '';
    writeStudentsSelection(level, room);
    roomSel.disabled = !level;
    searchInput.disabled = !level;
    summaryCache = new Map();
    if (admin && level) {
      try {
        const rooms = await fetchRoomOptions(level);
        roomSel.innerHTML =
          `<option value="">${escapeHtml(t('common.select'))}</option>` +
          rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
      } catch (err) {
        onToast?.(err?.message);
      }
    } else if (!admin && level) {
      try {
        const map = JSON.parse(levelSel.dataset.rooms || '{}');
        const rooms = map[level] || [];
        roomSel.innerHTML =
          `<option value="">${escapeHtml(t('common.select'))}</option>` +
          rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
      } catch {
        roomSel.innerHTML = `<option value="">${escapeHtml(t('common.select'))}</option>`;
      }
    }
    students = [];
    renderList();
  });

  roomSel?.addEventListener('change', () => {
    room = roomSel.value;
    writeStudentsSelection(level, room);
    const ready = Boolean(level && room);
    searchInput.disabled = !ready;
    summaryCache = new Map();
    if (ready) void bindClass();
    else {
      students = [];
      renderList();
    }
  });

  searchInput?.addEventListener('input', renderList);

  async function applyPickedClassFromStorage() {
    try {
      const pick = sessionStorage.getItem('studentsPickClass');
      if (!pick || !levelSel || !roomSel) return;
      sessionStorage.removeItem('studentsPickClass');
      const { level: lvl, room: rm } = parseClassKey(pick);
      if (!lvl || !rm || !canAccessLevelRoom(session, lvl, rm)) return;

      if (admin) {
        levelSel.value = lvl;
        level = lvl;
        await loadRoomsForLevel(lvl);
      } else {
        levelSel.value = lvl;
        level = lvl;
        const map = JSON.parse(levelSel.dataset.rooms || '{}');
        const rooms = map[lvl] || [];
        roomSel.innerHTML =
          `<option value="">${escapeHtml(t('common.select'))}</option>` +
          rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
        roomSel.disabled = false;
      }

      roomSel.value = rm;
      room = rm;
      searchInput.disabled = false;
      await bindClass();
    } catch (err) {
      console.warn('[students] pick class failed', err);
    }
  }

  async function loadRoomsForLevel(lvl) {
    const rooms = await fetchRoomOptions(lvl);
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.select'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    roomSel.disabled = false;
  }

  if (gasReady) {
    void loadLevels().then(async () => {
      const picked = sessionStorage.getItem('studentsPickClass');
      if (picked) {
        await applyPickedClassFromStorage();
        return;
      }

      if (!level || !room || !canAccessLevelRoom(session, level, room)) return;
      if (!levelSel || !roomSel) return;

      levelSel.value = level;
      searchInput.disabled = false;
      if (admin) {
        await loadRoomsForLevel(level);
      } else {
        try {
          const map = JSON.parse(levelSel.dataset.rooms || '{}');
          const rooms = map[level] || [];
          roomSel.innerHTML =
            `<option value="">${escapeHtml(t('common.select'))}</option>` +
            rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
          roomSel.disabled = false;
        } catch {
          roomSel.innerHTML = `<option value="">${escapeHtml(t('common.select'))}</option>`;
        }
      }

      roomSel.value = room;
      await bindClass();
    });
  }

  container.__studentsCleanup = () => {};
}
