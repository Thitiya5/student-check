import { escapeHtml } from '../utils/html.js';
import { ATTENDANCE_STATUS_KEYS } from '../data/attendanceStatuses.js';
import {
  getDisciplineChecks,
  calcDisciplineScore,
  formatDisciplineScore,
  parseDisciplineFromRecord
} from '../data/disciplineChecks.js';
import { statusLabel, t } from '../i18n/index.js';
import { studentFullName } from '../services/studentsService.js';
import { formatDateWithDayThai } from './datePicker.js';

/**
 * @param {{
 *   student: object,
 *   summary: ReturnType<import('../utils/studentAttendanceSummary.js').summarizeStudentAttendance>,
 *   recentRecords: Array<{ attendanceDate: string, status: string, disciplineFlags?: string[], disciplineAdjust?: number, disciplineScore?: number }>,
 *   range: { from: string, to: string, labelKey: string },
 *   onClose?: () => void
 * }} opts
 */
function formatDisciplineDayLine(record) {
  const { flags, adjust, note } = parseDisciplineFromRecord(record);
  const score = calcDisciplineScore(flags, adjust, record.status);
  if (!flags.length && score === 0 && !note) return '';

  const labels = flags.map((id) => {
    const rule = getDisciplineChecks().find((r) => r.id === id);
    return rule ? t(rule.labelKey) : id;
  });
  const parts = [];
  if (labels.length) parts.push(labels.join(', '));
  if (score !== 0) parts.push(`${t('students.disciplineScore')} ${formatDisciplineScore(score)}`);
  if (note) parts.push(note);
  return parts.join(' · ');
}

export function openStudentProfileModal({ student, summary, recentRecords, range, onClose }) {
  const name = studentFullName(student);
  const risk = summary.risk;
  const riskClass = `student-profile__alert--${risk}`;
  const disc = summary.discipline || { totalScore: 0, issueDays: 0, flagCounts: {} };
  const scoreClass =
    disc.totalScore < 0 ? 'is-negative' : disc.totalScore > 0 ? 'is-positive' : '';

  let alertHtml = '';
  if (risk === 'watch') {
    alertHtml = `<div class="student-profile__alert ${riskClass}" role="status">
      <strong>${escapeHtml(t('students.riskWatchTitle'))}</strong>
      <p>${escapeHtml(t('students.riskWatchMsg'))}</p>
    </div>`;
  } else   if (summary.parentRisk?.shouldWarn) {
    alertHtml = `<div class="student-profile__alert student-profile__alert--alert" role="alert">
      <span class="profile-alert__badge">${escapeHtml(t('points.parentWarningBadge'))}</span>
      <strong>${escapeHtml(t('points.parentWarningTitle'))}</strong>
      <p>${escapeHtml(t('points.parentWarningBody', { percent: summary.parentRisk.riskPercent }))}</p>
    </div>`;
  } else if (risk === 'alert') {
    alertHtml = `<div class="student-profile__alert ${riskClass}" role="alert">
      <strong>${escapeHtml(t('students.riskAlertTitle'))}</strong>
      <p>${escapeHtml(t('students.riskAlertMsg'))}</p>
    </div>`;
  }

  const statCards = ATTENDANCE_STATUS_KEYS.map((key) => {
    const count = summary.counts[key] ?? 0;
    const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
    return `<article class="student-profile-stat student-profile-stat--${key}">
      <span class="student-profile-stat__label">${escapeHtml(statusLabel(key))}</span>
      <strong class="student-profile-stat__value">${count}</strong>
      <span class="student-profile-stat__pct">${pct}%</span>
    </article>`;
  }).join('');

  const bars = ATTENDANCE_STATUS_KEYS.map((key) => {
    const count = summary.counts[key] ?? 0;
    const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
    return `<div class="student-profile-bar">
      <span class="student-profile-bar__label">${escapeHtml(statusLabel(key))}</span>
      <div class="student-profile-bar__track"><div class="student-profile-bar__fill student-profile-bar__fill--${key}" style="width:${pct}%"></div></div>
      <span class="student-profile-bar__val">${pct}%</span>
    </div>`;
  }).join('');

  const disciplineItems = getDisciplineChecks().map((rule) => {
    const count = disc.flagCounts[rule.id] ?? 0;
    if (!count) return '';
    return `<li class="student-profile-discipline__item">
      <span>${escapeHtml(t(rule.labelKey))}</span>
      <strong>${escapeHtml(t('students.disciplineCount', { count }))}</strong>
    </li>`;
  }).filter(Boolean);

  const disciplineSection =
    disc.issueDays > 0 || disc.totalScore !== 0
      ? `<section class="student-profile-discipline">
      <h3>${escapeHtml(t('students.disciplineTitle'))}</h3>
      <div class="student-profile-discipline__summary">
        <div class="student-profile-discipline__score ${scoreClass}">
          <span class="student-profile-discipline__score-val">${escapeHtml(formatDisciplineScore(disc.totalScore))}</span>
          <span class="student-profile-discipline__score-cap">${escapeHtml(t('students.disciplineTotal'))}</span>
        </div>
        <p class="student-profile-discipline__days">
          <span>${escapeHtml(t('students.disciplineIssueDays'))}</span>
          <strong>${disc.issueDays}</strong>
        </p>
      </div>
      ${
        disciplineItems.length
          ? `<ul class="student-profile-discipline__list">${disciplineItems.join('')}</ul>`
          : ''
      }
    </section>`
      : `<section class="student-profile-discipline student-profile-discipline--empty">
      <h3>${escapeHtml(t('students.disciplineTitle'))}</h3>
      <p class="student-profile-discipline__none">${escapeHtml(t('students.disciplineNone'))}</p>
    </section>`;

  const recentHtml = recentRecords.length
    ? recentRecords
        .slice(0, 12)
        .map((r) => {
          const discLine = formatDisciplineDayLine(r);
          return `<li class="student-profile-recent__item">
            <span>${escapeHtml(formatDateWithDayThai(r.attendanceDate))}</span>
            <span class="status-badge status-badge--${escapeHtml(r.status)}">${escapeHtml(statusLabel(r.status))}</span>
            ${discLine ? `<span class="student-profile-recent__disc">${escapeHtml(discLine)}</span>` : ''}
          </li>`;
        })
        .join('')
    : `<li class="student-profile-recent__empty">${escapeHtml(t('students.noRecordsInRange'))}</li>`;

  const root = document.createElement('div');
  root.className = 'modal-backdrop student-profile-backdrop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', name);

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet glass-card student-profile-sheet';
  sheet.innerHTML = `
    <div class="student-profile__head">
      <div>
        <h2 class="student-profile__name">${escapeHtml(name)}</h2>
        <p class="student-profile__meta">${escapeHtml(t('students.profileMeta', {
          id: student.student_id,
          no: student.number || '-',
          class: student.class_key || `${student.level}/${student.room}`
        }))}</p>
        <p class="student-profile__range">${escapeHtml(t(range.labelKey))} (${escapeHtml(range.from)} – ${escapeHtml(range.to)})</p>
      </div>
      <button type="button" class="modal-close student-profile__close" id="studentProfileClose" aria-label="ปิด">✕</button>
    </div>
    ${alertHtml}
    <div class="student-profile-hero">
      <div class="student-profile-hero__ring student-profile-hero__ring--${risk}" style="--p:${summary.presentPercent}">
        <div class="student-profile-hero__inner">
          <span class="student-profile-hero__pct">${summary.presentPercent}%</span>
          <span class="student-profile-hero__cap">${escapeHtml(t('students.presentPercent'))}</span>
        </div>
      </div>
      <div class="student-profile-hero__side">
        <p><span>${escapeHtml(t('students.recordedDays'))}</span> <strong>${summary.total}</strong></p>
      </div>
    </div>
    <div class="student-profile-stats">${statCards}</div>
    <section class="student-profile-bars"><h3>${escapeHtml(t('students.statusBreakdown'))}</h3>${bars}</section>
    ${disciplineSection}
    <p class="student-profile__parent">${escapeHtml(t('students.parentLine', { name: student.parent_name || '-', phone: student.parent_phone || '-' }))}</p>
    <section class="student-profile-recent">
      <h3>${escapeHtml(t('students.recentDays'))}</h3>
      <ul>${recentHtml}</ul>
    </section>
    <button type="button" class="button-primary student-profile__done" id="studentProfileDone">ปิด</button>`;

  root.appendChild(sheet);
  document.body.appendChild(root);
  document.body.classList.add('modal-open');

  const close = () => {
    root.remove();
    document.body.classList.remove('modal-open');
    onClose?.();
  };

  root.querySelector('#studentProfileClose')?.addEventListener('click', close);
  root.querySelector('#studentProfileDone')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
}
