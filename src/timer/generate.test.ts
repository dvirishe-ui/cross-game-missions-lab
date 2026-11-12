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
  it.each([[45, 36], [1440, 1150]])('a %i-minute challenge gets tasks for about %i minutes', (w, target) => {
    const s = { ...base, windowMin: w };
    const set = suggestedSet(target, games, 1.4, DEFAULT_CLOCK, 2);
    const tuned = suggestTarget(set, games, s, target, 0);
    const final = tuned ? set.map((m, i) => (i === 0 ? { ...m, target: tuned.to } : m)) : set;
    const r = simulateDay(final, games, s);
    expect(Math.abs(r.median - target) / target).toBeLessThan(0.2);
  }, 60_000);
  it('random sets only use reachable multipliers', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const m of randomSet(seed, games)) if (m.kind === 'catch') expect(chanceAtLeast(games[m.game], m.threshold!).p).toBeGreaterThanOrEqual(1 / 2000);
  });
});

describe('market-aware suggestions', () => {
  it('keeps only games the calculator can time, in the country order', async () => {
    const { marketGames } = await import('./generate');
    const { GAME_RANKING } = await import('../data/gameRanking');
    expect(marketGames(GAME_RANKING.Kenya)).toEqual(['aviator', 'plinko', 'trader', 'pilot-chicken', 'goal', 'keno', 'hi-lo', 'mines', 'dice', 'balloon']);
    expect(Object.keys(GAME_RANKING)).toHaveLength(230);
  });
  it('favours the top games of the market across many days', async () => {
    const { marketGames, variedSet } = await import('./generate');
    const { GAME_RANKING } = await import('../data/gameRanking');
    const market = marketGames(GAME_RANKING.Nigeria);
    const count: Record<string, number> = {};
    for (let seed = 1; seed <= 200; seed++) for (const m of variedSet(240, 4, seed, games, 1.4, DEFAULT_CLOCK, 2, market)) count[m.game] = (count[m.game] ?? 0) + 1;
    // Nigeria: aviator, mines, plinko, keno, goal, pilot-chicken, trader.
    expect(count.aviator).toBeGreaterThan(180); // Aviator (rank 1) sets the time on most days; Trader on some
    expect(count.mines).toBeGreaterThan(count.trader ?? 0);
    expect(count.plinko).toBeGreaterThan(count.trader ?? 0);
  });
});

describe('strict markets and cross-provider games', () => {
  it('never uses a game that is not live in the market', async () => {
    const { marketGames, variedSet, randomTimedSet } = await import('./generate');
    const { GAME_RANKING } = await import('../data/gameRanking');
    const afg = marketGames(GAME_RANKING.Afghanistan); // no Trader there
    expect(afg).not.toContain('trader');
    for (let seed = 1; seed <= 100; seed++) {
      for (const m of [...variedSet(180, 6, seed, games, 1.4, DEFAULT_CLOCK, 2, afg), ...randomTimedSet(180, 6, seed, games, 1.4, DEFAULT_CLOCK, 2, afg)]) expect(afg).toContain(m.game);
    }
    expect(marketGames(GAME_RANKING.Antarctica)).toEqual([]);
    expect(variedSet(180, 6, 1, games, 1.4, DEFAULT_CLOCK, 2, [])).toEqual([]);
  });
  it('a market with only Aviator still gets a plan', async () => {
    const { marketGames, variedSet } = await import('./generate');
    const { GAME_RANKING } = await import('../data/gameRanking');
    const only = marketGames(GAME_RANKING.Bermuda);
    expect(only).toEqual(['aviator']);
    const set = variedSet(120, 4, 3, games, 1.4, DEFAULT_CLOCK, 2, only);
    expect(set.length).toBe(4);
    expect(set.every((m) => m.game === 'aviator')).toBe(true);
  });
  it('the cross-provider boost brings Mines, Plinko and Keno in more often', async () => {
    const { marketGames, variedSet, CROSS_PROVIDER } = await import('./generate');
    const { GAME_RANKING } = await import('../data/gameRanking');
    const m = marketGames(GAME_RANKING.Kenya); // aviator, plinko, trader, pilot-chicken, goal, keno, mines
    const share = (boost: string[]) => {
      let hit = 0;
      for (let seed = 1; seed <= 300; seed++) hit += variedSet(180, 3, seed, games, 1.4, DEFAULT_CLOCK, 2, m, boost as never).filter((x) => x.game === 'mines' || x.game === 'keno').length;
      return hit;
    };
    expect(share(CROSS_PROVIDER)).toBeGreaterThan(share([]) * 1.3);
  });
});
