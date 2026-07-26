/**
 * Rasterises the brand SVGs into favicon / PWA / app-store icon sizes.
 * Run with: node scripts/build-brand-icons.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { src: 'public/favicon.svg', out: 'public/favicon.png', size: 64 },
  { src: 'public/favicon.svg', out: 'public/favicon-32.png', size: 32 },
  { src: 'public/favicon.svg', out: 'public/apple-touch-icon.png', size: 180 },
  { src: 'public/favicon.svg', out: 'public/icons/icon-192.png', size: 192 },
  { src: 'public/favicon.svg', out: 'public/icons/icon-512.png', size: 512 },
  { src: 'src/assets/brand/wolf-mark.svg', out: 'public/brand-logo.png', size: 512 },
  { src: 'src/assets/brand/wolf-mark.svg', out: 'public/brand-mark.png', size: 256 },
  { src: 'src/assets/brand/wolf-mark.svg', out: 'preview/mark-16.png', size: 16 },
  { src: 'src/assets/brand/wolf-mark.svg', out: 'preview/mark-64.png', size: 64 },
  { src: 'public/favicon.svg', out: 'preview/favicon-16.png', size: 16 },
  { src: 'public/favicon.svg', out: 'preview/favicon-32.png', size: 32 },
  { src: 'public/favicon.svg', out: 'preview/favicon-256.png', size: 256 },
];

for (const { src, out, size } of TARGETS) {
  const svg = await readFile(resolve(root, src));
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const dest = resolve(root, out);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, png);
  console.log(`${out}  ${size}px  ${(png.length / 1024).toFixed(1)}KB`);
}
