// Published SPRIBE paytables collected from public game reviews. Each table is
// only trusted if it reproduces the advertised 97% RTP with the game's own odds
// (see rtpOf* below and the tests).

// ---------------------------------------------------------------------------
// Keno: 36 numbers, 10 drawn, pick 1–10. payout[h] = multiplier for h hits.
// ---------------------------------------------------------------------------

export const KENO_NUMBERS = 36;
export const KENO_DRAWN = 10;

/** Rows confirmed complete. Index = hits. */
export const KENO_PAYTABLE: Record<number, number[]> = {
  1: [0, 3.49],
  2: [0, 1.5, 4.92],
  3: [0, 1, 2.3, 8.2],
  4: [0, 0.5, 1.82, 4.2, 21],
  5: [0, 0, 1.1, 3.75, 15, 35],
  6: [0, 0, 0.5, 2.9, 7.6, 18, 55],
  7: [0, 0, 0.25, 2.3, 4.1, 10, 31, 60],
};

/** Rows only partly published (unknown hits are missing). Used for the 100× maximum only. */
export const KENO_PARTIAL: Record<number, Record<number, number>> = {
  8: { 3: 1.4, 8: 70 },
  10: { 6: 10.2, 7: 25, 10: 100 },
};

export const KENO_SOURCES = [
  { label: 'SiGMA World: Spribe Keno review', url: 'https://sigma.world/play/games/spribe/keno/' },
  { label: 'Tribuna: Spribe Keno & Keno 80', url: 'https://tribuna.com/en/casino/blogs/spribes-keno-80-slot-review-how-to-play-and-where-to-find-ke/' },
];

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(h hits | picks) with 10 of 36 drawn. */
export function kenoHitChance(picks: number, hits: number): number {
  return (choose(KENO_DRAWN, hits) * choose(KENO_NUMBERS - KENO_DRAWN, picks - hits)) / choose(KENO_NUMBERS, picks);
}

export function rtpOfKeno(picks: number): number {
  return KENO_PAYTABLE[picks].reduce((a, pay, h) => a + pay * kenoHitChance(picks, h), 0);
}

// ---------------------------------------------------------------------------
// Plinko: rows 12/14/16, colours green/yellow/red. Slot k (0..rows) is reached
// with binomial chance C(rows,k) / 2^rows. Values listed edge → centre.
// ---------------------------------------------------------------------------

export type PlinkoColour = 'green' | 'yellow' | 'red';

export interface PlinkoTable {
  rows: number;
  colour: PlinkoColour;
  /** Edge → centre (rows/2 + 1 values); mirrored for the other half. */
  half: number[];
}

export const PLINKO_TABLES: PlinkoTable[] = [
  { rows: 12, colour: 'green', half: [11, 3.2, 1.6, 1.2, 1.1, 1, 0.5] },
  { rows: 14, colour: 'green', half: [18, 3.2, 1.6, 1.3, 1.2, 1.1, 1, 0.5] },
  { rows: 12, colour: 'red', half: [141, 25, 8.1, 2.3, 0.7, 0.2, 0] },
  { rows: 14, colour: 'red', half: [353, 49, 14, 5.3, 2.1, 0.5, 0.2, 0] },
  { rows: 16, colour: 'red', half: [555, 122, 26, 8.5, 3.5, 2, 0.5, 0.2, 0] },
];

/** Published maximums for tables whose full slot list was not found. */
export const PLINKO_MAX_ONLY = [
  { rows: 16, colour: 'green' as PlinkoColour, max: 35 },
  { rows: 12, colour: 'yellow' as PlinkoColour, max: 25 },
  { rows: 14, colour: 'yellow' as PlinkoColour, max: 55 },
  { rows: 16, colour: 'yellow' as PlinkoColour, max: 118 },
];

export const PLINKO_SOURCES = [
  { label: 'Wagermaniacs: Plinko by Spribe', url: 'https://wagermaniacs.com/plinko/' },
  { label: 'casino-plinko: Plinko Spribe', url: 'https://games.casino-plinko.com/plinko-spribe/' },
  { label: 'plinkoaus: Plinko Spribe', url: 'https://www.plinkoaus.net/game/plinko-spribe' },
  { label: 'bf1.io: Plinko by Spribe', url: 'https://bf1.io/casino/games/plinko-by-spribe' },
];

export function plinkoSlots(t: PlinkoTable): { value: number; chance: number }[] {
  const total = 2 ** t.rows;
  const out: { value: number; chance: number }[] = [];
  for (let k = 0; k <= t.rows; k++) {
    const fromEdge = Math.min(k, t.rows - k);
    out.push({ value: t.half[fromEdge], chance: choose(t.rows, k) / total });
  }
  return out;
}

export function rtpOfPlinko(t: PlinkoTable): number {
  return plinkoSlots(t).reduce((a, s) => a + s.value * s.chance, 0);
}

// ---------------------------------------------------------------------------
// Mines: 5×5 grid, 1–20 mines. Multiplier after s safe picks with m mines =
// RTP × C(25, s) / C(25 − m, s).
// ---------------------------------------------------------------------------

export const MINES_SOURCES = [
  { label: 'MinesCalc: Spribe Mines calculator', url: 'https://minescalc.com/spribe-mines-calculator/' },
  { label: 'SlotCatalog: Mines by Spribe', url: 'https://slotcatalog.com/en/slots/Mines-Spribe' },
];

export function minesMultiplier(mines: number, safe: number, rtp = 0.97): number {
  return (rtp * choose(25, safe)) / choose(25 - mines, safe);
}

// ---------------------------------------------------------------------------
// Goal: fields small (3 wide, 4 columns), medium (4 wide, 7), large (5 wide, 10),
// one bomb per column. Multiplier after j columns = RTP × (w / (w − 1))^j.
// Matches the published lists, e.g. large 1.21 … 9.03.
// ---------------------------------------------------------------------------

export const GOAL_FIELDS = [
  { name: 'Small', width: 3, columns: 4 },
  { name: 'Medium', width: 4, columns: 7 },
  { name: 'Large', width: 5, columns: 10 },
];

export const GOAL_SOURCES = [
  { label: 'Tribuna: Spribe Goal overview', url: 'https://tribuna.com/en/casino/blogs/spribe-goal-slot-overview-how-to-play-where-to-find-the-goal/' },
  { label: 'SlotZone: Goal by Spribe', url: 'https://slotzone.io/slots/goal/' },
];

export function goalMultiplier(width: number, column: number, rtp = 0.97): number {
  return rtp * (width / (width - 1)) ** column;
}
