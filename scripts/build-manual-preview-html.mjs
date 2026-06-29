/**
 * สร้าง HTML preview จาก .src.md — รูปอ้าง manual-images/ (ใช้กับ docs:view)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CSS = `
body { font-family: Sarabun, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1f2937; }
img { max-width: 100%; height: auto; display: block; margin: 1rem auto; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
h1, h2, h3 { color: #4c1d95; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
th { background: #f3f4f6; }
code { background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 4px; }
em { display: block; text-align: center; color: #6b7280; font-size: 0.9rem; margin: -0.5rem 0 1.5rem; }
`;

const FILES = [
  { src: 'USER_MANUAL.src.md', html: 'USER_MANUAL.preview.html', title: 'คู่มือผู้ใช้งาน' },
  { src: 'ADMIN_MANUAL.src.md', html: 'ADMIN_MANUAL.preview.html', title: 'คู่มือผู้ดูแลระบบ' }
];

for (const { src, html, title } of FILES) {
  const srcPath = path.join(ROOT, src);
  const fallback = path.join(ROOT, html.replace('.preview.html', '.md'));
  const input = fs.existsSync(srcPath) ? srcPath : fallback;
  let md = fs.readFileSync(input, 'utf8');
  md = md.replace(/\.\/manual-images\//g, '/manual-images/');
  md = md.replace(/docs\/screenshots\//g, '/manual-images/');

  marked.setOptions({ gfm: true });
  const body = marked.parse(md);
  const full = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;
  fs.writeFileSync(path.join(ROOT, html), full);
  console.log('✓', html, `(from ${path.basename(input)})`);
}
