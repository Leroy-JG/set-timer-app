import { describe, expect, it } from 'vitest';
import { liveTitle, setDoneBody } from './messages';

describe('textes des notifications', () => {
  it('annonce la série terminée, puis la dernière', () => {
    expect(setDoneBody(2, 5)).toBe('Série 2 sur 5 terminée. À toi de jouer !');
    expect(setDoneBody(5, 5)).toBe('Dernière série terminée. Bravo !');
    expect(setDoneBody(1, 1)).toBe('Dernière série terminée. Bravo !');
  });

  it('titre du compte à rebours', () => {
    expect(liveTitle(3, 8)).toBe('Série 3 sur 8');
  });
});
