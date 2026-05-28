/** Official school branding — Yangtaladwittayakarn School */
export const APP_THEME_COLOR = '#7C4DFF';

export const SCHOOL_LOGO_SRC = '/assets/school-logo.png';

export const SCHOOL_NAME_TH = 'โรงเรียนยางตลาดวิทยาคาร';
export const SCHOOL_TAGLINE_TH = 'ระบบเช็คชื่อนักเรียน';
export const SCHOOL_NAME_EN = 'Yangtaladwittayakarn School · Attendance System';

export const APP_TITLE_TH = 'โรงเรียนยางตลาดวิทยาคาร - ระบบเช็คชื่อ';
export const APP_TITLE_EN = 'Yangtaladwittayakarn School - Attendance';

/**
 * Sync browser tab title with current language.
 * @param {'th'|'en'} [lang]
 */
export function updateDocumentBranding(lang = 'th') {
  const title = lang === 'en' ? APP_TITLE_EN : APP_TITLE_TH;
  if (document.title !== title) document.title = title;

  let apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (!apple) {
    apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    document.head.appendChild(apple);
  }
  apple.href = SCHOOL_LOGO_SRC;
}
