// Numerically stable binomial and negative-binomial helpers.
// All pmf values are built in log space (lgamma / log1p); no factorials.

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Natural log of the gamma function (Lanczos, g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

export function logChoose(n: number, k: number): number {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

/** log P(X = k) for X ~ Binomial(n, p), 0 < p < 1. */
export function logBinomPmf(k: number, n: number, p: number): number {
  return logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p);
}

/**
 * P(X >= k) for X ~ Binomial(n, p).
 * Sums whichever tail is smaller, starting next to the mode and stopping once
 * terms become negligible, so tiny tails (e.g. 1e-11) keep full precision and
 * large n (millions of entrants) stays fast.
 */
export function binomTailGE(k: number, n: number, p: number): number {
  if (!Number.isFinite(n) || n < 0 || !Number.isFinite(k)) return NaN;
  if (p < 0 || p > 1 || Number.isNaN(p)) return NaN;
  n = Math.floor(n);
  k = Math.ceil(k);
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p === 0) return 0;
  if (p === 1) return 1;
  const mean = n * p;
  if (k > mean) {
    // Upper tail: terms decrease monotonically from k upward.
    return sumTerms(k, n, p, 1);
  }
  // 1 - P(X <= k-1); terms decrease from k-1 downward.
  return Math.max(0, 1 - sumTerms(k - 1, n, p, -1));
}

function sumTerms(start: number, n: number, p: number, dir: 1 | -1): number {
  const logStart = logBinomPmf(start, n, p);
  if (logStart < -745) return 0;
  // Use ratio recurrence relative to the first term to avoid repeated lgamma.
  const odds = p / (1 - p);
  let term = 1;
  let sum = 1;
  let j = start;
  for (let i = 0; i < 1e7; i++) {
    if (dir === 1) {
      if (j >= n) break;
      term *= ((n - j) / (j + 1)) * odds;
      j += 1;
    } else {
      if (j <= 0) break;
      term *= (j / (n - j + 1)) / odds;
      j -= 1;
    }
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return Math.exp(logStart + Math.log(sum));
}

/**
 * Negative binomial in the "total attempts" convention:
 * N = attempts needed to obtain the k-th success = (failures before k-th success) + k.
 * P(N <= n) = P(Binomial(n, p) >= k).
 */
export function negBinomCdfAttempts(n: number, k: number, p: number): number {
  return binomTailGE(k, n, p);
}

/** Smallest total-attempt count n with P(N <= n) >= q. Returns Infinity when unreachable. */
export function negBinomQuantileAttempts(q: number, k: number, p: number): number {
  if (k <= 0) return 0;
  if (p <= 0) return Infinity;
  if (p >= 1) return k;
  if (q <= 0) return k;
  if (q >= 1) return Infinity;
  let lo = k - 1; // P(N <= k-1) = 0 < q
  let hi = Math.max(k, Math.ceil(k / p));
  while (negBinomCdfAttempts(hi, k, p) < q - 1e-12) {
    lo = hi;
    hi *= 2;
    if (hi > 1e13) return Infinity;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (negBinomCdfAttempts(mid, k, p) >= q - 1e-12) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Bisection for the per-attempt probability needed so P(Binomial(n,p) >= k) = target. */
export function requiredProbability(k: number, n: number, target: number): number {
  if (k <= 0) return 0;
  if (n < k) return NaN;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (binomTailGE(k, n, mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(successes: number, trials: number, z = 1.96): [number, number] {
  if (trials <= 0) return [0, 1];
  const phat = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = (phat + (z * z) / (2 * trials)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat)) / trials + (z * z) / (4 * trials * trials))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
