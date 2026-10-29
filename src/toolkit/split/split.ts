// Prize pool split: winner ranges with an amount per winner. Suggested styles
// always add up to the pool exactly; manual edits are shown against the pool.

import { cents } from '../model/money';

export type SplitStyle = 'balanced' | 'top-heavy' | 'flat' | 'equal' | 'custom';
export type SplitMode = 'fixed' | 'percent';

/** Winners from..to (inclusive) each get `amount` (fixed) or `percent` of the pool. */
export interface PrizeRange {
  id: string;
  from: number;
  to: number;
  amount: number;
  percent: number;
}

export interface SplitState {
  pool: number | null;
  winners: number | null;
  currency: string;
  style: SplitStyle;
  mode: SplitMode;
  ranges: PrizeRange[];
}

/** How steeply prizes fall with position for each style (weight = 1 / rank^k). */
export const STYLE_STEEPNESS: Record<Exclude<SplitStyle, 'custom' | 'equal'>, number> = { balanced: 0.85, 'top-heavy': 1.35, flat: 0.25 };

/** Standard bands: 1, 2, 3, 4–10, 11–25, 26–50, 51–100, 101–250, 251–500, … */
export function standardBands(winners: number): [number, number][] {
  const edges = [1, 2, 3, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const out: [number, number][] = [];
  let from = 1;
  for (const e of edges) {
    if (from > winners) break;
    const to = Math.min(e, winners);
    out.push([from, to]);
    from = to + 1;
  }
  if (from <= winners) out.push([from, winners]);
  return out;
}

const rid = () => Math.random().toString(36).slice(2, 9);

/**
 * Suggested split: band amounts are whole currency units, never rising with
 * position; the rounding remainder goes to 1st place so the total is exact.
 */
export function suggestSplit(pool: number, winners: number, style: Exclude<SplitStyle, 'custom'>): PrizeRange[] {
  if (!(pool > 0) || !(winners >= 1)) return [];
  if (style === 'equal') return equalSplit(pool, winners);
  const k = STYLE_STEEPNESS[style];
  const bands = standardBands(Math.floor(winners));
  const weight = (r: number) => 1 / Math.pow(r, k);
  let total = 0;
  for (let r = 1; r <= winners; r++) total += weight(r);
  let prev = Infinity;
  const ranges = bands.map(([from, to]) => {
    let w = 0;
    for (let r = from; r <= to; r++) w += weight(r);
    const each = Math.min(prev, Math.floor((pool * w) / total / (to - from + 1)));
    prev = each;
    return { id: rid(), from, to, amount: each, percent: 0 };
  });
  const used = ranges.reduce((a, r) => a + r.amount * (r.to - r.from + 1), 0);
  ranges[0].amount = cents(ranges[0].amount + (pool - used));
  return ranges.map((r) => ({ ...r, percent: pool ? cents((r.amount / pool) * 100) : 0 }));
}

export const rangeSize = (r: PrizeRange) => Math.max(0, Math.floor(r.to) - Math.floor(r.from) + 1);

/** Amount per winner in a range under the current mode. */
export const perWinner = (s: SplitState, r: PrizeRange) => (s.mode === 'percent' ? cents(((s.pool ?? 0) * r.percent) / 100) : r.amount);

export interface SplitStats {
  allocated: number;
  remaining: number;
  covered: number;
  average: number;
  median: number;
  first: number;
  firstShare: number;
  top3Share: number;
  top10Share: number;
  /** Positions listed twice, positions missing, ranges whose amount rises. */
  overlaps: number[];
  gaps: number[];
  rising: string[];
}

/** Prize for each position 1..winners (0 where no range covers it). */
export function positions(s: SplitState): number[] {
  const n = Math.max(0, Math.floor(s.winners ?? 0));
  const out = new Array<number>(n).fill(0);
  for (const r of s.ranges) for (let i = Math.max(1, r.from); i <= Math.min(n, r.to); i++) out[i - 1] += perWinner(s, r);
  return out;
}

export function splitStats(s: SplitState): SplitStats {
  const pool = s.pool ?? 0;
  const n = Math.max(0, Math.floor(s.winners ?? 0));
  const seen = new Array<number>(n + 1).fill(0);
  let allocated = 0;
  for (const r of s.ranges) {
    allocated += perWinner(s, r) * rangeSize(r);
    for (let i = Math.max(1, r.from); i <= Math.min(n, r.to); i++) seen[i]++;
  }
  const overlaps: number[] = [];
  const gaps: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (seen[i] > 1) overlaps.push(i);
    if (seen[i] === 0) gaps.push(i);
  }
  const sorted = [...s.ranges].sort((a, b) => a.from - b.from);
  const rising: string[] = [];
  for (let i = 1; i < sorted.length; i++) if (perWinner(s, sorted[i]) > perWinner(s, sorted[i - 1])) rising.push(label(sorted[i]));
  const pos = positions(s);
  const sum = (k: number) => pos.slice(0, k).reduce((a, b) => a + b, 0);
  const asc = [...pos].sort((a, b) => a - b);
  const median = n ? (n % 2 ? asc[(n - 1) / 2] : (asc[n / 2 - 1] + asc[n / 2]) / 2) : 0;
  allocated = cents(allocated);
  return {
    allocated,
    remaining: cents(pool - allocated),
    covered: n - gaps.length,
    average: n ? allocated / n : 0,
    median,
    first: pos[0] ?? 0,
    firstShare: pool ? (pos[0] ?? 0) / pool : 0,
    top3Share: pool ? sum(3) / pool : 0,
    top10Share: pool ? sum(10) / pool : 0,
    overlaps,
    gaps,
    rising,
  };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const label = (r: PrizeRange) => (r.from === r.to ? ordinal(r.from) : `${ordinal(r.from)}–${ordinal(r.to)}`);

/** Puts whatever is left (or over) onto 1st place so the total equals the pool. */
export function balanceToFirst(s: SplitState): SplitState {
  const st = splitStats(s);
  const first = [...s.ranges].sort((a, b) => a.from - b.from)[0];
  if (!first || !s.pool) return s;
  const size = rangeSize(first) || 1;
  return {
    ...s,
    ranges: s.ranges.map((r) =>
      r.id !== first.id ? r : s.mode === 'percent' ? { ...r, percent: cents(r.percent + (st.remaining / s.pool! / size) * 100) } : { ...r, amount: cents(r.amount + st.remaining / size) },
    ),
  };
}

export function toCsv(s: SplitState, money: (n: number) => string): string {
  const rows = [['Positions', 'Winners', 'Prize per winner', 'Range total', 'Share of pool']];
  for (const r of [...s.ranges].sort((a, b) => a.from - b.from)) {
    const each = perWinner(s, r);
    const tot = each * rangeSize(r);
    rows.push([label(r), String(rangeSize(r)), money(each), money(tot), s.pool ? `${((tot / s.pool) * 100).toFixed(2)}%` : '']);
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

/**
 * Everyone gets the same prize. Works in cents; if the pool does not divide
 * evenly, the few leftover cents go to 1st place so the total stays exact.
 */
export function equalSplit(pool: number, winners: number): PrizeRange[] {
  const n = Math.floor(winners);
  const totalCents = Math.round(pool * 100);
  const each = Math.floor(totalCents / n);
  const extra = totalCents - each * n;
  const range = (from: number, to: number, c: number): PrizeRange => ({ id: rid(), from, to, amount: c / 100, percent: pool ? cents((c / 100 / pool) * 100) : 0 });
  if (!extra) return [range(1, n, each)];
  return n === 1 ? [range(1, 1, totalCents)] : [range(1, 1, each + extra), range(2, n, each)];
}

// ---------------------------------------------------------------------------
// Daily rewards that grow every day.
// ---------------------------------------------------------------------------

export type GrowthMode = 'steps' | 'percent';

export interface DailyGrowth {
  /** Reward per winner for each day. */
  rewards: number[];
  allocated: number;
  remaining: number;
}

/**
 * Splits a pool across days so each day pays more per winner than the day
 * before. 'steps': the last day pays about `factor` times the first, in equal
 * steps. 'percent': each day pays `factor` % more than the day before.
 * Rewards are whole currency units; what rounding leaves over goes to the
 * last days, so the total matches the pool whenever the units allow.
 */
export function growingDailyRewards(pool: number, winners: number[], mode: GrowthMode, factor: number): DailyGrowth {
  const days = winners.length;
  if (!(pool > 0) || !days || winners.some((w) => !(w >= 1))) return { rewards: winners.map(() => 0), allocated: 0, remaining: pool || 0 };
  const weights = winners.map((_, i) =>
    mode === 'percent' ? Math.pow(1 + Math.max(0, factor) / 100, i) : days === 1 ? 1 : 1 + ((Math.max(1, factor) - 1) * i) / (days - 1),
  );
  // Share of the pool per day, by weight × winners, so per-winner rewards follow the weights.
  const denom = weights.reduce((a, w, i) => a + w * winners[i], 0);
  const rewards = weights.map((w) => Math.floor((pool * w) / denom));
  for (let i = 1; i < days; i++) if (rewards[i] <= rewards[i - 1]) rewards[i] = rewards[i - 1] + 1;
  let used = rewards.reduce((a, r, i) => a + r * winners[i], 0);
  // Over the pool (tiny pools): take units back from the first days without breaking the order.
  for (let i = 0; used > pool && i < days; i++) {
    while (used > pool && rewards[i] > (i ? rewards[i - 1] + 1 : 1)) {
      rewards[i]--;
      used -= winners[i];
    }
  }
  // Leftover: whole units to the last days first (keeps every day above the one before).
  let left = pool - used;
  for (let i = days - 1; i >= 0 && left > 0; i--) {
    const add = Math.floor(left / winners[i]);
    const cap = i === days - 1 ? add : Math.min(add, (rewards[i + 1] ?? Infinity) - 1 - rewards[i]);
    if (cap > 0) {
      rewards[i] += cap;
      left -= cap * winners[i];
    }
  }
  // Then cents on the last day, if they divide evenly.
  const lastW = winners[days - 1];
  const leftCents = Math.round(left * 100);
  if (leftCents > 0 && leftCents % lastW === 0) {
    rewards[days - 1] = cents(rewards[days - 1] + leftCents / lastW / 100);
    left = 0;
  }
  const allocated = cents(rewards.reduce((a, r, i) => a + r * winners[i], 0));
  return { rewards, allocated, remaining: cents(pool - allocated) };
}
