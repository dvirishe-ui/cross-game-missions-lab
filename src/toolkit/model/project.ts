// The Promotion Project: one object holds everything the four tools share, so
// nothing is typed twice. Empty number fields are null, never a guessed default.

import type { GameId } from '../../data/games';
import type { SimMission } from '../../sim/engine';
import { simMissionsForDay } from '../../sim/days';
import type { Milestone } from '../timeline/timeline';
import type { SplitState } from '../split/split';

export type PromoType = 'cross-game-mission' | 'tournament' | 'other';
export type RewardMethod = 'fcfs' | 'leaderboard' | 'random-draw' | 'custom';
export type PayoutMethod = 'automatic' | 'manual' | 'custom';

export const PROMO_TYPES: { id: PromoType; label: string }[] = [
  { id: 'cross-game-mission', label: 'Cross-game mission / challenge' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'other', label: 'Other' },
];
export const REWARD_METHODS: { id: RewardMethod; label: string }[] = [
  { id: 'fcfs', label: 'First come, first served' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'random-draw', label: 'Random draw' },
  { id: 'custom', label: 'Custom' },
];
export const PAYOUT_METHODS: { id: PayoutMethod; label: string }[] = [
  { id: 'automatic', label: 'Automatic' },
  { id: 'manual', label: 'Manual' },
  { id: 'custom', label: 'Custom' },
];

/** One daily mission. Blank date/start/end fall back to the campaign schedule. */
export interface DayConfig {
  id: string;
  date: string;
  start: string;
  end: string;
  /** null = use the campaign's winners per day. */
  winners: number | null;
  reward: number | null;
  /** Optional entered daily pool; checked against winners × reward. */
  poolOverride: number | null;
  tasks: SimMission[];
}

/** What the Mission Calculator last showed for this project. */
export interface CalcState {
  missions: SimMission[];
  windowMin: number;
  targetMin: number;
  tol: number;
  prizes: number;
  bets: 1 | 2;
  source: string;
  /** Day the tasks were loaded from, if any. */
  dayId: string | null;
}

export interface Estimate {
  /** Minutes until the last prize, typical day (null = prizes left over; JSON has no Infinity). */
  median: number | null;
  /** Minutes until the prizes-th player finishes each task (null = not in time). */
  perTask: (number | null)[];
  pAllGone: number;
  windowMin: number;
  /** Tasks the estimate was made for, to spot a stale estimate. */
  key: string;
}

export interface Project {
  id: string;
  updatedAt: number;
  promo: {
    name: string;
    slogan: string;
    type: PromoType;
    format: string;
    declaredDays: number | null;
    declaredTasksPerDay: number | null;
    consecutive: boolean;
  };
  schedule: {
    announceDate: string;
    announceTime: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    timezone: string;
    dailyStart: string;
    dailyEnd: string;
  };
  games: { anchor: GameId | ''; secondary: GameId[] };
  eligibility: {
    markets: string;
    operators: string;
    conditions: string;
    joinRequired: boolean;
    verifiedOnly: boolean;
    /** "The first N eligible players to … will receive …" */
    qualification: string;
  };
  days: DayConfig[];
  prizes: {
    currency: string;
    totalPool: number | null;
    winnersPerDay: number | null;
    rewardStructure: string;
    rewardMethod: RewardMethod;
    rewardType: string;
    maxRewardsPerPlayer: number | null;
    /** Where the T&C prize structure comes from. */
    structureSource: 'daily' | 'split';
  };
  progress: { resetDaily: boolean; carryOver: boolean; updateAfterRound: boolean; refreshNote: boolean; completionDeadline: boolean };
  payout: { method: PayoutMethod; deadlineHours: number | null; currencyRule: boolean };
  clauses: { variableTasks: boolean; futureEligibility: boolean; combinable: boolean };
  /** Target length of one daily mission, in minutes (null = the daily window). */
  mission: { targetMin: number | null };
  calculator: CalcState | null;
  estimates: Record<string, Estimate>;
  split: SplitState | null;
  timeline: Milestone[] | null;
  tc: { editedText: string | null; editedBase: string | null; mode: 'brief' | 'tc' };
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function blankDay(): DayConfig {
  return { id: uid(), date: '', start: '', end: '', winners: null, reward: null, poolOverride: null, tasks: [] };
}

export function blankProject(name = 'New promotion'): Project {
  return {
    id: uid(),
    updatedAt: Date.now(),
    promo: { name, slogan: '', type: 'cross-game-mission', format: '', declaredDays: null, declaredTasksPerDay: null, consecutive: true },
    schedule: { announceDate: '', announceTime: '', startDate: '', startTime: '', endDate: '', endTime: '', timezone: '', dailyStart: '', dailyEnd: '' },
    games: { anchor: '', secondary: [] },
    eligibility: { markets: '', operators: '', conditions: '', joinRequired: true, verifiedOnly: true, qualification: 'complete all tasks' },
    days: [],
    prizes: { currency: '', totalPool: null, winnersPerDay: null, rewardStructure: '', rewardMethod: 'fcfs', rewardType: 'Cash', maxRewardsPerPlayer: 1, structureSource: 'daily' },
    progress: { resetDaily: true, carryOver: false, updateAfterRound: true, refreshNote: true, completionDeadline: true },
    payout: { method: 'automatic', deadlineHours: null, currencyRule: true },
    clauses: { variableTasks: true, futureEligibility: true, combinable: false },
    mission: { targetMin: null },
    calculator: null,
    estimates: {},
    split: null,
    timeline: null,
    tc: { editedText: null, editedBase: null, mode: 'brief' },
  };
}

/**
 * The SPRIBE Adventure campaign exactly as supplied, inconsistencies included
 * ("4 tasks per day" while Days 3–7 have six). Markets were not supplied.
 */
export function referenceProject(): Project {
  const p = blankProject('SPRIBE Adventure');
  const rewards = [25, 30, 35, 40, 50, 55, 65];
  return {
    ...p,
    promo: { name: 'SPRIBE Adventure', slogan: 'One Adventure. Multiple Games. Bigger Rewards', type: 'cross-game-mission', format: 'Daily Cross-Games Challenges', declaredDays: 7, declaredTasksPerDay: 4, consecutive: true },
    schedule: { announceDate: '2026-09-28', announceTime: '02:01', startDate: '2026-10-05', startTime: '19:00', endDate: '2026-10-11', endTime: '23:59', timezone: 'UTC', dailyStart: '19:00', dailyEnd: '23:59' },
    games: { anchor: 'aviator', secondary: ['mines', 'goal', 'plinko', 'pilot-chicken', 'keno', 'trader'] },
    days: rewards.map((reward, i) => ({ ...blankDay(), reward, tasks: simMissionsForDay(i + 1) })),
    prizes: { currency: 'USD', totalPool: 15000, winnersPerDay: 50, rewardStructure: 'Progressive Reward Structure', rewardMethod: 'fcfs', rewardType: 'Cash', maxRewardsPerPlayer: 1, structureSource: 'daily' },
    payout: { method: 'automatic', deadlineHours: 72, currencyRule: true },
  };
}

/** Fills sections a stored project is missing (older saves), keeping its values. */
export function normalize(raw: Partial<Project>): Project {
  const b = blankProject();
  const r = raw as Project;
  return {
    ...b,
    ...r,
    promo: { ...b.promo, ...r.promo },
    schedule: { ...b.schedule, ...r.schedule },
    games: { ...b.games, ...r.games },
    eligibility: { ...b.eligibility, ...r.eligibility },
    prizes: { ...b.prizes, ...r.prizes },
    progress: { ...b.progress, ...r.progress },
    payout: { ...b.payout, ...r.payout },
    clauses: { ...b.clauses, ...r.clauses },
    mission: { ...b.mission, ...r.mission },
    tc: { ...b.tc, ...r.tc },
    days: Array.isArray(r.days) ? r.days.map((d) => ({ ...blankDay(), ...d })) : [],
    estimates: r.estimates ?? {},
  };
}

export const tasksKey = (tasks: SimMission[]) => JSON.stringify(tasks.map((t) => [t.game, t.kind, t.threshold ?? null, t.target]));
