import { DAY_RESULTS } from '../data/previousCampaign';
import { simMissionsForDay } from '../sim/days';
import type { FitDay } from './model';

/**
 * Everyone plays every game at once on auto, so all players move at the same pace.
 * The model keeps a fixed pool this size: above it the last prize barely moves,
 * because the shared Aviator rounds decide it.
 */
export const AUTO_PLAYERS = 100;

/** Days with 50 winners: the reported duration is when the last prize went. */
export const FIT_DAYS: FitDay[] = DAY_RESULTS.filter((r) => r.winners > 0).map((r) => ({
  day: r.day,
  missions: simMissionsForDay(r.day),
  players: AUTO_PLAYERS,
  reportedMin: r.durationMin,
}));
