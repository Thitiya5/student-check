import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { formatDisciplineScore } from '../data/disciplineChecks.js';

let activeBadge = null;

/**
 * Floating save confirmation (top-right) — class, net +/-, changed students.
 * @param {{
 *   classKey: string,
 *   dateLabel?: string,
 *   totalDelta: number,
 *   items: Array<{ name: string, kind?: 'good'|'bad', points: number, label?: string, labelKey?: string, note?: string }>,
 *   durationMs?: number
 * }} opts
 */
export function showSaveResultBadge({
  classKey,
  dateLabel = '',
  totalDelta,
  items = [],
  durationMs = 12000
}) {
  activeBadge?.remove();
  activeBadge = null;

  const isPos = totalDelta > 0;
  const isNeg = totalDelta < 0;
  const scoreCls = isPos ? 'save-result-badge__score--pos' : isNeg ? 'save-result-badge__score--neg' : 'save-result-badge__score--zero';
  const scoreText = formatDisciplineScore(totalDelta);

  const listHtml = items.length
    ? `<ul class="save-result-badge__list">${items
        .slice(0, 6)
        .map((item) => {
          const pts = formatDisciplineScore(item.points);
          const ptsCls = item.points < 0 ? 'save-result-badge__item-pts--neg' : 'save-result-badge__item-pts--pos';
          const kindLabel = item.label
            || (item.labelKey ? t(item.labelKey) : '')
            || (item.kind === 'good'
              ? t('discipline.goodDeedShort')
              : item.kind === 'bad'
                ? t('discipline.badDeedShort')
                : '');
          return `<li class="save-result-badge__item">
            <span class="save-result-badge__item-name">${escapeHtml(item.name)}</span>
            <span class="save-result-badge__item-meta">${escapeHtml(kindLabel)} <span class="${ptsCls}">${escapeHtml(pts)}</span></span>
          </li>`;
        })
        .join('')}${items.length > 6 ? `<li class="save-result-badge__more">${escapeHtml(t('behavior.saveMore', { count: items.length - 6 }))}</li>` : ''}</ul>`
    : '';

  const root = document.createElement('div');
  root.className = 'save-result-badge';
  root.setAttribute('role', 'status');
  root.innerHTML = `
    <button type="button" class="save-result-badge__close" aria-label="${escapeHtml(t('common.cancel'))}">×</button>
    <div class="save-result-badge__score ${scoreCls}">${escapeHtml(scoreText)}</div>
    <div class="save-result-badge__info">
      <strong class="save-result-badge__class">${escapeHtml(classKey)}</strong>
      ${dateLabel ? `<span class="save-result-badge__date">${escapeHtml(dateLabel)}</span>` : ''}
      <p class="save-result-badge__title">${escapeHtml(t('behavior.saveDone'))}</p>
    </div>
    ${listHtml}`;

  document.body.appendChild(root);
  activeBadge = root;

  const close = () => {
    root.classList.add('save-result-badge--out');
    setTimeout(() => {
      root.remove();
      if (activeBadge === root) activeBadge = null;
    }, 280);
  };

  root.querySelector('.save-result-badge__close')?.addEventListener('click', close);
  if (durationMs > 0) setTimeout(close, durationMs);

  return close;
}

export function dismissSaveResultBadge() {
  activeBadge?.querySelector('.save-result-badge__close')?.click();
}
