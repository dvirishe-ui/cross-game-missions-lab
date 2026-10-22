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

describe('operator report', () => {
  it('its user changes match our during-vs-before counts within 5 points', async () => {
    const { OPERATOR_DIFF, GAMES, AVIATOR } = await import('./data');
    for (const d of OPERATOR_DIFF) {
      const ours = d.key === 'aviator' ? AVIATOR.during / AVIATOR.before - 1 : (() => { const g = GAMES.find((x) => x.key === d.key)!; return g.players.during / g.players.before - 1; })();
      expect(Math.abs(ours * 100 - d.users), d.key).toBeLessThan(5);
    }
  });
});
