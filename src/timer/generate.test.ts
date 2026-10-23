import { describe, expect, it } from 'vitest';
import { gameMap } from '../sim/engine';
import { SIM_GAMES, chanceAtLeast } from '../sim/games';
import { DEFAULT_CLOCK } from './clock';
import { randomSet, suggestedSet } from './generate';
import { simulateDay, suggestTarget } from './model';

const games = gameMap(SIM_GAMES);
const base = { players: 100, prizes: 50, windowMin: 299, betsPerRound: 2 as const, clock: DEFAULT_CLOCK, speed: 1.4, spread: 0, runs: 120, seed: 7 };

describe('task sets', () => {
  it.each([120, 180, 240])('suggested set lands near a %i-minute target', (target) => {
    const set = suggestedSet(target, games, 1.4, DEFAULT_CLOCK, 2);
    const tuned = suggestTarget(set, games, base, target, 0);
    const final = tuned ? set.map((m, i) => (i === 0 ? { ...m, target: tuned.to } : m)) : set;
    const r = simulateDay(final, games, base);
    expect(Math.abs(r.median - target)).toBeLessThan(30);
  }, 20_000);
  it('random sets only use reachable multipliers', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const m of randomSet(seed, games)) if (m.kind === 'catch') expect(chanceAtLeast(games[m.game], m.threshold!).p).toBeGreaterThanOrEqual(1 / 2000);
  });
});
