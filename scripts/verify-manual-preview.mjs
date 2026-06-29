/**
 * เปิด preview HTML ด้วย Puppeteer แล้วถ่ายภาพยืนยันว่ารูปแสดงจริง
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'USER_MANUAL.preview.html');
const OUT = path.join(ROOT, 'manual-images', '_verify-preview.png');

const html = fs.readFileSync(HTML, 'utf8');
const imgCount = (html.match(/data:image\/png;base64/g) || []).length;
console.log('Base64 images in HTML:', imgCount);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
await page.goto(`file:///${HTML.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 120000 });

const rendered = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  return imgs.map((img) => ({
    alt: img.alt || '',
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    ok: img.naturalWidth > 0 && img.naturalHeight > 0
  }));
});

const ok = rendered.filter((r) => r.ok).length;
const broken = rendered.filter((r) => !r.ok);

console.log(`Rendered images: ${ok}/${rendered.length} OK`);
if (broken.length) {
  console.log('Broken:', broken.map((b) => b.alt).join(', '));
} else {
  console.log('All images rendered successfully.');
}

await page.screenshot({ path: OUT, fullPage: false });
console.log('Screenshot saved:', OUT);
await browser.close();
