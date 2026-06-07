import { escapeHtml } from '../utils/html.js';

import { renderEmpty } from '../utils/ui.js';

import { loadTeacherAuthSession, isAdminSession } from '../services/teacherAuth.js';

import { t } from '../i18n/index.js';

import { renderPageHeader, bindPageHeaderActions } from '../components/pageHeader.js';



/**

 * Admin hub — shortcuts only; edit/delete attendance ใช้หน้าประวัติ

 * @param {HTMLElement} container

 * @param {{ state: object, onNavigate: (path: string) => void, onToast?: (msg: string) => void }} ctx

 */

export function renderAdminPage(container, { state, onNavigate, onToast, onLogout, onBack }) {

  container.classList.add('admin-page');

  const session = state.teacherAuth || loadTeacherAuthSession();

  if (!isAdminSession(session)) {

    container.innerHTML = renderEmpty(t('admin.denied'), t('admin.deniedHint'));

    container.querySelector('.ui-empty')?.addEventListener('click', () => onNavigate('/dashboard'));

    return;

  }



  container.innerHTML = `${renderPageHeader({

    title: t('admin.title'),

    topAction: 'back'

  })}

  <section class="admin-hub glass-card">

    <nav class="admin-hub__grid" aria-label="${escapeHtml(t('admin.title'))}">

      <button type="button" class="admin-hub__btn" id="adminPointsReportBtn">

        <span class="admin-hub__label">${escapeHtml(t('pointsReport.open'))}</span>

        <span class="admin-hub__sub">${escapeHtml(t('admin.pointsReportSub'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminBehaviorBtn">

        <span class="admin-hub__label">${escapeHtml(t('behavior.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminDisciplineReportBtn">

        <span class="admin-hub__label">${escapeHtml(t('disciplineReport.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminInspectionBtn">

        <span class="admin-hub__label">${escapeHtml(t('inspection.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminDisciplineRecordsBtn">

        <span class="admin-hub__label">${escapeHtml(t('disciplineRecords.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminTeachersBtn">

        <span class="admin-hub__label">${escapeHtml(t('adminTeachers.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminStudentsBtn">

        <span class="admin-hub__label">${escapeHtml(t('adminStudents.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn" id="adminSettingsBtn">

        <span class="admin-hub__label">${escapeHtml(t('settingsAdmin.open'))}</span>

      </button>

      <button type="button" class="admin-hub__btn admin-hub__btn--wide" id="adminHistoryBtn">

        <span class="admin-hub__label">${escapeHtml(t('admin.openHistory'))}</span>

        <span class="admin-hub__sub">${escapeHtml(t('admin.openHistorySub'))}</span>

      </button>

    </nav>

  </section>`;



  bindPageHeaderActions(container, {

    onLogout,

    onBack: () => onBack?.('/dashboard'),

    onNavigate

  });



  container.querySelector('#adminPointsReportBtn')?.addEventListener('click', () => {

    onNavigate?.('/points-report');

  });

  container.querySelector('#adminBehaviorBtn')?.addEventListener('click', () => {

    onNavigate?.('/behavior');

  });

  container.querySelector('#adminDisciplineReportBtn')?.addEventListener('click', () => {

    onNavigate?.('/discipline-report');

  });

  container.querySelector('#adminInspectionBtn')?.addEventListener('click', () => {

    onNavigate?.('/inspection');

  });

  container.querySelector('#adminDisciplineRecordsBtn')?.addEventListener('click', () => {

    onNavigate?.('/admin-discipline');

  });

  container.querySelector('#adminTeachersBtn')?.addEventListener('click', () => {

    onNavigate?.('/admin-teachers');

  });

  container.querySelector('#adminStudentsBtn')?.addEventListener('click', () => {

    onNavigate?.('/admin-students');

  });

  container.querySelector('#adminSettingsBtn')?.addEventListener('click', () => {

    onNavigate?.('/settings-admin');

  });

  container.querySelector('#adminHistoryBtn')?.addEventListener('click', () => {

    onNavigate?.('/history');

  });



  container.__adminCleanup = () => {};

}

