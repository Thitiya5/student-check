import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8766;

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf' };

function safePath(urlPath) {
  const rel = urlPath === '/' ? '/USER_MANUAL.preview.html' : urlPath.split('?')[0];
  const resolved = path.normalize(path.join(ROOT, decodeURIComponent(rel)));
  return resolved.startsWith(ROOT) ? resolved : null;
}

const server = http.createServer((req, res) => {
  const fp = safePath(req.url || '/');
  if (!fp || !fs.existsSync(fp)) {
    res.writeHead(404);
    return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/USER_MANUAL.preview.html`, { waitUntil: 'networkidle0' });

const imgs = await page.evaluate(() =>
  [...document.querySelectorAll('img')].map((img) => ({
    src: img.src.slice(0, 60),
    ok: img.naturalWidth > 0,
    w: img.naturalWidth
  }))
);

const ok = imgs.filter((i) => i.ok).length;
console.log(`HTTP preview images: ${ok}/${imgs.length} OK`);
if (imgs.some((i) => !i.ok)) console.log('Broken:', imgs.filter((i) => !i.ok));

await page.screenshot({ path: path.join(ROOT, 'manual-images', '_verify-http.png') });
console.log('Screenshot: manual-images/_verify-http.png');

await browser.close();
server.close();

if (ok === imgs.length && imgs.length > 0) {
  spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:8765/docs-viewer.html`], {
    detached: true,
    stdio: 'ignore',
    cwd: ROOT
  });
}
