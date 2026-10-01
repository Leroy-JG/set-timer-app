import { describe, expect, it } from 'vitest';
import {
  angleFraction,
  clampSeconds,
  clampSets,
  formatTime,
  initialState,
  isWaitingNext,
  remainingFraction,
  reset,
  sanitizeConfig,
  sanitizeState,
  seek,
  skip,
  start,
  tick,
  unwrapFraction,
  type TimerConfig,
  type TimerState,
} from './timer';

const config: TimerConfig = { seconds: 30, sets: 3 };
const running = (now = 0) => start(initialState(config), config, now);

describe('bornes', () => {
  it('borne la durée et le nombre de séries', () => {
    expect(clampSeconds(0)).toBe(1);
    expect(clampSeconds(-5)).toBe(1);
    expect(clampSeconds(99999)).toBe(99 * 60 + 59);
    expect(clampSeconds(NaN)).toBe(1);
    expect(clampSets(0)).toBe(1);
    expect(clampSets(250)).toBe(99);
    expect(clampSets(4.4)).toBe(4);
  });

  it('retombe sur les valeurs par défaut pour des réglages enregistrés invalides', () => {
    expect(sanitizeConfig(null)).toEqual({ seconds: 90, sets: 4 });
    expect(sanitizeConfig({ seconds: 'x', sets: 'y' })).toEqual({ seconds: 90, sets: 4 });
    expect(sanitizeConfig({ seconds: 45, sets: 6 })).toEqual({ seconds: 45, sets: 6 });
    expect(sanitizeConfig({ seconds: -1, sets: 1000 })).toEqual({ seconds: 1, sets: 99 });
  });
});

describe('formatTime', () => {
  it('affiche MM:SS en arrondissant à la seconde supérieure', () => {
    expect(formatTime(90_000)).toBe('01:30');
    expect(formatTime(1)).toBe('00:01');
    expect(formatTime(999)).toBe('00:01');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(-50)).toBe('00:00');
    expect(formatTime(99 * 60_000 + 59_000)).toBe('99:59');
  });
});

describe('décompte', () => {
  it('démarre et avance à partir de l’heure réelle', () => {
    let s = running(1_000);
    expect(s).toEqual({ phase: 'running', completed: 0, remainingMs: 30_000, endAt: 31_000 });
    s = tick(s, config, 11_000);
    expect(s.remainingMs).toBe(20_000);
    expect(start(s, config, 20_000)).toBe(s); // déjà en marche : un deuxième Go ne change rien
  });

  it('à 00:00 compte la série, le chrono reste à 00:00 et attend le prochain Go', () => {
    const s = tick(running(0), config, 30_000);
    expect(s).toEqual({ phase: 'idle', completed: 1, remainingMs: 0, endAt: null });
    expect(isWaitingNext(s)).toBe(true);
    // le Go suivant repart de la durée pleine
    const next = start(s, config, 100_000);
    expect(next).toEqual({ phase: 'running', completed: 1, remainingMs: 30_000, endAt: 130_000 });
  });

  it('enchaîne toutes les séries puis passe à « done »', () => {
    let s = initialState(config);
    let now = 0;
    for (let i = 0; i < 3; i++) {
      s = start(s, config, now);
      now += 30_000;
      s = tick(s, config, now);
    }
    expect(s).toEqual({ phase: 'done', completed: 3, remainingMs: 0, endAt: null });
    expect(remainingFraction(s, config)).toBe(0);
    expect(start(s, config, now)).toBe(s);
  });

  it("rattrape le retard si l'app était en arrière-plan (une seule série comptée)", () => {
    const s = tick(running(0), config, 10 * 60_000);
    expect(s.completed).toBe(1);
    expect(s.phase).toBe('idle');
  });

  it('une horloge système remise en arrière ne rallonge pas la série au-delà de sa durée', () => {
    const s = tick(running(1_000_000), config, 0);
    expect(s.remainingMs).toBe(30_000);
  });

  it('la fraction restante va de 1 à 0', () => {
    let s = running(0);
    expect(remainingFraction(s, config)).toBe(1);
    s = tick(s, config, 15_000);
    expect(remainingFraction(s, config)).toBe(0.5);
  });
});

describe('déplacer l’horloge sur le cercle', () => {
  const two: TimerConfig = { seconds: 120, sets: 3 };

  it('un quart du cercle = un quart du temps écoulé (2 min → 1:30), en marche', () => {
    const s = seek(start(initialState(two), two, 0), two, 0.25, 50_000);
    expect(s.remainingMs).toBe(90_000);
    expect(s.endAt).toBe(140_000);
    expect(formatTime(s.remainingMs)).toBe('01:30');
    expect(remainingFraction(s, two)).toBe(0.75);
  });

  it('on peut aussi rajouter du temps (revenir en arrière)', () => {
    let s = tick(start(initialState(two), two, 0), two, 100_000); // reste 20 s
    s = seek(s, two, 0.1, 100_000);
    expect(s.remainingMs).toBe(108_000);
    expect(s.endAt).toBe(208_000);
    s = seek(s, two, 0.5, 100_000);
    expect(s).toMatchObject({ phase: 'running', remainingMs: 60_000, endAt: 160_000 });
  });

  it('ne termine jamais la série de lui-même : il reste au moins 1 s', () => {
    expect(seek(start(initialState(two), two, 0), two, 1, 0).remainingMs).toBe(1000);
    expect(seek(start(initialState(two), two, 0), two, 0, 0).remainingMs).toBe(120_000);
    const tiny: TimerConfig = { seconds: 1, sets: 2 };
    expect(seek(start(initialState(tiny), tiny, 0), tiny, 0.9, 0).remainingMs).toBe(1000);
  });

  it('ne fait rien à l’arrêt, entre deux séries ou une fois fini, ni avec une valeur absurde', () => {
    const idle = initialState(two);
    expect(seek(idle, two, 0.5, 0)).toBe(idle);
    const done: TimerState = { phase: 'done', completed: 3, remainingMs: 0, endAt: null };
    expect(seek(done, two, 0.5, 0)).toBe(done);
    const r = start(idle, two, 0);
    expect(seek(r, two, NaN, 0)).toBe(r);
  });

  it('convertit un point du cercle en fraction : haut 0, droite ¼, bas ½, gauche ¾', () => {
    expect(angleFraction(0, -10)).toBe(0);
    expect(angleFraction(10, 0)).toBeCloseTo(0.25);
    expect(angleFraction(0, 10)).toBeCloseTo(0.5);
    expect(angleFraction(-10, 0)).toBeCloseTo(0.75);
    expect(angleFraction(-0.0001, -10)).toBeGreaterThan(0.99);
    expect(angleFraction(0, 0)).toBe(0);
  });

  it('pendant un glissement, passer par le haut ne fait pas sauter de l’autre côté', () => {
    expect(unwrapFraction(0.95, 0.02)).toBe(1);
    expect(unwrapFraction(0.03, 0.97)).toBe(0);
    expect(unwrapFraction(0.3, 0.4)).toBe(0.4);
  });
});

describe('terminer la série en appuyant sur le chrono', () => {
  it('la série est comptée et le chrono attend le prochain Go à 00:00', () => {
    const s = skip(tick(running(0), config, 10_000), config);
    expect(s).toEqual({ phase: 'idle', completed: 1, remainingMs: 0, endAt: null });
  });

  it('termine tout à la dernière série', () => {
    const last: TimerState = { phase: 'running', completed: 2, remainingMs: 10_000, endAt: 10_000 };
    expect(skip(last, config)).toEqual({ phase: 'done', completed: 3, remainingMs: 0, endAt: null });
  });

  it('ne fait rien à l’arrêt ou une fois fini', () => {
    const idle = initialState(config);
    expect(skip(idle, config)).toBe(idle);
  });
});

describe('réinitialisation', () => {
  it('repart de zéro avec la durée pleine, sans série comptée', () => {
    expect(reset(config)).toEqual({ phase: 'idle', completed: 0, remainingMs: 30_000, endAt: null });
  });
});

describe('état enregistré (app fermée ou tuée par le système)', () => {
  it('restitue fidèlement chaque état valide', () => {
    const states: TimerState[] = [
      initialState(config),
      { phase: 'running', completed: 1, remainingMs: 12_000, endAt: 1_700_000_000_000 },
      { phase: 'idle', completed: 1, remainingMs: 0, endAt: null },
      { phase: 'done', completed: 3, remainingMs: 0, endAt: null },
    ];
    for (const s of states) expect(sanitizeState(JSON.parse(JSON.stringify(s)), config)).toEqual(s);
  });

  it('retombe sur un état neutre (jamais un chrono faux) si les données sont abîmées', () => {
    const neutral = initialState(config);
    const bad: unknown[] = [
      null,
      'x',
      42,
      {},
      { phase: 'running', completed: 0, remainingMs: 10, endAt: null },
      { phase: 'running', completed: 0, remainingMs: 10, endAt: NaN },
      { phase: 'running', completed: 0, remainingMs: 10, endAt: -5 },
      { phase: 'paused', completed: 0, remainingMs: 7_000, endAt: null }, // ancien état : plus de pause
      { phase: 'idle', completed: 1.5, remainingMs: 0, endAt: null },
      { phase: 'idle', completed: -1, remainingMs: 0, endAt: null },
      { phase: 'idle', completed: 9, remainingMs: 0, endAt: null },
      { phase: 'done', completed: 1, remainingMs: 0, endAt: null },
      { phase: 'running', completed: 3, remainingMs: 5, endAt: 10 },
      { phase: 'volé', completed: 0, remainingMs: 1, endAt: null },
    ];
    for (const raw of bad) expect(sanitizeState(raw, config)).toEqual(neutral);
  });

  it('borne un temps restant plus grand que la durée (réglages changés entre-temps)', () => {
    expect(sanitizeState({ phase: 'running', completed: 0, remainingMs: 900_000, endAt: 5_000 }, config).remainingMs).toBe(30_000);
  });

  it('un décompte interrompu dont l’heure est passée compte la série à la reprise', () => {
    const saved = sanitizeState({ phase: 'running', completed: 0, remainingMs: 20_000, endAt: 5_000 }, config);
    expect(tick(saved, config, 60_000)).toEqual({ phase: 'idle', completed: 1, remainingMs: 0, endAt: null });
    // et si l'heure n'est pas passée, le décompte continue là où il en est
    expect(tick(saved, config, 1_000).remainingMs).toBe(4_000);
  });
});
