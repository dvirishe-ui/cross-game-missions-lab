import { DAY_RESULTS } from '../data/previousCampaign';
import { simMissionsForDay } from '../sim/days';
import type { FitDay } from './model';

/**
 * Everyone plays every game at once on auto, so all players move at the same pace.
 * The model keeps a fixed pool this size: above it the last prize barely moves,
 * because the shared Aviator rounds decide it.
 */
export const AUTO_PLAYERS = 100;

/**
 * Players on auto for a given number of winners. Real days had about three
 * players who started for every winner; the pool is at least twice the
 * winners, so the last prize never waits for the very slowest player.
 */
export const playersFor = (winners: number) => Math.max(AUTO_PLAYERS, Math.ceil(winners * 2));

/** Fewer simulated days for very large pools, to keep the page quick. */
export const runsFor = (winners: number, base: number) => (winners > 2000 ? Math.round(base / 4) : winners > 500 ? Math.round(base / 2) : base);

/** Days with 50 winners: the reported duration is when the last prize went. */
export const FIT_DAYS: FitDay[] = DAY_RESULTS.filter((r) => r.winners > 0).map((r) => ({
  day: r.day,
  missions: simMissionsForDay(r.day),
  players: AUTO_PLAYERS,
  reportedMin: r.durationMin,
}));

/** Auto pace of the non-Aviator games, fitted to Days 1–5 and 7 with everyone on auto and two Aviator bets a round (see model.test.ts). */
export const FITTED_SPEED = 1.4;
