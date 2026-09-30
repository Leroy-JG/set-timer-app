import { describe, expect, it } from 'vitest';
import {
  canEdit,
  clampSeconds,
  clampSets,
  formatTime,
  initialState,
  pause,
  remainingFraction,
  reset,
  sanitizeConfig,
  start,
  tick,
  type TimerConfig,
} from './timer';

const config: TimerConfig = { seconds: 30, sets: 3 };

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
  it('démarre, avance, se met en pause et reprend sans perdre de temps', () => {
    let s = start(initialState(config), 1_000);
    expect(s.phase).toBe('running');
    s = tick(s, config, 11_000);
    expect(s.remainingMs).toBe(20_000);
    s = pause(s, 11_000);
    expect(s.phase).toBe('paused');
    expect(s.remainingMs).toBe(20_000);
    s = tick(s, config, 500_000); // en pause : rien ne bouge
    expect(s.remainingMs).toBe(20_000);
    s = start(s, 600_000);
    expect(s.endAt).toBe(620_000);
  });

  it('à 00:00 compte la série, se remet à la durée pleine et attend', () => {
    let s = start(initialState(config), 0);
    s = tick(s, config, 30_000);
    expect(s).toEqual({ phase: 'idle', completed: 1, remainingMs: 30_000, endAt: null });
    expect(remainingFraction(s, config)).toBe(1);
  });

  it('enchaîne toutes les séries puis passe à « done »', () => {
    let s = initialState(config);
    let now = 0;
    for (let i = 0; i < 3; i++) {
      s = start(s, now);
      now += 30_000;
      s = tick(s, config, now);
    }
    expect(s).toEqual({ phase: 'done', completed: 3, remainingMs: 0, endAt: null });
    expect(remainingFraction(s, config)).toBe(0);
    expect(start(s, now)).toBe(s);
  });

  it("rattrape le retard si l'app était en arrière-plan (une seule série comptée)", () => {
    const s = tick(start(initialState(config), 0), config, 10 * 60_000);
    expect(s.completed).toBe(1);
    expect(s.phase).toBe('idle');
  });

  it('la fraction restante va de 1 à 0', () => {
    let s = start(initialState(config), 0);
    expect(remainingFraction(s, config)).toBe(1);
    s = tick(s, config, 15_000);
    expect(remainingFraction(s, config)).toBe(0.5);
  });
});

describe('édition et réinitialisation', () => {
  it("les réglages ne changent qu'avant de commencer", () => {
    const s = initialState(config);
    expect(canEdit(s)).toBe(true);
    expect(canEdit(start(s, 0))).toBe(false);
    expect(canEdit(pause(start(s, 0), 1))).toBe(false);
    expect(canEdit(tick(start(s, 0), config, 30_000))).toBe(false); // entre deux séries
    expect(canEdit(reset(config))).toBe(true);
  });
});
