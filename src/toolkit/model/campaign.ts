// Task types and values derived from a project (day dates, windows, prize
// pools). Derived values are computed, never typed in, so they cannot drift.

import type { GameId } from '../../data/games';
import type { MissionKind, SimMission } from '../../sim/engine';
import { SIM_GAMES } from '../../sim/games';
import { addDays, toMinutes } from './time';
import { cents } from './money';
import type { DayConfig, Project } from './project';

export const GAME_NAME: Record<string, string> = Object.fromEntries(SIM_GAMES.map((g) => [g.id, g.name]));
export const ALL_GAMES = SIM_GAMES.map((g) => g.id as GameId);

/**
 * Task types. To add one: give it an id, its fields and its wording here (and
 * a time model in the calculator if it should be estimated).
 */
export const TASK_TYPES: Record<MissionKind, { label: string; needsMultiplier: boolean; targetLabel: string; text: (t: SimMission) => string }> = {
  catch: {
    label: 'Catch multiplier',
    needsMultiplier: true,
    targetLabel: 'times',
    text: (t) => `Catch multiplier ${val(t.threshold)}x or more for ${val(t.target)} times`,
  },
  collect: { label: 'Collect total multiplier', needsMultiplier: false, targetLabel: 'total ×', text: (t) => `Collect ${val(t.target)}x in total` },
  bets: { label: 'Individual bets', needsMultiplier: false, targetLabel: 'bets', text: (t) => `Place a total of ${val(t.target)} individual bets` },
};

const val = (n: number | undefined) => (n != null && Number.isFinite(n) ? new Intl.NumberFormat('en-US').format(n) : '[MISSING: value]');

export const taskText = (t: SimMission) => TASK_TYPES[t.kind].text(t);

/** Calendar date of a day: its own date, else campaign start + index when days are consecutive. */
export function dayDate(p: Project, i: number): string {
  const d = p.days[i];
  if (d?.date) return d.date;
  return p.promo.consecutive && p.schedule.startDate ? addDays(p.schedule.startDate, i) : '';
}
export const dayStart = (p: Project, d: DayConfig) => d.start || p.schedule.dailyStart;
export const dayEnd = (p: Project, d: DayConfig) => d.end || p.schedule.dailyEnd;
export const dayWinners = (p: Project, d: DayConfig) => d.winners ?? p.prizes.winnersPerDay;

/** Length of a day's window in minutes; a window that crosses midnight wraps. */
export function dayWindowMin(p: Project, d: DayConfig): number | null {
  const a = toMinutes(dayStart(p, d));
  const b = toMinutes(dayEnd(p, d));
  if (a == null || b == null) return null;
  const w = b - a;
  return w > 0 ? w + (b % 60 === 59 ? 1 : 0) : w + 1440;
}

/** Daily prize pool = winners × reward per winner (null if either is missing). */
export function dayPool(p: Project, d: DayConfig): number | null {
  const w = dayWinners(p, d);
  return w != null && d.reward != null && Number.isFinite(w) && Number.isFinite(d.reward) ? cents(w * d.reward) : null;
}

export function calculatedTotal(p: Project): number | null {
  if (!p.days.length) return null;
  let sum = 0;
  for (const d of p.days) {
    const v = dayPool(p, d);
    if (v == null) return null;
    sum += v;
  }
  return cents(sum);
}

export const allowedGames = (p: Project): GameId[] => [...(p.games.anchor ? [p.games.anchor] : []), ...p.games.secondary.filter((g) => g !== p.games.anchor)];

/** Games actually used by the configured tasks, in first-use order. */
export function usedGames(p: Project): GameId[] {
  const out: GameId[] = [];
  for (const d of p.days) for (const t of d.tasks) if (t.game && !out.includes(t.game)) out.push(t.game);
  return out;
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
