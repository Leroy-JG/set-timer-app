import { describe, expect, it } from 'vitest';
import { digitsToSeconds, formatDigits, formatDuration, typedDigits } from './timeEntry';

describe('saisie de la durée chiffre après chiffre', () => {
  it('0 1 3 0 donne une minute trente', () => {
    expect(digitsToSeconds('0130')).toBe(90);
    expect(formatDigits('0130')).toBe('01:30');
  });

  it('le décompte se construit au fil des chiffres (comme un micro-ondes)', () => {
    const steps = ['0', '01', '013', '0130'].map(formatDigits);
    expect(steps).toEqual(['00:00', '00:01', '00:13', '01:30']);
  });

  it('moins de 4 chiffres : complétés par des zéros à gauche', () => {
    expect(digitsToSeconds('45')).toBe(45);
    expect(digitsToSeconds('130')).toBe(90);
    expect(formatDigits('5')).toBe('00:05');
  });

  it('au-delà de 4 chiffres, les plus anciens sortent à gauche', () => {
    expect(typedDigits('01304')).toBe('1304');
    expect(digitsToSeconds('01304')).toBe(13 * 60 + 4);
  });

  it('seulement les chiffres comptent (le texte affiché « 01:30 » peut revenir tel quel du champ)', () => {
    expect(typedDigits('01:30')).toBe('0130');
    expect(typedDigits('ab1c2')).toBe('12');
  });

  it('secondes au-dessus de 59 : reportées sur les minutes', () => {
    expect(digitsToSeconds('0090')).toBe(90);
    expect(digitsToSeconds('0199')).toBe(60 + 99);
  });

  it('borné à 00:01 – 99:59', () => {
    expect(digitsToSeconds('')).toBe(1);
    expect(digitsToSeconds('0000')).toBe(1);
    expect(digitsToSeconds('9999')).toBe(99 * 60 + 59);
  });

  it('affiche une durée en minutes et secondes', () => {
    expect(formatDuration(90)).toBe('01:30');
    expect(formatDuration(5999)).toBe('99:59');
    expect(formatDuration(0)).toBe('00:01');
  });
});
