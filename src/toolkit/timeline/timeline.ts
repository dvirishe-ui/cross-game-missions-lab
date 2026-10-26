// Preparation timeline: milestones placed a number of days before or after
// the announcement, the campaign start or the campaign end. Defaults are
// planning suggestions only, kept in one list so they are easy to change.

import type { PromoType } from '../model/project';
import { addDays, daysBetween, validDate } from '../model/time';

export type Anchor = 'announce' | 'start' | 'end';

export interface Milestone {
  id: string;
  name: string;
  anchor: Anchor;
  /** Days relative to the anchor (negative = before). */
  offsetDays: number;
  /** Campaign announcement / start / end themselves. */
  major: boolean;
  /** A locked milestone keeps its own date when campaign dates change. */
  locked: boolean;
  lockedDate: string;
  done: boolean;
}

export interface MilestoneDefault {
  name: string;
  anchor: Anchor;
  offsetDays: number;
  /** Promotion types it applies to; empty = all. */
  types: PromoType[];
}

/**
 * Planning defaults. These are suggestions, not SPRIBE deadlines. Edit names,
 * anchors, offsets or the types they apply to here.
 */
export const MILESTONE_DEFAULTS: MilestoneDefault[] = [
  { name: 'Promotion concept finalised', anchor: 'announce', offsetDays: -21, types: [] },
  { name: 'Mission mechanics finalised', anchor: 'announce', offsetDays: -16, types: ['cross-game-mission'] },
  { name: 'Tournament mechanics finalised', anchor: 'announce', offsetDays: -16, types: ['tournament'] },
  { name: 'Prize pool confirmed', anchor: 'announce', offsetDays: -14, types: [] },
  { name: 'T&C draft ready', anchor: 'announce', offsetDays: -10, types: [] },
  { name: 'Creative brief prepared', anchor: 'announce', offsetDays: -8, types: [] },
  { name: 'T&C final approval', anchor: 'announce', offsetDays: -3, types: [] },
  { name: 'Operator communication prepared', anchor: 'announce', offsetDays: -2, types: [] },
  { name: 'Campaign announced', anchor: 'announce', offsetDays: 0, types: [] },
  { name: 'Configuration ready', anchor: 'start', offsetDays: -5, types: [] },
  { name: 'Campaign configuration QA', anchor: 'start', offsetDays: -3, types: [] },
  { name: 'Final go / no-go approval', anchor: 'start', offsetDays: -2, types: [] },
  { name: 'Operators reminded of start', anchor: 'start', offsetDays: -1, types: [] },
  { name: 'Campaign starts', anchor: 'start', offsetDays: 0, types: [] },
  { name: 'Campaign ends', anchor: 'end', offsetDays: 0, types: [] },
  { name: 'Results and payout check', anchor: 'end', offsetDays: 1, types: [] },
  { name: 'Week 2 follow-up report', anchor: 'end', offsetDays: 14, types: [] },
  { name: 'Week 4 follow-up report', anchor: 'end', offsetDays: 28, types: [] },
];

const MAJOR = new Set(['Campaign announced', 'Campaign starts', 'Campaign ends']);
const mid = () => Math.random().toString(36).slice(2, 9);

export function defaultMilestones(type: PromoType): Milestone[] {
  // Stable ids, so edits to not-yet-saved defaults find their milestone.
  return MILESTONE_DEFAULTS.filter((d) => !d.types.length || d.types.includes(type)).map((d) => ({
    id: `default-${MILESTONE_DEFAULTS.indexOf(d)}`,
    name: d.name,
    anchor: d.anchor,
    offsetDays: d.offsetDays,
    major: MAJOR.has(d.name) && d.offsetDays === 0,
    locked: false,
    lockedDate: '',
    done: false,
  }));
}

export function newMilestone(): Milestone {
  return { id: mid(), name: 'New milestone', anchor: 'start', offsetDays: -7, major: false, locked: false, lockedDate: '', done: false };
}

export interface AnchorDates {
  announce: string;
  start: string;
  end: string;
}

/**
 * Date of a milestone. An announcement-based milestone falls back to the
 * campaign start when no announcement date is set (and says so).
 */
export function milestoneDate(m: Milestone, a: AnchorDates): { date: string; fallback: boolean } {
  if (m.locked && validDate(m.lockedDate)) return { date: m.lockedDate, fallback: false };
  let base = a[m.anchor];
  let fallback = false;
  if (!validDate(base) && m.anchor === 'announce' && validDate(a.start)) {
    base = a.start;
    fallback = true;
  }
  return { date: validDate(base) ? addDays(base, m.offsetDays) : '', fallback };
}

export type Status = { kind: 'done' | 'overdue' | 'today' | 'soon' | 'later' | 'nodate'; days: number };

/** Status against the viewer's local date. "Soon" = within the next 3 days. */
export function milestoneStatus(m: Milestone, date: string, today: string): Status {
  if (m.done) return { kind: 'done', days: 0 };
  if (!validDate(date)) return { kind: 'nodate', days: 0 };
  const d = daysBetween(today, date);
  if (d < 0) return { kind: 'overdue', days: -d };
  if (d === 0) return { kind: 'today', days: 0 };
  return { kind: d <= 3 ? 'soon' : 'later', days: d };
}

/** Locks a milestone to a manually chosen date. */
export const setManualDate = (m: Milestone, date: string): Milestone => ({ ...m, locked: true, lockedDate: date });
