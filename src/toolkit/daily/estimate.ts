// Daily Promo estimator: short (10–20 minute) sessions.
//
// Two different questions are kept apart:
//   1. Does a ROUND reach X×? (a property of the game)
//   2. Does a PLAYER qualify? (they must have a bet in that round, cashing out
//      at X× or later, and reach the required number of catches in time).
//
// Aviator: one crash point per round, shared by everyone. Two bets in the same
// round are not two independent outcomes: if the round reaches X×, both bets
// can, if it does not, neither can. So players' results are strongly linked,
// and "will all the slots fill" is worked out from the shared rounds, never by
// treating players as independent coins.
//
// Plinko, Keno, Mines, Goal: each bet is the player's own result. Chances come
// from the published paytables / game rules already in the toolkit
// (chanceAtLeast). The Aviator formula is never used for them.
//
// Pilot Chicken, Trader: cash-out games with a constant 97% RTP, so cashing
// out at X× succeeds 97% ÷ X of the time for each player's own bet (RTP rule,
// a model assumption, not Aviator's shared rounds).
// Keno 80: no verified per-bet model, so it shows "Insufficient data" unless
// the operator types a chance per bet.
//
// Nothing here depends on the stake. A bigger bet changes what a player wins,
// never the chance of a multiplier.

import { DEFAULT_CLOCK, meanRoundSec, reachChance, type AviatorClock } from '../../timer/clock';
import { SIM_GAMES, chanceAtLeast, type SimGame } from '../../sim/games';
import type { GameId } from '../../data/games';
import { mulberry32 } from '../../math/rng';
import { FITTED_SPEED } from '../../timer/days';

export const GAME_BY_ID: Record<string, SimGame> = Object.fromEntries(SIM_GAMES.map((g) => [g.id, g]));

/** Games whose per-bet chance comes from a published paytable or rules. */
export const EXACT_GAMES: GameId[] = ['plinko', 'mines', 'goal', 'keno', 'dice', 'hi-lo'];
/**
 * Cash-out games with a constant 97% RTP: cashing out at X× must succeed
 * RTP ÷ X of the time (otherwise the return at X× would not be the RTP).
 * Each player's own result; not Aviator's shared rounds. Model assumption.
 */
export const RTP_GAMES: GameId[] = ['pilot-chicken', 'trader', 'balloon'];
/** Every game the planner can estimate (besides Aviator). */
export const MODEL_GAMES: GameId[] = [...EXACT_GAMES, ...RTP_GAMES];

export type ModelKind = 'shared-round' | 'own-bet' | 'none';

export function modelKind(game: GameId, chanceOverride: number | null): ModelKind {
  if (game === 'aviator') return 'shared-round';
  if (chanceOverride != null && chanceOverride > 0 && chanceOverride <= 1) return 'own-bet';
  return MODEL_GAMES.includes(game) ? 'own-bet' : 'none';
}

export interface EstMission {
  game: GameId;
  /** catch X× N times (default) · collect N× in total · place N bets. */
  kind?: 'catch' | 'collect' | 'bets';
  threshold: number | null;
  catches: number | null;
  /** Aviator: count catches per round (default) or per bet (both bets of one round count). */
  countPer: 'round' | 'bet';
  chanceOverride: number | null;
}

export interface Assumptions {
  clock: AviatorClock;
  /** Aviator bets a player places per round when counting per bet. */
  betsPerRound: 1 | 2;
  /** Bets per minute for own-bet games (model assumption, editable). */
  betsPerMin: Partial<Record<GameId, number>>;
  /** Share of Aviator rounds an active player has a bet in (0–1). */
  roundShare: number;
  /** Minutes lost switching games in bundle mode. */
  switchMin: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { clock: DEFAULT_CLOCK, betsPerRound: 2, betsPerMin: {}, roundShare: 1, switchMin: 1 };

/**
 * Bets per minute for an own-bet game: the game's base pace × the auto pace
 * fitted to the real October campaign days (FITTED_SPEED, 1.4), the same pace
 * the Mission Calculator uses, so both tools give the same minutes.
 */
export const betsPerMinFor = (game: GameId, a: Assumptions) => a.betsPerMin[game] ?? Math.round((GAME_BY_ID[game]?.betsPerMin ?? 3) * FITTED_SPEED * 10) / 10;

/** Chance a single Aviator round reaches X×: RTP / X (provably-fair formula). */
export const aviatorRoundChance = (x: number, c: AviatorClock = DEFAULT_CLOCK) => reachChance(x, c);

/** Per-bet chance of at least X× for an own-bet game, or null when unknown. */
export function ownBetChance(m: EstMission): number | null {
  if (m.chanceOverride != null && m.chanceOverride > 0 && m.chanceOverride <= 1) return m.chanceOverride;
  const g = GAME_BY_ID[m.game];
  if (!g || !MODEL_GAMES.includes(m.game) || m.threshold == null) return null;
  if (RTP_GAMES.includes(m.game)) return m.threshold > g.maxMultiplier ? 0 : Math.min(1, g.rtp / Math.max(1, m.threshold));
  const p = chanceAtLeast(g, m.threshold).p;
  return p > 0 ? p : 0;
}

/** Rounds a player needs that reach X×. Per bet with two bets, one round gives two catches. */
export const roundsNeeded = (m: EstMission, a: Assumptions) => (m.countPer === 'bet' ? Math.ceil((m.catches ?? 1) / a.betsPerRound) : (m.catches ?? 1));

// ---------- binomial helpers (exact in log space) ----------

const LG: number[] = [0];
function logFact(n: number): number {
  for (let i = LG.length; i <= n; i++) LG[i] = LG[i - 1] + Math.log(i);
  return LG[n];
}
export function binomPmf(n: number, p: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logFact(n) - logFact(k) - logFact(n - k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}
/** P(Bin(n, p) ≥ k). */
export function binomAtLeast(n: number, p: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (n > 20000) {
    const mu = n * p;
    const sd = Math.sqrt(n * p * (1 - p)) || 1e-9;
    return 1 - normCdf((k - 0.5 - mu) / sd);
  }
  let below = 0;
  for (let i = 0; i < k; i++) below += binomPmf(n, p, i);
  return Math.min(1, Math.max(0, 1 - below));
}
/** E[max(0, s − Bin(n, p))]: expected unfilled slots. */
export function expectedShortfall(n: number, p: number, s: number): number {
  let e = 0;
  for (let x = 0; x < s && x <= n; x++) e += (s - x) * binomPmf(n, p, x);
  if (s > n) e += 0; // the loop already counted x ≤ n
  return e;
}
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - q : q;
}

// ---------- individual (one player) ----------

/** Chance one player completes the mission within `minutes`. null = insufficient data. */
/** Bets one player can place in `minutes` (Aviator: rounds × bets per round × share of rounds). */
export function betsAvailable(game: GameId, minutes: number, a: Assumptions = DEFAULT_ASSUMPTIONS): number {
  if (game === 'aviator') return Math.floor(((minutes * 60) / meanRoundSec(a.clock)) * a.roundShare) * a.betsPerRound;
  return Math.floor(minutes * betsPerMinFor(game, a));
}

/** Players collect by cashing out around this multiplier (same as the main calculator). */
export const COLLECT_AT = 2;

/**
 * Collect N× in total, as an equivalent catch mission: wins of about 2× each.
 * Aviator: a round reaching 2× pays 2× on each of the player's bets in it.
 */
export function asCatch(m: EstMission, a: Assumptions = DEFAULT_ASSUMPTIONS): EstMission {
  if ((m.kind ?? 'catch') !== 'collect' || m.catches == null) return m;
  if (m.game === 'aviator') return { ...m, kind: 'catch', threshold: COLLECT_AT, countPer: 'round', catches: Math.max(1, Math.ceil(m.catches / (COLLECT_AT * a.betsPerRound))) };
  const g = GAME_BY_ID[m.game];
  const pays = m.chanceOverride == null && g && EXACT_GAMES.includes(m.game) ? chanceAtLeast(g, COLLECT_AT).pays || COLLECT_AT : COLLECT_AT;
  return { ...m, kind: 'catch', threshold: COLLECT_AT, catches: Math.max(1, Math.ceil(m.catches / pays)) };
}

export function individualChance(m0: EstMission, minutes: number, a: Assumptions = DEFAULT_ASSUMPTIONS): number | null {
  if (m0.catches == null || m0.catches < 1 || minutes <= 0) return null;
  if (m0.kind === 'bets') return betsAvailable(m0.game, minutes, a) >= m0.catches ? 1 : 0;
  const m = asCatch(m0, a);
  if (m.threshold == null || m.catches == null) return null;
  const kind = modelKind(m.game, m.chanceOverride);
  if (kind === 'none') return null;
  if (kind === 'shared-round') {
    if (m.threshold <= 1) return 1;
    const rounds = Math.floor(((minutes * 60) / meanRoundSec(a.clock)) * a.roundShare);
    return binomAtLeast(rounds, aviatorRoundChance(m.threshold, a.clock), roundsNeeded(m, a));
  }
  const p = ownBetChance(m);
  if (p == null) return null;
  return binomAtLeast(Math.floor(minutes * betsPerMinFor(m.game, a)), p, m.catches);
}

/** Minutes until a typical (median) player has finished, or null if over `cap` / unknown. */
export function medianMinutes(m: EstMission, a: Assumptions = DEFAULT_ASSUMPTIONS, cap = 600): number | null {
  if (individualChance(m, cap, a) == null || (individualChance(m, cap, a) ?? 0) < 0.5) return null;
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if ((individualChance(m, mid, a) ?? 0) >= 0.5) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------- search ----------

export interface Feasibility {
  /** Individual completion chance band, percent (heuristic). */
  minP: number;
  maxP: number;
  /** Typical player's finish time as a share of the window, percent (heuristic). */
  minFill: number;
  maxFill: number;
}
export const DEFAULT_FEASIBILITY: Feasibility = { minP: 25, maxP: 75, minFill: 40, maxFill: 90 };

export interface Suggestion {
  threshold: number;
  catches: number;
  chance: number;
  medianMin: number | null;
  why: string;
}

export const THRESHOLDS = [1.5, 2, 3, 5, 7, 10, 15, 20, 25, 30, 50, 100];

/**
 * Threshold × catch-count combinations that fit a window, best first.
 * Ranking (heuristic): closest to the middle of the chance band, typical finish
 * near the middle of the window, then a mild preference for several catches at
 * a moderate multiplier over one lucky high one (less down to a single round).
 */
export function searchFits(game: GameId, windowMin: number, f: Feasibility = DEFAULT_FEASIBILITY, a: Assumptions = DEFAULT_ASSUMPTIONS, base: Partial<EstMission> = {}, limit = 5): Suggestion[] {
  const g = GAME_BY_ID[game];
  if (!g || modelKind(game, base.chanceOverride ?? null) === 'none') return [];
  const mid = (f.minP + f.maxP) / 200;
  const out: (Suggestion & { score: number })[] = [];
  for (const x of THRESHOLDS) {
    if (x > g.maxMultiplier) continue;
    if (game !== 'aviator' && base.chanceOverride == null && (ownBetChance({ game, threshold: x, catches: 1, countPer: 'round', chanceOverride: null }) ?? 0) <= 0) continue;
    for (let k = 1; k <= 30; k++) {
      const m: EstMission = { game, threshold: x, catches: k, countPer: base.countPer ?? 'round', chanceOverride: base.chanceOverride ?? null };
      const p = individualChance(m, windowMin, a);
      if (p == null) continue;
      if (p < f.minP / 100) break; // more catches only lowers it
      if (p > f.maxP / 100) continue;
      const med = medianMinutes(m, a, windowMin * 3);
      const fill = med == null ? Infinity : (med / windowMin) * 100;
      if (fill < f.minFill || fill > f.maxFill) continue;
      const shared = game === 'aviator';
      const why =
        `${Math.round(p * 100)}% of players who ${shared ? 'bet every round' : `play at the assumed pace`} finish in ${windowMin} min ` +
        `(inside your ${f.minP}–${f.maxP}% band); a typical finisher needs about ${med!.toFixed(1)} min, ${Math.round(fill)}% of the window` +
        (shared ? `. About ${(aviatorRoundChance(x) * 100).toFixed(1)}% of rounds reach ${x}×.` : `. Chance per bet of ${x}×+: ${((ownBetChance(m) ?? 0) * 100).toFixed(2)}%.`);
      out.push({ threshold: x, catches: k, chance: p, medianMin: med, why, score: Math.abs(p - mid) + Math.abs(fill - (f.minFill + f.maxFill) / 2) / 400 + (k === 1 ? 0.12 : k === 2 ? 0.03 : 0) + Math.log10(x) * 0.03 });
    }
  }
  return out
    .sort((a1, b1) => a1.score - b1.score)
    .slice(0, limit)
    .map(({ score: _s, ...s }) => s);
}

// ---------- population (needs audience + participation) ----------

export interface Audience {
  /** Players active during a session (user input). */
  activePlayers: number | null;
  /** Share of active players who attempt a mission, percent (user input). */
  attemptShare: number | null;
}

export interface PopulationResult {
  /** null = insufficient data. */
  expectedCompletions: number | null;
  pAllFill: number | null;
  /** Median minutes until the last slot fills (runs where it filled). */
  fillMin: number | null;
  /** Share of runs where every slot filled before the end. */
  fillShare: number | null;
  expectedUnfilled: number | null;
  reason?: string;
}

export interface PoolSpec {
  missions: EstMission[];
  slots: number;
  /** Bundle: a player must finish every mission; the pool is shared. */
  bundle: boolean;
  windowMin: number;
}

const INSUFFICIENT = (reason: string): PopulationResult => ({ expectedCompletions: null, pAllFill: null, fillMin: null, fillShare: null, expectedUnfilled: null, reason });

/**
 * Monte Carlo over shared Aviator rounds. Each run draws one sequence of
 * rounds for the session; every player sees the same rounds. Given that
 * sequence, players are independent (each has a bet in a round with
 * probability roundShare), so completions are Binomial within a run.
 */
export function population(spec: PoolSpec, aud: Audience, a: Assumptions = DEFAULT_ASSUMPTIONS, runs = 300, seed = 7): PopulationResult {
  if (aud.activePlayers == null || aud.attemptShare == null) return INSUFFICIENT('Enter active players and the share who attempt it.');
  if (!spec.slots || spec.slots < 1) return INSUFFICIENT('Enter the number of winner slots.');
  for (const m of spec.missions) if (individualChance(m, spec.windowMin, a) == null) return INSUFFICIENT(`No chance model for ${GAME_BY_ID[m.game]?.name ?? m.game}: enter a chance per bet.`);
  const n = Math.round(aud.activePlayers * Math.min(1, Math.max(0, aud.attemptShare / 100)));
  const W = spec.windowMin;
  // Time each mission gets: bundle players play one after another and lose switching time.
  const k = spec.missions.length;
  const slice = (t: number) => (spec.bundle ? Math.max(0, (t - a.switchMin * (k - 1)) / k) : t);
  const rng = mulberry32(seed);
  const step = 0.25; // minutes
  const grid = Math.ceil(W / step);
  let sumE = 0;
  let sumP = 0;
  let sumU = 0;
  let filled = 0;
  const fillTimes: number[] = [];
  for (let r = 0; r < runs; r++) {
    // Shared Aviator rounds for this run: times (minutes) when each round's flight ends and its crash point.
    const rounds: { t0: number; crash: number }[] = [];
    let t = 0;
    while (t < W * 60) {
      const crash = Math.max(1, a.clock.rtp / Math.max(1e-12, rng()));
      const start = t + a.clock.betSec;
      rounds.push({ t0: start, crash });
      t = start + Math.log(crash) / a.clock.k + a.clock.pauseSec;
    }
    // Hits for an Aviator mission by time T (minutes): rounds reaching X× whose X× moment is ≤ T.
    const hitsBy = (m: EstMission, T: number) => {
      let h = 0;
      for (const rd of rounds) {
        if (rd.crash >= (m.threshold ?? 1) && rd.t0 + Math.log(m.threshold ?? 1) / a.clock.k <= T * 60) h++;
      }
      return h;
    };
    const chanceBy = (m0: EstMission, T: number) => {
      if (m0.kind === 'bets') return individualChance(m0, T, a) ?? 0;
      const m = asCatch(m0, a);
      if (m.game === 'aviator') return binomAtLeast(hitsBy(m, T), a.roundShare, roundsNeeded(m, a));
      return individualChance(m, T, a) ?? 0;
    };
    const pAt = (T: number) => {
      const s = slice(T);
      if (spec.bundle) return spec.missions.reduce((acc, m) => acc * chanceBy(m, s), 1);
      return chanceBy(spec.missions[0], s);
    };
    const pEnd = pAt(W);
    sumE += n * pEnd;
    sumP += binomAtLeast(n, pEnd, spec.slots);
    sumU += expectedShortfall(n, pEnd, spec.slots);
    if (n * pEnd >= spec.slots) {
      // first grid time where the expected count in this run reaches the slots
      let lo = 0;
      let hi = grid;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (n * pAt((mid + 1) * step) >= spec.slots) hi = mid;
        else lo = mid + 1;
      }
      filled++;
      fillTimes.push((lo + 1) * step);
    }
  }
  fillTimes.sort((x, y) => x - y);
  return {
    expectedCompletions: sumE / runs,
    pAllFill: sumP / runs,
    fillMin: fillTimes.length ? fillTimes[Math.floor(fillTimes.length / 2)] : null,
    fillShare: filled / runs,
    expectedUnfilled: sumU / runs,
  };
}

// ---------- missions sized by play time ----------

export interface TimedSuggestion {
  kind: 'catch' | 'collect' | 'bets';
  threshold: number | null;
  catches: number;
  /** Minutes a typical (median) player needs. */
  medianMin: number;
  /** Chance a player finishes within the play time. */
  chance: number;
  text: string;
}

/**
 * Missions a typical player finishes in about `playMin` minutes of play on
 * that game, best first. Catch: several catches at a moderate multiplier are
 * preferred over one lucky high one. Collect: total around 2× wins. Bets: the
 * bets that fit the play time.
 */
export function searchByTime(game: GameId, kind: 'catch' | 'collect' | 'bets', playMin: number, a: Assumptions = DEFAULT_ASSUMPTIONS, chanceOverride: number | null = null, limit = 3): TimedSuggestion[] {
  const g = GAME_BY_ID[game];
  if (!g || playMin <= 0) return [];
  const base = { game, countPer: 'round' as const, chanceOverride };
  const name = g.name;
  const pack = (m: EstMission, text: string): TimedSuggestion | null => {
    const med = medianMinutes(m, a, playMin * 4);
    if (med == null) return null;
    return { kind: (m.kind ?? 'catch') as TimedSuggestion['kind'], threshold: m.threshold, catches: m.catches!, medianMin: med, chance: individualChance(m, playMin, a) ?? 0, text };
  };
  if (kind === 'bets') {
    const n = Math.max(5, Math.floor(betsAvailable(game, playMin, a) / 5) * 5);
    const s = pack({ ...base, kind: 'bets', threshold: null, catches: n }, `${name}: place ${n} bets`);
    return s ? [s] : [];
  }
  if (modelKind(game, chanceOverride) === 'none') return [];
  const out: (TimedSuggestion & { score: number })[] = [];
  if (kind === 'collect') {
    for (let n = 5; n <= 5000; n += n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 25 : 100) {
      const s = pack({ ...base, kind: 'collect', threshold: null, catches: n }, `${name}: collect ${n}× in total`);
      if (!s) break;
      out.push({ ...s, score: Math.abs(s.medianMin - playMin) / playMin });
      if (s.medianMin > playMin * 1.5) break;
    }
  } else {
    for (const x of THRESHOLDS) {
      if (x > g.maxMultiplier) continue;
      if (game !== 'aviator' && chanceOverride == null && (ownBetChance({ ...base, threshold: x, catches: 1 }) ?? 0) <= 0) continue;
      for (let k = 1; k <= 40; k++) {
        const s = pack({ ...base, kind: 'catch', threshold: x, catches: k }, `${name}: catch ${x}× ${k} time${k === 1 ? '' : 's'}`);
        if (!s) break;
        if (s.medianMin > playMin * 1.4) break;
        const off = Math.abs(s.medianMin - playMin) / playMin;
        if (off > 0.2) continue;
        // Promo-friendly: a real multiplier (3× and up) caught a handful of times (2–12)
        // beats 1.5× caught 40 times, as long as the timing is close.
        out.push({ ...s, score: off + (x < 3 ? 0.25 : 0) + (k === 1 ? 0.1 : 0) + (k > 12 ? 0.08 + (k - 12) * 0.005 : 0) });
      }
    }
  }
  return out
    .sort((p, q) => p.score - q.score)
    .slice(0, limit)
    .map(({ score: _s, ...s }) => s);
}
