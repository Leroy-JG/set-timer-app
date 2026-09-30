/**
 * Famille de marque (héritée d'Alam) : les couleurs « de fonction » ne changent jamais d'une app à l'autre ;
 * seuls le fond de marque (`ground`), le fond sombre (`night`) et le secondaire changent.
 * `checkPalette` vérifie qu'une palette s'accorde avec l'or et les couleurs de fonction.
 */

type Rgb = [number, number, number];

export const FAMILY = {
  accent: '#C9A227',
  accentWarm: '#E8A317',
  cream: '#F4EBD9',
  warmBlack: '#1C1A17',
  neutral: '#8A7F6D',
  success: { light: '#2F6B4F', dark: '#5FB58A' },
  error: { light: '#B5623B', dark: '#E0906B' },
  muted: { light: '#6B6152', dark: '#B4AC9A' },
  light: { card: '#FBF7EE', border: '#DDD0B4', track: '#E3D7BC' },
} as const;

/** Couleurs « pigments » communes à la famille (le secondaire se prend parmi elles). */
export const PIGMENTS = {
  kermes: '#A3303F',
  cornaline: '#E07B39',
  orpiment: '#EBD27A',
  olive: '#7A8F3A',
  turquoise: '#2A9D9F',
  ciel: '#5B8FC7',
  lapis: '#26428B',
  indigo: '#4B3F8F',
  pourpre: '#7A3E8E',
  roseDamas: '#C9708A',
  henne: '#6B4A33',
  pierre: '#8A7F6D',
} as const;

export interface Palette {
  /** Fond de marque (= primary) : logo, écran de démarrage, action et barres en thème clair. */
  ground: string;
  /** Fond du thème sombre. */
  night: string;
  /** Remplissage des barres en thème sombre. */
  secondary: string;
  /** Surfaces sombres, déduites de la teinte du fond (`darkSurfaces`). */
  card: string;
  border: string;
  track: string;
}

const rgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linear = (h: string): Rgb => rgb(h).map(lin) as Rgb;

export function contrast(a: string, b: string): number {
  const L = (h: string) => {
    const [r, g, bl] = linear(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Écart de couleur perçu (CIE Lab, ΔE76) : en dessous de ~35, deux couleurs se confondent facilement. */
export function deltaE(a: string, b: string): number {
  const lab = (h: string) => {
    const [r, g, bl] = linear(h);
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047);
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * bl);
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)] as Rgb;
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function hue(h: string): number {
  const [r, g, b] = rgb(h).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const k = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return k * 60;
}

function fromHsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Tons sombres d'un nouveau fond de marque : même teinte, proportions mesurées sur Alam. */
export function darkSurfaces(ground: string) {
  const h = hue(ground);
  return {
    night: fromHsl(h, 0.506, 0.159),
    card: fromHsl(h, 0.44, 0.204),
    border: fromHsl(h, 0.37, 0.304),
    track: fromHsl(h, 0.36, 0.29),
  };
}

/** Règles non respectées par une palette (liste vide = elle va avec l'or et avec les couleurs de fonction). */
export function checkPalette(p: Palette): string[] {
  const { accent, cream, success, error, muted } = FAMILY;
  const h = hue(p.ground);
  const rules: [string, boolean][] = [
    ['teinte du fond hors de 210°–350°', h >= 210 && h <= 350],
    ['or sur fond < 3,5:1', contrast(accent, p.ground) >= 3.5],
    ['blanc sur fond < 7:1', contrast('#FFFFFF', p.ground) >= 7],
    ['fond sur crème < 6:1', contrast(p.ground, cream) >= 6],
    ['fond trop proche de success (ΔE < 45)', deltaE(p.ground, success.light) >= 45],
    ['fond trop proche de error (ΔE < 45)', deltaE(p.ground, error.light) >= 45],
    ['or sur nuit < 6:1', contrast(accent, p.night) >= 6],
    ['crème sur nuit < 12:1', contrast(cream, p.night) >= 12],
    ['texte secondaire sur carte sombre < 4,5:1', contrast(muted.dark, p.card) >= 4.5],
    ['secondaire sur piste < 3:1', contrast(p.secondary, p.track) >= 3],
    ['secondaire trop proche de success sombre (ΔE < 35)', deltaE(p.secondary, success.dark) >= 35],
    ["secondaire trop proche de l'or (ΔE < 40)", deltaE(p.secondary, accent) >= 40],
  ];
  return rules.filter(([, ok]) => !ok).map(([label]) => label);
}

/** Palette de cette app : violet « prune » (teinte ≈ 272°), secondaire = ciel. Validée par `checkPalette`. */
const GROUND = '#5C2E8A';
export const PALETTE: Palette = { ground: GROUND, ...darkSurfaces(GROUND), secondary: PIGMENTS.ciel };
