import { DAY_RESULTS } from '../data/previousCampaign';
import { simMissionsForDay } from '../sim/days';
import { ENGAGED_SHARE_FROM_DATA } from '../sim/days';
import type { FitDay } from './model';

/** Players going for every task on a reported day: starters × share who finished the most-finished task. */
export const playersForDay = (day: number) => {
  const r = DAY_RESULTS.find((x) => x.day === day);
  return r ? Math.round(r.started * ENGAGED_SHARE_FROM_DATA) : 100;
};

/** Days with 50 winners: the reported duration is when the last prize went. */
export const FIT_DAYS: FitDay[] = DAY_RESULTS.filter((r) => r.winners > 0).map((r) => ({
  day: r.day,
  missions: simMissionsForDay(r.day),
  players: playersForDay(r.day),
  reportedMin: r.durationMin,
}));
