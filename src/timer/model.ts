// When does the last prize go? Agent-based simulation of one mission day.
// Aviator rounds are generated on a real clock (see clock.ts) and shared by
// every player; the other games use per-bet chances from their paytables and
// a pace that is fitted to the reported days.

import { mulberry32, sampleNegBinomAttempts, type Rng } from '../math/rng';
import { COLLECT_AIM, missionChance, type SimMission } from '../sim/engine';
import { chanceAtLeast, type SimGame } from '../sim/games';
import { flightSec, type AviatorClock } from './clock';

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

function makeRounds(c: AviatorClock, minutes: number, rng: Rng): Rounds {
  const starts: number[] = [];
  const crashes: number[] = [];
  let t = 0;
  while (t < minutes * 60) {
    const crash = Math.max(1, c.rtp / (1 - rng()));
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

function soloTime(m: SimMission, g: SimGame, rate: number, rng: Rng): number {
  if (rate <= 0) return Infinity;
  if (m.kind === 'bets') return m.target / rate;
  if (m.kind === 'catch') {
    const p = missionChance(m, g);
    return p <= 0 ? Infinity : sampleNegBinomAttempts(m.target, p, rng) / rate;
  }
  const c = chanceAtLeast(g, COLLECT_AIM);
  return c.p <= 0 ? Infinity : sampleNegBinomAttempts(Math.ceil(m.target / c.pays), c.p, rng) / rate;
}

export function runDay(missions: SimMission[], games: Record<string, SimGame>, s: TimerSettings, rng: Rng, horizon = s.windowMin): TimerRun {
  const rounds = missions.some((m) => games[m.game].shared) ? makeRounds(s.clock, horizon, mulberry32(Math.floor(rng() * 4294967296))) : null;
  // Qualifying rounds per Aviator mission: the minute a cash-out at x is reached.
  const hits = missions.map((m) => {
    if (!rounds || !games[m.game].shared) return null;
    const { x, rounds: need } = aviatorNeed(m, games[m.game], s.betsPerRound);
    const at: number[] = [];
    const fly = flightSec(x, s.clock) / 60;
    for (let i = 0; i < rounds.crash.length; i++) if (rounds.crash[i] >= x) at.push(rounds.start[i] + fly);
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
  const quick = { ...s, runs: Math.min(s.runs, 120) };
  const at = (n: number) => simulateDay(missions.map((x, i) => (i === mission ? { ...x, target: n } : x)), games, quick);
  const key = (r: TimerResult) => (r.pAllGone < 0.5 ? Infinity : r.median);
  // Bigger targets take longer; binary search on the median.
  let lo = 1;
  let hi = Math.max(2, m.target);
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
