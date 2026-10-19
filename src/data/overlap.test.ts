import { describe, expect, it } from 'vitest';
import { OVERLAP_GAMES, OVERLAP_ROWS, maxPlayingAll, overlap, shareAlsoIn } from './overlap';

describe('cross-game overlap data', () => {
  it('has every pair, and both directions agree', () => {
    for (const a of OVERLAP_GAMES)
      for (const b of OVERLAP_GAMES) {
        if (a.key === b.key) continue;
        expect(OVERLAP_ROWS[a.key][b.key], `${a.key}→${b.key}`).toBeTypeOf('number');
        expect(OVERLAP_ROWS[a.key][b.key], `${a.key}↔${b.key}`).toBe(OVERLAP_ROWS[b.key][a.key]);
      }
  });
  it('no overlap exceeds either game’s players', () => {
    for (const a of OVERLAP_GAMES) for (const b of OVERLAP_GAMES) if (a.key !== b.key) expect(overlap(a.key, b.key)!).toBeLessThanOrEqual(Math.min(a.players, b.players));
  });
  it('matches the shared percentages', () => {
    expect(shareAlsoIn('aviator', 'mines')! * 100).toBeCloseTo(0.88, 2);
    expect(shareAlsoIn('hotline', 'aviator')! * 100).toBeCloseTo(59.38, 1);
    expect(shareAlsoIn('trader', 'pilot-chicken')! * 100).toBeCloseTo(28.7, 2);
    expect(shareAlsoIn('mines', 'goal')! * 100).toBeCloseTo(6.33, 2);
  });
  it('limits players already in every Day 7 game to 49', () => {
    const r = maxPlayingAll(['aviator', 'pilot-chicken', 'plinko', 'mines', 'trader', 'goal'])!;
    expect(r.limit).toBe(49);
  });
});
