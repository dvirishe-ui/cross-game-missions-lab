import type { GameId } from '../data/games';
import { mulberry32, sampleNegBinomAttempts, type Rng } from '../math/rng';
import { chanceAtLeast, type SimGame } from './games';

/** Players collecting a total cash out around this multiplier. */
export const COLLECT_AIM = 2;

// Agent-based simulation of one campaign day. Everyone plays all missions at
// the same time. Times are minutes from the event start.

export type MissionKind = 'catch' | 'collect' | 'bets';

export interface SimMission {
  game: GameId;
  kind: MissionKind;
  /** catch: times; collect: total ×; bets: number of bets. */
  target: number;
  /** catch only: multiplier to reach (×). */
  threshold?: number;
  /** catch only: your own chance per bet (decimal), overriding the game model. */
  chanceOverride?: number | null;
}

/** Chance per bet used for a catch mission. */
export function missionChance(m: SimMission, g: SimGame): number {
  if (m.chanceOverride != null) return m.chanceOverride;
  return chanceAtLeast(g, m.threshold ?? 1).p;
}

export interface SimSettings {
  starters: number; // players who start at least one task
  engagedShare: number; // share of starters who go for the full set (0–1)
  prizes: number;
  eventMinutes: number;
  /** How different players' speeds are (lognormal sigma). */
  spread: number;
  /** Speed multiplier applied to every game (from calibration). */
  speed: number;
  runs: number;
  seed: number;
}

export interface RunResult {
  finishTimes: number[]; // sorted, only within the event
  finalPrize: number | null; // minute the last prize went, null if not all claimed
  winners: number;
  /** Players who completed each mission by the time counting stopped. */
  missionDone: number[];
  /** Which mission was the last one finished, per winner. */
  lastMission: number[];
}

export interface SimSummary {
  runs: RunResult[];
  pAllClaimed: number;
  finalPrize: { p10: number; median: number; p90: number } | null;
  avgWinners: number;
  missionDoneMedian: number[];
  bottleneckShare: number[];
  typical: RunResult; // run closest to the median final-prize time
}

export function describeMission(m: SimMission, gameName: string): string {
  if (m.kind === 'catch') return `${gameName}: catch ${m.threshold}× or more ${m.target} times`;
  if (m.kind === 'collect') return `${gameName}: collect ${m.target}× in total`;
  return `${gameName}: place ${m.target} bets`;
}

function lognormal(rng: Rng, sigma: number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(sigma * z - (sigma * sigma) / 2);
}

function binomial(n: number, p: number, rng: Rng): number {
  let c = 0;
  for (let i = 0; i < n; i++) if (rng() < p) c++;
  return c;
}

/** Minutes for one player to finish one mission. */
function missionTime(m: SimMission, g: SimGame, pace: number, speed: number, rng: Rng, shared: SharedRounds | null): number {
  if (g.shared && shared) return sharedTime(m, g, pace, shared, rng);
  const rate = g.betsPerMin * speed * pace;
  if (rate <= 0) return Infinity;
  if (m.kind === 'bets') return m.target / rate;
  if (m.kind === 'catch') {
    const p = missionChance(m, g);
    if (p <= 0) return Infinity;
    return sampleNegBinomAttempts(m.target, p, rng) / rate;
  }
  // Collect: each successful cash-out adds roughly `pays` to the total.
  const c = chanceAtLeast(g, COLLECT_AIM);
  if (c.p <= 0) return Infinity;
  return sampleNegBinomAttempts(Math.ceil(m.target / c.pays), c.p, rng) / rate;
}

/** Shared Aviator rounds for one run: crash points are common to all players. */
interface SharedRounds {
  minutesPerRound: number;
  crash: Float64Array;
}

function makeRounds(g: SimGame, speed: number, minutes: number, seed: number): SharedRounds {
  // Own random stream, so the same luck replays at any speed.
  const rng = mulberry32(seed);
  const perMin = g.betsPerMin * speed;
  const n = Math.max(1, Math.ceil(perMin * minutes));
  const crash = new Float64Array(n);
  // P(crash ≥ x) = RTP / x: crash = RTP / (1 − U).
  for (let i = 0; i < n; i++) crash[i] = g.rtp / (1 - rng());
  return { minutesPerRound: 1 / perMin, crash };
}

function sharedTime(m: SimMission, g: SimGame, pace: number, r: SharedRounds, rng: Rng): number {
  // A slower player sits out some rounds; nobody can play rounds faster than they happen.
  const q = Math.min(1, pace);
  // An override replaces the crash maths with an equivalent threshold.
  const threshold = m.kind === 'catch' ? (m.chanceOverride != null ? g.rtp / Math.max(m.chanceOverride, 1e-12) : m.threshold ?? 1) : m.kind === 'collect' ? COLLECT_AIM : 0;
  const need = m.kind === 'collect' ? Math.ceil(m.target / COLLECT_AIM) : m.target;
  if (need <= 0) return 0;
  let got = 0;
  for (let i = 0; i < r.crash.length; i++) {
    if (r.crash[i] >= threshold && rng() < q) {
      got += 1;
      if (got >= need) return (i + 1) * r.minutesPerRound;
    }
  }
  return Infinity;
}

export function simulateRun(missions: SimMission[], games: Record<string, SimGame>, s: SimSettings, rng: Rng, horizon = s.eventMinutes): RunResult {
  const engaged = binomial(s.starters, s.engagedShare, rng);
  const shared = new Map<GameId, SharedRounds>();
  for (const m of missions) {
    const g = games[m.game];
    if (g.shared && !shared.has(m.game)) shared.set(m.game, makeRounds(g, s.speed, horizon, Math.floor(rng() * 4294967296)));
  }
  const players: { finish: number; times: number[] }[] = [];
  for (let i = 0; i < engaged; i++) {
    const pace = lognormal(rng, s.spread);
    const times = missions.map((m) => missionTime(m, games[m.game], pace, s.speed, rng, shared.get(m.game) ?? null));
    players.push({ finish: times.length ? Math.max(...times) : 0, times });
  }
  const finishTimes = players
    .map((p) => p.finish)
    .filter((t) => t <= horizon)
    .sort((a, b) => a - b);
  const finalPrize = finishTimes.length >= s.prizes && s.prizes > 0 ? finishTimes[s.prizes - 1] : null;
  const stop = finalPrize ?? horizon;
  const missionDone = missions.map((_, j) => players.filter((p) => p.times[j] <= stop).length);
  const lastMission = missions.map(() => 0);
  players
    .filter((p) => p.finish <= stop)
    .sort((a, b) => a.finish - b.finish)
    .slice(0, s.prizes)
    .forEach((p) => {
      const j = p.times.indexOf(p.finish);
      if (j >= 0) lastMission[j] += 1;
    });
  return { finishTimes, finalPrize, winners: Math.min(s.prizes, finishTimes.length), missionDone, lastMission };
}

function pct(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? pct(s, 0.5) : NaN;
};

export function simulate(missions: SimMission[], games: Record<string, SimGame>, s: SimSettings, horizon = s.eventMinutes): SimSummary {
  const rng = mulberry32(s.seed);
  const runs: RunResult[] = [];
  for (let i = 0; i < s.runs; i++) runs.push(simulateRun(missions, games, s, rng, horizon));
  const claimed = runs.filter((r) => r.finalPrize != null).map((r) => r.finalPrize!).sort((a, b) => a - b);
  const pAll = claimed.length / runs.length;
  // Final-prize percentiles over all runs; runs where prizes remain count as "after the event".
  const all = runs.map((r) => r.finalPrize ?? Infinity).sort((a, b) => a - b);
  const finalPrize = claimed.length ? { p10: pct(all, 0.1), median: pct(all, 0.5), p90: pct(all, 0.9) } : null;
  const totalLast = missions.map((_, j) => runs.reduce((a, r) => a + r.lastMission[j], 0));
  const lastSum = totalLast.reduce((a, b) => a + b, 0) || 1;
  const target = finalPrize?.median ?? Infinity;
  const typical = runs.reduce((best, r) => (Math.abs((r.finalPrize ?? Infinity) - target) < Math.abs((best.finalPrize ?? Infinity) - target) ? r : best), runs[0]);
  return {
    runs,
    pAllClaimed: pAll,
    finalPrize,
    avgWinners: runs.reduce((a, r) => a + r.winners, 0) / runs.length,
    missionDoneMedian: missions.map((_, j) => median(runs.map((r) => r.missionDone[j]))),
    bottleneckShare: totalLast.map((x) => x / lastSum),
    typical,
  };
}

// ---------------------------------------------------------------------------
// Calibration: one speed factor that best matches reported final-prize times.
// With no deadline, every time scales exactly with 1 / speed, so we simulate
// once at speed 1 and solve for the factor.
// ---------------------------------------------------------------------------

export interface CalibrationDay {
  day: number;
  missions: SimMission[];
  starters: number;
  reportedMinutes: number;
}

export interface CalibrationResult {
  speed: number;
  perDay: { day: number; reported: number; simulated: number }[];
}

export function calibrate(days: CalibrationDay[], games: Record<string, SimGame>, base: Omit<SimSettings, 'starters' | 'speed'>): CalibrationResult {
  const longHorizon = base.eventMinutes * 12;
  const atOne = days.map((d) => {
    const sum = simulate(d.missions, games, { ...base, starters: d.starters, speed: 1, runs: Math.min(base.runs, 120) }, longHorizon);
    return { d, t1: sum.finalPrize?.median ?? NaN };
  });
  const usable = atOne.filter((x) => Number.isFinite(x.t1) && x.t1 > 0);
  const logs = usable.map((x) => Math.log(x.t1 / x.d.reportedMinutes));
  const speed = usable.length ? Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length) : 1;
  return { speed, perDay: atOne.map((x) => ({ day: x.d.day, reported: x.d.reportedMinutes, simulated: x.t1 / speed })) };
}

export function gameMap(list: SimGame[]): Record<string, SimGame> {
  return Object.fromEntries(list.map((g) => [g.id, g]));
}
