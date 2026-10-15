import { DAY_RESULTS, missionsForDay } from '../data/previousCampaign';
import type { CalibrationDay, SimMission } from './engine';

/** The previous campaign's missions in simulator form (wording parsed from the original data). */
export function simMissionsForDay(day: number): SimMission[] {
  return missionsForDay(day).map((m) =>
    m.kind === 'multiplier'
      ? { game: m.game, kind: 'catch', target: m.target, threshold: m.threshold }
      : m.kind === 'accumulate'
        ? { game: m.game, kind: 'collect', target: m.target }
        : { game: m.game, kind: 'bets', target: m.target },
  );
}

/** Days with 50 winners: their reported duration is read as the final-prize time. */
export const CALIBRATION_DAYS: CalibrationDay[] = DAY_RESULTS.filter((r) => r.winners > 0).map((r) => ({
  day: r.day,
  missions: simMissionsForDay(r.day),
  starters: r.started,
  reportedMinutes: r.durationMin,
}));

/** Average share of starters who completed the most-completed task (reported). */
export const ENGAGED_SHARE_FROM_DATA = DAY_RESULTS.reduce((a, r) => a + r.most.completed / r.started, 0) / DAY_RESULTS.length;
