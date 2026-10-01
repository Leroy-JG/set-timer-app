import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, sanitizePrefs } from './prefs';

describe('préférences', () => {
  it('tout est activé par défaut', () => {
    expect(DEFAULT_PREFS).toEqual({ sound: true, notifications: true, awake: true });
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('x')).toEqual(DEFAULT_PREFS);
  });

  it('garde les booléens valides et ignore le reste', () => {
    expect(sanitizePrefs({ sound: false, notifications: 'non', awake: 0 })).toEqual({ sound: false, notifications: true, awake: true });
    expect(sanitizePrefs({ sound: false, notifications: false, awake: false })).toEqual({ sound: false, notifications: false, awake: false });
  });
});
