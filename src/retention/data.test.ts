import { describe, expect, it } from 'vitest';
import { AVIATOR, GAMES, growth, total } from './data';

describe('before / during / after data', () => {
  it('matches the shared percentages', () => {
    const pc = GAMES.find((g) => g.key === 'pilot-chicken')!;
    expect((pc.withAviator.during / AVIATOR.during) * 100).toBeCloseTo(2.2, 1);
    const plinko = GAMES.find((g) => g.key === 'plinko')!;
    expect((plinko.withAviator.before / AVIATOR.before) * 100).toBeCloseTo(1.13, 2);
    expect((plinko.withAviator.before / plinko.players.before) * 100).toBeCloseTo(39.94, 2);
  });
  it('overlap never exceeds a game’s players', () => {
    for (const g of GAMES) for (const p of ['before', 'during', 'after'] as const) expect(g.withAviator[p]).toBeLessThanOrEqual(g.players[p]);
  });
  it('promo games: 5,632 → 9,718 → 5,331 (+73% during, −5% after)', () => {
    const promo = GAMES.filter((g) => g.promo);
    expect([total(promo, 'before'), total(promo, 'during'), total(promo, 'after')]).toEqual([5632, 9718, 5331]);
    expect(growth(total(promo, 'before'), total(promo, 'during'))).toBeCloseTo(0.725, 3);
    expect(growth(total(promo, 'before'), total(promo, 'after'))).toBeCloseTo(-0.053, 3);
  });
});
