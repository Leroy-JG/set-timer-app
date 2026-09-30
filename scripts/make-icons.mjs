// Génère les 9 icônes de l'application (PNG) : un anneau de progression (arc doré sur piste crème) au-dessus de
// quatre tirets de séries (deux faits en crème, deux à faire en gris), sur le fond de marque.
// Le SVG est rendu dans Chromium via Playwright, puis capturé en PNG.
//
//   node scripts/make-icons.mjs
//
// Prérequis : le paquet « playwright » et un Chromium (variable CHROMIUM_PATH, sinon celui de Playwright).
// Changer une icône PWA ⇒ incrémenter `CACHE` dans `public/sw.js` (les icônes sont servies depuis le cache).
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PRIMARY = '#5C2E8A';
const ACCENT = '#C9A227';
const CREAM = '#F4EBD9';

/** Motif centré dans un carré de 1024. `mono` : silhouette blanche (icône de notification Android, qui ne garde que la forme). */
function motif(mono = false) {
  const cx = 512;
  const cy = 452;
  const r = 232;
  const stroke = 62;
  const c = 2 * Math.PI * r;
  const arc = c * 0.68;
  const track = mono ? '#FFFFFF' : CREAM;
  const arcColor = mono ? '#FFFFFF' : ACCENT;
  let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-opacity="${mono ? 0.4 : 0.28}" stroke-width="${stroke}"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${arcColor}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${arc} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`;
  const w = 112;
  const gap = 28;
  const total = 4 * w + 3 * gap;
  const y = 812;
  for (let i = 0; i < 4; i++) {
    const x = cx - total / 2 + i * (w + gap);
    const tile = mono ? '#FFFFFF' : CREAM;
    out += i < 2
      ? `<rect x="${x}" y="${y}" width="${w}" height="36" rx="18" fill="${tile}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="36" rx="18" fill="${tile}" fill-opacity="${mono ? 0.4 : 0.28}"/>`;
  }
  return out;
}

/** SVG 1024×1024. `scale` réduit le motif autour du centre (zones de sécurité des masques d'icône). */
function svg({ background, scale = 1, mono = false }) {
  const bg = background ? `<rect width="1024" height="1024" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${bg}<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${motif(mono)}</g></svg>`;
}

const jobs = [
  // [fichier, taille, options SVG, fond transparent ?]
  ['assets/icon.png', 1024, { background: PRIMARY }, false],
  ['assets/adaptive-icon.png', 1024, { scale: 0.78 }, true], // zone de sécurité Android = cercle de 66 %
  ['assets/splash-icon.png', 1024, {}, true],
  ['assets/favicon.png', 48, { background: PRIMARY, scale: 1.05 }, false],
  ['public/icon-192.png', 192, { background: PRIMARY }, false],
  ['public/icon-512.png', 512, { background: PRIMARY }, false],
  ['public/icon-maskable-512.png', 512, { background: PRIMARY, scale: 0.95 }, false], // maskable = cercle de 80 %
  ['public/apple-touch-icon.png', 180, { background: PRIMARY }, false],
  ['assets/notification-icon.png', 96, { mono: true, scale: 0.95 }, true], // silhouette blanche sur fond transparent (Android)
];

function loadPlaywright() {
  for (const base of [import.meta.url, '/opt/node22/lib/node_modules/']) {
    try {
      return createRequire(base)('playwright');
    } catch {
      // essaie l'emplacement suivant
    }
  }
  throw new Error('Paquet « playwright » introuvable (npm install --no-save playwright).');
}

const { chromium } = loadPlaywright();
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
for (const [file, size, opts, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">` +
      svg(opts).replace('width="1024" height="1024"', `width="${size}" height="${size}"`) +
      `</div></body></html>`,
  );
  await page.screenshot({ path: `${ROOT}${file}`, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('écrit', file);
}
await browser.close();
