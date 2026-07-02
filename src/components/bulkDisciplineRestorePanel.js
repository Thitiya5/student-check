import { escapeHtml } from '../utils/html.js';
import { t } from '../i18n/index.js';
import { formatDisciplineScore } from '../data/disciplineChecks.js';
import {
  buildBulkRestoreSummaryText,
  executeBulkDisciplineRestore,
  previewBulkDisciplineRestore
} from '../services/bulkDisciplineRestoreService.js';
import { reasonLabel } from '../services/studentPointsService.js';
import { fetchLevelOptions, fetchRoomOptions } from '../services/studentsService.js';
import { openBulkRestoreConfirmModal } from './bulkRestoreConfirmModal.js';
import { getTodayDate } from '../utils/dateIso.js';

const SAMPLE_STUDENT_LIMIT = 10;

/**
 * @param {import('../services/bulkDisciplineRestoreService.js').BulkRestorePreview} preview
 */
function renderSampleStudents(preview) {
  const sample = (preview.students || []).slice(0, SAMPLE_STUDENT_LIMIT);
  if (!sample.length) return '';

  const rows = sample
    .map((student) => {
      const items = (student.transactions || [])
        .map((txn) => reasonLabel(txn.reason, 'discipline'))
        .join(', ');
      const points = (student.transactions || []).reduce(
        (sum, txn) => sum + Math.abs(Number(txn.points) || 0),
        0
      );
      return `<li class="bulk-restore-sample__item">
        <div class="bulk-restore-sample__name">${escapeHtml(student.studentName)}</div>
        <div class="bulk-restore-sample__meta">
          <span>${escapeHtml(student.classKey)}</span>
          <span>${escapeHtml(items)}</span>
          <strong>${escapeHtml(formatDisciplineScore(points))}</strong>
        </div>
      </li>`;
    })
    .join('');

  const more =
    preview.studentCount > SAMPLE_STUDENT_LIMIT
      ? `<p class="bulk-restore-sample__more">${escapeHtml(
          t('bulkRestore.sampleMore', { count: preview.studentCount - SAMPLE_STUDENT_LIMIT })
        )}</p>`
      : '';

  return `<section class="bulk-restore-sample" aria-label="${escapeHtml(t('bulkRestore.sampleTitle'))}">
    <h4 class="bulk-restore-section__title">${escapeHtml(t('bulkRestore.sampleTitle'))}</h4>
    <ul class="bulk-restore-sample__list">${rows}</ul>
    ${more}
  </section>`;
}

/**
 * @param {HTMLElement} mount
 * @param {{
 *   session: object,
 *   teacherName: string,
 *   onToast?: (msg: string) => void
 * }} ctx
 */
export function renderBulkDisciplineRestorePanel(mount, { session, teacherName, onToast }) {
  const today = getTodayDate();
  let bulkDate = today;
  let bulkLevel = '';
  let bulkRoom = '';
  /** @type {import('../services/bulkDisciplineRestoreService.js').BulkRestorePreview|null} */
  let bulkPreview = null;
  /** @type {object|null} */
  let bulkResult = null;
  let bulkBusy = false;

  mount.innerHTML = `<section class="bulk-restore glass-card" aria-labelledby="bulkRestoreTitle">
    <div class="bulk-restore__head">
      <h2 id="bulkRestoreTitle" class="bulk-restore__title">${escapeHtml(t('bulkRestore.title'))}</h2>
    </div>
    <div class="bulk-restore__form">
      <label class="reports-filter">
        <span class="reports-filter__label">${escapeHtml(t('bulkRestore.inspectionDate'))}</span>
        <input type="date" id="bulkRestoreDate" class="reports-filter__control input-field" value="${today}" required />
      </label>
      <label class="reports-filter">
        <span class="reports-filter__label">${escapeHtml(t('common.level'))}</span>
        <select id="bulkRestoreLevel" class="reports-filter__control select-field">
          <option value="">${escapeHtml(t('common.all'))}</option>
        </select>
      </label>
      <label class="reports-filter">
        <span class="reports-filter__label">${escapeHtml(t('common.room'))}</span>
        <select id="bulkRestoreRoom" class="reports-filter__control select-field" disabled>
          <option value="">${escapeHtml(t('common.all'))}</option>
        </select>
      </label>
      <label class="reports-filter bulk-restore__reason">
        <span class="reports-filter__label">${escapeHtml(t('bulkRestore.reason'))}</span>
        <textarea id="bulkRestoreReason" class="input-field bulk-restore__reason-input" rows="2" required placeholder="${escapeHtml(t('bulkRestore.reasonPh'))}"></textarea>
      </label>
    </div>
    <div class="bulk-restore__actions">
      <button type="button" class="bulk-restore__preview-btn" id="bulkRestorePreviewBtn">${escapeHtml(t('bulkRestore.preview'))}</button>
    </div>
    <div id="bulkRestorePreviewMount" class="bulk-restore__preview" hidden></div>
    <div id="bulkRestoreProgressMount" class="bulk-restore__progress" hidden></div>
    <div id="bulkRestoreResultMount" class="bulk-restore__result" hidden></div>
  </section>`;

  const dateInput = mount.querySelector('#bulkRestoreDate');
  const levelSel = mount.querySelector('#bulkRestoreLevel');
  const roomSel = mount.querySelector('#bulkRestoreRoom');
  const reasonInput = mount.querySelector('#bulkRestoreReason');
  const previewMount = mount.querySelector('#bulkRestorePreviewMount');
  const progressMount = mount.querySelector('#bulkRestoreProgressMount');
  const resultMount = mount.querySelector('#bulkRestoreResultMount');

  function setBusy(busy) {
    bulkBusy = busy;
    mount.querySelector('#bulkRestorePreviewBtn')?.toggleAttribute('disabled', busy);
    mount.querySelector('#bulkRestoreExecuteBtn')?.toggleAttribute('disabled', busy);
  }

  function renderPreview(preview) {
    if (!previewMount) return;
    if (!preview?.studentCount) {
      previewMount.hidden = false;
      previewMount.innerHTML = `<p class="bulk-restore__empty">${escapeHtml(t('bulkRestore.previewEmpty'))}</p>`;
      return;
    }

    const categoryItems = preview.byCategory
      .map(
        (row) => `<li class="bulk-restore-breakdown__item">
          <span class="bulk-restore-breakdown__label">${escapeHtml(row.label)}</span>
          <span class="bulk-restore-breakdown__value">${row.count} · ${escapeHtml(formatDisciplineScore(row.points))}</span>
        </li>`
      )
      .join('');

    const levelItems = preview.byLevel
      .map(
        (row) => `<li class="bulk-restore-breakdown__item">
          <span class="bulk-restore-breakdown__label">${escapeHtml(row.level)}</span>
          <span class="bulk-restore-breakdown__value">${row.students} ${escapeHtml(t('bulkRestore.studentsUnit'))}</span>
        </li>`
      )
      .join('');

    const classItems = preview.byClass
      .map(
        (row) => `<li class="bulk-restore-breakdown__item">
          <span class="bulk-restore-breakdown__label">${escapeHtml(row.classKey)}</span>
          <span class="bulk-restore-breakdown__value">${row.students} ${escapeHtml(t('bulkRestore.studentsUnit'))} · ${row.transactions} ${escapeHtml(t('bulkRestore.itemsUnit'))}</span>
        </li>`
      )
      .join('');

    previewMount.hidden = false;
    previewMount.innerHTML = `
      <div class="bulk-restore__preview-head">
        <h3 class="bulk-restore__preview-title">${escapeHtml(t('bulkRestore.previewTitle'))}</h3>
        <p class="bulk-restore__operation-id">
          <span>${escapeHtml(t('bulkRestore.operationId'))}</span>
          <code>${escapeHtml(preview.operationId)}</code>
        </p>
      </div>

      <div class="bulk-restore-kpi" role="group" aria-label="${escapeHtml(t('bulkRestore.previewTitle'))}">
        <article class="bulk-restore-kpi__card">
          <p class="bulk-restore-kpi__label">${escapeHtml(t('bulkRestore.inspectionDate'))}</p>
          <p class="bulk-restore-kpi__value">${escapeHtml(preview.date)}</p>
        </article>
        <article class="bulk-restore-kpi__card">
          <p class="bulk-restore-kpi__label">${escapeHtml(t('bulkRestore.statStudents'))}</p>
          <p class="bulk-restore-kpi__value">${preview.studentCount}</p>
        </article>
        <article class="bulk-restore-kpi__card">
          <p class="bulk-restore-kpi__label">${escapeHtml(t('bulkRestore.statTransactions'))}</p>
          <p class="bulk-restore-kpi__value">${preview.transactionCount}</p>
        </article>
        <article class="bulk-restore-kpi__card bulk-restore-kpi__card--accent">
          <p class="bulk-restore-kpi__label">${escapeHtml(t('bulkRestore.statPoints'))}</p>
          <p class="bulk-restore-kpi__value">${escapeHtml(formatDisciplineScore(preview.totalPointsToRestore))}</p>
        </article>
      </div>

      ${preview.skippedWaived || preview.skippedBulk ? `<p class="bulk-restore__skip-note">${escapeHtml(t('bulkRestore.skippedNote', { waived: preview.skippedWaived, bulk: preview.skippedBulk }))}</p>` : ''}

      <div class="bulk-restore-breakdown">
        <section class="bulk-restore-breakdown__block">
          <h4 class="bulk-restore-section__title">${escapeHtml(t('bulkRestore.byCategory'))}</h4>
          <ul class="bulk-restore-breakdown__list">${categoryItems}</ul>
        </section>
        <section class="bulk-restore-breakdown__block">
          <h4 class="bulk-restore-section__title">${escapeHtml(t('bulkRestore.byLevel'))}</h4>
          <ul class="bulk-restore-breakdown__list">${levelItems}</ul>
        </section>
      </div>

      <details class="bulk-restore-rooms">
        <summary class="bulk-restore-rooms__summary">${escapeHtml(t('bulkRestore.roomDetails'))}</summary>
        <ul class="bulk-restore-breakdown__list bulk-restore-breakdown__list--rooms">${classItems}</ul>
      </details>

      ${renderSampleStudents(preview)}

      <div class="bulk-restore__confirm">
        <button type="button" class="bulk-restore__execute-btn" id="bulkRestoreExecuteBtn">${escapeHtml(t('bulkRestore.execute'))}</button>
      </div>`;

    mount.querySelector('#bulkRestoreExecuteBtn')?.addEventListener('click', () => {
      void runExecute();
    });
  }

  function renderProgress(progress) {
    if (!progressMount) return;
    progressMount.hidden = false;
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    progressMount.innerHTML = `
      <p class="bulk-restore__progress-label" role="status">
        ${escapeHtml(t('bulkRestore.progress', { done: progress.done, total: progress.total, classKey: progress.classKey || '' }))}
      </p>
      <div class="bulk-restore__progress-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
  }

  function renderResult(result) {
    if (!resultMount) return;
    resultMount.hidden = false;
    resultMount.innerHTML = `
      <h3 class="bulk-restore__result-title">${escapeHtml(t('bulkRestore.successTitle'))}</h3>
      <p class="bulk-restore__operation-id bulk-restore__operation-id--result">
        <span>${escapeHtml(t('bulkRestore.operationId'))}</span>
        <code>${escapeHtml(result.operationId || result.bulkRestoreId || '')}</code>
      </p>
      <p class="bulk-restore__result-meta">${escapeHtml(t('bulkRestore.successMeta', {
        students: result.studentCount,
        transactions: result.transactionCount,
        points: formatDisciplineScore(result.totalPointsRestored)
      }))}</p>
      ${result.classErrors?.length ? `<p class="bulk-restore__warn">${escapeHtml(t('bulkRestore.partialErrors', { count: result.classErrors.length }))}</p>` : ''}
      <button type="button" class="button-ghost" id="bulkRestoreDownloadBtn">${escapeHtml(t('bulkRestore.download'))}</button>`;

    mount.querySelector('#bulkRestoreDownloadBtn')?.addEventListener('click', () => {
      const text = buildBulkRestoreSummaryText(result);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulk-restore-${result.date || 'summary'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  async function populateRooms(level) {
    if (!roomSel) return;
    if (!level) {
      roomSel.disabled = true;
      roomSel.innerHTML = `<option value="">${escapeHtml(t('common.all'))}</option>`;
      return;
    }
    const rooms = await fetchRoomOptions(level);
    roomSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    roomSel.disabled = false;
    if (bulkRoom) roomSel.value = bulkRoom;
  }

  async function loadLevels() {
    const levels = await fetchLevelOptions();
    if (!levelSel) return;
    levelSel.innerHTML =
      `<option value="">${escapeHtml(t('common.all'))}</option>` +
      levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }

  async function runPreview() {
    bulkPreview = null;
    bulkResult = null;
    if (resultMount) resultMount.hidden = true;
    if (progressMount) progressMount.hidden = true;

    const reason = reasonInput?.value.trim() || '';
    if (!reason) {
      onToast?.(t('bulkRestore.reasonRequired'));
      return;
    }

    setBusy(true);
    try {
      bulkPreview = await previewBulkDisciplineRestore(session, {
        date: bulkDate,
        level: bulkLevel || undefined,
        room: bulkRoom || undefined
      });
      renderPreview(bulkPreview);
    } catch (err) {
      previewMount.hidden = false;
      previewMount.innerHTML = `<p class="bulk-restore__error">${escapeHtml(err instanceof Error ? err.message : t('common.loadFailed'))}</p>`;
      onToast?.(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function runExecute() {
    const reason = reasonInput?.value.trim() || '';
    if (!reason) {
      onToast?.(t('bulkRestore.reasonRequired'));
      return;
    }
    if (!bulkPreview?.studentCount) {
      onToast?.(t('bulkRestore.previewFirst'));
      return;
    }

    openBulkRestoreConfirmModal({
      session,
      operationId: bulkPreview.operationId,
      date: bulkPreview.date,
      studentCount: bulkPreview.studentCount,
      transactionCount: bulkPreview.transactionCount,
      totalPointsLabel: formatDisciplineScore(bulkPreview.totalPointsToRestore),
      onConfirm: async () => {
        setBusy(true);
        if (progressMount) progressMount.hidden = false;
        renderProgress({ done: 0, total: 0 });
        try {
          bulkResult = await executeBulkDisciplineRestore(session, {
            preview: bulkPreview,
            operationId: bulkPreview.operationId,
            restoreReason: reason,
            teacherName,
            onProgress: (progress) => renderProgress(progress)
          });
          if (previewMount) previewMount.hidden = true;
          if (progressMount) progressMount.hidden = true;
          renderResult(bulkResult);
          onToast?.(t('bulkRestore.successToast'));
        } catch (err) {
          onToast?.(err instanceof Error ? err.message : t('common.loadFailed'));
        } finally {
          setBusy(false);
        }
      },
      onError: (err) => {
        onToast?.(err instanceof Error ? err.message : t('behavior.saveFailed'));
      }
    });
  }

  dateInput?.addEventListener('change', () => {
    bulkDate = dateInput.value || today;
    bulkPreview = null;
    if (previewMount) previewMount.hidden = true;
  });
  levelSel?.addEventListener('change', async () => {
    bulkLevel = levelSel.value;
    bulkRoom = '';
    await populateRooms(bulkLevel);
    bulkPreview = null;
    if (previewMount) previewMount.hidden = true;
  });
  roomSel?.addEventListener('change', () => {
    bulkRoom = roomSel.value;
    bulkPreview = null;
    if (previewMount) previewMount.hidden = true;
  });

  mount.querySelector('#bulkRestorePreviewBtn')?.addEventListener('click', () => {
    void runPreview();
  });

  void loadLevels();
}
