/** Logique pure du minuteur de séries (aucune horloge, aucun effet de bord : le temps est passé en paramètre). */

export const MIN_SECONDS = 1;
export const MAX_SECONDS = 99 * 60 + 59;
export const MIN_SETS = 1;
export const MAX_SETS = 99;

export interface TimerConfig {
  /** Durée d'une série, en secondes. */
  seconds: number;
  /** Nombre de séries. */
  sets: number;
}

export const DEFAULT_CONFIG: TimerConfig = { seconds: 90, sets: 4 };

export type Phase = 'idle' | 'running' | 'paused' | 'done';

export interface TimerState {
  phase: Phase;
  /** Séries terminées. */
  completed: number;
  /** Temps restant sur la série en cours, en ms. */
  remainingMs: number;
  /** Instant (ms) où la série en cours se termine ; seulement en `running`. */
  endAt: number | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  return { phase: 'idle', completed: 0, remainingMs: config.seconds * 1000, endAt: null };
}

/** Les réglages ne se modifient qu'avant de commencer (après « Réinitialiser »). */
export function canEdit(state: TimerState): boolean {
  return state.phase === 'idle' && state.completed === 0;
}

export function start(state: TimerState, now: number): TimerState {
  if (state.phase === 'running' || state.phase === 'done') return state;
  return { ...state, phase: 'running', endAt: now + state.remainingMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.phase !== 'running' || state.endAt === null) return state;
  return { ...state, phase: 'paused', remainingMs: Math.max(0, state.endAt - now), endAt: null };
}

/**
 * Avance l'horloge. Quand la série arrive à 00:00 : elle est comptée, puis le minuteur se remet à la durée pleine
 * et attend (« idle ») que l'on lance la série suivante ; après la dernière série, la phase est « done ».
 */
export function tick(state: TimerState, config: TimerConfig, now: number): TimerState {
  if (state.phase !== 'running' || state.endAt === null) return state;
  const remaining = state.endAt - now;
  if (remaining > 0) return { ...state, remainingMs: remaining };
  const completed = state.completed + 1;
  if (completed >= config.sets) return { phase: 'done', completed: config.sets, remainingMs: 0, endAt: null };
  return { phase: 'idle', completed, remainingMs: config.seconds * 1000, endAt: null };
}

export function reset(config: TimerConfig): TimerState {
  return initialState(config);
}

/** Fraction du temps restant sur la série en cours (1 = pleine durée, 0 = 00:00). */
export function remainingFraction(state: TimerState, config: TimerConfig): number {
  if (state.phase === 'done') return 0;
  return clamp(state.remainingMs / (config.seconds * 1000), 0, 1);
}

/** « MM:SS », arrondi à la seconde supérieure (le cadran reste à 00:01 jusqu'à la toute fin). */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
