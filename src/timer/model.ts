// When does the last prize go? Agent-based simulation of one mission day.
// Aviator and Trader are simulated round by round: each round's result comes
// from Aviator's provably-fair formula (provablyFair.ts), on a real clock, and
// is shared by every player. The other games use per-bet chances from their
// paytables and an auto pace fitted to the reported days.

import { mulberry32, sampleNegBinomAttempts, type Rng } from '../math/rng';
import { COLLECT_AIM, missionChance, type SimMission } from '../sim/engine';
import { chanceAtLeast, type SimGame } from '../sim/games';
import { flightSec, TRADER_CLOCK, TRADER_MAX, type AviatorClock } from './clock';
import { crashFromH, random52 } from './provablyFair';

export interface TimerSettings {
  /** Players who go for every task. */
  players: number;
  prizes: number;
  /** Length of the daily window in minutes. */
  windowMin: number;
  /** Aviator bets per player per round (the game allows two). */
  betsPerRound: 1 | 2;
  clock: AviatorClock;
  /** Pace multiplier for the non-Aviator games (fitted to the reported days). */
  speed: number;
  /** How different players' speeds are (lognormal sigma). */
  spread: number;
  runs: number;
  seed: number;
}

export interface TimerRun {
  /** Minute the last prize went, null if prizes were left at the end. */
  lastPrize: number | null;
  winners: number;
  /** Per mission: minute the prizes-th player finished it (Infinity if fewer did). */
  missionNth: number[];
}

export interface TimerResult {
  runs: TimerRun[];
  pAllGone: number;
  /** Percentiles of the last-prize minute; Infinity = prizes left at the end. */
  p10: number;
  median: number;
  p90: number;
  missionNthMedian: number[];
  /** Index of the mission that most often finished last for the winners. */
  slowest: number;
}

interface Rounds {
  /** Minute each flight starts. */
  start: Float64Array;
  crash: Float64Array;
}

/** Games played in shared rounds, with their clock and maximum multiplier. */
export const ROUND_GAMES: Record<string, { clock: (s: TimerSettings) => AviatorClock; max: number }> = {
  aviator: { clock: (s) => s.clock, max: Infinity },
  trader: { clock: () => TRADER_CLOCK, max: TRADER_MAX },
};

function makeRounds(c: AviatorClock, max: number, minutes: number, rng: Rng): Rounds {
  const starts: number[] = [];
  const crashes: number[] = [];
  let t = 0;
  while (t < minutes * 60) {
    const crash = Math.min(max, crashFromH(random52(rng), Math.round(c.rtp * 100)));
    const takeoff = t + c.betSec;
    starts.push(takeoff / 60);
    crashes.push(crash);
    t = takeoff + flightSec(crash, c) + c.pauseSec;
  }
  return { start: Float64Array.from(starts), crash: Float64Array.from(crashes) };
}

/** Threshold and number of qualifying rounds an Aviator mission needs. */
function aviatorNeed(m: SimMission, g: SimGame, bets: number): { x: number; rounds: number } {
  if (m.kind === 'bets') return { x: 1, rounds: Math.ceil(m.target / bets) };
  if (m.kind === 'collect') return { x: COLLECT_AIM, rounds: Math.ceil(m.target / COLLECT_AIM / bets) };
  const x = m.chanceOverride != null ? g.rtp / Math.max(m.chanceOverride, 1e-12) : m.threshold ?? 1;
  return { x, rounds: Math.ceil(m.target / bets) };
}

function lognormal(rng: Rng, sigma: number): number {
  const u1 = Math.max(1e-12, rng());
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
  return Math.exp(sigma * z - (sigma * sigma) / 2);
}

/** Bets to get k successes; a normal approximation once k is large (same mean and spread, much faster). */
function attempts(k: number, p: number, rng: Rng): number {
  if (k <= 40) return sampleNegBinomAttempts(k, p, rng);
  const z = Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
  return Math.max(k, k / p + z * Math.sqrt(k * (1 - p)) / p);
}

function soloTime(m: SimMission, g: SimGame, rate: number, rng: Rng): number {
  if (rate <= 0) return Infinity;
  if (m.kind === 'bets') return m.target / rate;
  if (m.kind === 'catch') {
    const p = missionChance(m, g);
    return p <= 0 ? Infinity : attempts(m.target, p, rng) / rate;
  }
  const c = chanceAtLeast(g, COLLECT_AIM);
  return c.p <= 0 ? Infinity : attempts(Math.ceil(m.target / c.pays), c.p, rng) / rate;
}

export function runDay(missions: SimMission[], games: Record<string, SimGame>, s: TimerSettings, rng: Rng, horizon = s.windowMin): TimerRun {
  // One shared round sequence per round game (Aviator, Trader).
  const rounds = new Map<string, Rounds>();
  for (const m of missions) {
    const rg = ROUND_GAMES[m.game];
    if (rg && !rounds.has(m.game)) rounds.set(m.game, makeRounds(rg.clock(s), rg.max, horizon, mulberry32(Math.floor(rng() * 4294967296))));
  }
  // Qualifying rounds per round-game mission: the minute a cash-out at x is reached.
  const hits = missions.map((m) => {
    const r = rounds.get(m.game);
    if (!r) return null;
    const { x, rounds: need } = aviatorNeed(m, games[m.game], s.betsPerRound);
    const at: number[] = [];
    const fly = flightSec(x, ROUND_GAMES[m.game].clock(s)) / 60;
    for (let i = 0; i < r.crash.length; i++) if (r.crash[i] >= x) at.push(r.start[i] + fly);
    return { at, need };
  });
  const times: number[][] = missions.map(() => []);
  const finish: number[] = [];
  for (let p = 0; p < s.players; p++) {
    const pace = lognormal(rng, s.spread);
    // A slower player sits out some Aviator rounds; nobody plays rounds faster than they happen.
    const q = Math.min(1, pace);
    let worst = 0;
    missions.forEach((m, j) => {
      const h = hits[j];
      let t: number;
      if (h) {
        t = Infinity;
        if (h.need <= 0) t = 0;
        else if (q >= 1) t = h.at.length >= h.need ? h.at[h.need - 1] : Infinity;
        else {
          let got = 0;
          for (const a of h.at) if (rng() < q && ++got >= h.need) {
            t = a;
            break;
          }
        }
      } else t = soloTime(m, games[m.game], games[m.game].betsPerMin * s.speed * pace, rng);
      times[j].push(t);
      if (t > worst) worst = t;
    });
    finish.push(worst);
  }
  finish.sort((a, b) => a - b);
  const nth = (xs: number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    return s.prizes > 0 && sorted.length >= s.prizes && sorted[s.prizes - 1] <= horizon ? sorted[s.prizes - 1] : Infinity;
  };
  const last = nth(finish);
  return {
    lastPrize: Number.isFinite(last) ? last : null,
    winners: Math.min(s.prizes, finish.filter((t) => t <= horizon).length),
    missionNth: times.map(nth),
  };
}

const pct = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];

export function simulateDay(missions: SimMission[], games: Record<string, SimGame>, s: TimerSettings, horizon = s.windowMin): TimerResult {
  const rng = mulberry32(s.seed);
  const runs: TimerRun[] = [];
  for (let i = 0; i < s.runs; i++) runs.push(runDay(missions, games, s, rng, horizon));
  const all = runs.map((r) => r.lastPrize ?? Infinity).sort((a, b) => a - b);
  const missionNthMedian = missions.map((_, j) => pct(runs.map((r) => r.missionNth[j]).sort((a, b) => a - b), 0.5));
  const lastCount = missions.map(() => 0);
  for (const r of runs) {
    let j = -1;
    r.missionNth.forEach((t, i) => {
      if (j < 0 || t > r.missionNth[j]) j = i;
    });
    if (j >= 0) lastCount[j]++;
  }
  return {
    runs,
    pAllGone: all.filter(Number.isFinite).length / runs.length,
    p10: pct(all, 0.1),
    median: pct(all, 0.5),
    p90: pct(all, 0.9),
    missionNthMedian,
    slowest: lastCount.indexOf(Math.max(...lastCount)),
  };
}

/** Share of runs where the last prize had gone by each minute (for the chance curve). */
export function goneByCurve(r: TimerResult, windowMin: number, step = 5): { t: number; p: number }[] {
  const out: { t: number; p: number }[] = [];
  for (let t = 0; t <= windowMin; t += step) out.push({ t, p: r.runs.filter((x) => x.lastPrize != null && x.lastPrize <= t).length / r.runs.length });
  return out;
}

// ---------------------------------------------------------------------------
// Fitting the pace of the non-Aviator games to the reported days.
// ---------------------------------------------------------------------------

export interface FitDay {
  day: number;
  missions: SimMission[];
  players: number;
  reportedMin: number;
}

export interface FitResult {
  speed: number;
  perDay: { day: number; reported: number; median: number; p10: number; p90: number }[];
}

const FIT_SPEEDS = Array.from({ length: 17 }, (_, i) => 0.25 * Math.pow(2, i / 4)); // 0.25 … 4

export function fitSpeed(days: FitDay[], games: Record<string, SimGame>, base: Omit<TimerSettings, 'players' | 'speed'>): FitResult {
  const horizon = base.windowMin * 2;
  const score = (speed: number) =>
    days.reduce((a, d) => {
      const r = simulateDay(d.missions, games, { ...base, players: d.players, speed }, horizon);
      const med = Number.isFinite(r.median) ? r.median : horizon * 1.5;
      return a + Math.log(med / d.reportedMin) ** 2;
    }, 0);
  let best = FIT_SPEEDS[0];
  let bestScore = Infinity;
  for (const sp of FIT_SPEEDS) {
    const sc = score(sp);
    if (sc < bestScore) {
      bestScore = sc;
      best = sp;
    }
  }
  return {
    speed: best,
    perDay: days.map((d) => {
      const r = simulateDay(d.missions, games, { ...base, players: d.players, speed: best, runs: base.runs * 2 }, horizon);
      return { day: d.day, reported: d.reportedMin, median: r.median, p10: r.p10, p90: r.p90 };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tuning: change one mission's number so the last prize lands near a target.
// ---------------------------------------------------------------------------

export interface Suggestion {
  mission: number;
  from: number;
  to: number;
  result: TimerResult;
}

export function suggestTarget(missions: SimMission[], games: Record<string, SimGame>, s: TimerSettings, targetMin: number, mission: number): Suggestion | null {
  const m = missions[mission];
  if (!m) return null;
  const quick = { ...s, runs: Math.min(s.runs, 100) };
  const at = (n: number) => simulateDay(missions.map((x, i) => (i === mission ? { ...x, target: n } : x)), games, quick);
  const key = (r: TimerResult) => (r.pAllGone < 0.5 ? Infinity : r.median);
  // Bigger targets take longer; binary search on the median, starting near the current number.
  let lo = Math.max(1, Math.floor(m.target / 2));
  let hi = Math.max(lo + 1, Math.ceil(m.target * 1.5));
  while (lo > 1 && key(at(lo)) > targetMin) lo = Math.max(1, Math.floor(lo / 2));
  while (key(at(hi)) < targetMin && hi < m.target * 64) hi *= 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (key(at(mid)) < targetMin) lo = mid;
    else hi = mid;
  }
  const rl = at(lo);
  const rh = at(hi);
  const pick = Math.abs(key(rl) - targetMin) <= Math.abs(key(rh) - targetMin) ? lo : hi;
  if (pick === m.target) return null;
  return { mission, from: m.target, to: pick, result: pick === lo ? rl : rh };
}
