// Prize pool split: winner ranges with an amount per winner. Suggested styles
// always add up to the pool exactly; manual edits are shown against the pool.

import { cents } from '../model/money';

export type SplitStyle = 'balanced' | 'top-heavy' | 'flat' | 'custom';
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
export const STYLE_STEEPNESS: Record<Exclude<SplitStyle, 'custom'>, number> = { balanced: 0.85, 'top-heavy': 1.35, flat: 0.25 };

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
