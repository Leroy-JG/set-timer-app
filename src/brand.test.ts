import { describe, expect, it } from 'vitest';
import { checkPalette, darkSurfaces, hue, PALETTE, PIGMENTS } from './brand';

describe('famille de marque', () => {
  it("la palette de l'app respecte toutes les règles d'accord avec l'or", () => {
    expect(checkPalette(PALETTE)).toEqual([]);
  });

  it('retrouve la palette d’Alam (seule règle non tenue : secondaire / succès sombre, déjà connue)', () => {
    const ground = '#26428B';
    const palette = { ground, ...darkSurfaces(ground), secondary: PIGMENTS.turquoise };
    expect(checkPalette(palette)).toEqual(['secondaire trop proche de success sombre (ΔE < 35)']);
  });

  it('refuse un fond hors de la zone de teinte', () => {
    const ground = '#2F6B4F';
    expect(hue(ground)).toBeLessThan(210);
    expect(checkPalette({ ground, ...darkSurfaces(ground), secondary: PIGMENTS.ciel })).toContain('teinte du fond hors de 210°–350°');
  });
});
