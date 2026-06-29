/**
 * จับภาพหน้าจอแอปสำหรับคู่มือผู้ใช้งาน
 * ใช้ production URL + mock session ใน localStorage
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const MANUAL_IMAGE_DIR = path.join(__dirname, '..', 'manual-images');
const BASE_URL = process.env.MANUAL_BASE_URL || 'https://student-check-th.web.app';
const SETTINGS_CACHE_KEY = 'student_check_app_settings_v1';
const BANGKOK_TZ = 'Asia/Bangkok';

/** @param {Date} [d] */
function formatDateBangkok(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/** @param {string} dateKey @param {number} days */
function addDaysToDateKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateBangkok(d);
}

/** @param {string} dateKey */
function isSchoolDayKey(dateKey) {
  const dow = new Date(`${dateKey}T12:00:00`).getDay();
  return dow >= 1 && dow <= 5;
}

/**
 * วันทำการสำหรับตัวอย่างคู่มือ — ถอยจากเสาร์/อาทิตย์
 * @param {string} [refDateKey] yyyy-MM-dd (Bangkok)
 */
function getManualWeekdayDate(refDateKey = formatDateBangkok()) {
  if (process.env.MANUAL_WEEKDAY_DATE) return process.env.MANUAL_WEEKDAY_DATE;
  let key = refDateKey;
  for (let i = 0; i < 7; i += 1) {
    if (isSchoolDayKey(key)) return key;
    key = addDaysToDateKey(key, -1);
  }
  return refDateKey;
}

/**
 * @param {import('puppeteer').Page} page
 * @param {string} fallback
 */
async function resolveInspectionDemoDate(page, fallback) {
  if (process.env.MANUAL_INSPECTION_DATE) return process.env.MANUAL_INSPECTION_DATE;

  const fromCache = await page.evaluate((cacheKey) => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const settings = JSON.parse(raw);
      const kickoff = String(settings?.discipline?.startDate || '').trim();
      if (kickoff) return kickoff;

      const insp = settings?.inspection || {};
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      const ym = today.slice(0, 7);

      if (insp.inspectionDayType === 'day_of_month') {
        return `${ym}-${String(insp.dayOfMonth || 5).padStart(2, '0')}`;
      }

      for (let day = 1; day <= 31; day += 1) {
        const key = `${ym}-${String(day).padStart(2, '0')}`;
        if (key.slice(0, 7) !== ym) break;
        const dow = new Date(`${key}T12:00:00`).getDay();
        if (dow >= 1 && dow <= 5) return key;
      }
      return null;
    } catch {
      return null;
    }
  }, SETTINGS_CACHE_KEY);

  const candidate = fromCache && isSchoolDayKey(fromCache) ? fromCache : fallback;
  return candidate;
}

const TEACHER_SESSION = {
  teacherName: 'ครูสมชาย ใจดี',
  username: 'demo_teacher',
  role: 'teacher',
  assignedClasses: ['M2/1'],
  isAdmin: false,
  mustChangePin: false
};

const ADMIN_SESSION = {
  teacherName: 'ผู้ดูแลระบบ',
  username: 'admin',
  role: 'admin',
  assignedClasses: ['ALL'],
  isAdmin: true,
  mustChangePin: false
};

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 900, deviceScaleFactor: 2 }
};

/** @typedef {'teacher'|'admin'|false} AuthKind */
/** @typedef {'mobile'|'desktop'} ViewportKind */

/**
 * @param {import('puppeteer').Page} page
 * @param {object|null} session
 */
async function applySession(page, session) {
  if (!session) return;
  await page.evaluate((s) => {
    localStorage.setItem('student-check-teacher-auth', JSON.stringify(s));
    localStorage.setItem('student-check-teacher-name', s.teacherName);
    localStorage.setItem(
      'student-check-state',
      JSON.stringify({
        teacherName: s.teacherName,
        teacherAuth: s,
        teacherRole: s.role,
        assignedClasses: s.assignedClasses,
        isAdmin: s.isAdmin,
        mustChangePin: false,
        classConfirmed: true,
        currentLevel: 'M2',
        currentRoom: '1'
      })
    );
  }, session);
}

/**
 * @param {import('puppeteer').Page} page
 * @param {AuthKind} auth
 */
async function bootstrapAuth(page, auth) {
  const session = auth === 'admin' ? ADMIN_SESSION : auth === 'teacher' ? TEACHER_SESSION : null;
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (session) {
    await applySession(page, session);
    await page.goto(`${BASE_URL}/#/dashboard`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForSelector('.bottom-nav', { timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * @param {import('puppeteer').Page} page
 * @param {string} level
 * @param {string} room
 */
async function selectReportClass(page, level, room) {
  await page.waitForSelector('#repLevel', { timeout: 25000 });
  await page.waitForFunction(
    (lv) => {
      const sel = document.querySelector('#repLevel');
      return sel && [...sel.options].some((o) => o.value === lv);
    },
    { timeout: 25000 },
    level
  );
  await page.select('#repLevel', level);
  await new Promise((r) => setTimeout(r, 1500));
  await page.waitForFunction(
    (roomNum) => {
      const sel = document.querySelector('#repRoom');
      return sel && [...sel.options].some((o) => o.value === roomNum);
    },
    { timeout: 25000 },
    room
  );
  await page.select('#repRoom', room);
  await new Promise((r) => setTimeout(r, 4000));
}

/** @type {(weekdayDate: string, inspectionDate: string) => typeof SHOTS_TEMPLATE} */
function buildShots(weekdayDate, inspectionDate) {
  return [
    { file: 'login.png', hash: '#/login', auth: false, waitMs: 2500 },
    { file: 'dashboard.png', hash: '#/dashboard', auth: 'teacher', waitMs: 3500 },
    { file: 'menu.png', hash: '#/menu', auth: 'teacher', waitMs: 2500 },
    {
      file: 'check.png',
      hash: `#/check?date=${weekdayDate}`,
      auth: 'teacher',
      waitMs: 5000,
      setup: async (page) => {
        const startBtn = await page.$('#startCheckBtn');
        if (startBtn) {
          await startBtn.click();
          await page.waitForSelector('.attendance-students-list, .student-card', { timeout: 35000 });
        }
        const weekendBanner = await page.$('.check-weekend-banner');
        if (weekendBanner) {
          console.warn('  check.png still shows weekend banner — verify date', weekdayDate);
        }
      }
    },
    { file: 'history.png', hash: '#/history', auth: 'teacher', waitMs: 3500, viewport: 'desktop' },
    { file: 'reports.png', hash: '#/reports', auth: 'teacher', waitMs: 4000, viewport: 'desktop' },
    {
      file: 'reports-monthly.png',
      hash: '#/reports',
      auth: 'teacher',
      waitMs: 1500,
      setup: async (page) => {
        await page.waitForSelector('button[data-mode="monthly"]', { timeout: 25000 });
        await page.click('button[data-mode="monthly"]');
        await new Promise((r) => setTimeout(r, 1000));
        await selectReportClass(page, 'M2', '1');
      }
    },
    {
      file: 'reports-daily-class.png',
      hash: '#/reports',
      auth: 'teacher',
      waitMs: 1500,
      setup: async (page) => {
        await page.waitForSelector('button[data-mode="daily"]', { timeout: 25000 });
        await page.click('button[data-mode="daily"]');
        await new Promise((r) => setTimeout(r, 800));
        await selectReportClass(page, 'M2', '1');
      }
    },
    { file: 'students.png', hash: '#/students', auth: 'teacher', waitMs: 3500 },
    { file: 'settings.png', hash: '#/settings', auth: 'teacher', waitMs: 3000 },
    { file: 'admin.png', hash: '#/admin', auth: 'admin', waitMs: 3000, viewport: 'desktop' },
    { file: 'settings-admin.png', hash: '#/settings-admin', auth: 'admin', waitMs: 3500, viewport: 'desktop' },
    {
      file: 'inspection.png',
      hash: '#/inspection',
      auth: 'admin',
      waitMs: 2000,
      viewport: 'desktop',
      setup: async (page) => {
        await new Promise((r) => setTimeout(r, 2500));
        const inspDate = await resolveInspectionDemoDate(page, inspectionDate);
        const url = `${BASE_URL}/#/inspection?date=${inspDate}&level=M2&room=1`;
        console.log('  inspection demo date:', inspDate);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
        await page
          .waitForSelector('.inspection-list, .inspection-card', { timeout: 45000 })
          .catch(async () => {
            await page.click('#inspLoadBtn').catch(() => {});
            await page.waitForSelector('.inspection-list, .inspection-card', { timeout: 35000 });
          });
        const notScheduled = await page.evaluate(() =>
          /ไม่ใช่วันตรวจ|not an inspection/i.test(document.body.innerText || '')
        );
        if (notScheduled) {
          console.warn('  inspection.png may show not-scheduled — try MANUAL_INSPECTION_DATE');
        }
      }
    },
    { file: 'admin-teachers.png', hash: '#/admin-teachers', auth: 'admin', waitMs: 3000, viewport: 'desktop' },
    {
      file: 'admin-students.png',
      hash: '#/admin-students',
      auth: 'admin',
      waitMs: 2000,
      viewport: 'desktop',
      setup: async (page) => {
        await page.waitForSelector('#adminStLevel', { timeout: 25000 });
        await page.select('#adminStLevel', 'M2');
        await new Promise((r) => setTimeout(r, 1500));
        await page.waitForFunction(
          () => {
            const sel = document.querySelector('#adminStRoom');
            return sel && !sel.disabled && sel.options.length > 1;
          },
          { timeout: 25000 }
        );
        await page.select('#adminStRoom', '1');
        await page.waitForSelector('.admin-student-card, .ui-empty', { timeout: 35000 });
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  ];
}

async function captureShot(page, shot) {
  const vp = VIEWPORTS[shot.viewport || 'mobile'];
  await page.setViewport(vp);

  const outPath = path.join(OUT_DIR, shot.file);
  const url = `${BASE_URL}/${shot.hash}`;
  console.log('[screenshot]', shot.file, '←', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  if (shot.setup) {
    try {
      await shot.setup(page);
    } catch (setupErr) {
      console.warn('  setup warning', shot.file, setupErr.message);
    }
  }
  await new Promise((r) => setTimeout(r, shot.waitMs || 2000));
  const onLogin = await page.$('.login-card');
  if (onLogin && shot.auth) {
    console.warn('  session warning', shot.file, '— still on login page');
  }
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('  ✓ saved', outPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const weekdayDate = getManualWeekdayDate();
  const inspectionDate = process.env.MANUAL_INSPECTION_DATE || '2026-06-05';
  const SHOTS = buildShots(weekdayDate, inspectionDate);
  console.log('Base URL:', BASE_URL);
  console.log('Demo weekday (check):', weekdayDate);
  console.log('Demo inspection fallback:', inspectionDate);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  /** @type {AuthKind|null} */
  let currentAuth = null;

  for (const shot of SHOTS) {
    try {
      const auth = shot.auth ?? false;
      if (auth !== currentAuth) {
        await bootstrapAuth(page, auth);
        currentAuth = auth;
      }
      await captureShot(page, shot);
    } catch (err) {
      console.warn('  ✗ failed', shot.file, err.message);
    }
  }

  await browser.close();

  fs.mkdirSync(MANUAL_IMAGE_DIR, { recursive: true });
  for (const shot of SHOTS) {
    const src = path.join(OUT_DIR, shot.file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(MANUAL_IMAGE_DIR, shot.file));
    }
  }

  console.log('\nScreenshots done →', OUT_DIR);
  console.log('Copied to →', MANUAL_IMAGE_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
