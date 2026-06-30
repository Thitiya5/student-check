import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';
import { BANGKOK_TZ } from '../../utils/dateIso.js';
import {
  hasSavedAttendanceToday,
  hasSubmittedRoomToday,
  isExecutiveAttendanceNotStarted
} from '../../utils/executive/executiveEmptyState.js';

const PENDING_VISIBLE_MAX = 10;

/**
 * @param {number} percent
 */
function completionBarVariant(percent) {
  if (percent >= 100) return 'exec-progress--green';
  if (percent >= 80) return 'exec-progress--orange';
  return 'exec-progress--red';
}

/**
 * @param {string|null|undefined} iso
 */
function formatCompletionTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BANGKOK_TZ
  }).format(date);
}

/**
 * @param {{ level: string, messageKey: string, count?: number, percent?: number }} operational
 */
function operationalMessage(operational) {
  if (operational.messageKey === 'executive.completion.statusPending') {
    return t(operational.messageKey, { count: operational.count ?? 0 });
  }
  if (operational.messageKey === 'executive.completion.statusLow') {
    return t(operational.messageKey, { percent: operational.percent ?? 0 });
  }
  return t(operational.messageKey);
}

/**
 * @param {import('../../services/executive/executiveCompletionService.js').ExecutiveCompletionBundle} completion
 * @param {{ loading?: boolean, charts?: import('../../utils/executive/executiveChartAggregates.js').ExecutiveChartsData|null }} [opts]
 */
export function renderExecutiveCompletionProgress(completion, { loading = false, charts = null } = {}) {
  const status = completion?.status ?? {
    totalRooms: 0,
    checkedRooms: 0,
    pendingRooms: 0,
    completionPercent: 0
  };
  const pendingRooms = completion?.pendingRooms ?? [];
  const lastCompleted = completion?.lastCompleted ?? {
    displayLabel: '—',
    teacherName: '—',
    timestamp: null
  };
  const operational = completion?.operationalStatus ?? {
    level: 'warn',
    messageKey: 'executive.completion.statusNoRooms'
  };

  const percent = loading ? 0 : status.completionPercent;
  const barWidth = loading ? 0 : Math.min(100, Math.max(0, percent));
  const barVariant = loading ? 'exec-progress--muted' : completionBarVariant(percent);
  const visiblePending = pendingRooms.slice(0, PENDING_VISIBLE_MAX);
  const hiddenCount = Math.max(0, pendingRooms.length - PENDING_VISIBLE_MAX);

  const notStarted = !loading && isExecutiveAttendanceNotStarted(completion, charts);
  const noSubmittedRoom = !loading && !hasSubmittedRoomToday(completion);

  const completionEmptyHtml = `<div class="exec-empty-state">
      <p class="exec-empty-state__icon" aria-hidden="true">📋</p>
      <p class="exec-empty-state__title">${escapeHtml(t('executive.empty.progressTitle'))}</p>
      <p class="exec-empty-state__body">${escapeHtml(t('executive.empty.progressBody'))}</p>
    </div>`;

  const pendingEmptyHtml = `<div class="exec-empty-state exec-empty-state--compact">
      <p class="exec-empty-state__title">${escapeHtml(t('executive.empty.pendingTitle'))}</p>
      <p class="exec-empty-state__body">${escapeHtml(t('executive.empty.pendingBody'))}</p>
    </div>`;

  const recentEmptyHtml = `<p class="exec-empty-state__title exec-empty-state__title--solo">${escapeHtml(t('executive.empty.recentTitle'))}</p>`;

  const pendingList = loading
    ? `<li class="exec-pending-item exec-pending-item--placeholder">…</li>`
    : notStarted
      ? ''
      : visiblePending.length
        ? visiblePending
            .map(
              (room) =>
                `<li class="exec-pending-item">${escapeHtml(room.displayLabel || room.classKey)}</li>`
            )
            .join('')
        : `<li class="exec-pending-item exec-pending-item--none">${escapeHtml(t('executive.completion.noPending'))}</li>`;

  const moreLine =
    !loading && !notStarted && hiddenCount > 0
      ? `<p class="exec-pending-more">${escapeHtml(
          t('executive.completion.pendingMore', { count: hiddenCount })
        )}</p>`
      : '';

  const statusIcon = loading
    ? '…'
    : notStarted
      ? '⚪'
      : operational.level === 'ok'
        ? '✅'
        : operational.level === 'critical'
          ? '🔴'
          : '🟡';
  const statusText = loading
    ? t('common.loading')
    : notStarted
      ? t('executive.empty.statusNotStarted')
      : operationalMessage(operational);
  const statusLevel = notStarted ? 'idle' : operational.level;

  return `<section class="exec-completion" aria-label="${escapeHtml(t('executive.completion.aria'))}">
    <h2 class="exec-section-title">${escapeHtml(t('executive.completion.title'))}</h2>
    <div class="exec-completion__grid">
      <article class="exec-completion-card glass-card">
        <h3 class="exec-completion-card__title">${escapeHtml(t('executive.completion.cardCompletion'))}</h3>
        ${
          loading
            ? `<p class="exec-completion-card__percent">…</p>`
            : noSubmittedRoom
              ? completionEmptyHtml
              : `<p class="exec-completion-card__headline">
          <span class="exec-completion-card__ratio">${status.checkedRooms} / ${status.totalRooms}</span>
          <span class="exec-completion-card__unit">${escapeHtml(t('executive.completion.classrooms'))}</span>
        </p>
        <p class="exec-completion-card__percent">${percent}%</p>
        <div class="exec-progress ${barVariant}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(String(barWidth))}">
          <div class="exec-progress__bar" style="width:${barWidth}%"></div>
        </div>`
        }
      </article>

      <article class="exec-completion-card glass-card">
        <h3 class="exec-completion-card__title">${escapeHtml(t('executive.completion.cardPending'))}</h3>
        ${
          loading
            ? `<p class="exec-completion-card__sub">…</p><ul class="exec-pending-list">${pendingList}</ul>`
            : notStarted
              ? pendingEmptyHtml
              : `<p class="exec-completion-card__sub">${escapeHtml(t('executive.completion.pendingCount', { count: status.pendingRooms }))}</p>
        <ul class="exec-pending-list">${pendingList}</ul>
        ${moreLine}`
        }
      </article>

      <article class="exec-completion-card glass-card">
        <h3 class="exec-completion-card__title">${escapeHtml(t('executive.completion.cardRecent'))}</h3>
        <div class="exec-recent">
          ${
            loading
              ? `<p class="exec-recent__room">…</p><p class="exec-recent__teacher">…</p><p class="exec-recent__time">…</p>`
              : noSubmittedRoom
                ? recentEmptyHtml
                : `<p class="exec-recent__room">${escapeHtml(lastCompleted.displayLabel)}</p>
          <p class="exec-recent__teacher">${escapeHtml(lastCompleted.teacherName)}</p>
          <p class="exec-recent__time">${escapeHtml(formatCompletionTime(lastCompleted.timestamp))}</p>`
          }
        </div>
      </article>

      <article class="exec-completion-card glass-card exec-completion-card--status">
        <h3 class="exec-completion-card__title">${escapeHtml(t('executive.completion.cardStatus'))}</h3>
        <p class="exec-op-status exec-op-status--${escapeHtml(statusLevel)}">
          <span class="exec-op-status__icon" aria-hidden="true">${statusIcon}</span>
          <span class="exec-op-status__text">${escapeHtml(statusText)}</span>
        </p>
      </article>
    </div>
  </section>`;
}
