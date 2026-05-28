import { escapeHtml } from '../utils/html.js';
import {
  ATTENDANCE_STATUS_KEYS,
  CHECK_DEFAULT_STATUS
} from '../data/attendanceStatuses.js';
import {
  getDisciplineChecks,
  getBehaviorKinds,
  emptyDisciplineEntry
} from '../data/disciplineChecks.js';
import {
  getBehaviorGoodPoints,
  getBehaviorBadPoints,
  canRecordDisciplineOnDate
} from '../services/appSettingsService.js';
import { statusLabel, t } from '../i18n/index.js';
import { joinWithDot } from '../utils/separator.js';

/** @typedef {{ flags: string[], behaviors: Array<{ kind: string, note: string }>, note: string }} DisciplineEntry */

const statusPillClasses = {
  present: 'status-present',
  late: 'status-late',
  absent: 'status-absent',
  leave: 'status-leave',
  errand: 'status-errand',
  activity: 'status-activity',
  sick: 'status-sick'
};

export { ATTENDANCE_STATUS_KEYS };

function initials(student) {
  const a = (student.first_name || '').trim()[0];
  const b = (student.last_name || '').trim()[0];
  const one = `${a ?? ''}${b ?? ''}`.toUpperCase();
  if (one) return escapeHtml(one);
  return '?';
}

function renderInspectionSection(studentId, entry, checkDate, canEdit) {
  if (!canRecordDisciplineOnDate(checkDate)) return '';

  const flags = [...(entry?.flags ?? [])];
  const sid = escapeHtml(studentId);
  const disabled = canEdit ? '' : 'disabled';

  const chips = getDisciplineChecks()
    .map((rule) => {
      const on = flags.includes(rule.id);
      const selected = on ? ' discipline-chip--on' : '';
      return `<button type="button" class="discipline-chip${selected}" data-student-id="${sid}" data-discipline-flag="${escapeHtml(rule.id)}" ${disabled} aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(t(rule.labelKey))}</button>`;
    })
    .join('');

  return `<section class="inspection-block" data-inspection-block="${sid}" aria-label="${escapeHtml(t('discipline.inspectionTitle'))}">
    <h4 class="card-section__title">${escapeHtml(t('discipline.inspectionTitle'))}</h4>
    <div class="discipline-chips" role="group">${chips}</div>
  </section>`;
}

function renderBehaviorSection(studentId, entry, checkDate, canEdit) {
  if (!canRecordDisciplineOnDate(checkDate)) return '';

  const behaviors = entry?.behaviors ?? [];
  const sid = escapeHtml(studentId);
  const disabled = canEdit ? '' : 'disabled';
  const goodPts = getBehaviorGoodPoints();
  const badPts = Math.abs(getBehaviorBadPoints());

  const behaviorBtns = getBehaviorKinds()
    .map((b) => {
      const active = behaviors.some((x) => x.kind === b.id);
      const isGood = b.id === 'good';
      const icon = isGood ? '⭐' : '⚠️';
      const ptsLabel = isGood ? `+${goodPts}` : `−${badPts}`;
      const cls = isGood
        ? 'discipline-behavior-btn discipline-behavior-btn--good'
        : 'discipline-behavior-btn discipline-behavior-btn--bad';
      const label = isGood ? t('discipline.goodDeedShort') : t('discipline.badDeedShort');
      return `<button type="button" class="${cls}${active ? ' is-active' : ''}" data-student-id="${sid}" data-behavior-kind="${escapeHtml(b.id)}" ${disabled}>
        <span class="discipline-behavior-btn__icon" aria-hidden="true">${icon}</span>
        <span class="discipline-behavior-btn__text">${escapeHtml(label)} <span class="discipline-behavior-btn__pts">(${escapeHtml(ptsLabel)})</span></span>
      </button>`;
    })
    .join('');

  const behaviorNotes = behaviors
    .filter((b) => b.note)
    .map((b) => {
      const title = b.kind === 'good' ? t('discipline.goodDeedShort') : t('discipline.badDeedShort');
      return `<p class="behavior-block__note" data-behavior-note="${escapeHtml(b.kind)}"><span class="behavior-block__note-label">${escapeHtml(title)}</span> ${escapeHtml(b.note)}</p>`;
    })
    .join('');

  return `<section class="behavior-block" data-behavior-block="${sid}" aria-label="${escapeHtml(t('discipline.behaviorTitle'))}">
    <h4 class="card-section__title">${escapeHtml(t('discipline.behaviorTitle'))}</h4>
    <div class="discipline-behavior__actions">${behaviorBtns}</div>
    <div class="behavior-block__notes">${behaviorNotes}</div>
  </section>`;
}

export function renderStudentCardMarkup(
  student,
  currentStatus,
  disciplineEntry = emptyDisciplineEntry(),
  canEdit = true,
  statusKeys = ATTENDANCE_STATUS_KEYS,
  checkDate = ''
) {
  const sid = escapeHtml(student.student_id);
  const fname = escapeHtml(student.first_name);
  const lname = escapeHtml(student.last_name);

  const buttons = statusKeys
    .map((key) => {
      const selected = currentStatus === key ? ' attendance-status-btn--selected' : '';
      const disabled = canEdit ? '' : 'disabled';
      const label = escapeHtml(statusLabel(key));
      return `
      <button type="button" class="attendance-status-btn attendance-status-btn--${key}${selected}"
        data-student-id="${sid}" data-status="${escapeHtml(key)}" ${disabled}
        aria-pressed="${currentStatus === key ? 'true' : 'false'}">
        <span class="attendance-status-btn__icon attendance-status-btn__icon--${key}" aria-hidden="true"></span>
        <span class="attendance-status-btn__label">${label}</span>
      </button>`;
    })
    .join('');

  const pillClass = statusPillClasses[currentStatus] || statusPillClasses.absent;
  const idLine = student.number
    ? joinWithDot(`รหัส ${student.student_id}`, `เลขที่ ${student.number}`)
    : `รหัส ${sid}`;

  return `
    <article class="attendance-student-card" data-student-id="${sid}" data-attendance-status="${escapeHtml(currentStatus)}">
      <div class="attendance-student-card__top">
        <div class="attendance-student-card__avatar" aria-hidden="true">${initials(student)}</div>
        <div class="attendance-student-card__info">
          <div class="attendance-student-card__name">${fname} ${lname}</div>
          <div class="attendance-student-card__id">${escapeHtml(idLine)}</div>
        </div>
        <span class="attendance-student-card__pill status-pill ${pillClass} attendance-student-card__pill--${escapeHtml(currentStatus)}"
          aria-label="status">${escapeHtml(statusLabel(currentStatus))}</span>
      </div>
      <div class="attendance-status-row" role="group" aria-label="${escapeHtml(t('check.statusGroup'))}">${buttons}</div>
      ${renderInspectionSection(student.student_id, disciplineEntry, checkDate, canEdit)}
      ${renderBehaviorSection(student.student_id, disciplineEntry, checkDate, canEdit)}
    </article>
  `;
}

export function renderStudentCardListMarkup(
  students,
  attendance,
  discipline = {},
  canEdit = true,
  statusKeys = ATTENDANCE_STATUS_KEYS,
  checkDate = ''
) {
  return students
    .map((student) => {
      const id = student.student_id;
      const st = attendance[id] || CHECK_DEFAULT_STATUS;
      const disc = discipline[id] || emptyDisciplineEntry();
      return renderStudentCardMarkup(student, st, disc, canEdit, statusKeys, checkDate);
    })
    .join('');
}

const pillClassByStatus = { ...statusPillClasses };

export function updateStudentCardUI(root, studentId, status, disciplineEntry, checkDate = '') {
  const card = root.querySelector(`.attendance-student-card[data-student-id="${CSS.escape(studentId)}"]`);
  if (!card) return;
  card.dataset.attendanceStatus = status;

  const pill = card.querySelector('.attendance-student-card__pill');
  if (pill) {
    pill.textContent = statusLabel(status);
    pill.className = [
      'attendance-student-card__pill',
      'status-pill',
      pillClassByStatus[status] || pillClassByStatus.absent,
      `attendance-student-card__pill--${status}`
    ].join(' ');
  }

  card.querySelectorAll('.attendance-status-btn[data-status]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const key = btn.dataset.status;
    const on = key === status;
    btn.classList.toggle('attendance-status-btn--selected', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  if (disciplineEntry) {
    updateStudentDisciplineUI(root, studentId, disciplineEntry, checkDate);
  }
}

export function updateStudentDisciplineUI(root, studentId, entry, checkDate = '') {
  const card = root.querySelector(`.attendance-student-card[data-student-id="${CSS.escape(studentId)}"]`);
  if (!card) return;
  const status = card.dataset.attendanceStatus || CHECK_DEFAULT_STATUS;

  const flags = [...(entry.flags ?? [])];
  card.querySelectorAll('.discipline-chip[data-discipline-flag]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const on = flags.includes(btn.dataset.disciplineFlag || '');
    btn.classList.toggle('discipline-chip--on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  card.querySelectorAll('[data-behavior-kind]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const kind = btn.dataset.behaviorKind;
    const active = (entry.behaviors || []).some((b) => b.kind === kind);
    btn.classList.toggle('is-active', active);
  });

  const notesHost = card.querySelector('.behavior-block__notes');
  const behaviors = (entry.behaviors || []).filter((b) => b.note);
  if (notesHost) {
    notesHost.innerHTML = behaviors
      .map((b) => {
        const title = b.kind === 'good' ? t('discipline.goodDeedShort') : t('discipline.badDeedShort');
        return `<p class="behavior-block__note" data-behavior-note="${escapeHtml(b.kind)}"><span class="behavior-block__note-label">${escapeHtml(title)}</span> ${escapeHtml(b.note)}</p>`;
      })
      .join('');
  }
}

export function bindAttendanceStatusPickers(container, onPick) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.attendance-status-btn[data-student-id][data-status]');
    if (!(btn instanceof HTMLButtonElement)) return;
    if (btn.disabled) return;
    const id = btn.dataset.studentId;
    const status = btn.dataset.status;
    if (!id || !status) return;
    onPick(id, status);
  });
}

export function bindDisciplinePickers(container, onChange) {
  container.addEventListener('click', (e) => {
    const flagBtn = e.target.closest('.discipline-chip[data-discipline-flag][data-student-id]');
    if (flagBtn instanceof HTMLButtonElement && !flagBtn.disabled) {
      const id = flagBtn.dataset.studentId;
      const flag = flagBtn.dataset.disciplineFlag;
      if (!id || !flag) return;
      onChange(id, { type: 'toggle', flag });
      return;
    }

    const behaviorBtn = e.target.closest('[data-behavior-kind][data-student-id]');
    if (behaviorBtn instanceof HTMLButtonElement && !behaviorBtn.disabled) {
      const id = behaviorBtn.dataset.studentId;
      const kind = behaviorBtn.dataset.behaviorKind;
      if (!id || !kind) return;
      onChange(id, { type: 'behavior', kind });
    }
  });
}

export { emptyDisciplineEntry };
