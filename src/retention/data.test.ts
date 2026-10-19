import { describe, expect, it } from 'vitest';
import { AVIATOR, GAMES, growth, perHundredAviator, total } from './data';

describe('before / during / after data', () => {
  it('matches the shared percentages', () => {
    const pc = GAMES.find((g) => g.key === 'pilot-chicken')!;
    expect((pc.withAviator.during / AVIATOR.during) * 100).toBeCloseTo(2.2, 1);
    const mines = GAMES.find((g) => g.key === 'mines')!;
    expect((mines.withAviator.before / AVIATOR.before) * 100).toBeCloseTo(0.9, 1);
  });
  it('overlap never exceeds a game’s players', () => {
    for (const g of GAMES) for (const p of ['before', 'during', 'after'] as const) expect(g.withAviator[p]).toBeLessThanOrEqual(g.players[p]);
  });
  it('promo games: 3,085 → 9,718 → 5,331 (+73%), Aviator +72%', () => {
    const promo = GAMES.filter((g) => g.promo);
    expect([total(promo, 'before'), total(promo, 'during'), total(promo, 'after')]).toEqual([3085, 9718, 5331]);
    expect(growth(total(promo, 'before'), total(promo, 'after'))).toBeCloseTo(0.728, 3);
    expect(growth(AVIATOR.before, AVIATOR.after)).toBeCloseTo(0.718, 3);
  });
  it('Pilot Chicken keeps about 3.4× its old share of Aviator players', () => {
    const pc = GAMES.find((g) => g.key === 'pilot-chicken')!;
    expect(perHundredAviator(pc.players.after, 'after') / perHundredAviator(pc.players.before, 'before')).toBeCloseTo(3.38, 1);
  });
});
