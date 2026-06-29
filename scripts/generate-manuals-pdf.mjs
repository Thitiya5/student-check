/**
 * สร้าง USER_MANUAL.pdf, USER_QUICK_GUIDE.pdf และ ADMIN_MANUAL.pdf
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
const MANUAL_IMAGE_DIR = path.join(ROOT, 'manual-images');
const LOGO_CANDIDATES = [
  path.join(ROOT, 'public', 'assets', 'school-logo.png'),
  path.join(ROOT, 'dist', 'assets', 'school-logo.png')
];

/** @returns {string} */
function coverLogoSrc() {
  for (const p of LOGO_CANDIDATES) {
    if (fs.existsSync(p)) {
      return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
    }
  }
  return 'https://student-check-th.web.app/assets/school-logo.png';
}

const SCHOOL = 'โรงเรียนยางตลาดวิทยาคาร';
const APP_VERSION = '3.1.0';
const APP_URL = 'https://student-check-th.web.app';
const DOC_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date());

const DOC_META = {
  user: { id: 'SC-UM-001', revision: '1.2' },
  admin: { id: 'SC-AM-001', revision: '1.6' },
  handover: { id: 'SC-HO-001', revision: '1.3' }
};

/** จำนวนหน้าก่อนเนื้อหาหลัก — ปก + Quick Start/สารบัญ (หน้าเดียว) */
const PAGES_BEFORE_CONTENT_USER = 3;
const PAGES_BEFORE_CONTENT_ADMIN = 3;

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

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string} file */
function imageDataUri(file) {
  const base = path.basename(file);
  for (const dir of [MANUAL_IMAGE_DIR, SCREENSHOT_DIR]) {
    const p = path.join(dir, base);
    if (fs.existsSync(p)) {
      const b64 = fs.readFileSync(p).toString('base64');
      const ext = path.extname(base).slice(1).toLowerCase() || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${b64}`;
    }
  }
  return null;
}

function flowchartArrowH() {
  return `<span class="flowchart-arrow-h" aria-hidden="true">→</span>`;
}

function systemInfographicHtml() {
  return `<div class="flowchart-system flowchart-system--horizontal">
  <p class="flowchart-title">Flowchart — การไหลของข้อมูล</p>
  <div class="flowchart-diagram-h">
    <div class="flowchart-node flowchart-node--compact flowchart-node--sheets">
      <strong>1 · Sheets</strong><small>ครู · นักเรียน</small>
    </div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--app">
      <strong>2 · Student Check</strong><small>PWA</small>
    </div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--firebase">
      <strong>3 · Firebase</strong><small>เช็คชื่อ · คะแนน</small>
    </div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--report">
      <strong>4 · รายงาน</strong><small>PDF</small>
    </div>
  </div>
</div>`;
}

function workflowUserHtml() {
  return `<div class="flowchart-system flowchart-system--horizontal flowchart-workflow">
  <p class="flowchart-title">End-to-End Workflow — ครู (รายวัน)</p>
  <div class="flowchart-diagram-h flowchart-diagram-h--wrap">
    <div class="flowchart-node flowchart-node--compact flowchart-node--app"><strong>Login</strong></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--app"><strong>หน้าหลัก</strong></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--firebase"><strong>เช็คชื่อ</strong><small>มาทุกคน</small></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--firebase"><strong>บันทึก</strong></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--report"><strong>รายงาน</strong><small>PDF</small></div>
  </div>
</div>`;
}

function workflowAdminHtml() {
  return `<div class="flowchart-system flowchart-system--horizontal flowchart-workflow">
  <p class="flowchart-title">End-to-End Workflow — Admin</p>
  <div class="flowchart-diagram-h flowchart-diagram-h--wrap">
    <div class="flowchart-node flowchart-node--compact flowchart-node--sheets"><strong>Sheets</strong><small>ครู · นักเรียน</small></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--app"><strong>Deploy</strong><small>Hosting</small></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--app"><strong>ตั้งค่า</strong></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--firebase"><strong>ครูเช็คชื่อ</strong></div>
    ${flowchartArrowH()}
    <div class="flowchart-node flowchart-node--compact flowchart-node--report"><strong>รายงาน · ตรวจระเบียบ</strong></div>
  </div>
</div>`;
}

function quickStartHtml() {
  return `<div class="quickstart-block">
  <h2 id="quickstart">เริ่มใช้งานภายใน 1 นาที (Quick Start)</h2>
  <ol class="quickstart-steps quickstart-steps--compact">
    <li>เปิด <strong>${APP_URL}</strong></li>
    <li>กรอก <strong>ชื่อครู</strong> → <strong>เข้าสู่ระบบ</strong></li>
    <li><strong>เช็คชื่อ</strong> → เลือกห้อง → <strong>มาทุกคน</strong></li>
    <li>แก้คนขาด/สาย/ลา → <strong>บันทึก</strong></li>
  </ol>
  <p class="quickstart-warn quickstart-warn--inline">⚠️ กด <strong>มาทุกคน</strong> ก่อนเสมอ</p>
</div>`;
}

function userQuickStartHtml() {
  const loginFig = toFigure('large:หน้าเข้าสู่ระบบ', 'login.png');
  const checkFig = toFigure('large:หน้าเช็คชื่อ', 'check.png');
  return `<div class="user-quickstart-block" id="quickstart">
  <h2>เริ่มใช้งานภายใน 1 นาที (Quick Start)</h2>
  <div class="quickstart-figures">
    <div class="quickstart-figure-col">
      <p class="quickstart-figure-label">① เข้าสู่ระบบ</p>
      ${loginFig}
    </div>
    <div class="quickstart-figure-col">
      <p class="quickstart-figure-label">② เช็คชื่อ</p>
      ${checkFig}
    </div>
  </div>
  <ol class="user-quickstart-steps">
    <li>เปิด <strong>${APP_URL}</strong> · กรอก <strong>ชื่อครู</strong> → <strong>เข้าสู่ระบบ</strong></li>
    <li><strong>เช็คชื่อ</strong> → เลือกห้อง → กด <strong>มาทุกคน</strong></li>
    <li>แก้สถานะขาด/สาย/ลา → กด <strong>บันทึก</strong></li>
    <li>ดูย้อนหลังที่ <strong>ประวัติ</strong> · ส่งออก PDF ที่ <strong>มาเรียน</strong></li>
  </ol>
  <p class="quickstart-warn quickstart-warn--inline">⚠️ ทุกคนเริ่มต้นเป็น “ขาด” — กด <strong>มาทุกคน</strong> ก่อนเสมอ</p>
</div>`;
}

function adminQuickStartHtml() {
  const adminFig = toFigure('large:หน้าจัดการระบบ', 'admin.png');
  return `<div class="admin-quickstart-block" id="quickstart">
  <h2>เริ่มต้นใช้งานสำหรับผู้ดูแลระบบ (Quick Start)</h2>
  <ol class="admin-quickstart-steps">
    <li>เปิด <strong>${APP_URL}</strong> · กรอกชื่อครู (หรือชื่อผู้ใช้) → <strong>เข้าสู่ระบบ</strong></li>
    <li><strong>เมนู</strong> ☰ → <strong>จัดการ</strong> หรือปุ่ม <strong>จัดการระบบ</strong> บนหน้าหลัก</li>
    <li>งานประจำ: <strong>จัดการครู</strong> · <strong>จัดการนักเรียน</strong> · <strong>ตั้งค่าระบบ</strong></li>
    <li>ตรวจสอบข้อมูล: <strong>ประวัติ</strong> · รายงาน <strong>มาเรียน</strong> → ส่งออก PDF</li>
  </ol>
  ${adminFig}
  <div class="figure-callout admin-quickstart-callout"><span class="figure-callout-label">คำบรรยายภาพ:</span> ① รายงานคะแนน · ② พฤติกรรม/ระเบียบ · ③ ตรวจระเบียบ · ④ จัดการครู · ⑤ จัดการนักเรียน · ⑥ ตั้งค่าระบบ · ⑦ แก้ไข/ลบรายการเช็คชื่อ (ประวัติ)</div>
</div>`;
}

/**
 * @param {string} md
 */
function preprocessCallouts(md) {
  let out = md.replace(
    /:::warning\s*\n([\s\S]*?)\n:::/g,
    (_, body) =>
      `<div class="callout-warning">${marked.parse(body.trim())}</div>`
  );
  out = out.replace(/:::infographic-system:::/g, systemInfographicHtml());
  out = out.replace(/:::workflow-user:::/g, workflowUserHtml());
  out = out.replace(/:::workflow-admin:::/g, workflowAdminHtml());
  out = out.replace(/:::feature\s*\n([\s\S]*?)\n:::/g, (_, body) => {
    const rows = body
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|'))
      .map((line) => {
        const cells = line
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length < 2) return '';
        const label = marked.parseInline(cells[0]);
        const value = marked.parseInline(cells[1]);
        return `<tr><td>${label}</td><td>${value}</td></tr>`;
      })
      .join('');
    return `<table class="feature-table">${rows}</table>`;
  });
  out = out.replace(/:::figure-callout\s*\n([\s\S]*?)\n:::/g, (_, body) => {
    const text = body
      .trim()
      .replace(/^\*\*คำบรรยายภาพ:\*\*\s*/, '')
      .replace(/^\*\*คำอธิบายภาพ:\*\*\s*/, '')
      .replace(/^\*\*จุดสำคัญ:\*\*\s*/, '');
    return `<div class="figure-callout"><span class="figure-callout-label">คำบรรยายภาพ:</span> ${marked.parseInline(text)}</div>`;
  });
  out = out.replace(/:::row-figures\s*\n([\s\S]*?)\n:::/g, (_, body) => {
    const figures = body
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^!\[/.test(l))
      .map((l) => {
        const m = l.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (!m) return '';
        const file = m[2].replace(/^\.\//, '');
        return toFigure(m[1], file);
      })
      .join('');
    return `<div class="figure-row">${figures}</div>`;
  });
  return out;
}

/**
 * @param {string} md
 */
function preprocessMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  /** @type {{ num: string, title: string, id: string, kind: 'chapter' | 'appendix' }[]} */
  const tocEntries = [];
  const processed = [];
  let skipSection = false;
  let skipRest = false;

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (/^# /.test(line) && !line.startsWith('## ')) continue;

    if (/^## ระบบเช็คชื่อ/.test(line)) {
      processed.push(`<p class="doc-subtitle">${escapeHtml(line.replace(/^##\s+/, '').trim())}</p>`);
      continue;
    }
    if (/^## สารบัญ\s*$/.test(line)) {
      skipSection = true;
      continue;
    }
    if (skipSection) {
      if (/^## /.test(line)) skipSection = false;
      else continue;
    }
    if (/^## การสร้าง PDF/.test(line)) {
      skipRest = true;
      continue;
    }
    if (skipRest) continue;

    const h2num = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (h2num) {
      const num = h2num[1];
      const title = h2num[2].trim();
      tocEntries.push({ num, title, id: sectionId(num, title), kind: 'chapter' });
      processed.push(line);
      continue;
    }

    const h2app = line.match(/^##\s+ภาคผนวก(?::\s*(.+))?$/);
    if (h2app) {
      const sub = (h2app[1] || '').trim();
      tocEntries.push({
        num: 'ภาคผนวก',
        title: sub ? `ภาคผนวก: ${sub}` : 'ภาคผนวก',
        id: sectionId('app', sub || 'appendix'),
        kind: 'appendix'
      });
      processed.push(line);
      continue;
    }

    processed.push(line);
  }

  return { body: preprocessCallouts(processed.join('\n')), tocEntries };
}

/**
 * @param {string} alt
 * @param {string} file
 */
function toFigure(alt, file) {
  const imgPath = imageDataUri(file);
  if (!imgPath) {
    console.warn('  missing screenshot:', file);
    return `<p class="figure-missing">[ไม่พบภาพ: ${escapeHtml(file)}]</p>`;
  }

  const isLarge = /^large:/i.test(alt);
  const caption = (isLarge ? alt.replace(/^large:/i, '') : alt).trim() || path.basename(file);
  const cls = isLarge ? 'figure-large' : 'figure';

  const stepMatch = caption.match(/[①②③④⑤⑥]/);
  const stepsHtml = stepMatch
    ? `<p class="figure-steps">${escapeHtml(caption.match(/[①②③④⑤⑥][^①②③④⑤⑥]*/g)?.join('  ') || '')}</p>`
    : '';
  const titleOnly = stepMatch ? caption.split(/[①②③④⑤⑥]/)[0].trim() : caption;

  return `<figure class="${cls}">
<img src="${imgPath}" alt="${escapeHtml(caption)}" />
<figcaption class="figure-caption">${escapeHtml(titleOnly || caption)}</figcaption>
${stepsHtml}
</figure>`;
}

/** @param {string} html */
function embedMarkdownImages(html) {
  let out = html.replace(
    /<p>\s*<img\s+alt="([^"]*)"\s+src="(?:\.\/|\/)?(?:docs\/screenshots|manual-images)\/([^"]+)"\s*\/?>\s*<\/p>/gi,
    (_, alt, file) => toFigure(alt, file)
  );
  out = out.replace(
    /<img\s+alt="([^"]*)"\s+src="(?:\.\/|\/)?(?:docs\/screenshots|manual-images)\/([^"]+)"\s*\/?>/gi,
    (_, alt, file) => toFigure(alt, file)
  );
  out = out.replace(
    /<p>\s*<img\s+src="(?:\.\/|\/)?(?:docs\/screenshots|manual-images)\/([^"]+)"\s+alt="([^"]*)"\s*\/?>\s*<\/p>/gi,
    (_, file, alt) => toFigure(alt, file)
  );
  out = out.replace(
    /<img\s+src="(?:\.\/|\/)?(?:docs\/screenshots|manual-images)\/([^"]+)"\s+alt="([^"]*)"\s*\/?>/gi,
    (_, file, alt) => toFigure(alt, file)
  );
  return out;
}

/**
 * @param {string} md
 * @param {{ formalIntro?: string | null }} opts
 */
function markdownToHtml(md, opts = {}) {
  const { body, tocEntries } = preprocessMarkdown(md);
  marked.setOptions({ gfm: true, breaks: false });
  let html = marked.parse(body);
  html = embedMarkdownImages(html);

  html = html.replace(/<h2>(\d+)\.\s([^<]+)<\/h2>/g, (_, num, title) => {
    return `<h2 id="${sectionId(num, title.trim())}">${num}. ${title.trim()}</h2>`;
  });
  html = html.replace(/<h2>ภาคผนวก(?::\s([^<]+))?<\/h2>/g, (_, title) => {
    const t = (title || 'appendix').trim();
    return `<h2 id="${sectionId('app', t)}">ภาคผนวก${title ? `: ${title.trim()}` : ''}</h2>`;
  });

  html = html.replace(/<hr\s*\/?>/g, '');

  if (opts.formalIntro) {
    html = `<div class="formal-intro">${opts.formalIntro}</div>\n${html}`;
  }

  return { html, tocEntries };
}

/**
 * @param {{ num: string, title: string, id: string, kind?: string }[]} tocEntries
 * @param {Record<string, number | string>} [pageMap]
 */
function buildTocHtml(tocEntries, pageMap = {}) {
  return tocEntries
    .map((e) => {
      const page = pageMap[e.id] ?? '';
      if (e.kind === 'quick') {
        return `<li><a href="#quickstart"><span class="toc-appendix">${escapeHtml(e.title)}</span><span class="toc-leader"></span><span class="toc-page-num">${page}</span></a></li>`;
      }
      if (e.kind === 'appendix') {
        return `<li><a href="#${e.id}"><span class="toc-appendix">${escapeHtml(e.title)}</span><span class="toc-leader"></span><span class="toc-page-num">${page}</span></a></li>`;
      }
      return `<li><a href="#${e.id}"><span><span class="toc-num">${e.num}.</span> ${escapeHtml(e.title)}</span><span class="toc-leader"></span><span class="toc-page-num">${page}</span></a></li>`;
    })
    .join('\n');
}

/**
 * @param {{
 *   docTitle: string,
 *   docSubtitle: string,
 *   docKind: string,
 *   contentHtml: string,
 *   tocEntries: { num: string, title: string, id: string, kind?: string }[],
 *   pageMap?: Record<string, number | string>,
 *   includeQuickStart?: boolean,
 *   userQuickStart?: boolean,
 *   adminQuickStart?: boolean,
 *   docId?: string,
 *   docRevision?: string
 *   contentClass?: string
 *   formalIntro?: string | null
 * }} opts
 */
function buildFullHtml(opts) {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const tocItems = buildTocHtml(opts.tocEntries, opts.pageMap);
  const quickStart = opts.includeQuickStart ? quickStartHtml() : '';
  const contentClass = opts.contentClass ? `content ${opts.contentClass}` : 'content';
  const tocListClass = opts.adminQuickStart || opts.userQuickStart
    ? 'toc-list toc-list--preface-full'
    : opts.contentClass === 'admin-manual'
      ? 'toc-list toc-list--compact'
      : opts.includeQuickStart
        ? 'toc-list toc-list--compact'
        : 'toc-list';
  const docIdRow =
    opts.docId && opts.docRevision
      ? `<tr><td>เลขที่เอกสาร</td><td>${escapeHtml(opts.docId)} (ครั้งที่ ${escapeHtml(opts.docRevision)})</td></tr>`
      : '';

  const preface = opts.adminQuickStart
    ? `<section class="preface-page preface-toc-page">
    <h2 id="toc">สารบัญ</h2>
    <ol class="${tocListClass}">${tocItems}</ol>
  </section>
  <section class="preface-page admin-quickstart-page">
    ${adminQuickStartHtml()}
  </section>`
    : opts.userQuickStart
      ? `<section class="preface-page preface-toc-page">
    <h2 id="toc">สารบัญ</h2>
    <ol class="${tocListClass}">${tocItems}</ol>
  </section>
  <section class="preface-page user-quickstart-page">
    ${userQuickStartHtml()}
  </section>`
    : opts.includeQuickStart
    ? `<section class="preface-page">
    ${quickStart}
    <h2 id="toc">สารบัญ</h2>
    <ol class="toc-list toc-list--compact">${tocItems}</ol>
  </section>`
    : `<section class="preface-page admin-preface admin-preface--toc-only">
    <h2 id="toc">สารบัญ</h2>
    <p class="admin-toc-lead">คู่มือปฏิบัติงานบนแอป Student Check สำหรับผู้ดูแลระบบโรงเรียน</p>
    <ol class="${tocListClass}">${tocItems}</ol>
  </section>`;

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(opts.docTitle)}</title>
  <style>${css}</style>
</head>
<body>
  <section class="cover-page">
    <img class="cover-logo" src="${coverLogoSrc()}" alt="ตราสัญลักษณ์โรงเรียน" />
    <p class="cover-org">${SCHOOL}</p>
    <p class="cover-suborg">กลุ่มบริหารการทั่วไป (General Administration)</p>
    <p class="cover-doc-type">เอกสารประกอบการปฏิบัติงาน</p>
    <h1 class="cover-title">${escapeHtml(opts.docTitle)}</h1>
    <p class="cover-subtitle">${escapeHtml(opts.docSubtitle)}</p>
    <table class="cover-meta">
      <tr><td>เรื่อง</td><td>${escapeHtml(opts.docKind)}</td></tr>
      ${docIdRow}
      <tr><td>ระบบ</td><td>Student Check — ระบบเช็คชื่อนักเรียนออนไลน์</td></tr>
      <tr><td>เวอร์ชัน</td><td>${APP_VERSION}</td></tr>
      <tr><td>วันที่จัดทำ</td><td>${DOC_DATE}</td></tr>
      <tr><td>URL</td><td>${APP_URL}</td></tr>
    </table>
    <p class="cover-footer-note">จัดทำโดย นางสาวเกศจุฬา ภูนาเมือง<br />โรงเรียนยางตลาดวิทยาคาร</p>
  </section>
  ${preface}
  <main class="${contentClass}">
    ${opts.contentHtml}
    <p class="doc-end">— จบเอกสาร —</p>
  </main>
</body>
</html>`;
}

/** @param {import('puppeteer').Page} page */
async function waitForImages(page) {
  await page.evaluate(() => {
    for (const img of document.images) {
      if (!img.complete) {
        img.addEventListener('error', () => {}, { once: true });
      }
    }
  });
  await new Promise((r) => setTimeout(r, 500));
}

/**
 * @param {import('puppeteer').Page} page
 * @param {{ id: string }[]} tocEntries
 */
async function measureTocPages(page, tocEntries, pagesBefore) {
  return page.evaluate(
    ({ ids, pagesBefore, pageHeightPx }) => {
      /** @type {Record<string, number>} */
      const map = {};
      const main = document.querySelector('main.content');
      if (!main) return map;

      const mainTop = main.getBoundingClientRect().top + window.scrollY;

      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const elTop = el.getBoundingClientRect().top + window.scrollY;
        const relTop = Math.max(0, elTop - mainTop);
        map[id] = pagesBefore + Math.floor(relTop / pageHeightPx) + 1;
      }
      return map;
    },
    {
      ids: tocEntries.map((e) => e.id).filter((id) => id !== 'quickstart'),
      pagesBefore,
      pageHeightPx: ((297 - 12 - 10 - 6) * 96) / 25.4
    }
  );
}

/**
 * @param {import('puppeteer').Page} page
 * @param {string} html
 * @param {string} outputPath
 * @param {string} footerLabel
 */
async function htmlToPdf(page, html, outputPath, footerLabel) {
  await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
  await waitForImages(page);

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%; font-size:12pt; color:#555; padding:0 25mm 1mm;
        line-height:1.15; display:flex; justify-content:space-between; font-family:'TH Sarabun New',sans-serif;">
        <span>${escapeHtml(footerLabel)}</span>
        <span>หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '12mm', bottom: '10mm', left: '0', right: '0' }
  });
}

/**
 * @param {{
 *   mdFile: string,
 *   pdfFile: string,
 *   docTitle: string,
 *   docSubtitle: string,
 *   docKind: string,
 *   footerLabel: string,
 *   formalIntro?: string | null,
 *   includeQuickStart?: boolean,
 *   userQuickStart?: boolean,
 *   adminQuickStart?: boolean,
 *   docId?: string,
 *   docRevision?: string
 *   contentClass?: string
 * }} cfg
 */
async function generateOne(cfg) {
  const srcPath = path.join(ROOT, cfg.mdFile.replace('.md', '.src.md'));
  const mdPath = fs.existsSync(srcPath) ? srcPath : path.join(ROOT, cfg.mdFile);
  const md = fs.readFileSync(mdPath, 'utf8');
  const { html, tocEntries: mdToc } = markdownToHtml(md, {
    formalIntro: cfg.formalIntro ?? null
  });
  const tocEntries =
    cfg.includeQuickStart || cfg.userQuickStart || cfg.adminQuickStart
      ? [
          {
            num: '☆',
            title: cfg.adminQuickStart
              ? 'เริ่มต้นใช้งานสำหรับผู้ดูแลระบบ (Quick Start)'
              : 'เริ่มใช้งานภายใน 1 นาที (Quick Start)',
            id: 'quickstart',
            kind: 'quick'
          },
          ...mdToc
        ]
      : mdToc;

  const figureCount = (html.match(/<figure class="/g) || []).length;
  console.log(`  ${cfg.pdfFile}: ${figureCount} รูป, สารบัญ ${tocEntries.length} หัวข้อ`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 300000
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });

  const measureHtml = buildFullHtml({
    docTitle: cfg.docTitle,
    docSubtitle: cfg.docSubtitle,
    docKind: cfg.docKind,
    contentHtml: html,
    tocEntries,
    includeQuickStart: cfg.includeQuickStart,
    userQuickStart: cfg.userQuickStart,
    adminQuickStart: cfg.adminQuickStart,
    docId: cfg.docId,
    docRevision: cfg.docRevision,
    contentClass: cfg.contentClass,
    formalIntro: cfg.formalIntro ?? null
  });

  await page.setContent(measureHtml, { waitUntil: 'load', timeout: 120000 });
  await waitForImages(page);
  await page.emulateMediaType('print');

  const pagesBefore =
    cfg.adminQuickStart || cfg.userQuickStart
      ? cfg.adminQuickStart
        ? PAGES_BEFORE_CONTENT_ADMIN
        : PAGES_BEFORE_CONTENT_USER
      : cfg.includeQuickStart
        ? 2
        : PAGES_BEFORE_CONTENT_ADMIN;
  const pageMap = await measureTocPages(page, tocEntries, pagesBefore);
  if (cfg.includeQuickStart) pageMap.quickstart = 2;
  if (cfg.userQuickStart || cfg.adminQuickStart) pageMap.quickstart = 3;

  const finalHtml = buildFullHtml({
    docTitle: cfg.docTitle,
    docSubtitle: cfg.docSubtitle,
    docKind: cfg.docKind,
    contentHtml: html,
    tocEntries,
    pageMap,
    includeQuickStart: cfg.includeQuickStart,
    userQuickStart: cfg.userQuickStart,
    adminQuickStart: cfg.adminQuickStart,
    docId: cfg.docId,
    docRevision: cfg.docRevision,
    contentClass: cfg.contentClass,
    formalIntro: cfg.formalIntro ?? null
  });

  if (process.argv.includes('--debug')) {
    const debugPath = path.join(ROOT, cfg.pdfFile.replace('.pdf', '.debug.html'));
    fs.writeFileSync(debugPath, finalHtml, 'utf8');
    console.log('  debug HTML:', debugPath);
  }

  const outPath = path.join(ROOT, cfg.pdfFile);
  await htmlToPdf(page, finalHtml, outPath, cfg.footerLabel);
  await browser.close();
  try {
    const buf = fs.readFileSync(outPath);
    const pages = (buf.toString('latin1').match(/\/Type[\s]*\/Page[^s]/g) || []).length;
    console.log(`✓ PDF: ${outPath} (${pages} หน้า)`);
  } catch {
    console.log('✓ PDF:', outPath);
  }
}

/** @param {string} file @param {string} alt */
function imgTag(file, alt) {
  const src = imageDataUri(file);
  if (!src) return `<p class="figure-missing">[ไม่พบภาพ: ${escapeHtml(file)}]</p>`;
  return `<img src="${src}" alt="${escapeHtml(alt)}" />`;
}

/** Quick Guide 2 หน้า */
async function generateQuickGuide() {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const meta = DOC_META.user;
  const html = `<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"/><title>Quick Guide — Student Check</title><style>${css}</style></head>
<body>
  <section class="cover-page quickguide-cover">
    <p class="cover-org">${SCHOOL}</p>
    <h1 class="cover-title" style="font-size:22pt;margin:6mm 0">Quick Guide</h1>
    <p class="cover-subtitle">คู่มือภาพ 2 หน้า — Student Check v${APP_VERSION}</p>
    <table class="cover-meta" style="margin-top:6mm;font-size:15pt">
      <tr><td>เลขที่</td><td>${meta.id} (ครั้งที่ ${meta.revision})</td></tr>
      <tr><td>URL</td><td>${APP_URL}</td></tr>
      <tr><td>ผู้ใช้</td><td>ครู · ครูประจำชั้น</td></tr>
    </table>
  </section>

  <section class="quickguide-page">
    <h2>หน้า 1 — Login · เช็คชื่อ</h2>
    <div class="quickguide-grid">
      <div class="quickguide-card">
        <h3>① Login</h3>
        ${imgTag('login.png', 'Login')}
        <div class="figure-callout figure-callout--compact"><span class="figure-callout-label">คำอธิบาย:</span> กรอกชื่อครู → เข้าสู่ระบบ</div>
        <ol><li>เปิด ${APP_URL.replace('https://', '')}</li><li>กรอกชื่อครู</li><li>กดเข้าสู่ระบบ</li></ol>
      </div>
      <div class="quickguide-card">
        <h3>② เช็คชื่อ</h3>
        ${imgTag('check.png', 'เช็คชื่อ')}
        <div class="figure-callout figure-callout--compact"><span class="figure-callout-label">คำอธิบาย:</span> ① ห้อง · ② มาทุกคน · ③ แก้สถานะ · ④ บันทึก</div>
        <ol><li>เลือกห้อง</li><li>กด <strong>มาทุกคน</strong></li><li>แก้คนขาด/สาย</li><li>กด <strong>บันทึก</strong></li></ol>
      </div>
    </div>
    <p class="quickguide-footer">⚠️ ทุกคนเริ่มต้นเป็น “ขาด” — กด <strong>มาทุกคน</strong> ก่อนเสมอ</p>
  </section>

  <section class="quickguide-page">
    <h2>หน้า 2 — แก้ไขย้อนหลัง · รายงาน</h2>
    <div class="quickguide-grid">
      <div class="quickguide-card">
        <h3>③ แก้ไขย้อนหลัง</h3>
        ${imgTag('history.png', 'ประวัติ')}
        <div class="figure-callout figure-callout--compact"><span class="figure-callout-label">คำอธิบาย:</span> เมนู → ประวัติ → เลือกวันที่/ห้อง</div>
        <ol><li>เมนู → ประวัติ</li><li>เลือกวันที่/ห้อง</li><li>แก้สถานะ → บันทึก</li></ol>
      </div>
      <div class="quickguide-card">
        <h3>④ รายงาน</h3>
        ${imgTag('reports.png', 'รายงาน')}
        <div class="figure-callout figure-callout--compact"><span class="figure-callout-label">คำอธิบาย:</span> แถบ มาเรียน → เลือกโหมด → ส่งออก PDF</div>
        <ol><li>แถบล่าง → มาเรียน</li><li>เลือกโหมด/วันที่</li><li>ส่งออก PDF</li></ol>
      </div>
    </div>
    <table class="handover-table" style="margin-top:4mm;font-size:14pt">
      <thead><tr><th>ปัญหา</th><th>แนวทาง</th></tr></thead>
      <tbody>
        <tr><td>ไม่พบชื่อครู</td><td>แจ้ง Admin</td></tr>
        <tr><td>ทุกคน “ขาด”</td><td>กด มาทุกคน</td></tr>
        <tr><td>Admin / ตั้งค่า</td><td>ADMIN_MANUAL.pdf</td></tr>
      </tbody>
    </table>
    <p class="quickguide-footer">${SCHOOL} · ${APP_URL}</p>
  </section>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 300000
  });
  const page = await browser.newPage();
  const outPath = path.join(ROOT, 'USER_QUICK_GUIDE.pdf');
  await htmlToPdf(page, html, outPath, `${SCHOOL} — Quick Guide`);
  await browser.close();
  console.log('✓ PDF:', outPath);
}

/** ใบสรุปส่งมอบ 1 หน้า — สำหรับผู้บริหารและงานวิชาการ */
async function generateHandoverSummary() {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const meta = DOC_META.handover;
  const html = `<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"/><title>ใบสรุปส่งมอบ — Student Check</title><style>${css}</style></head>
<body>
  <section class="handover-page handover-page--compact">
    <img class="cover-logo handover-logo" src="${coverLogoSrc()}" alt="" />
    <h1 class="handover-title">ใบสรุปส่งมอบระบบ</h1>
    <p class="handover-subtitle">Student Check v${APP_VERSION} · ${SCHOOL}</p>
    <p class="handover-dept">กลุ่มบริหารการทั่วไป (General Administration) · ${meta.id} ครั้งที่ ${meta.revision} · ${DOC_DATE}</p>
    <p class="handover-url">${APP_URL}</p>

    <div class="handover-columns">
      <div class="handover-col">
        <h2 class="handover-h2">วัตถุประสงค์</h2>
        <ul class="handover-list">
          <li>บันทึกการมาเรียน · รายงาน PDF · คะแนนพฤติกรรม</li>
          <li>ครูและผู้ดูแลระบบใช้งานผ่านเว็บแอป</li>
          <li>ผู้ดูแลระบบจัดการผ่านเมนู <strong>จัดการ</strong></li>
        </ul>
        <h2 class="handover-h2">แนวทางเริ่มต้น</h2>
        <ol class="handover-steps handover-steps--inline">
          <li><strong>ครู</strong> — 02_QuickGuide → เข้าสู่ระบบ → เช็คชื่อ → บันทึก</li>
          <li><strong>ผู้ดูแลระบบ</strong> — 03_คู่มือAdmin บท 8 → จัดการครู · นักเรียน · ตั้งค่า</li>
          <li><strong>ปัญหา</strong> — FAQ ในคู่มือครู/Admin · ระบบล่ม → งาน IT</li>
        </ol>
      </div>
      <div class="handover-col">
        <h2 class="handover-h2">เอกสารในชุดส่งมอบ</h2>
        <table class="handover-table handover-table--docs">
          <thead><tr><th>ไฟล์</th><th>ผู้ใช้</th></tr></thead>
          <tbody>
            <tr><td>01_คู่มือครู</td><td>ครู</td></tr>
            <tr><td>02_QuickGuide</td><td>ครู (เริ่มเร็ว)</td></tr>
            <tr><td>03_คู่มือAdmin</td><td>ผู้ดูแลระบบ</td></tr>
            <tr><td>04_ใบสรุปส่งมอบ</td><td>ผู้บริหาร</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <h2 class="handover-h2">Checklist ผู้ดูแลระบบ (สรุป)</h2>
    <div class="handover-checklist-cols">
      <div class="handover-checklist-col">
        <p class="handover-checklist-head">ต้นเทอม</p>
        <ul class="handover-chk">
          <li>☐ รายชื่อนักเรียนครบทุกห้อง</li>
          <li>☐ บัญชีครู · ห้องถูกต้อง</li>
          <li>☐ ตั้งค่าคะแนน · วันตรวจ</li>
          <li>☐ ทดสอบเข้าสู่ระบบ · เช็คชื่อ</li>
          <li>☐ แจกคู่มือครู (01 · 02)</li>
        </ul>
      </div>
      <div class="handover-checklist-col">
        <p class="handover-checklist-head">รายเดือน</p>
        <ul class="handover-chk">
          <li>☐ ตรวจห้องที่ยังไม่เช็คชื่อ</li>
          <li>☐ ตรวจระเบียบตามตาราง</li>
          <li>☐ ส่งออกรายงาน PDF</li>
          <li>☐ ตอบคำถามครู (FAQ บท 7)</li>
        </ul>
      </div>
      <div class="handover-checklist-col">
        <p class="handover-checklist-head">สิ้นภาคเรียน</p>
        <ul class="handover-chk">
          <li>☐ ส่งออกรายงานภาคเรียน</li>
          <li>☐ อัปเดตรายชื่อ · ย้ายห้อง</li>
          <li>☐ ปิดใช้งานครูที่ลาออก</li>
          <li>☐ เตรียม Checklist ต้นเทอมถัดไป</li>
        </ul>
      </div>
    </div>

    <p class="handover-footer">จัดทำโดย นางสาวเกศจุฬา ภูนาเมือง · กลุ่มบริหารการทั่วไป (General Administration)</p>
  </section>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 300000
  });
  const page = await browser.newPage();
  const outPath = path.join(ROOT, 'HANDOVER_SUMMARY.pdf');
  await htmlToPdf(page, html, outPath, `${SCHOOL} — ใบสรุปส่งมอบ`);
  await browser.close();
  console.log('✓ PDF:', outPath);
}

async function main() {
  const formalIntroAdmin = null;

  const skipScreenshots = process.argv.includes('--no-screenshots');
  if (!skipScreenshots) {
    console.log('Capturing screenshots...');
    const { spawnSync } = await import('child_process');
    spawnSync('node', [path.join(__dirname, 'capture-manual-screenshots.mjs')], {
      stdio: 'inherit',
      cwd: ROOT
    });
    spawnSync('node', [path.join(__dirname, 'build-manual-preview-html.mjs')], {
      stdio: 'inherit',
      cwd: ROOT
    });
  }

  console.log('\nGenerating PDFs...\n');

  await generateOne({
    mdFile: 'USER_MANUAL.md',
    pdfFile: 'USER_MANUAL.pdf',
    docTitle: 'คู่มือการใช้งานระบบเช็คชื่อนักเรียน',
    docSubtitle: 'สำหรับครูและบุคลากรทางการศึกษา',
    docKind: 'คู่มือผู้ใช้งาน (User Manual)',
    footerLabel: `${SCHOOL} — คู่มือผู้ใช้งาน`,
    formalIntro: null,
    includeQuickStart: false,
    userQuickStart: true,
    docId: DOC_META.user.id,
    docRevision: DOC_META.user.revision
  });

  await generateQuickGuide();

  await generateOne({
    mdFile: 'ADMIN_MANUAL.md',
    pdfFile: 'ADMIN_MANUAL.pdf',
    docTitle: 'คู่มือผู้ดูแลระบบเช็คชื่อนักเรียน',
    docSubtitle: 'สำหรับผู้ดูแลระบบและงานวิชาการ',
    docKind: 'คู่มือผู้ดูแลระบบ (Administrator Manual)',
    footerLabel: `${SCHOOL} — คู่มือผู้ดูแลระบบ`,
    formalIntro: formalIntroAdmin,
    includeQuickStart: false,
    adminQuickStart: true,
    docId: DOC_META.admin.id,
    docRevision: DOC_META.admin.revision,
    contentClass: 'admin-manual'
  });

  await generateHandoverSummary();

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
