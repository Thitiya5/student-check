import { escapeHtml } from '../utils/html.js';

export function renderSummaryCards(stats) {
  return stats
    .map(
      (item) => `
      <article class="summary-card">
        <span>${item.label}</span>
        <strong class="stat-value">${item.value}</strong>
        <p>${item.description}</p>
      </article>`
    )
    .join('');
}

export function renderMenuCards(items) {
  return items
    .map(
      (item) => `
      <article class="menu-card">
        <div>
          <h3>${item.title}</h3>
          <p>${item.description}</p>
        </div>
        <span>${item.action}</span>
      </article>`
    )
    .join('');
}

export function renderDashboardStats({ presentCount, absentCount, percentValue }) {
  return `
    <div class="dashboard-metrics">
      <article class="summary-card-glass">
        <div class="summary-icon" aria-hidden="true">✓</div>
        <div class="stat-label">Present</div>
        <div class="stat-value">${presentCount}</div>
        <p class="stat-caption">Students marked present or not yet updated today.</p>
      </article>
      <article class="summary-card-glass">
        <div class="summary-icon" aria-hidden="true">!</div>
        <div class="stat-label">Absent</div>
        <div class="stat-value">${absentCount}</div>
        <p class="stat-caption">Students recorded as absent for today.</p>
      </article>
      <article class="summary-card-glass is-accent-purple summary-percent-ring">
        <div class="ring" style="--p: ${Math.min(Math.max(percentValue, 0), 100)}">
          <div class="ring-inner">${percentValue}%</div>
        </div>
        <div>
          <div class="stat-label">Attendance %</div>
          <p class="stat-caption">Share of roster not marked absent, late, or leave.</p>
        </div>
      </article>
    </div>
  `;
}

const QUICK_ACTION_SVG = {
  '/check': `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  '/history': `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  '/reports': `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V9"/><path d="M12 17V7"/><path d="M16 17v-4"/></svg>`,
  '/students': `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-2.2 2.7-4 6-4s6 1.8 6 4"/><path d="M14 19c0-1.5 1.8-3 4-3"/></svg>`,
  '/admin': `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>`
};

/**
 * Compact icon quick actions for dashboard home.
 * @param {{ title: string, target: string }[]} items
 */
export function renderDashboardQuickActions(items) {
  return items
    .map(
      (item) => `
      <button type="button" class="dash-action" data-target="${escapeHtml(item.target)}">
        <span class="dash-action__icon">${QUICK_ACTION_SVG[item.target] || ''}</span>
        <span class="dash-action__label">${escapeHtml(item.title)}</span>
      </button>`
    )
    .join('');
}

export function renderQuickMenuCards(items) {
  return items
    .map(
      (item) => `
      <article class="menu-card-modern" role="button" tabindex="0" data-target="${item.target}">
        <div>
          <h3>${item.title}</h3>
          <p>${item.description}</p>
        </div>
        <span class="menu-chevron" aria-hidden="true">›</span>
      </article>`
    )
    .join('');
}
