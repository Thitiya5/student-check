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
const BASE_URL = process.env.MANUAL_BASE_URL || 'https://student-check-th.web.app';

const TEACHER_SESSION = {
  teacherName: 'ครูตัวอย่าง สำหรับคู่มือ',
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

/** @type {{ file: string, hash: string, auth?: 'teacher'|'admin'|false, waitMs?: number, selector?: string }}[] */
const SHOTS = [
  { file: 'login.png', hash: '#/login', auth: false, waitMs: 2500 },
  { file: 'dashboard.png', hash: '#/dashboard', auth: 'teacher', waitMs: 3500 },
  { file: 'check.png', hash: '#/check', auth: 'teacher', waitMs: 3500 },
  { file: 'history.png', hash: '#/history', auth: 'teacher', waitMs: 3000 },
  { file: 'reports.png', hash: '#/reports', auth: 'teacher', waitMs: 3500 },
  { file: 'students.png', hash: '#/students', auth: 'teacher', waitMs: 3000 },
  { file: 'settings.png', hash: '#/settings', auth: 'teacher', waitMs: 2500 },
  { file: 'admin.png', hash: '#/admin', auth: 'admin', waitMs: 3000 },
  { file: 'settings-admin.png', hash: '#/settings-admin', auth: 'admin', waitMs: 3000 }
];

function authPayload(kind) {
  if (kind === 'admin') return ADMIN_SESSION;
  if (kind === 'teacher') return TEACHER_SESSION;
  return null;
}

async function injectSession(page, kind) {
  const session = authPayload(kind);
  if (!session) return;
  await page.evaluateOnNewDocument((s) => {
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  for (const shot of SHOTS) {
    const outPath = path.join(OUT_DIR, shot.file);
    try {
      await page.goto('about:blank');
      if (shot.auth) {
        await injectSession(page, shot.auth);
      }
      const url = `${BASE_URL}/${shot.hash}`;
      console.log('[screenshot]', shot.file, '←', url);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, shot.waitMs || 2000));
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('  ✓ saved', outPath);
    } catch (err) {
      console.warn('  ✗ failed', shot.file, err.message);
    }
  }

  await browser.close();
  console.log('\nScreenshots done →', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
