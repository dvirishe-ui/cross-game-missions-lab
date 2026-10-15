import type { GameId } from '../data/games';

// How each SPRIBE game is modelled in the simulator.
//
// - 'shared-crash': one crash result per round, shared by every player (Aviator).
// - 'aim': the player chooses when to cash out, so aiming for X wins with chance ≈ RTP / X.
// - 'paytable': fixed paytable (Keno, Plinko). RTP / X is only a best-case ceiling
//   (Markov's inequality: P(payout ≥ X) ≤ average payout / X).

export type GameKind = 'shared-crash' | 'aim' | 'paytable';

export interface SimGame {
  id: GameId;
  name: string;
  kind: GameKind;
  /** Return to player as a decimal. */
  rtp: number;
  rtpNote: string;
  /** Bets per minute for an engaged player at normal pace (Aviator: rounds per minute). Starting guess. */
  betsPerMin: number;
  /** Paytable games only: real chance as a share of the best-case ceiling (1 = best case). */
  paytableShare: number;
}

export const SIM_GAMES: SimGame[] = [
  { id: 'aviator', name: 'Aviator', kind: 'shared-crash', rtp: 0.97, rtpNote: '97% widely reported', betsPerMin: 3, paytableShare: 1 },
  { id: 'pilot-chicken', name: 'Pilot Chicken', kind: 'aim', rtp: 0.97, rtpNote: '97% reported at launch', betsPerMin: 6, paytableShare: 1 },
  { id: 'plinko', name: 'Plinko', kind: 'paytable', rtp: 0.97, rtpNote: '97% on some listings, not verified', betsPerMin: 12, paytableShare: 1 },
  { id: 'mines', name: 'Mines', kind: 'aim', rtp: 0.97, rtpNote: 'Assumed 97%, not verified', betsPerMin: 6, paytableShare: 1 },
  { id: 'goal', name: 'Goal', kind: 'aim', rtp: 0.97, rtpNote: 'Assumed 97%, not verified', betsPerMin: 6, paytableShare: 1 },
  { id: 'keno', name: 'Keno', kind: 'paytable', rtp: 0.97, rtpNote: '97% on one review site, not verified', betsPerMin: 6, paytableShare: 1 },
  { id: 'keno-80', name: 'Keno 80', kind: 'paytable', rtp: 0.97, rtpNote: 'Assumed 97%, not verified', betsPerMin: 6, paytableShare: 1 },
  { id: 'trader', name: 'Trader', kind: 'aim', rtp: 0.97, rtpNote: 'Assumed 97%, not verified', betsPerMin: 4, paytableShare: 1 },
];

export const KIND_TEXT: Record<GameKind, string> = {
  'shared-crash': 'Shared rounds: everyone sees the same result',
  aim: 'Player picks the cash-out point',
  paytable: 'Fixed paytable: best case only',
};

/** Players cash out around this multiplier when collecting a total (×). */
export const COLLECT_AIM = 2;

/** Chance that one bet (or one Aviator round) reaches at least X. */
export function chanceAtLeast(g: SimGame, x: number): number {
  if (x <= 0) return 1;
  const base = Math.min(1, g.rtp / x);
  return g.kind === 'paytable' ? base * g.paytableShare : base;
}

/** "1 in 31" style text. */
export function oneIn(p: number): string {
  if (p <= 0) return 'never';
  if (p >= 1) return 'every bet';
  const n = 1 / p;
  return `1 in ${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US')}`;
}
