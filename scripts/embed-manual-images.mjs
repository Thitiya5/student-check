/**
 * ฝังรูปในคู่มือเป็น base64 — แก้ปัญหา Markdown preview โหลดรูปจาก path ไม่ได้
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const IMAGE_DIRS = [
  path.join(ROOT, 'manual-images'),
  path.join(ROOT, 'docs', 'screenshots')
];

const MD_PAIRS = [
  { src: 'USER_MANUAL.src.md', out: 'USER_MANUAL.md' },
  { src: 'ADMIN_MANUAL.src.md', out: 'ADMIN_MANUAL.md' }
];

const PATH_IMAGE_RE = /!\[([^\]]*)\]\(\.\/(?:manual-images|docs\/screenshots)\/([^)]+)\)/g;

/** @param {string} file */
function resolveImage(file) {
  for (const dir of IMAGE_DIRS) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** @param {string} file */
function mimeFor(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

/** @param {string} alt */
function escapeAttr(alt) {
  return String(alt).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * @param {{ src: string, out: string }} pair
 * @param {Map<string, string>} cache
 */
function embedPair(pair, cache) {
  const srcPath = path.join(ROOT, pair.src);
  const outPath = path.join(ROOT, pair.out);
  const inputPath = fs.existsSync(srcPath) ? srcPath : outPath;
  let md = fs.readFileSync(inputPath, 'utf8');
  let count = 0;

  md = md.replace(PATH_IMAGE_RE, (match, alt, file) => {
    if (!cache.has(file)) {
      const imgPath = resolveImage(file);
      if (!imgPath) {
        console.warn(`  missing image: ${file} (${pair.out})`);
        return match;
      }
      const b64 = fs.readFileSync(imgPath).toString('base64');
      const mime = mimeFor(file);
      cache.set(file, `data:${mime};base64,${b64}`);
    }
    count++;
    const src = cache.get(file);
    const safeAlt = escapeAttr(alt);
    return `<img src="${src}" alt="${safeAlt}" style="max-width:100%;height:auto;display:block;margin:1rem auto;border:1px solid #e5e7eb;border-radius:8px;" />\n\n*${alt}*`;
  });

  fs.writeFileSync(outPath, md);
  console.log(`✓ ${pair.out}: embedded ${count} image(s) from ${path.basename(inputPath)}`);
}

function main() {
  /** @type {Map<string, string>} */
  const cache = new Map();
  for (const pair of MD_PAIRS) {
    embedPair(pair, cache);
  }

  spawnSync('node', [path.join(__dirname, 'build-manual-preview-html.mjs')], {
    stdio: 'inherit',
    cwd: ROOT
  });
}

main();
