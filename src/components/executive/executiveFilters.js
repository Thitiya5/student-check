import { escapeHtml } from '../../utils/html.js';
import { t } from '../../i18n/index.js';

const GRADES = ['', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
const SEMESTERS = ['1', '2'];
const ACADEMIC_YEARS = ['2567', '2568', '2569'];

/**
 * @param {import('../../hooks/executive/useExecutiveFilters.js').ExecutiveFilters} filters
 */
export function renderExecutiveFilters(filters) {
  const gradeOptions = GRADES.map(
    (g) =>
      `<option value="${escapeHtml(g)}"${filters.grade === g ? ' selected' : ''}>${
        g ? escapeHtml(g) : escapeHtml(t('executive.filters.allGrades'))
      }</option>`
  ).join('');

  const semesterOptions = SEMESTERS.map(
    (s) =>
      `<option value="${s}"${filters.semester === s ? ' selected' : ''}>${escapeHtml(
        t('executive.filters.semesterOption', { term: s })
      )}</option>`
  ).join('');

  const yearOptions = ACADEMIC_YEARS.map(
    (y) =>
      `<option value="${y}"${filters.academicYear === y ? ' selected' : ''}>${escapeHtml(y)}</option>`
  ).join('');

  return `<details class="exec-filters glass-card mobile-filter-collapse" aria-label="${escapeHtml(t('executive.filters.aria'))}">    <summary class="mobile-filter-collapse__summary">${escapeHtml(t('common.filters'))}</summary>
    <div class="mobile-filter-collapse__body">
    <h2 class="exec-section-title">${escapeHtml(t('executive.filters.title'))}</h2>
    <div class="exec-filters__grid">
      <label class="field exec-filters__field">
        <span>${escapeHtml(t('executive.filters.date'))}</span>
        <input type="date" class="input-field" id="execFilterDate" value="${escapeHtml(filters.date)}" />
      </label>
      <label class="field exec-filters__field">
        <span>${escapeHtml(t('executive.filters.month'))}</span>
        <input type="month" class="input-field" id="execFilterMonth" value="${escapeHtml(filters.month)}" />
      </label>
      <label class="field exec-filters__field">
        <span>${escapeHtml(t('executive.filters.semester'))}</span>
        <select class="select-field" id="execFilterSemester">${semesterOptions}</select>
      </label>
      <label class="field exec-filters__field">
        <span>${escapeHtml(t('executive.filters.academicYear'))}</span>
        <select class="select-field" id="execFilterYear">${yearOptions}</select>
      </label>
      <label class="field exec-filters__field">
        <span>${escapeHtml(t('executive.filters.grade'))}</span>
        <select class="select-field" id="execFilterGrade">${gradeOptions}</select>
      </label>
      <label class="field exec-filters__field">
        <span>${escapeHtml(t('executive.filters.room'))}</span>
        <input type="text" class="input-field" id="execFilterRoom" placeholder="${escapeHtml(
          t('executive.filters.roomPh')
        )}" value="${escapeHtml(filters.room)}" inputmode="numeric" />
      </label>
    </div>
    <p class="exec-filters__hint">${escapeHtml(t('executive.filters.mockHint'))}</p>
    </div>
  </details>`;
}

/**
 * @param {HTMLElement} root
 * @param {ReturnType<import('../../hooks/executive/useExecutiveFilters.js').createExecutiveFilters>} filterStore
 */
export function bindExecutiveFilters(root, filterStore) {
  const dateEl = root.querySelector('#execFilterDate');
  const monthEl = root.querySelector('#execFilterMonth');
  const semesterEl = root.querySelector('#execFilterSemester');
  const yearEl = root.querySelector('#execFilterYear');
  const gradeEl = root.querySelector('#execFilterGrade');
  const roomEl = root.querySelector('#execFilterRoom');

  dateEl?.addEventListener('change', () => {
    filterStore.setState({ date: dateEl.value });
  });
  monthEl?.addEventListener('change', () => {
    filterStore.setState({ month: monthEl.value });
  });
  semesterEl?.addEventListener('change', () => {
    filterStore.setState({ semester: semesterEl.value });
  });
  yearEl?.addEventListener('change', () => {
    filterStore.setState({ academicYear: yearEl.value });
  });
  gradeEl?.addEventListener('change', () => {
    filterStore.setState({ grade: gradeEl.value });
  });
  roomEl?.addEventListener('input', () => {
    filterStore.setState({ room: roomEl.value.trim() });
  });
}
