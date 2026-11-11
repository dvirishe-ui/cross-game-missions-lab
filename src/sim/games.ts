import type { GameId } from '../data/games';
import {
  GOAL_FIELDS,
  GOAL_SOURCES,
  KENO_PAYTABLE,
  KENO_SOURCES,
  MINES_SOURCES,
  PLINKO_SOURCES,
  PLINKO_TABLES,
  goalMultiplier,
  kenoHitChance,
  minesMultiplier,
  plinkoSlots,
} from './paytables';

// How each SPRIBE game is modelled.
// 'paytable'  Keno, Plinko: chances computed exactly from the published paytable.
// 'grid'      Mines, Goal: exact chances from the game's grid rules.
// 'crash'     Aviator, Trader, Pilot Chicken: the player cashes out at X, which
//             succeeds RTP / X of the time (Aviator's rounds are shared by everyone).
// 'grid'      also Dice (payout = 97% ÷ win chance) and Hi-Lo (each guess priced
//             to 97%, chained guesses multiply; exact from the rules).
// 'unknown'   Keno 80: no paytable found, RTP / X is only a ceiling.

export type GameKind = 'paytable' | 'grid' | 'crash' | 'unknown';

export interface Source {
  label: string;
  url: string;
}

export interface SimGame {
  id: GameId;
  name: string;
  kind: GameKind;
  rtp: number;
  rtpNote: string;
  /** Highest multiplier the game can pay. */
  maxMultiplier: number;
  /** Bets per minute for an engaged player at normal pace (Aviator: rounds per minute). Starting guess. */
  betsPerMin: number;
  /** Aviator: one result per round shared by every player. */
  shared: boolean;
  how: string;
  sources: Source[];
}

export const SIM_GAMES: SimGame[] = [
  {
    id: 'aviator',
    name: 'Aviator',
    kind: 'crash',
    rtp: 0.97,
    rtpNote: '97% (widely published)',
    maxMultiplier: 1_000_000,
    betsPerMin: 3,
    shared: true,
    how: 'Each round crashes at a random point; reaching X× happens in about 97% ÷ X of rounds. Everyone in a round sees the same result.',
    sources: [{ label: 'Spribe: Aviator', url: 'https://spribe.co/games/aviator' }],
  },
  {
    id: 'pilot-chicken',
    name: 'Pilot Chicken',
    kind: 'crash',
    rtp: 0.97,
    rtpNote: '97% (most sources)',
    maxMultiplier: 1_000_000,
    betsPerMin: 6,
    shared: false,
    how: 'Step-by-step crash across runway lanes; Easy 1.05×–25×, Medium 1.3×–1,000×, Hard 1.5×–1,000,000×. Cashing out at X× succeeds about 97% ÷ X of the time.',
    sources: [
      { label: 'eeGaming: Pilot Chicken launch', url: 'https://eegaming.org/latest-news/2026/02/20/134344/spribe-to-ruffle-feathers-with-latest-high-stakes-crash-game-pilot-chicken/' },
      { label: 'SlotCatalog: Pilot Chicken', url: 'https://slotcatalog.com/en/slots/pilot-chicken' },
    ],
  },
  {
    id: 'plinko',
    name: 'Plinko',
    kind: 'paytable',
    rtp: 0.97,
    rtpNote: '97% (matches the published tables)',
    maxMultiplier: 555,
    betsPerMin: 12,
    shared: false,
    how: '12, 14 or 16 rows and green / yellow / red risk. Exact chances from the published slot multipliers; the player picks the setup that best reaches X×.',
    sources: PLINKO_SOURCES,
  },
  {
    id: 'mines',
    name: 'Mines',
    kind: 'grid',
    rtp: 0.97,
    rtpNote: '97% (published)',
    maxMultiplier: 10_000,
    betsPerMin: 6,
    shared: false,
    how: '5×5 grid with 1–20 mines. Multiplier = 0.97 × C(25,s) ÷ C(25−m,s); the player picks mines and safe tiles to reach X×.',
    sources: MINES_SOURCES,
  },
  {
    id: 'goal',
    name: 'Goal',
    kind: 'grid',
    rtp: 0.97,
    rtpNote: '97% (published)',
    maxMultiplier: goalMultiplier(5, 10),
    betsPerMin: 6,
    shared: false,
    how: 'Small, medium or large field, one bomb per column. Largest win is 9.03× (large field, all 10 columns), so anything above 9.03× is impossible.',
    sources: GOAL_SOURCES,
  },
  {
    id: 'keno',
    name: 'Keno',
    kind: 'paytable',
    rtp: 0.97,
    rtpNote: '97% (matches the published table)',
    maxMultiplier: 100,
    betsPerMin: 6,
    shared: false,
    how: '36 numbers, 10 drawn, pick 1–10. Exact chances from the published paytable; top prize 100× (10 of 10).',
    sources: KENO_SOURCES,
  },
  {
    id: 'keno-80',
    name: 'Keno 80',
    kind: 'unknown',
    rtp: 0.97,
    rtpNote: '97% on most listings (one lists 93.6%)',
    maxMultiplier: 10_000,
    betsPerMin: 6,
    shared: false,
    how: '80 numbers, 20 drawn, pick 1–10, up to 10,000×. Full paytable not found, so 97% ÷ X is only the best case.',
    sources: [{ label: 'SlotCatalog: Keno 80 (Spribe)', url: 'https://slotcatalog.com/en/slots/Keno-80-Spribe' }],
  },
  {
    id: 'dice',
    name: 'Dice',
    kind: 'grid',
    rtp: 0.97,
    rtpNote: '97% (Spribe; one listing says 97.3%)',
    maxMultiplier: 9900,
    betsPerMin: 12,
    shared: false,
    how: 'Roll over or under a number from 0 to 100; the player sets the win chance and the payout is 97% ÷ win chance. So X× is hit on 97% ÷ X of bets, up to about 9,900×.',
    sources: [
      { label: 'Spribe: Dice', url: 'https://spribe.co/games/dice' },
      { label: 'RTPwiki: Dice (Spribe)', url: 'https://www.rtpwiki.com/games/dice-rtp/' },
    ],
  },
  {
    id: 'hi-lo',
    name: 'Hi-Lo',
    kind: 'grid',
    rtp: 0.97,
    rtpNote: '97% (Spribe)',
    maxMultiplier: 10_000,
    betsPerMin: 6,
    shared: false,
    how: 'Guess whether the next card (Ace low to King high, endless deck) is higher-or-same or lower-or-same. Each guess pays 97% × 13 ÷ winning cards (1.05× to 12.61×); correct guesses chain and multiply, skipping a card is free. Above 12.61× a player needs several guesses in a row, each costing 3%.',
    sources: [
      { label: 'Spribe: Hi-Lo', url: 'https://spribe.co/games/hi-lo' },
      { label: 'casinoslots.co.za: Hi Lo rules (every guess priced to 97%)', url: 'https://www.casinoslots.co.za/games/provably-fair/hilo/' },
    ],
  },
  {
    id: 'trader',
    name: 'Trader',
    kind: 'crash',
    rtp: 0.97,
    rtpNote: '97% (Spribe listing)',
    maxMultiplier: 1000,
    betsPerMin: 4,
    shared: false,
    how: 'Stock-chart crash game: the line moves up and down until it crashes, max 1,000×. Best estimate: auto cash-out at X× succeeds about 97% ÷ X of the time.',
    sources: [
      { label: 'SlotCatalog: Trader', url: 'https://slotcatalog.com/en/slots/trader' },
      { label: 'Gamblix: Trader rules and RTP', url: 'https://gamblix.dev/en/game/trader-spribe' },
    ],
  },
];

export const KIND_TEXT: Record<GameKind, string> = {
  paytable: 'Exact, from paytable',
  grid: 'Exact, from game rules',
  crash: 'Estimate (crash maths)',
  unknown: 'Best case only',
};

export interface Chance {
  /** Chance per bet (Aviator: per round). */
  p: number;
  /** The setup that gives this chance. */
  setup: string;
  /** Typical multiplier when it succeeds. */
  pays: number;
}

const NONE = (g: SimGame): Chance => ({ p: 0, setup: `Not possible: max ${fmtX(g.maxMultiplier)}`, pays: 0 });

export function fmtX(x: number): string {
  return `${x >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : +x.toFixed(2)}×`;
}

const cache = new Map<string, Chance>();

/** Best chance per bet of a result of at least X× (or exactly X× when exact = true). */
export function chanceAtLeast(g: SimGame, x: number, exact = false): Chance {
  const key = `${g.id}|${g.rtp}|${x}|${exact}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = compute(g, x, exact);
  cache.set(key, res);
  return res;
}

function compute(g: SimGame, x: number, exact: boolean): Chance {
  if (x <= 1) return { p: 1, setup: 'Any bet', pays: 1 };
  if (x > g.maxMultiplier + 1e-9) return NONE(g);
  const meets = (v: number) => (exact ? Math.abs(v - x) < 1e-9 : v >= x - 1e-9);
  switch (g.id) {
    case 'keno': {
      let best: Chance = NONE(g);
      for (const [picksStr, row] of Object.entries(KENO_PAYTABLE)) {
        const picks = Number(picksStr);
        let p = 0;
        let paid = 0;
        row.forEach((pay, h) => {
          if (meets(pay)) {
            const c = kenoHitChance(picks, h);
            p += c;
            paid += c * pay;
          }
        });
        if (p > best.p) best = { p, setup: `${picks} picks, ${row.findIndex((v) => meets(v))}+ hits`, pays: paid / p };
      }
      return best;
    }
    case 'plinko': {
      let best: Chance = NONE(g);
      for (const t of PLINKO_TABLES) {
        let p = 0;
        let paid = 0;
        for (const s of plinkoSlots(t)) if (meets(s.value)) {
          p += s.chance;
          paid += s.chance * s.value;
        }
        if (p > best.p) best = { p, setup: `${t.rows} rows, ${t.colour}`, pays: paid / p };
      }
      return best;
    }
    case 'mines': {
      let best: Chance = NONE(g);
      for (let m = 1; m <= 20; m++)
        for (let s = 1; s <= 25 - m; s++) {
          const mult = minesMultiplier(m, s, g.rtp);
          if (!meets(mult)) continue;
          const p = g.rtp / mult;
          if (p > best.p) best = { p, setup: `${m} mines, open ${s}`, pays: mult };
          break; // larger s only lowers the chance
        }
      return best;
    }
    case 'goal': {
      let best: Chance = NONE(g);
      for (const f of GOAL_FIELDS)
        for (let j = 1; j <= f.columns; j++) {
          const mult = goalMultiplier(f.width, j, g.rtp);
          if (!meets(mult)) continue;
          const p = g.rtp / mult;
          if (p > best.p) best = { p, setup: `${f.name} field, ${j} columns`, pays: mult };
          break;
        }
      return best;
    }
    case 'dice': {
      // Payout = RTP ÷ win chance, win chance up to 98%: pick the chance that pays exactly X.
      if (exact) return { p: g.rtp / x, setup: `Win chance ${((g.rtp / x) * 100).toFixed(2)}%`, pays: x };
      const p = Math.min(0.98, g.rtp / x);
      return { p, setup: `Win chance ${(p * 100).toFixed(2)}%`, pays: g.rtp / p };
    }
    case 'hi-lo': {
      // One guess with k of 13 ranks winning pays 0.97 × 13 / k. Chains multiply.
      // Best plan: fewest steps, each as safe as possible, whose product reaches X.
      const best = hiLoBest(x, g.rtp, exact);
      return best ?? NONE(g);
    }
    default: {
      // Crash maths: cashing out at X succeeds RTP / X of the time.
      if (exact) return { p: 0, setup: 'Exact results not modelled', pays: 0 };
      return { p: Math.min(1, g.rtp / x), setup: g.shared ? `Cash out at ${fmtX(x)} (shared round)` : `Cash out at ${fmtX(x)}`, pays: x };
    }
  }
}

/** Best chain of Hi-Lo guesses (k winning ranks each) whose payout reaches x. */
function hiLoBest(x: number, rtp: number, exact: boolean): Chance | null {
  const mult = (k: number) => (rtp * 13) / k;
  let best: { p: number; ks: number[]; pays: number } | null = null;
  // steps of up to 6 guesses, ranks k chosen in non-increasing order (order does not matter)
  const walk = (ks: number[], pays: number, p: number, maxK: number) => {
    if (ks.length && (exact ? Math.abs(pays - x) / x < 0.005 : pays >= x - 1e-9)) {
      if (!best || p > best.p) best = { p, ks: [...ks], pays };
      return;
    }
    if (ks.length >= 6 || (best && p <= best.p)) return;
    for (let k = maxK; k >= 1; k--) {
      ks.push(k);
      walk(ks, pays * mult(k), (p * k) / 13, k);
      ks.pop();
    }
  };
  walk([], 1, 1, 12);
  if (!best) return null;
  const b = best as { p: number; ks: number[]; pays: number };
  return { p: b.p, setup: `${b.ks.length} guess${b.ks.length === 1 ? '' : 'es'} (${b.ks.map((k) => `${mult(k).toFixed(2)}×`).join(' → ')})`, pays: b.pays };
}

/** "1 in 31" style text. */
export function oneIn(p: number): string {
  if (p <= 0) return 'never';
  if (p >= 1) return 'every bet';
  const n = 1 / p;
  return `1 in ${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US')}`;
}
