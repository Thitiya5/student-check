/**
 * สร้าง USER_MANUAL.pdf และ ADMIN_MANUAL.pdf
 * รูปแบบเอกสารราชการ — หน้าปก สารบัญ เลขหน้า
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CSS_PATH = path.join(__dirname, 'manual-pdf.css');
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
const LOGO_URL = 'https://student-check-th.web.app/assets/school-logo.png';

const SCHOOL = 'โรงเรียนยางตลาดวิทยาคาร';
const APP_VERSION = '2.0.0';
const DOC_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date());

/** แทรกภาพหน้าจอหลังหัวข้อ h2 ตามเลขข้อ (เฉพาะ USER_MANUAL) */
const USER_SCREENSHOTS_BY_NUM = {
  '2': { file: 'login.png', caption: 'ภาพที่ 1 หน้าจอเข้าสู่ระบบ' },
  '5': { file: 'dashboard.png', caption: 'ภาพที่ 2 หน้าหลัก (Dashboard)' },
  '6': { file: 'check.png', caption: 'ภาพที่ 3 หน้าเช็คชื่อนักเรียน' },
  '9': { file: 'history.png', caption: 'ภาพที่ 4 หน้าประวัติการเช็คชื่อ' },
  '10': { file: 'reports.png', caption: 'ภาพที่ 5 หน้ารายงานสรุป' },
  '11': { file: 'students.png', caption: 'ภาพที่ 6 หน้ารายชื่อนักเรียน' },
  '13': { file: 'settings.png', caption: 'ภาพที่ 7 หน้าตั้งค่า' }
};

/**
 * @param {string} num
 * @param {string} title
 */
function sectionId(num, title) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u0E00-\u0E7Fa-z0-9-]/gi, '')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return `section-${num}-${slug || 'topic'}`;
}

/**
 * @param {string} md
 * @param {{ withScreenshots?: boolean }} opts
 */
function markdownToHtml(md, opts = {}) {
  const lines = md.split('\n');
  /** @type {{ num: string, title: string, id: string }[]} */
  const tocEntries = [];
  const processed = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      continue;
    }

    const h2 = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (h2) {
      const num = h2[1];
      const title = h2[2].trim();
      const id = sectionId(num, title);
      tocEntries.push({ num, title, id });
      line = `## ${num}. ${title}`;

      processed.push(line);

      if (opts.withScreenshots && USER_SCREENSHOTS_BY_NUM[num]) {
        const shot = USER_SCREENSHOTS_BY_NUM[num];
        const imgPath = path.join(SCREENSHOT_DIR, shot.file);
        if (fs.existsSync(imgPath)) {
          const b64 = fs.readFileSync(imgPath).toString('base64');
          processed.push('');
          processed.push(`<figure class="figure">`);
          processed.push(`<img src="data:image/png;base64,${b64}" alt="${shot.caption}" />`);
          processed.push(`<figcaption class="figure-caption">${shot.caption}</figcaption>`);
          processed.push(`</figure>`);
          processed.push('');
        }
      }
      continue;
    }

    processed.push(line);
  }

  marked.setOptions({ gfm: true, breaks: false });
  let html = marked.parse(processed.join('\n'));

  html = html.replace(/<h2>(\d+)\.\s([^<]+)<\/h2>/g, (_, num, title) => {
    const id = sectionId(num, title.trim());
    return `<h2 id="${id}">${num}. ${title.trim()}</h2>`;
  });

  if (opts.formalIntro) {
    html = `<div class="formal-intro">${opts.formalIntro}</div>\n${html}`;
  }

  return { html, tocEntries };
}

/**
 * @param {{
 *   docTitle: string,
 *   docSubtitle: string,
 *   docKind: string,
 *   footerLabel: string,
 *   contentHtml: string,
 *   tocEntries: { num: string, title: string; id: string }[],
 *   outputPath: string
 * }} opts
 */
function buildFullHtml(opts) {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const tocItems = opts.tocEntries
    .map(
      (e) =>
        `<li><a href="#${e.id}"><span class="toc-num">${e.num}.</span> ${escapeHtml(e.title)}</a></li>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(opts.docTitle)}</title>
  <style>${css}</style>
</head>
<body>
  <section class="cover-page">
    <img class="cover-logo" src="${LOGO_URL}" alt="ตราสัญลักษณ์โรงเรียน" />
    <p class="cover-org">${SCHOOL}</p>
    <p class="cover-suborg">Office of the Academic Affairs</p>
    <p class="cover-doc-type">เอกสารประกอบการปฏิบัติงาน</p>
    <h1 class="cover-title">${escapeHtml(opts.docTitle)}</h1>
    <p class="cover-subtitle">${escapeHtml(opts.docSubtitle)}</p>
    <table class="cover-meta">
      <tr><td>เรื่อง</td><td>${escapeHtml(opts.docKind)}</td></tr>
      <tr><td>ระบบ</td><td>Student Check — ระบบเช็คชื่อนักเรียนออนไลน์</td></tr>
      <tr><td>เวอร์ชัน</td><td>${APP_VERSION}</td></tr>
      <tr><td>วันที่จัดทำ</td><td>${DOC_DATE}</td></tr>
      <tr><td>URL</td><td>https://student-check-th.web.app</td></tr>
    </table>
    <p class="cover-footer-note">จัดทำโดย นางสาวเกศจุฬา ภูนาเมือง<br />โรงเรียนยางตลาดวิทยาคาร</p>
  </section>

  <section class="toc-page">
    <h2 id="toc">สารบัญ</h2>
    <ol class="toc-list">${tocItems}</ol>
  </section>

  <main class="content">
    ${opts.contentHtml}
    <p class="doc-end">— จบเอกสาร —</p>
  </main>
</body>
</html>`;
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} html
 * @param {string} outputPath
 * @param {string} footerLabel
 */
async function htmlToPdf(html, outputPath, footerLabel) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%; font-size:8pt; font-family:Sarabun,sans-serif; color:#555;
        padding:0 25mm 0 25mm; display:flex; justify-content:space-between; align-items:center;">
        <span>${escapeHtml(footerLabel)}</span>
        <span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>
    `,
    margin: { top: '18mm', bottom: '22mm', left: '0', right: '0' }
  });

  await browser.close();
  console.log('✓ PDF:', outputPath);
}

/**
 * @param {{
 *   mdFile: string,
 *   pdfFile: string,
 *   docTitle: string,
 *   docSubtitle: string,
 *   docKind: string,
 *   footerLabel: string,
 *   withScreenshots?: boolean
 * }} cfg
 */
async function generateOne(cfg) {
  const mdPath = path.join(ROOT, cfg.mdFile);
  const md = fs.readFileSync(mdPath, 'utf8');
  const { html, tocEntries } = markdownToHtml(md, {
    withScreenshots: cfg.withScreenshots,
    formalIntro: cfg.formalIntro
  });
  const fullHtml = buildFullHtml({
    docTitle: cfg.docTitle,
    docSubtitle: cfg.docSubtitle,
    docKind: cfg.docKind,
    footerLabel: cfg.footerLabel,
    contentHtml: html,
    tocEntries,
    outputPath: path.join(ROOT, cfg.pdfFile)
  });
  const outPath = path.join(ROOT, cfg.pdfFile);
  await htmlToPdf(fullHtml, outPath, cfg.footerLabel);
}

async function main() {
  const formalIntroUser = `<p>โรงเรียนยางตลาดวิทยาคาร ได้จัดทำเอกสารฉบับนี้ขึ้น เพื่อแนะนำขั้นตอนการใช้งานระบบเช็คชื่อนักเรียนออนไลน์ (Student Check) ให้แก่ครูและบุคลากรทางการศึกษา โดยอ้างอิงจากระบบที่ใช้งานจริง ณ วันที่จัดทำเอกสาร ขอให้ผู้ใช้งานศึกษาและปฏิบัติตามลำดับขั้นตอนที่กำหนด เพื่อความถูกต้องและครบถ้วนของข้อมูลการมาเรียนของนักเรียน</p>`;

  const formalIntroAdmin = `<p>โรงเรียนยางตลาดวิทยาคาร ได้จัดทำเอกสารฉบับนี้ขึ้น เพื่อเป็นแนวทางการบริหารจัดการ ดูแล และแก้ไขปัญหาระบบเช็คชื่อนักเรียนออนไลน์ (Student Check) สำหรับผู้ดูแลระบบและงานเทคโนโลยีสารสนเทศ โดยอ้างอิงจากโครงสร้างและการตั้งค่าที่มีอยู่ในระบบ ณ วันที่จัดทำเอกสาร</p>`;
  const skipScreenshots = process.argv.includes('--no-screenshots');
  if (!skipScreenshots) {
    console.log('Capturing screenshots...');
    const { spawnSync } = await import('child_process');
    const r = spawnSync('node', [path.join(__dirname, 'capture-manual-screenshots.mjs')], {
      stdio: 'inherit',
      cwd: ROOT
    });
    if (r.status !== 0) {
      console.warn('Screenshot capture had errors — continuing with available images.');
    }
  }

  console.log('\nGenerating PDFs...\n');

  await generateOne({
    mdFile: 'USER_MANUAL.md',
    pdfFile: 'USER_MANUAL.pdf',
    docTitle: 'คู่มือการใช้งานระบบเช็คชื่อนักเรียน',
    docSubtitle: 'สำหรับครูและบุคลากรทางการศึกษา',
    docKind: 'คู่มือผู้ใช้งาน (User Manual)',
    footerLabel: `${SCHOOL} — คู่มือผู้ใช้งาน`,
    withScreenshots: true,
    formalIntro: formalIntroUser
  });

  await generateOne({
    mdFile: 'ADMIN_MANUAL.md',
    pdfFile: 'ADMIN_MANUAL.pdf',
    docTitle: 'คู่มือผู้ดูแลระบบเช็คชื่อนักเรียน',
    docSubtitle: 'สำหรับผู้ดูแลระบบและงานเทคโนโลยีสารสนเทศ',
    docKind: 'คู่มือผู้ดูแลระบบ (Administrator Manual)',
    footerLabel: `${SCHOOL} — คู่มือผู้ดูแลระบบ`,
    withScreenshots: false,
    formalIntro: formalIntroAdmin
  });

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
