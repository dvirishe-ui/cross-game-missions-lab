// Game popularity supplied by the user (Nov 2026): one region, several
// operators. Observed data that will change; the planner keeps an editable
// copy on each plan. "Pilot" is read as Pilot Chicken.

import type { GameId } from './games';

export interface PopularityRow {
  name: string;
  /** Toolkit game, or null when the toolkit has no model for it yet. */
  game: GameId | null;
  /** 1-month retention, percent. */
  retention: number;
  betsPerPlayer: number;
}

export const POPULARITY_SOURCE = 'One region, several operators (supplied Nov 2026)';

export const POPULARITY: PopularityRow[] = [
  { name: 'Pilot', game: 'pilot-chicken', retention: 26.5, betsPerPlayer: 27.89 },
  { name: 'Mines', game: 'mines', retention: 23.24, betsPerPlayer: 55 },
  { name: 'Keno', game: 'keno', retention: 17.63, betsPerPlayer: 800 },
  { name: 'Trader', game: 'trader', retention: 17.31, betsPerPlayer: 78 },
  { name: 'Goal', game: 'goal', retention: 14.32, betsPerPlayer: 70 },
  { name: 'Hi-Lo', game: null, retention: 14.05, betsPerPlayer: 246 },
  { name: 'Plinko', game: 'plinko', retention: 10.48, betsPerPlayer: 270 },
  { name: 'Balloon', game: null, retention: 9.76, betsPerPlayer: 9.36 },
  { name: 'Dice', game: null, retention: 7.36, betsPerPlayer: 250 },
  { name: 'Hotline', game: null, retention: 4.76, betsPerPlayer: 10 },
  { name: 'Roulette', game: null, retention: 4.43, betsPerPlayer: 27 },
];

/** Retention by toolkit game. */
export const DEFAULT_POPULARITY: Record<string, number> = Object.fromEntries(POPULARITY.filter((r) => r.game).map((r) => [r.game!, r.retention]));

/** Games used by default: retention of at least this much (popular ones). */
export const POPULAR_CUTOFF = 14;
