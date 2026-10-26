// Every form field that a check or a [MISSING: …] marker can point at.
// The id is the input's DOM id; the tab is the page that holds it.

export type Tab = 'calculator' | 'checker' | 'timeline' | 'tc';

export interface FieldRef {
  tab: Tab;
  id: string;
  label: string;
}

const f = (tab: Tab, id: string, label: string): FieldRef => ({ tab, id, label });

export const FIELDS = {
  name: f('checker', 'f-name', 'Promotion name'),
  slogan: f('checker', 'f-slogan', 'Slogan'),
  type: f('checker', 'f-type', 'Promotion type'),
  format: f('checker', 'f-format', 'Format'),
  declaredDays: f('checker', 'f-declared-days', 'Number of days'),
  declaredTasks: f('checker', 'f-declared-tasks', 'Tasks per day'),
  announceDate: f('checker', 'f-announce-date', 'Announcement date'),
  announceTime: f('checker', 'f-announce-time', 'Announcement time'),
  startDate: f('checker', 'f-start-date', 'Campaign start date'),
  startTime: f('checker', 'f-start-time', 'Campaign start time'),
  endDate: f('checker', 'f-end-date', 'Campaign end date'),
  endTime: f('checker', 'f-end-time', 'Campaign end time'),
  timezone: f('checker', 'f-timezone', 'Time zone'),
  dailyStart: f('checker', 'f-daily-start', 'Daily mission start'),
  dailyEnd: f('checker', 'f-daily-end', 'Daily mission end'),
  anchor: f('checker', 'f-anchor', 'Anchor game'),
  secondary: f('checker', 'f-secondary', 'Secondary games'),
  markets: f('tc', 'f-markets', 'Eligible markets'),
  operators: f('tc', 'f-operators', 'Eligible operators'),
  qualification: f('tc', 'f-qualification', 'Qualification condition'),
  currency: f('checker', 'f-currency', 'Currency'),
  totalPool: f('checker', 'f-total-pool', 'Total prize pool'),
  winnersPerDay: f('checker', 'f-winners', 'Winners per day'),
  rewardStructure: f('checker', 'f-reward-structure', 'Reward structure'),
  rewardMethod: f('checker', 'f-reward-method', 'Reward method'),
  rewardType: f('tc', 'f-reward-type', 'Reward type'),
  maxRewards: f('tc', 'f-max-rewards', 'Maximum rewards per player per mission'),
  payoutMethod: f('tc', 'f-payout-method', 'Payout method'),
  payoutHours: f('tc', 'f-payout-hours', 'Payout deadline'),
  missionTarget: f('checker', 'f-mission-target', 'Target mission duration'),
  days: f('checker', 'f-days', 'Daily missions'),
} satisfies Record<string, FieldRef>;

/** Field inside one day's card. */
export const dayField = (dayIndex: number, part: 'winners' | 'reward' | 'pool' | 'date' | 'tasks', label: string): FieldRef =>
  f('checker', `f-day-${dayIndex}-${part}`, label);
export const taskField = (dayIndex: number, taskIndex: number, label: string): FieldRef => f('checker', `f-day-${dayIndex}-task-${taskIndex}`, label);
export const slotField = (slot: string, label: string): FieldRef => f('tc', `f-slot-${slot}`, label);
