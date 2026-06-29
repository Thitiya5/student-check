/**
 * สร้างไฟล์ .src.md (path สั้น) จากคู่มือที่ฝัง base64 แล้ว
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'manual-images');

/** @type {Map<string, string>} */
const b64ToFile = new Map();

for (const file of fs.readdirSync(IMAGE_DIR)) {
  if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
  const b64 = fs.readFileSync(path.join(IMAGE_DIR, file)).toString('base64');
  b64ToFile.set(b64.slice(0, 120), file);
}

/**
 * @param {string} dataUri
 */
function fileFromDataUri(dataUri) {
  const m = dataUri.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) return null;
  const prefix = m[1].slice(0, 120);
  for (const [key, file] of b64ToFile) {
    if (m[1].startsWith(key.slice(0, 80))) return file;
  }
  return null;
}

const MD = ['USER_MANUAL.md', 'ADMIN_MANUAL.md'];

for (const md of MD) {
  const abs = path.join(ROOT, md);
  if (!fs.existsSync(abs)) continue;
  let text = fs.readFileSync(abs, 'utf8');
  text = text.replace(
    /<img src="(data:image\/[^"]+)" alt="([^"]*)"[^>]*\/?>\s*\n\n\*([^*]+)\*/g,
    (match, src, alt, caption) => {
      const file = fileFromDataUri(src);
      if (!file) return match;
      return `![${caption}](./manual-images/${file})`;
    }
  );
  const out = path.join(ROOT, md.replace('.md', '.src.md'));
  fs.writeFileSync(out, text);
  console.log('✓', path.basename(out));
}
