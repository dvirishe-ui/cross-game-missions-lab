import { binomTailGE } from '../math/binomial';
import { mulberry32 } from '../math/rng';

/**
 * Largest per-bet chance of a qualifying result for which "nobody finished"
 * is still a coin flip (expected finishers ≈ ln 2). Above this, zero finishers
 * would have been unlikely.
 */
export function zeroFinisherCeiling(opts: { k: number; betsPerMin: number; minutes: number; engaged: number; spread: number; seed?: number }): number {
  const rng = mulberry32(opts.seed ?? 7);
  const paces: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const u1 = Math.max(1e-12, rng());
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
    paces.push(Math.exp(opts.spread * z - (opts.spread * opts.spread) / 2));
  }
  const expected = (p: number) => (opts.engaged * paces.reduce((a, pace) => a + binomTailGE(opts.k, Math.floor(opts.betsPerMin * pace * opts.minutes), p), 0)) / paces.length;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (expected(mid) > Math.LN2) hi = mid;
    else lo = mid;
  }
  return lo;
}
