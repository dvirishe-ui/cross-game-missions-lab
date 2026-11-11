// Prize allocation for the Daily Promo.
//
// Budget-free mode (default): shares only. Each level (day, session, mission)
// gets a share of its parent, equal unless custom weights are chosen.
//   mission share = day share × session share × mission share
//   slot share    = mission share ÷ slots           (independent missions)
//   slot share    = session share ÷ shared slots    (bundle: one pool per session)
// No money appears until a budget and a currency are entered.
//
// Budget mode: integer minor units (cents). Every split uses the largest
// remainder method with ties broken by position, so the parts always add up
// to exactly the budget and the same inputs always give the same answer.

import { lengthWeight, peakFactor, type DailyPlan, type DSession } from './plan';

/** Splits an integer total by weights; parts are integers that add up to total exactly. */
export function largestRemainder(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (!n) return [];
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return largestRemainder(total, weights.map(() => 1));
  const exact = w.map((x) => (total * x) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let j = 0; left > 0; j = (j + 1) % n, left--) out[order[j].i]++;
  return out;
}

/** Minor-unit digits of a currency (USD 2, JPY 0). Unknown → 2. */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.trim().toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
export const toMinor = (amount: number, currency: string) => Math.round(amount * 10 ** minorDigits(currency));
export const fromMinor = (minor: number, currency: string) => minor / 10 ** minorDigits(currency);

export interface SlotAlloc {
  /** Share of the whole campaign pool (0–1). */
  share: number;
  /** Minor units, when a budget is set. */
  minor: number | null;
}

export interface PoolAlloc {
  key: string;
  day: number;
  session: number;
  /** -1 = the whole session (bundle pool). */
  mission: number;
  label: string;
  share: number;
  minor: number | null;
  slots: number;
  payouts: SlotAlloc[];
  /** Equal payout has a remainder spread one unit at a time. */
  remainder: number;
  /** The pool cannot give every slot a positive amount. */
  short: boolean;
}

export interface Allocation {
  budgetMinor: number | null;
  dayShares: number[];
  daysMinor: (number | null)[];
  sessionShares: number[][];
  sessionsMinor: (number | null)[][];
  pools: PoolAlloc[];
  totalMinor: number | null;
  flags: string[];
}

const weightsOf = (mode: 'equal' | 'custom', items: { weight: number | null }[]) => items.map((x) => (mode === 'custom' ? (x.weight ?? 1) : 1));
const sessionWeights = (plan: DailyPlan, items: DSession[], tz: string) =>
  plan.weights.session === 'custom'
    ? weightsOf('custom', items)
    : items.map((s) => (plan.weights.session === 'length' ? lengthWeight(plan, s.durationMin) : 1) * peakFactor(plan, s.start, tz));
const shares = (w: number[]) => {
  const s = w.reduce((a, b) => a + Math.max(0, b), 0);
  return w.map((x) => (s > 0 ? Math.max(0, x) / s : 1 / w.length));
};

/** Ranked payouts: n, n−1, …, 1. Equal: all 1. */
const slotWeights = (plan: DailyPlan, n: number) => Array.from({ length: n }, (_, i) => (plan.payout === 'ranked' ? n - i : 1));

const slotsOf = (plan: DailyPlan, s: DSession, mi: number) => (mi < 0 ? (s.bundleSlots ?? plan.template.bundleSlots) : (s.missions[mi]?.slots ?? 0));

export function allocate(plan: DailyPlan, budget: number | null, currency: string, tz = ''): Allocation {
  const flags: string[] = [];
  // Amount per session length: each session gets its own amount; the budget is their sum.
  const perLength = plan.prizeMode === 'per-length';
  const amountOf = (s: DSession) => plan.lengthAmounts[String(s.durationMin)] ?? null;
  const amountsReady = perLength && !!currency.trim() && plan.days.every((d) => d.sessions.every((s) => (amountOf(s) ?? 0) > 0));
  const sessionMinorFixed = (s: DSession) => (amountsReady ? toMinor(amountOf(s)! * peakFactor(plan, s.start, tz), currency) : null);
  const budgetMinor = perLength
    ? amountsReady
      ? plan.days.reduce((a, d) => a + d.sessions.reduce((b, s) => b + sessionMinorFixed(s)!, 0), 0)
      : null
    : budget != null && budget > 0 && currency.trim()
      ? toMinor(budget, currency)
      : null;
  const dayW = perLength ? plan.days.map((d) => d.sessions.reduce((a, s) => a + (amountsReady ? sessionMinorFixed(s)! : lengthWeight(plan, s.durationMin) * peakFactor(plan, s.start, tz)), 0)) : weightsOf(plan.weights.day, plan.days);
  const dayShares = shares(dayW);
  const daysMinor = budgetMinor != null ? largestRemainder(budgetMinor, dayW) : plan.days.map(() => null);
  const sessionShares: number[][] = [];
  const sessionsMinor: (number | null)[][] = [];
  const pools: PoolAlloc[] = [];
  plan.days.forEach((d, di) => {
    const sw = perLength ? d.sessions.map((x) => (amountsReady ? sessionMinorFixed(x)! : lengthWeight(plan, x.durationMin) * peakFactor(plan, x.start, tz))) : sessionWeights(plan, d.sessions, tz);
    const ss = shares(sw);
    sessionShares.push(ss.map((x) => x * dayShares[di]));
    const sm = daysMinor[di] != null ? largestRemainder(daysMinor[di]!, sw) : d.sessions.map(() => null);
    sessionsMinor.push(sm);
    d.sessions.forEach((s, si) => {
      const sShare = ss[si] * dayShares[di];
      const parts: { mi: number; share: number; minor: number | null }[] =
        plan.rewardMode === 'bundle'
          ? [{ mi: -1, share: sShare, minor: sm[si] }]
          : (() => {
              const mw = weightsOf(plan.weights.mission, s.missions);
              const ms = shares(mw);
              const mm = sm[si] != null ? largestRemainder(sm[si]!, mw) : s.missions.map(() => null);
              return s.missions.map((_, mi) => ({ mi, share: ms[mi] * sShare, minor: mm[mi] }));
            })();
      for (const part of parts) {
        const n = Math.max(0, Math.floor(slotsOf(plan, s, part.mi)));
        const sw2 = slotWeights(plan, n);
        const wsum = sw2.reduce((a, b) => a + b, 0) || 1;
        const pm = part.minor != null && n ? largestRemainder(part.minor, sw2) : null;
        const payouts = sw2.map((w, i) => ({ share: (part.share * w) / wsum, minor: pm ? pm[i] : null }));
        const remainder = pm && plan.payout === 'equal' && n ? part.minor! % n : 0;
        const short = pm != null && pm.some((x) => x <= 0);
        pools.push({
          key: `${di}-${si}-${part.mi}`,
          day: di,
          session: si,
          mission: part.mi,
          label: `Day ${di + 1} · Session ${si + 1}${part.mi < 0 ? ' · shared pool' : ` · Mission ${part.mi + 1}`}`,
          share: part.share,
          minor: part.minor,
          slots: n,
          payouts,
          remainder,
          short,
        });
      }
    });
  });
  if (perLength && !amountsReady) flags.push(`Enter an amount for every session length in use${currency.trim() ? '' : ' and a currency'} to see money.`);
  const short = pools.filter((p) => p.short);
  if (short.length) flags.push(`${short.length} pool${short.length === 1 ? '' : 's'} cannot give every slot a positive payout (e.g. ${short[0].label}: ${short[0].minor} minor units for ${short[0].slots} slots).`);
  const rem = pools.filter((p) => p.remainder);
  if (rem.length) flags.push(`${rem.length} pool${rem.length === 1 ? '' : 's'} do not divide evenly; the leftover minor units go one each to the first slots so the total stays exact.`);
  if (pools.some((p) => !p.slots)) flags.push('Some pools have no winner slots; their money would be unawarded.');
  const totalMinor = budgetMinor != null ? pools.reduce((a, p) => a + p.payouts.reduce((b, x) => b + (x.minor ?? 0), 0) + (p.slots ? 0 : (p.minor ?? 0)), 0) : null;
  return { budgetMinor, dayShares, daysMinor, sessionShares, sessionsMinor, pools, totalMinor, flags };
}

/** Shares if every mission had `slots` slots (equal everywhere): 5 / 10 / 20 comparison. */
export function slotScenario(missions: number, slots: number, budgetMinor: number | null) {
  const totalSlots = missions * slots;
  const missionShare = missions ? 1 / missions : 0;
  const slotShare = totalSlots ? 1 / totalSlots : 0;
  return {
    slots,
    totalSlots,
    missionShare,
    slotShare,
    slotMinorFloor: budgetMinor != null && totalSlots ? Math.floor(budgetMinor / totalSlots) : null,
  };
}

export const pct = (x: number, digits = 3) => `${(x * 100).toFixed(digits).replace(/\.?0+$/, '')}%`;
