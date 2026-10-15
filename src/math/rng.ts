// Seeded pseudo-random generator (mulberry32) so every simulation is reproducible.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Attempts up to and including the first success (support 1, 2, ...). */
export function sampleGeometric(p: number, rng: Rng): number {
  if (p >= 1) return 1;
  if (p <= 0) return Infinity;
  const u = 1 - rng(); // (0, 1]
  return Math.floor(Math.log(u) / Math.log1p(-p)) + 1;
}

/** Total attempts to obtain k successes (negative binomial, total-attempts convention). */
export function sampleNegBinomAttempts(k: number, p: number, rng: Rng): number {
  let total = 0;
  for (let i = 0; i < k; i++) total += sampleGeometric(p, rng);
  return total;
}

export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}
