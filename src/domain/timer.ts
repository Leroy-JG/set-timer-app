/** Logique pure du minuteur de séries (aucune horloge, aucun effet de bord : le temps est passé en paramètre). */

export const MIN_SECONDS = 1;
export const MAX_SECONDS = 99 * 60 + 59;
export const MIN_SETS = 1;
export const MAX_SETS = 99;
/** Reste minimal après un déplacement sur le cercle : seul le temps (ou un appui sur le chrono) termine une série. */
export const MIN_SEEK_MS = 1000;

export interface TimerConfig {
  /** Durée d'une série, en secondes. */
  seconds: number;
  /** Nombre de séries. */
  sets: number;
}

export const DEFAULT_CONFIG: TimerConfig = { seconds: 90, sets: 4 };

/**
 * - `idle`    : en attente d'un « Go » (au tout début, ou entre deux séries : chrono à 00:00) ;
 * - `running` : décompte en cours ; `paused` : décompte suspendu ; `done` : toutes les séries sont faites.
 */
export type Phase = 'idle' | 'running' | 'paused' | 'done';

export interface TimerState {
  phase: Phase;
  /** Séries terminées. */
  completed: number;
  /** Temps restant sur la série en cours, en ms (0 entre deux séries). */
  remainingMs: number;
  /** Instant (ms) où la série en cours se termine ; seulement en `running`. */
  endAt: number | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const totalMs = (config: TimerConfig) => config.seconds * 1000;

export function clampSeconds(value: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : MIN_SECONDS), MIN_SECONDS, MAX_SECONDS);
}

export function clampSets(value: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : MIN_SETS), MIN_SETS, MAX_SETS);
}

/** Réglages lus depuis le stockage : toute valeur invalide retombe sur la valeur par défaut. */
export function sanitizeConfig(raw: unknown): TimerConfig {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    seconds: clampSeconds(num(o.seconds, DEFAULT_CONFIG.seconds)),
    sets: clampSets(num(o.sets, DEFAULT_CONFIG.sets)),
  };
}

export function initialState(config: TimerConfig): TimerState {
  return { phase: 'idle', completed: 0, remainingMs: totalMs(config), endAt: null };
}

/**
 * État enregistré (l'app a pu être fermée ou tuée par le système pendant un décompte) : toute donnée incohérente
 * retombe sur un état neutre plutôt que sur un chrono faux.
 */
export function sanitizeState(raw: unknown, config: TimerConfig): TimerState {
  const fallback = initialState(config);
  if (typeof raw !== 'object' || raw === null) return fallback;
  const o = raw as Record<string, unknown>;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const phase = o.phase;
  if (phase !== 'idle' && phase !== 'running' && phase !== 'paused' && phase !== 'done') return fallback;
  if (!isNum(o.completed) || !Number.isInteger(o.completed) || o.completed < 0 || o.completed > config.sets) return fallback;
  const completed = o.completed;
  if (phase === 'done') return completed === config.sets ? { phase, completed, remainingMs: 0, endAt: null } : fallback;
  if (completed >= config.sets) return fallback;
  if (phase === 'running') {
    if (!isNum(o.endAt) || o.endAt <= 0) return fallback;
    return { phase, completed, remainingMs: clamp(isNum(o.remainingMs) ? o.remainingMs : 0, 0, totalMs(config)), endAt: o.endAt };
  }
  if (!isNum(o.remainingMs)) return fallback;
  const remainingMs = clamp(o.remainingMs, 0, totalMs(config));
  // « paused » avec 00:00 n'a pas de sens ; « idle » = durée pleine au tout début, 00:00 entre deux séries
  if (phase === 'paused') return remainingMs > 0 ? { phase, completed, remainingMs, endAt: null } : fallback;
  return { phase, completed, remainingMs: completed === 0 ? totalMs(config) : 0, endAt: null };
}

/** Les réglages ne se modifient qu'avant de commencer (après « Réinitialiser »). */
export function canEdit(state: TimerState): boolean {
  return state.phase === 'idle' && state.completed === 0;
}

/** En attente du « Go » d'une série suivante (chrono à 00:00, au moins une série faite). */
export function isWaitingNext(state: TimerState): boolean {
  return state.phase === 'idle' && state.completed > 0;
}

export function start(state: TimerState, config: TimerConfig, now: number): TimerState {
  if (state.phase === 'running' || state.phase === 'done') return state;
  const remainingMs = state.remainingMs > 0 ? state.remainingMs : totalMs(config);
  return { ...state, phase: 'running', remainingMs, endAt: now + remainingMs };
}

export function pause(state: TimerState, config: TimerConfig, now: number): TimerState {
  if (state.phase !== 'running' || state.endAt === null) return state;
  const remaining = state.endAt - now;
  if (remaining <= 0) return finishSet(state, config); // l'heure est passée entre deux tops d'horloge
  return { ...state, phase: 'paused', remainingMs: Math.min(remaining, totalMs(config)), endAt: null };
}

/** Une série vient de se terminer (à 00:00 ou par appui sur le chrono) : on la compte et on attend le prochain « Go ». */
function finishSet(state: TimerState, config: TimerConfig): TimerState {
  const completed = Math.min(state.completed + 1, config.sets);
  if (completed >= config.sets) return { phase: 'done', completed: config.sets, remainingMs: 0, endAt: null };
  return { phase: 'idle', completed, remainingMs: 0, endAt: null };
}

/**
 * Avance l'horloge. Quand la série arrive à 00:00 : elle est comptée, le chrono reste à 00:00 et attend le prochain « Go » ;
 * après la dernière série, la phase est « done ». Le temps restant ne dépasse jamais la durée d'une série
 * (protège d'une horloge système remise en arrière).
 */
export function tick(state: TimerState, config: TimerConfig, now: number): TimerState {
  if (state.phase !== 'running' || state.endAt === null) return state;
  const remaining = state.endAt - now;
  if (remaining > 0) return { ...state, remainingMs: Math.min(remaining, totalMs(config)) };
  return finishSet(state, config);
}

/** Termine tout de suite la série en cours (chrono en marche ou en pause) : elle est comptée. */
export function skip(state: TimerState, config: TimerConfig): TimerState {
  if (state.phase !== 'running' && state.phase !== 'paused') return state;
  return finishSet(state, config);
}

/**
 * Déplace l'horloge : `elapsedFraction` (0–1) = part de la série déjà écoulée, comme sur le cercle
 * (un quart du cercle = un quart du temps écoulé). Fonctionne en marche et en pause.
 */
export function seek(state: TimerState, config: TimerConfig, elapsedFraction: number, now: number): TimerState {
  if (state.phase !== 'running' && state.phase !== 'paused') return state;
  if (!Number.isFinite(elapsedFraction)) return state;
  const total = totalMs(config);
  const remainingMs = clamp(Math.round(total * (1 - clamp(elapsedFraction, 0, 1))), Math.min(MIN_SEEK_MS, total), total);
  return state.phase === 'running' ? { ...state, remainingMs, endAt: now + remainingMs } : { ...state, remainingMs };
}

/**
 * Angle d'un point du cercle → part écoulée (0–1) : 0 en haut (minuit), croît dans le sens des aiguilles d'une montre.
 * `dx`, `dy` : position du doigt par rapport au centre (y vers le bas).
 */
export function angleFraction(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const theta = Math.atan2(dx, -dy); // -π..π, 0 en haut
  const fraction = (theta < 0 ? theta + 2 * Math.PI : theta) / (2 * Math.PI);
  return fraction >= 1 ? 0 : fraction;
}

/**
 * Pendant un glissement : si le doigt repasse par le haut du cercle, on reste au bout (1) ou au début (0)
 * au lieu de sauter de l'autre côté.
 */
export function unwrapFraction(previous: number, next: number): number {
  if (previous - next > 0.5) return 1;
  if (next - previous > 0.5) return 0;
  return next;
}

export function reset(config: TimerConfig): TimerState {
  return initialState(config);
}

/** Fraction du temps restant sur la série en cours (1 = pleine durée, 0 = 00:00). */
export function remainingFraction(state: TimerState, config: TimerConfig): number {
  if (state.phase === 'done') return 0;
  return clamp(state.remainingMs / totalMs(config), 0, 1);
}

/** « MM:SS », arrondi à la seconde supérieure (le cadran reste à 00:01 jusqu'à la toute fin). */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
