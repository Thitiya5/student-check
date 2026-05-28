import { escapeHtml } from '../utils/html.js';
import { t, statusLabel } from '../i18n/index.js';
import { formatDateWithDayThai } from './datePicker.js';
import { reasonLabel } from '../services/studentPointsService.js';
import { normalizeAttendanceStatus } from '../data/attendanceStatuses.js';
import { getDisciplineChecks } from '../data/disciplineChecks.js';
import { formatDisciplineScore } from '../data/disciplineChecks.js';
import { dedupeRecordsByDate } from '../utils/studentAttendanceSummary.js';

/** @typedef {'all'|'attendance'|'discipline'|'behavior'} ProfileTab */

const ATTENDANCE_TAB_STATUSES = new Set(['absent', 'late', 'errand', 'activity', 'sick', 'leave']);

/**
 * @param {number} pts
 */
function scoreClass(pts) {
  if (pts > 0) return 'is-positive';
  if (pts < 0) return 'is-negative';
  return '';
}

/**
 * @param {string} kind
 */
function iconForKind(kind) {
  const map = {
    attendance: 'attendance',
    discipline: 'discipline',
    behavior_good: 'good',
    behavior_bad: 'bad',
    behavior: 'behavior',
    manual: 'manual',
    present: 'present'
  };
  return map[kind] || 'default';
}

/**
 * @param {object} p
 */
function timelineCard({ date, title, subtitle, points, note, kind, adminActions = '' }) {
  const pts = Number(points) || 0;
  const ptsText = pts === 0 ? '—' : formatDisciplineScore(pts);
  const icon = iconForKind(kind);
  const sign = pts > 0 ? 'positive' : pts < 0 ? 'negative' : 'neutral';

  return `<article class="profile-timeline-card profile-timeline-card--${sign}" data-txn-card>
    <div class="profile-timeline-card__rail" aria-hidden="true"></div>
    <div class="profile-timeline-card__icon profile-timeline-card__icon--${icon}" aria-hidden="true"></div>
    <div class="profile-timeline-card__body">
      <time class="profile-timeline-card__date">${escapeHtml(formatDateWithDayThai(date))}</time>
      <h4 class="profile-timeline-card__title">${escapeHtml(title)}</h4>
      ${subtitle ? `<p class="profile-timeline-card__meta">${escapeHtml(subtitle)}</p>` : ''}
      ${note ? `<p class="profile-timeline-card__note">${escapeHtml(note)}</p>` : ''}
      ${adminActions}
    </div>
    <strong class="profile-timeline-card__pts ${scoreClass(pts)}">${escapeHtml(ptsText)}</strong>
  </article>`;
}

/**
 * @param {Array<object>} transactions
 */
function groupByDate(transactions) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const txn of transactions) {
    const d = String(txn.transactionDate || txn.date || '');
    if (!d) continue;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(txn);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/**
 * @param {Array<object>} transactions
 * @param {ProfileTab} tab
 */
export function filterTransactionsForTab(transactions, tab) {
  if (tab === 'all') return [...transactions];
  if (tab === 'attendance') {
    return transactions.filter((x) => (x.category || x.type) === 'attendance');
  }
  if (tab === 'discipline') {
    return transactions.filter((x) => (x.category || x.type) === 'discipline');
  }
  if (tab === 'behavior') {
    return transactions.filter((x) => {
      const c = x.category || x.type;
      return c === 'behavior' || c === 'manual';
    });
  }
  return transactions;
}

/**
 * @param {Array<object>} attendanceRows
 * @param {Array<object>} transactions
 */
export function buildAttendanceTimelineItems(attendanceRows, transactions) {
  const days = dedupeRecordsByDate(attendanceRows).filter((row) =>
    ATTENDANCE_TAB_STATUSES.has(normalizeAttendanceStatus(row.status))
  );

  /** @type {Map<string, { absent?: number, late?: number }>} */
  const ptsByDate = new Map();
  for (const txn of transactions) {
    if ((txn.category || txn.type) !== 'attendance') continue;
    const d = String(txn.transactionDate || txn.date);
    if (!ptsByDate.has(d)) ptsByDate.set(d, {});
    const bucket = ptsByDate.get(d);
    if (txn.reason === 'absent') bucket.absent = Number(txn.points) || 0;
    if (txn.reason === 'late') bucket.late = Number(txn.points) || 0;
  }

  return days.map((row) => {
    const date = String(row.attendanceDate);
    const status = normalizeAttendanceStatus(row.status);
    const ptsMap = ptsByDate.get(date) || {};
    let deduction = 0;
    if (status === 'absent' && ptsMap.absent) deduction = ptsMap.absent;
    if (status === 'late' && ptsMap.late) deduction = ptsMap.late;

    const teacher = String(row.teacherName || '').trim();
    const subtitle = [
      t('points.typeAttendance'),
      teacher || null
    ]
      .filter(Boolean)
      .join(' · ');

    let note = '';
    if (status === 'absent' || status === 'late') {
      note =
        deduction < 0
          ? t('points.attendanceDeducted')
          : t('points.attendanceNoDeduct');
    } else {
      note = t('points.attendanceNoDeduct');
    }

    return {
      date,
      title: statusLabel(status),
      subtitle,
      points: deduction,
      note,
      kind: 'attendance',
      txnIds: []
    };
  });
}

/**
 * @param {Array<object>} transactions
 */
export function buildDisciplineTimelineItems(transactions) {
  const disc = transactions.filter((x) => (x.category || x.type) === 'discipline');
  const groups = groupByDate(disc);
  const rules = getDisciplineChecks();

  return groups.map(([date, rows]) => {
    const flags = rows.map((r) => {
      const rule = rules.find((x) => x.id === r.reason);
      return rule ? t(rule.labelKey) : reasonLabel(r.reason, 'discipline');
    });
    const total = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
    const teacher = rows.map((r) => r.teacherName).find(Boolean) || '';

    return {
      date,
      title: flags.join(', '),
      subtitle: [t('points.typeDiscipline'), teacher].filter(Boolean).join(' · '),
      points: total,
      note: t('points.disciplineItems', { count: rows.length }),
      kind: 'discipline',
      txnIds: rows.map((r) => r.id)
    };
  });
}

/**
 * @param {Array<object>} transactions
 */
export function buildBehaviorTimelineItems(transactions) {
  return transactions
    .filter((x) => {
      const c = x.category || x.type;
      return c === 'behavior' || c === 'manual';
    })
    .map((txn) => {
      const cat = txn.category || txn.type || 'behavior';
      const isGood = txn.reason === 'good' || Number(txn.points) > 0;
      const title =
        cat === 'manual'
          ? txn.reason === 'restore'
            ? t('points.restore')
            : txn.reason || t('points.typeManual')
          : reasonLabel(txn.reason, 'behavior');

      const note = String(txn.note || '').trim();
      const teacher = String(txn.teacherName || '').trim();
      const subtitle = [categoryLabelShort(cat), teacher].filter(Boolean).join(' · ');

      return {
        date: String(txn.transactionDate || txn.date),
        title,
        subtitle,
        points: Number(txn.points) || 0,
        note,
        kind: isGood ? 'behavior_good' : 'behavior_bad',
        txnIds: [txn.id],
        txn
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function categoryLabelShort(cat) {
  if (cat === 'behavior') return t('points.typeBehavior');
  if (cat === 'manual') return t('points.typeManual');
  return cat;
}

/**
 * @param {Array<object>} transactions
 */
export function buildAllTimelineItems(transactions) {
  return [...transactions]
    .sort((a, b) => {
      const dc = String(b.transactionDate || b.date).localeCompare(
        String(a.transactionDate || a.date)
      );
      if (dc !== 0) return dc;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })
    .map((txn) => {
      const cat = txn.category || txn.type || 'manual';
      const isGood = Number(txn.points) > 0;
      let kind = cat;
      if (cat === 'behavior') kind = isGood ? 'behavior_good' : 'behavior_bad';

      const title = reasonLabel(txn.reason, cat);
      const note = String(txn.note || '').trim();
      const teacher = String(txn.teacherName || '').trim();
      const subtitle = [categoryLabelShort(cat), teacher].filter(Boolean).join(' · ');

      return {
        date: String(txn.transactionDate || txn.date),
        title,
        subtitle,
        points: Number(txn.points) || 0,
        note,
        kind,
        txnIds: [txn.id],
        txn
      };
    });
}

/**
 * @param {ProfileTab} tab
 * @param {Array<object>} attendanceRows
 * @param {Array<object>} transactions
 */
export function buildTimelineForTab(tab, attendanceRows, transactions) {
  if (tab === 'attendance') {
    return buildAttendanceTimelineItems(attendanceRows, transactions);
  }
  if (tab === 'discipline') {
    return buildDisciplineTimelineItems(transactions);
  }
  if (tab === 'behavior') {
    return buildBehaviorTimelineItems(transactions);
  }
  return buildAllTimelineItems(transactions);
}

/**
 * @param {Array<object>} items
 * @param {{ admin?: boolean, onEdit?: (id: string) => void, onDelete?: (id: string) => void }} [opts]
 */
export function renderTimelineHtml(items, opts = {}) {
  if (!items.length) return '';

  return `<div class="profile-timeline">${items
    .map((item) => {
      let adminActions = '';
      if (opts.admin && item.txn?.id) {
        adminActions = `<div class="profile-timeline-card__actions">
          <button type="button" class="button-secondary button-secondary--sm" data-edit-txn="${escapeHtml(item.txn.id)}">${escapeHtml(t('common.edit'))}</button>
          <button type="button" class="button-secondary button-secondary--sm" data-del-txn="${escapeHtml(item.txn.id)}">${escapeHtml(t('common.delete'))}</button>
        </div>`;
      } else if (opts.admin && item.txnIds?.length === 1) {
        const id = item.txnIds[0];
        adminActions = `<div class="profile-timeline-card__actions">
          <button type="button" class="button-secondary button-secondary--sm" data-del-txn="${escapeHtml(id)}">${escapeHtml(t('common.delete'))}</button>
        </div>`;
      }

      return timelineCard({
        date: item.date,
        title: item.title,
        subtitle: item.subtitle,
        points: item.points,
        note: item.note,
        kind: item.kind,
        adminActions
      });
    })
    .join('')}</div>`;
}

/**
 * @param {ProfileTab} tab
 */
export function emptyMessageForTab(tab) {
  if (tab === 'attendance') return t('points.emptyAttendance');
  if (tab === 'discipline') return t('points.emptyDiscipline');
  if (tab === 'behavior') return t('points.emptyBehavior');
  return t('points.noTransactions');
}
