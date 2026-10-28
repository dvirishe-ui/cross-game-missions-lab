// Mission duration estimates for the Promo Checker, using the Mission
// Calculator's own model and settings (everyone on auto, shared Aviator rounds).

import { gameMap } from '../../sim/engine';
import { SIM_GAMES } from '../../sim/games';
import { DEFAULT_CLOCK } from '../../timer/clock';
import { FITTED_SPEED, playersFor, runsFor } from '../../timer/days';
import { simulateDay } from '../../timer/model';
import { dayWindowMin, dayWinners } from './campaign';
import { tasksKey, type DayConfig, type Estimate, type Project } from './project';

const GAMES = gameMap(SIM_GAMES);
const finite = (n: number) => (Number.isFinite(n) ? n : null);

export function canEstimate(p: Project, d: DayConfig): boolean {
  const w = dayWinners(p, d);
  return (
    d.tasks.length > 0 &&
    d.tasks.every((t) => t.game && Number.isFinite(t.target) && t.target >= 1 && (t.kind !== 'catch' || (Number.isFinite(t.threshold) && (t.threshold ?? 0) >= 1))) &&
    w != null &&
    w >= 1 &&
    dayWindowMin(p, d) != null
  );
}

export function estimateDay(p: Project, d: DayConfig, bets: 1 | 2 = p.calculator?.bets ?? 2): Estimate | null {
  if (!canEstimate(p, d)) return null;
  const windowMin = dayWindowMin(p, d)!;
  const prizes = dayWinners(p, d)!;
  const r = simulateDay(d.tasks, GAMES, {
    players: playersFor(prizes),
    prizes,
    windowMin,
    betsPerRound: bets,
    clock: DEFAULT_CLOCK,
    speed: FITTED_SPEED,
    spread: 0,
    runs: runsFor(prizes, 150),
    seed: 7,
  });
  return { median: finite(r.median), perTask: r.missionNthMedian.map(finite), pAllGone: r.pAllGone, windowMin, key: tasksKey(d.tasks) };
}
