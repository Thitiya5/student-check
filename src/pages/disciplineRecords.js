import { escapeHtml } from '../utils/html.js';
import { renderLoading, renderEmpty } from '../utils/ui.js';
import { t } from '../i18n/index.js';
import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';
import { fetchLevelOptions, fetchRoomOptions } from '../services/studentsService.js';
import { formatDisciplineScore } from '../data/disciplineChecks.js';
import { openPinConfirmModal } from '../components/pinConfirmModal.js';
import { verifyBehaviorWritePin } from '../services/teachersService.js';
import {
  queryPointsInRangeForSession,
  reasonLabel
} from '../services/studentPointsService.js';
import { returnDisciplinePointsForStudent } from '../services/disciplineReturnService.js';
import { loadTeacherAuthSession, canReturnDisciplinePointsSession, classKeyToParts } from '../services/teacherAuth.js';
import { getTodayDate } from '../utils/dateIso.js';
import { initAppSettings, isDisciplineScoringEnabled } from '../services/appSettingsService.js';

/**
 * Admin-only discipline score ledger + correction entry.
 * @param {HTMLElement} container
 * @param {object} ctx
 */
export function renderDisciplineRecordsPage(container, { state = {}, onNavigate, onBack, onToast } = {}) {
  const session = state.teacherAuth || loadTeacherAuthSession();
  if (!canReturnDisciplinePointsSession(session)) {
    onNavigate?.('/dashboard');
    return;
  }

  container.classList.add('discipline-records-page');
  const today = getTodayDate();
  const teacherName = String(session?.teacherName || state.teacherName || '').trim();

  let historyFrom = today;
  let historyTo = today;
  let historyLevel = '';
  let historyRoom = '';
  let historyRows = [];
  let historySeq = 0;

  container.innerHTML = `${renderPageHeader({
    title: t('disciplineRecords.title'),
    topAction: 'back'
  })}
  <section class="reports-toolbar glass-card behavior-history-toolbar">
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterPeriod'))}</p>
      <div class="reports-toolbar__period">
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.fromDate'))}</span>
          <input type="date" id="discHistFrom" class="reports-filter__control input-field" value="${today}" />
        </label>
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.toDate'))}</span>
          <input type="date" id="discHistTo" class="reports-filter__control input-field" value="${today}" />
        </label>
      </div>
    </div>
    <div class="reports-toolbar__block">
      <p class="reports-toolbar__block-title">${escapeHtml(t('reports.filterClass'))}</p>
      <div class="reports-toolbar__class-row">
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.level'))}</span>
          <select id="discHistLevel" class="reports-filter__control select-field"><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
        <label class="reports-filter">
          <span class="reports-filter__label">${escapeHtml(t('common.room'))}</span>
          <select id="discHistRoom" class="reports-filter__control select-field" disabled><option value="">${escapeHtml(t('common.all'))}</option></select>
        </label>
      </div>
    </div>
    <div class="reports-toolbar__footer">
      <input class="input-field" id="discHistSearch" placeholder="${escapeHtml(t('check.searchPlaceholder'))}" />
      <button type="button" class="reports-primary-link" id="discHistRefresh">${escapeHtml(t('behavior.historyRefresh'))}</button>
    </div>
  </section>
  <section id="discHistoryBody">${renderLoading()}</section>`;

  bindPageHeaderActions(container, {
    onBack: () => onBack?.('/admin'),
    onNavigate
  });

  const historyBody = container.querySelector('#discHistoryBody');
  const histFromInput = container.querySelector('#discHistFrom');
  const histToInput = container.querySelector('#discHistTo');
  const histLevelSel = container.querySelector('#discHistLevel');
  const histRoomSel = container.querySelector('#discHistRoom');
  const histSearchInput = container.querySelector('#discHistSearch');

  if (!isDisciplineScoringEnabled()) {
    if (historyBody) {
      historyBody.innerHTML = renderEmpty(
        t('behavior.scoringDisabled'),
        t('behavior.scoringDisabledHint')
      );
    }
    return;
  }

  function renderHistoryLedger(list) {
    if (!historyBody) return;
    if (!list.length) {
      historyBody.innerHTML = renderEmpty(t('disciplineRecords.historyEmpty'));
      return;
    }
    const totalPts = list.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
    const cards = list
      .map((row, idx) => {
        const ptsNum = Number(row.points) || 0;
        const pts = formatDisciplineScore(ptsNum);
        const note = String(row.note || '').trim();
        return `<article class="behavior-history-card points-entry-card glass-card" data-idx="${idx}">
          <div class="points-entry-card__score points-entry-card__score--neg">${escapeHtml(pts)}</div>
          <div class="points-entry-card__body">
            <div class="points-entry-card__top">
              <strong class="points-entry-card__name">${escapeHtml(row.student_name || row.student_id)}</strong>
              <span class="points-entry-card__class">${escapeHtml(row.class || '')}</span>
            </div>
            <div class="points-entry-card__meta">
              <span>${escapeHtml(row.transactionDate || row.date || '')}</span>
              <span class="points-entry-card__cat">${escapeHtml(reasonLabel(row.reason, 'discipline'))}</span>
            </div>
            <p class="points-entry-card__teacher">${escapeHtml(t('pointsReport.recordedBy'))}: ${escapeHtml(row.teacherName || '—')}</p>
            ${note ? `<p class="points-entry-card__note">${escapeHtml(note)}</p>` : ''}
            <div class="behavior-history-card__actions">
              <button type="button" class="button-ghost button-secondary--sm behavior-history-card__return-btn" data-action="return" data-idx="${idx}">${escapeHtml(t('disciplineRecords.returnPoints'))}</button>
            </div>
          </div>
        </article>`;
      })
      .join('');

    historyBody.innerHTML = `
      <p class="points-ledger-summary">${escapeHtml(t('pointsReport.summaryBar', { count: list.length, total: formatDisciplineScore(totalPts) }))}</p>
      <div class="points-ledger-cards behavior-history-cards">${cards}</div>`;

    historyBody.querySelectorAll('[data-action="return"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = historyRows[Number(btn.getAttribute('data-idx'))];
        if (row) void revertDisciplineRow(row);
      });
    });
  }

  async function revertDisciplineRow(row) {
    const classKey = String(row.class || '');
    const parts = classKeyToParts(classKey);
    const sid = String(row.student_id || '');
    const flagId = String(row.reason || '');
    const date = String(row.transactionDate || row.date || today);
    if (!parts.level || !parts.room || !sid || !flagId) {
      onToast?.(t('toast.classNotAllowed'));
      return;
    }

    openPinConfirmModal({
      title: t('disciplineRecords.returnTitle'),
      onConfirm: async (pin) => {
        await verifyBehaviorWritePin(session, pin);
        await returnDisciplinePointsForStudent({
          classKey,
          studentId: sid,
          date,
          teacherName,
          flagId
        });
        onToast?.(t('disciplineRecords.returned'));
        void loadHistory();
      },
      onError: (err) => {
        onToast?.(err instanceof Error ? err.message : t('behavior.saveFailed'));
      }
    });
  }

  async function loadHistory() {
    if (!historyBody) return;
    const seq = ++historySeq;
    historyBody.innerHTML = renderLoading(t('students.loading'));
    try {
      const rows = await queryPointsInRangeForSession(session, {
        from: historyFrom,
        to: historyTo,
        level: historyLevel || undefined,
        room: historyRoom || undefined,
        category: 'discipline',
        search: histSearchInput?.value.trim() || undefined
      });
      if (seq !== historySeq) return;
      historyRows = rows;
      renderHistoryLedger(rows);
    } catch (err) {
      if (seq !== historySeq) return;
      historyBody.innerHTML = renderEmpty(t('behavior.historyFailed'), err?.message || '');
    }
  }

  async function populateHistoryRooms(lvl) {
    if (!histRoomSel) return;
    if (!lvl) {
      histRoomSel.disabled = true;
      histRoomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      return;
    }
    const rooms = await fetchRoomOptions(lvl);
    histRoomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    histRoomSel.disabled = false;
    if (historyRoom) histRoomSel.value = historyRoom;
  }

  async function loadLevels() {
    const levels = await fetchLevelOptions();
    if (histLevelSel) {
      histLevelSel.innerHTML =
        `<option value="">${escapeHtml(t('common.all'))}</option>` +
        levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    }
  }

  histLevelSel?.addEventListener('change', async () => {
    historyLevel = histLevelSel.value;
    historyRoom = '';
    await populateHistoryRooms(historyLevel);
    void loadHistory();
  });

  histRoomSel?.addEventListener('change', () => {
    historyRoom = histRoomSel.value;
    void loadHistory();
  });

  histFromInput?.addEventListener('change', () => {
    historyFrom = histFromInput.value || today;
    void loadHistory();
  });

  histToInput?.addEventListener('change', () => {
    historyTo = histToInput.value || today;
    void loadHistory();
  });

  histSearchInput?.addEventListener('input', () => void loadHistory());
  container.querySelector('#discHistRefresh')?.addEventListener('click', () => void loadHistory());

  void initAppSettings()
    .then(() => loadLevels())
    .then(() => loadHistory())
    .catch((err) => onToast?.(err?.message));

  container.__disciplineRecordsCleanup = () => {};
}
