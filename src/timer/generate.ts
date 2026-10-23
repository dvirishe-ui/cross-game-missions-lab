// Ready-made task sets for the calculator: a suggested set sized for a target
// time, and a random set to explore with.

import type { GameId } from '../data/games';
import { mulberry32 } from '../math/rng';
import { COLLECT_AIM, type SimMission } from '../sim/engine';
import { chanceAtLeast, type SimGame } from '../sim/games';
import { hitsPerHour, roundsPerHour, type AviatorClock } from './clock';

const round = (v: number, step: number, min: number) => Math.max(min, Math.round(v / step) * step);

/** Expected minutes for one player on auto to finish a task. */
export function expectedMinutes(m: SimMission, g: SimGame, speed: number, clock: AviatorClock, bets: 1 | 2): number {
  if (g.shared) {
    if (m.kind === 'bets') return (Math.ceil(m.target / bets) / roundsPerHour(clock)) * 60;
    const x = m.kind === 'catch' ? m.threshold ?? 1 : COLLECT_AIM;
    const need = m.kind === 'catch' ? Math.ceil(m.target / bets) : Math.ceil(m.target / COLLECT_AIM / bets);
    return (need / hitsPerHour(x, clock)) * 60;
  }
  const rate = g.betsPerMin * speed;
  if (m.kind === 'bets') return m.target / rate;
  if (m.kind === 'catch') {
    const p = chanceAtLeast(g, m.threshold ?? 1).p;
    return p > 0 ? m.target / p / rate : Infinity;
  }
  const c = chanceAtLeast(g, COLLECT_AIM);
  return Math.ceil(m.target / c.pays) / c.p / rate;
}

/**
 * Six tasks like the real campaign. Aviator sets the time (its rounds are
 * shared, so turnout does not move it); the others are sized to finish at
 * 50–70% of the target so they rarely decide it.
 */
export function suggestedSet(targetMin: number, games: Record<string, SimGame>, speed: number, clock: AviatorClock, bets: 1 | 2): SimMission[] {
  const T = Math.max(20, targetMin);
  const x = T >= 90 ? 30 : T >= 45 ? 20 : 10;
  const aviator: SimMission = { game: 'aviator', kind: 'catch', threshold: x, target: Math.max(bets, Math.round(((hitsPerHour(x, clock) * T) / 60) * bets * 0.95)) };
  const rate = (id: GameId) => games[id].betsPerMin * speed;
  const p10 = chanceAtLeast(games.plinko, 10).p;
  const collect = (id: GameId, share: number) => {
    const c = chanceAtLeast(games[id], COLLECT_AIM);
    return round(share * T * rate(id) * c.p * c.pays, 50, 50);
  };
  return [
    aviator,
    { game: 'plinko', kind: 'catch', threshold: 10, target: Math.max(3, Math.round(0.6 * T * rate('plinko') * p10)) },
    { game: 'mines', kind: 'collect', target: collect('mines', 0.6) },
    { game: 'keno', kind: 'bets', target: round(0.55 * T * rate('keno'), 50, 50) },
    { game: 'pilot-chicken', kind: 'bets', target: round(0.5 * T * rate('pilot-chicken'), 50, 50) },
    { game: 'trader', kind: 'collect', target: collect('trader', 0.65) },
  ];
}

const RANDOM_GAMES: GameId[] = ['pilot-chicken', 'plinko', 'mines', 'goal', 'keno', 'trader'];
const THRESHOLDS = [2, 3, 5, 10, 15, 20, 30, 50];

/** A random but finishable set of 4–6 tasks. */
export function randomSet(seed: number, games: Record<string, SimGame>): SimMission[] {
  const rng = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const n = 4 + Math.floor(rng() * 3);
  const pool = [...RANDOM_GAMES].sort(() => rng() - 0.5);
  const ids: GameId[] = rng() < 0.8 ? ['aviator', ...pool.slice(0, n - 1)] : pool.slice(0, n);
  return ids.map((id) => {
    const g = games[id];
    const kind = pick<SimMission['kind']>(['catch', 'catch', 'collect', 'bets']);
    if (kind === 'catch') {
      // Keep the chance per bet at 1 in 2,000 or better so the task can be done.
      const ok = THRESHOLDS.filter((x) => chanceAtLeast(g, x).p >= 1 / 2000);
      const threshold = pick(ok.length ? ok : [2]);
      const target = id === 'aviator' ? pick([4, 6, 10, 14, 20, 30]) : threshold >= 20 ? pick([3, 5, 10]) : pick([5, 10, 20, 30]);
      return { game: id, kind, threshold, target };
    }
    if (kind === 'collect') return { game: id, kind, target: pick([100, 150, 200, 300, 400]) };
    return { game: id, kind, target: id === 'aviator' ? pick([50, 100, 200]) : pick([100, 200, 300, 500]) };
  });
}
