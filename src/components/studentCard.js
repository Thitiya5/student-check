import { escapeHtml } from '../utils/html.js';
import {
  ATTENDANCE_STATUS_KEYS,
  CHECK_DEFAULT_STATUS,
  normalizeAttendanceStatus
} from '../data/attendanceStatuses.js';
import {
  getDisciplineChecks,
  getBehaviorKinds,
  emptyDisciplineEntry,
  normalizeDisciplineFlags
} from '../data/disciplineChecks.js';
import {
  canShowDisciplineOnCheck,
  isDisciplineActiveDate,
  isDisciplineScoringEnabled
} from '../services/appSettingsService.js';
import { formatDisciplineScore, resolveBehaviorEntryPoints } from '../data/disciplineChecks.js';
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

function renderInspectionSection(studentId, entry, checkDate, canEdit, attendanceStatus = CHECK_DEFAULT_STATUS) {
  if (!canShowDisciplineOnCheck(checkDate)) return '';

  const absent = normalizeAttendanceStatus(attendanceStatus) === 'absent';
  const flags = absent
    ? getDisciplineChecks().map((r) => r.id)
    : normalizeDisciplineFlags(entry?.flags ?? []);
  const sid = escapeHtml(studentId);
  const disabled = !canEdit || absent ? 'disabled' : '';

  const chips = getDisciplineChecks()
    .map((rule) => {
      const on = flags.includes(rule.id);
      const selected = on ? ' discipline-chip--on' : '';
      return `<button type="button" class="discipline-chip${selected}" data-student-id="${sid}" data-discipline-flag="${escapeHtml(rule.id)}" ${disabled} aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(t(rule.labelKey))}</button>`;
    })
    .join('');

  const autoHtml = absent
    ? `<p class="inspection-block__auto">${escapeHtml(t('inspection.autoFail'))}</p>`
    : '';

  return `<section class="inspection-block" data-inspection-block="${sid}" aria-label="${escapeHtml(t('discipline.inspectionTitle'))}">
    <h4 class="card-section__title">${escapeHtml(t('discipline.inspectionTitle'))}</h4>
    ${autoHtml}
    <div class="discipline-chips" role="group">${chips}</div>
  </section>`;
}

function renderBehaviorNoteRow(studentId, behavior, canEdit = true) {
  const title =
    behavior.kind === 'good' ? t('discipline.goodDeedShort') : t('discipline.badDeedShort');
  const pts = formatDisciplineScore(resolveBehaviorEntryPoints(behavior));
  const sid = escapeHtml(studentId);
  const kind = escapeHtml(behavior.kind);
  const returnBtn = canEdit
    ? `<button type="button" class="behavior-block__return-btn" data-student-id="${sid}" data-return-kind="${kind}" aria-label="${escapeHtml(t('behavior.returnPoints'))}">${escapeHtml(t('behavior.returnPoints'))}</button>`
    : '';
  return `<div class="behavior-block__note" data-behavior-note="${kind}" data-student-id="${sid}">
    <div class="behavior-block__note-main">
      <span class="behavior-block__note-label">${escapeHtml(title)} (${escapeHtml(pts)})</span>
      <span class="behavior-block__note-text">${escapeHtml(behavior.note)}</span>
    </div>
    ${returnBtn}
  </div>`;
}

export function renderBehaviorSection(studentId, entry, checkDate, canEdit) {
  if (!isDisciplineScoringEnabled() || !isDisciplineActiveDate(checkDate)) return '';

  const behaviors = entry?.behaviors ?? [];
  const sid = escapeHtml(studentId);
  const disabled = canEdit ? '' : 'disabled';

  const behaviorBtns = getBehaviorKinds()
    .map((b) => {
      const active = behaviors.some((x) => x.kind === b.id);
      const isGood = b.id === 'good';
      const icon = isGood ? '⭐' : '⚠️';
      const cls = isGood
        ? 'discipline-behavior-btn discipline-behavior-btn--good'
        : 'discipline-behavior-btn discipline-behavior-btn--bad';
      const label = isGood ? t('discipline.goodDeedShort') : t('discipline.badDeedShort');
      return `<button type="button" class="${cls}${active ? ' is-active' : ''}" data-student-id="${sid}" data-behavior-kind="${escapeHtml(b.id)}" ${disabled}>
        <span class="discipline-behavior-btn__icon" aria-hidden="true">${icon}</span>
        <span class="discipline-behavior-btn__text">${escapeHtml(label)}</span>
      </button>`;
    })
    .join('');

  const behaviorNotes = behaviors
    .filter((b) => b.note)
    .map((b) => renderBehaviorNoteRow(studentId, b, canEdit))
    .join('');

  return `<section class="behavior-block" data-behavior-block="${sid}" aria-label="${escapeHtml(t('discipline.behaviorTitle'))}">
    <h4 class="card-section__title">${escapeHtml(t('discipline.behaviorTitle'))}</h4>
    <div class="discipline-behavior__actions">${behaviorBtns}</div>
    <div class="behavior-block__notes">${behaviorNotes}</div>
  </section>`;
}

/**
 * @param {{ showDiscipline?: boolean, showBehavior?: boolean }} [sections]
 */
export function renderStudentCardMarkup(
  student,
  currentStatus,
  disciplineEntry = emptyDisciplineEntry(),
  canEdit = true,
  statusKeys = ATTENDANCE_STATUS_KEYS,
  checkDate = '',
  sections = {}
) {
  const showDiscipline = sections.showDiscipline !== false;
  const showBehavior = sections.showBehavior === true;
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
      ${showDiscipline ? renderInspectionSection(student.student_id, disciplineEntry, checkDate, canEdit, currentStatus) : ''}
      ${showBehavior ? renderBehaviorSection(student.student_id, disciplineEntry, checkDate, canEdit) : ''}
    </article>
  `;
}

export function renderBehaviorStudentCardMarkup(
  student,
  disciplineEntry = emptyDisciplineEntry(),
  canEdit = true,
  checkDate = ''
) {
  const sid = escapeHtml(student.student_id);
  const fname = escapeHtml(student.first_name);
  const lname = escapeHtml(student.last_name);
  const idLine = student.number
    ? joinWithDot(`รหัส ${student.student_id}`, `เลขที่ ${student.number}`)
    : `รหัส ${sid}`;

  const behaviors = disciplineEntry?.behaviors ?? [];
  const netPts = behaviors.reduce((sum, b) => sum + resolveBehaviorEntryPoints(b), 0);
  const scorePill =
    behaviors.length && netPts !== 0
      ? `<span class="behavior-student-card__score ${netPts < 0 ? 'behavior-student-card__score--neg' : 'behavior-student-card__score--pos'}">${escapeHtml(formatDisciplineScore(netPts))}</span>`
      : behaviors.length
        ? `<span class="behavior-student-card__score behavior-student-card__score--on">✓</span>`
        : '';

  return `<article class="behavior-student-card glass-card" data-student-id="${sid}">
    <div class="behavior-student-card__head">
      <div class="behavior-student-card__title-wrap">
        <strong class="behavior-student-card__name">${fname} ${lname}</strong>
        <span class="behavior-student-card__id">${escapeHtml(idLine)}</span>
      </div>
      ${scorePill}
    </div>
    ${renderBehaviorSection(student.student_id, disciplineEntry, checkDate, canEdit)}
  </article>`;
}

export function renderStudentCardListMarkup(
  students,
  attendance,
  discipline = {},
  canEdit = true,
  statusKeys = ATTENDANCE_STATUS_KEYS,
  checkDate = '',
  sections = {}
) {
  return students
    .map((student) => {
      const id = student.student_id;
      const st = attendance[id] || CHECK_DEFAULT_STATUS;
      const disc = discipline[id] || emptyDisciplineEntry();
      return renderStudentCardMarkup(student, st, disc, canEdit, statusKeys, checkDate, sections);
    })
    .join('');
}

export function renderBehaviorStudentCardListMarkup(
  students,
  discipline = {},
  canEdit = true,
  checkDate = ''
) {
  return students
    .map((student) => {
      const disc = discipline[student.student_id] || emptyDisciplineEntry();
      return renderBehaviorStudentCardMarkup(student, disc, canEdit, checkDate);
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
  const sid = CSS.escape(studentId);
  const card =
    root.querySelector(`.attendance-student-card[data-student-id="${sid}"]`) ||
    root.querySelector(`.behavior-student-card[data-student-id="${sid}"]`);
  if (!card) return;
  const status = card.dataset.attendanceStatus || CHECK_DEFAULT_STATUS;
  const absent = normalizeAttendanceStatus(status) === 'absent';
  const inspectionBlock = card.querySelector('.inspection-block');

  const flags = absent
    ? getDisciplineChecks().map((r) => r.id)
    : normalizeDisciplineFlags(entry.flags ?? []);

  if (inspectionBlock) {
    let autoLine = inspectionBlock.querySelector('.inspection-block__auto');
    if (absent) {
      if (!autoLine) {
        autoLine = document.createElement('p');
        autoLine.className = 'inspection-block__auto';
        inspectionBlock.querySelector('.card-section__title')?.insertAdjacentElement('afterend', autoLine);
      }
      autoLine.textContent = t('inspection.autoFail');
    } else {
      autoLine?.remove();
    }
  }

  card.querySelectorAll('.discipline-chip[data-discipline-flag]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const on = flags.includes(btn.dataset.disciplineFlag || '');
    btn.classList.toggle('discipline-chip--on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (inspectionBlock) btn.disabled = absent;
  });

  card.querySelectorAll('[data-behavior-kind]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const kind = btn.dataset.behaviorKind;
    const active = (entry.behaviors || []).some((b) => b.kind === kind);
    btn.classList.toggle('is-active', active);
  });

  const head = card.querySelector('.behavior-student-card__head');
  if (head) {
    const behaviorsAll = entry.behaviors || [];
    const netPts = behaviorsAll.reduce((sum, b) => sum + resolveBehaviorEntryPoints(b), 0);
    let pill = head.querySelector('.behavior-student-card__score');
    if (!behaviorsAll.length) {
      pill?.remove();
    } else {
      const cls =
        netPts < 0
          ? 'behavior-student-card__score--neg'
          : netPts > 0
            ? 'behavior-student-card__score--pos'
            : 'behavior-student-card__score--on';
      const text = netPts !== 0 ? formatDisciplineScore(netPts) : '✓';
      if (!pill) {
        pill = document.createElement('span');
        pill.className = `behavior-student-card__score ${cls}`;
        head.appendChild(pill);
      }
      pill.className = `behavior-student-card__score ${cls}`;
      pill.textContent = text;
    }
  }

  const notesHost = card.querySelector('.behavior-block__notes');
  const behaviors = (entry.behaviors || []).filter((b) => b.note);
  if (notesHost) {
    const canEdit = !card.querySelector('[data-behavior-kind]:disabled');
    notesHost.innerHTML = behaviors.map((b) => renderBehaviorNoteRow(studentId, b, canEdit)).join('');
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

export function bindDisciplinePickers(container, onChange, { behavior = false } = {}) {
  container.addEventListener('click', (e) => {
    const flagBtn = e.target.closest('.discipline-chip[data-discipline-flag][data-student-id]');
    if (flagBtn instanceof HTMLButtonElement && !flagBtn.disabled) {
      const id = flagBtn.dataset.studentId;
      const flag = flagBtn.dataset.disciplineFlag;
      if (!id || !flag) return;
      onChange(id, { type: 'toggle', flag });
      return;
    }

    if (!behavior) return;

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
