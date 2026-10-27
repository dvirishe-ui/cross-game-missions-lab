// Aviator's clock: how long rounds take, so Aviator tasks can be timed in
// minutes instead of a guessed "rounds per minute". Spribe does not publish
// round timing; these values come from public measurements and models (see
// AVIATOR_SOURCES) and can be changed on the page.

export interface AviatorClock {
  /** Betting countdown before take-off (seconds). */
  betSec: number;
  /** Pause after the crash before the next countdown (seconds). */
  pauseSec: number;
  /** Growth rate: multiplier = e^(k·t), t in seconds. */
  k: number;
  rtp: number;
}

export const DEFAULT_CLOCK: AviatorClock = { betSec: 5, pauseSec: 1.5, k: 0.065, rtp: 0.97 };

/** Low and high ends of what the sources report, for the "how sure" range. */
export const CLOCK_RANGE = {
  betSec: [5, 6],
  pauseSec: [1.5, 3],
  k: [0.055, 0.075],
} as const;

export const AVIATOR_SOURCES = [
  { label: 'AviatorStats: methodology (6 s betting, doubling every 10 s, 3 s pause)', url: 'https://aviatorstats.com/aviator/methodology' },
  { label: 'CrashMath: round duration by multiplier (k ≈ 0.065, 5 s + 1.5 s)', url: 'https://crashmath.org/en/learn/average-round-duration-by-multiplier/' },
  { label: 'bestonlinecasinos.ge: Aviator maths (≈180 rounds an hour assumed)', url: 'https://bestonlinecasinos.ge/en/blog/aviator-game-explained/' },
  { label: 'aviator-games.com: 15–25 s a round incl. betting, two bets per round', url: 'https://aviator-games.com/en/spribe' },
  { label: 'N1bet: P(reach m) = 0.97 / m, ~3% instant crashes', url: 'https://n1bet-match.com/aviator/' },
];

/** Seconds from take-off until the multiplier shows x. */
export const flightSec = (x: number, c: AviatorClock) => Math.log(Math.max(1, x)) / c.k;

/**
 * Average full round in seconds. With P(crash ≥ x) = RTP / x the average of
 * ln(crash) is exactly RTP, so the average flight is RTP / k.
 */
export const meanRoundSec = (c: AviatorClock) => c.betSec + c.rtp / c.k + c.pauseSec;

export const roundsPerHour = (c: AviatorClock) => 3600 / meanRoundSec(c);

/** Chance a round reaches x. */
export const reachChance = (x: number, c: AviatorClock) => Math.min(1, c.rtp / Math.max(1, x));

/** Rounds per hour that reach x or more. */
export const hitsPerHour = (x: number, c: AviatorClock) => roundsPerHour(c) * reachChance(x, c);

/** Slowest and fastest plausible clocks from the reported ranges. */
export function clockBounds(c: AviatorClock): { slow: AviatorClock; fast: AviatorClock } {
  return {
    slow: { ...c, betSec: CLOCK_RANGE.betSec[1], pauseSec: CLOCK_RANGE.pauseSec[1], k: CLOCK_RANGE.k[0] },
    fast: { ...c, betSec: CLOCK_RANGE.betSec[0], pauseSec: CLOCK_RANGE.pauseSec[0], k: CLOCK_RANGE.k[1] },
  };
}

/**
 * Chance that at least `need` rounds reaching x have happened within `minutes`
 * (Poisson approximation of the round count). Used for quick checks such as
 * "could players have finished with one bet per round?".
 */
export function chanceAtLeastHits(need: number, x: number, minutes: number, c: AviatorClock): number {
  const lambda = (hitsPerHour(x, c) * minutes) / 60;
  if (need <= 0) return 1;
  // 1 − P(N < need), summed in log space for stability.
  let term = Math.exp(-lambda);
  let below = term;
  for (let i = 1; i < need; i++) {
    term *= lambda / i;
    below += term;
  }
  return Math.max(0, 1 - below);
}

/**
 * Trader: Spribe does not publish its round algorithm. What is known: all
 * players share one chart (two bets per round, like Aviator), RTP is 97% and
 * the maximum is 1,000×. An auto cash-out at X can only pay 97% for every X if
 * the chart's peak follows the same 0.97 / X law, so the peak uses Aviator's
 * formula capped at 1,000×. Round timing is assumed to match Aviator's
 * (candles every ~2 s, similar climb); it is not published.
 */
export const TRADER_CLOCK: AviatorClock = { betSec: 5, pauseSec: 2, k: 0.065, rtp: 0.97 };
export const TRADER_MAX = 1000;
