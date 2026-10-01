import { clampSeconds } from './timer';

/**
 * Saisie de la durée « chiffre après chiffre », comme sur un four à micro-ondes : on tape les 4 chiffres de MM:SS à la suite
 * (0 1 3 0 → 01:30). Chaque nouveau chiffre entre à droite ; au-delà de 4, les plus anciens sortent à gauche.
 */

/** Les (au plus) 4 derniers chiffres d'un texte. */
export function typedDigits(text: string): string {
  return text.replace(/\D/g, '').slice(-4);
}

/** « 0130 » → 90 s. Moins de 4 chiffres : complétés par des zéros à gauche (« 45 » → 00:45). Secondes au-dessus de 59 : reportées sur les minutes
 *  (« 0090 » → 01:30). Borné à 00:01 – 99:59. */
export function digitsToSeconds(digits: string): number {
  const d = typedDigits(digits).padStart(4, '0');
  return clampSeconds(parseInt(d.slice(0, 2), 10) * 60 + parseInt(d.slice(2), 10));
}

/** Affichage pendant la saisie : « 130 » → « 01:30 ». */
export function formatDigits(digits: string): string {
  const d = typedDigits(digits).padStart(4, '0');
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Durée affichée hors saisie : 90 → « 01:30 ». */
export function formatDuration(seconds: number): string {
  const s = clampSeconds(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
