// Ready-made task sets for the calculator: a suggested set sized for a target
// time, and a random set to explore with.

import type { GameId } from '../data/games';
import { mulberry32 } from '../math/rng';
import { COLLECT_AIM, type SimMission } from '../sim/engine';
import { chanceAtLeast, type SimGame } from '../sim/games';
import { hitsPerHour, roundsPerHour, TRADER_CLOCK, type AviatorClock } from './clock';

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

// ---------------------------------------------------------------------------
// Varied sets: a different set each time (and each day), sized for a target.
// ---------------------------------------------------------------------------


const ROUND_CLOCK: Partial<Record<GameId, AviatorClock>> = { trader: TRADER_CLOCK };
const isRound = (id: GameId) => id === 'aviator' || id === 'trader';
export const PLAN_GAMES: GameId[] = ['aviator', 'trader', 'plinko', 'mines', 'goal', 'keno', 'pilot-chicken'];

/** Task kinds and multipliers that make sense for each game. */
const MENU: Record<string, { catch: number[]; kinds: SimMission['kind'][] }> = {
  aviator: { catch: [10, 20, 30, 50], kinds: ['catch', 'catch', 'collect', 'bets'] },
  trader: { catch: [10, 20, 30], kinds: ['catch', 'collect', 'bets'] },
  plinko: { catch: [5, 10, 15], kinds: ['catch', 'collect', 'bets'] },
  mines: { catch: [5, 10], kinds: ['collect', 'catch', 'bets'] },
  goal: { catch: [3, 5], kinds: ['collect', 'bets', 'catch'] },
  keno: { catch: [5, 10], kinds: ['bets', 'catch', 'collect'] },
  'pilot-chicken': { catch: [10, 20, 30], kinds: ['catch', 'collect', 'bets'] },
};

/** A task of the given kind sized so one player on auto needs about `minutes`. */
export function sizeTask(id: GameId, kind: SimMission['kind'], x: number | undefined, minutes: number, games: Record<string, SimGame>, speed: number, clock: AviatorClock, bets: 1 | 2): SimMission {
  if (isRound(id)) {
    const c = ROUND_CLOCK[id] ?? clock;
    const rounds = (roundsPerHour(c) * minutes) / 60;
    if (kind === 'bets') return { game: id, kind, target: round(rounds * bets, 10, 10) };
    if (kind === 'collect') return { game: id, kind, target: round(rounds * (c.rtp / COLLECT_AIM) * COLLECT_AIM * bets, 10, 20) };
    return { game: id, kind, threshold: x, target: Math.max(bets, Math.round(rounds * (c.rtp / (x ?? 2)) * bets)) };
  }
  const g = games[id];
  const rate = g.betsPerMin * speed;
  if (kind === 'bets') return { game: id, kind, target: round(minutes * rate, 10, 20) };
  if (kind === 'collect') {
    const c = chanceAtLeast(g, COLLECT_AIM);
    return { game: id, kind, target: round(minutes * rate * c.p * c.pays, 10, 20) };
  }
  const p = chanceAtLeast(g, x ?? 2).p;
  return { game: id, kind, threshold: x, target: Math.max(2, Math.round(minutes * rate * p)) };
}

const shuffled = <T,>(xs: T[], rng: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * A suggested day: a round game (usually Aviator) sets the time, the other
 * tasks are sized to finish at 45–75% of it. The seed picks the games, task
 * types and multipliers, so every seed (and every day) gives a different set.
 * The first task is the one to tune.
 */
export function variedSet(targetMin: number, tasks: number, seed: number, games: Record<string, SimGame>, speed: number, clock: AviatorClock, bets: 1 | 2): SimMission[] {
  const rng = mulberry32(seed);
  const T = Math.max(15, targetMin);
  const anchor: GameId = rng() < 0.75 ? 'aviator' : 'trader';
  const xs = T < 45 ? [5, 10] : T < 90 ? [10, 20] : anchor === 'aviator' ? [20, 30, 50] : [20, 30];
  const x = xs[Math.floor(rng() * xs.length)];
  const out: SimMission[] = [sizeTask(anchor, 'catch', x, T * 0.95, games, speed, clock, bets)];
  const pool = shuffled(PLAN_GAMES.filter((g) => g !== anchor), rng);
  const used = new Set<string>();
  for (let i = 0; i < Math.max(0, tasks - 1); i++) {
    const id = pool[i % pool.length];
    const menu = MENU[id];
    let kind = menu.kinds[Math.floor(rng() * menu.kinds.length)];
    for (let k = 0; used.has(`${id}|${kind}`) && k < 3; k++) kind = menu.kinds[(menu.kinds.indexOf(kind) + 1) % menu.kinds.length];
    used.add(`${id}|${kind}`);
    const cx = kind === 'catch' ? menu.catch[Math.floor(rng() * menu.catch.length)] : undefined;
    out.push(sizeTask(id, kind, cx, T * (0.45 + rng() * 0.3), games, speed, clock, bets));
  }
  return out;
}

/** A random set: any games and task types, each sized to finish somewhere in 35–95% of the target. */
export function randomTimedSet(targetMin: number, tasks: number, seed: number, games: Record<string, SimGame>, speed: number, clock: AviatorClock, bets: 1 | 2): SimMission[] {
  const rng = mulberry32(seed);
  const T = Math.max(15, targetMin);
  const pool = shuffled(PLAN_GAMES, rng);
  return Array.from({ length: Math.max(1, tasks) }, (_, i) => {
    const id = i < pool.length ? pool[i] : PLAN_GAMES[Math.floor(rng() * PLAN_GAMES.length)];
    const menu = MENU[id];
    const kind = menu.kinds[Math.floor(rng() * menu.kinds.length)];
    const cx = kind === 'catch' ? menu.catch[Math.floor(rng() * menu.catch.length)] : undefined;
    return sizeTask(id, kind, cx, T * (0.35 + rng() * 0.6), games, speed, clock, bets);
  });
}
