/**
 * จัดชุดส่งมอบ Student Check — โฟลเดอร์ + ZIP
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZIP_SCRIPT = path.join(__dirname, 'zip-handover.ps1');
const ROOT = path.join(__dirname, '..');
const VERSION = '3.1.0';
const PACKAGE_DIR = path.join(ROOT, `StudentCheck_v${VERSION}_Handover`);

const FILES = [
  { src: 'USER_MANUAL.pdf', dest: '01_คู่มือครู_USER_MANUAL.pdf' },
  { src: 'USER_QUICK_GUIDE.pdf', dest: '02_QuickGuide_2หน้า.pdf' },
  { src: 'ADMIN_MANUAL.pdf', dest: '03_คู่มือAdmin_ADMIN_MANUAL.pdf' },
  { src: 'HANDOVER_SUMMARY.pdf', dest: '04_ใบสรุปส่งมอบ.pdf' }
];

const README = `ชุดส่งมอบ Student Check v${VERSION}
โรงเรียนยางตลาดวิทยาคาร
========================================

เปิดไฟล์ตามลำดับ:

1. 04_ใบสรุปส่งมอบ.pdf     — สรุปรายการเอกสารและ URL
2. 02_QuickGuide_2หน้า.pdf  — แจกครูในไลน์กลุ่ม (เริ่มใช้งานเร็ว)
3. 01_คู่มือครู_USER_MANUAL.pdf — คู่มือครูฉบับเต็ม
4. 03_คู่มือAdmin_ADMIN_MANUAL.pdf — สำหรับผู้ดูแลระบบ / งานวิชาการ

URL: https://student-check-th.web.app
วันที่จัดชุด: ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date())}

หมายเหตุ: ไม่ต้องส่งไฟล์ .md หรือ source code ให้ครูทั่วไป
`;

/**
 * @param {string} zipPath
 * @param {string[]} expectedNames
 * @param {string[]} actualNames
 * @returns {string[]}
 */
function verifyZipContents(expectedNames, actualNames) {
  if (actualNames.length !== expectedNames.length) {
    return expectedNames;
  }
  const pdfCount = actualNames.filter((n) => /\.pdf$/i.test(n)).length;
  const hasReadme = actualNames.some((n) => n === 'README.txt');
  if (pdfCount !== FILES.length || !hasReadme) {
    return expectedNames;
  }
  return [];
}

/**
 * @param {string} dir
 * @param {string} zipPath
 * @returns {{ ok: boolean, entries: string[] }}
 */
function createZipArchive(dir, zipPath) {
  const ps = spawnSync('powershell', ['-NoProfile', '-File', ZIP_SCRIPT, dir, zipPath], {
    encoding: 'utf8'
  });
  const entries = (ps.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ps.status !== 0) {
    console.error(ps.stderr || 'ZIP script failed');
    return { ok: false, entries: [] };
  }
  return { ok: fs.existsSync(zipPath), entries };
}

function main() {
  for (const { src } of FILES) {
    const p = path.join(ROOT, src);
    if (!fs.existsSync(p)) {
      console.error(`ไม่พบ ${src} — รัน npm run docs:pdf ก่อน`);
      process.exit(1);
    }
  }

  if (fs.existsSync(PACKAGE_DIR)) {
    fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PACKAGE_DIR, { recursive: true });

  for (const { src, dest } of FILES) {
    fs.copyFileSync(path.join(ROOT, src), path.join(PACKAGE_DIR, dest));
    console.log('  ✓', dest);
  }

  fs.writeFileSync(path.join(PACKAGE_DIR, 'README.txt'), README, 'utf8');
  console.log('  ✓ README.txt');

  const zipName = `StudentCheck_v${VERSION}_Handover.zip`;
  const zipPath = path.join(ROOT, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const expectedInZip = [...FILES.map((f) => f.dest), 'README.txt'];

  const { ok: zipOk, entries: zipEntries } = createZipArchive(PACKAGE_DIR, zipPath);
  if (!zipOk) {
    console.error('ZIP ไม่สำเร็จ — ปิด PDF ที่เปิดอยู่แล้วรันใหม่');
    process.exit(1);
  }

  const missing = verifyZipContents(expectedInZip, zipEntries);
  if (missing.length > 0) {
    console.error('ZIP ไม่ครบ — ขาดไฟล์:', missing.join(', '));
    console.error('ปิด PDF/เบราว์เซอร์ที่เปิดคู่มืออยู่ แล้วรัน npm run docs:handover อีกครั้ง');
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    process.exit(1);
  }

  console.log('\n✓ ชุดส่งมอบ:', PACKAGE_DIR);
  console.log('✓ ZIP:', zipPath);
  console.log('✓ ไฟล์ใน ZIP:', expectedInZip.length, 'รายการ');
}

main();
