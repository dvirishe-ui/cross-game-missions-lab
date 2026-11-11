// Daily Promo plan: Campaign → Day → Session → Mission → Winner slots.
// Stored on the shared Promotion Project as `daily` (versioned). Dates,
// time zone, budget, currency and name come from the project itself, so the
// planner, Promo Checker, T&C Generator and exports never disagree.

import type { GameId } from '../../data/games';
import { DEFAULT_FEASIBILITY, EXACT_GAMES, searchFits, type Feasibility } from './estimate';

/** v2: sessions can be weighted by length (v1 plans move from equal to by-length). */
export const DAILY_VERSION = 2;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export type RewardMode = 'independent' | 'bundle';
export type WeightMode = 'equal' | 'custom';
/** Sessions can also be weighted by their length (a 20-minute session pays more than a 10-minute one). */
export type SessionWeightMode = WeightMode | 'length';
export type PolicyKey = 'repeatWinners' | 'unfilledSlots' | 'unawardedFunds' | 'ties' | 'selection';

export interface DMission {
  id: string;
  game: GameId;
  /** Catch a multiplier is the main type; "bets" kept for operators who need it. */
  kind: 'catch' | 'bets';
  threshold: number | null;
  /** catch: required catches; bets: number of bets. */
  catches: number | null;
  /** Independent mode: winner slots for this mission. */
  slots: number | null;
  /** Minimum qualifying bet, in the campaign currency (rule text only; never changes the chance). */
  minBet: number | null;
  /** Aviator: catches count once per round (default) or per bet. */
  countPer: 'round' | 'bet';
  /** Your own chance per bet, for games without a model. Decimal. */
  chanceOverride: number | null;
  /** Custom share weight inside its session (null = 1). */
  weight: number | null;
}

export interface DSession {
  id: string;
  /** Local 'HH:MM' in the campaign time zone. */
  start: string;
  durationMin: number;
  missions: DMission[];
  /** Override of the campaign lead time for this session (null = campaign). */
  leadMin: number | null;
  /** Bundle mode: shared slots for the session (null = template). */
  bundleSlots: number | null;
  weight: number | null;
}

export interface DDay {
  id: string;
  sessions: DSession[];
  weight: number | null;
  /** Edited by hand: template changes leave this day alone. */
  edited: boolean;
  /** One-announcement-per-day mode: local 'HH:MM' (blank = earliest deadline). May be on the previous date. */
  announceTime: string;
  /** true when announceTime is on the date before the day. */
  announcePrevDay: boolean;
}

export interface DailyPlan {
  version: number;
  days: DDay[];
  template: {
    sessionsPerDay: number;
    missionsPerSession: number;
    durationMin: number;
    slotsPerMission: number;
    bundleSlots: number;
    rotation: GameId[];
    /** Minimum gap between sessions when placing them (heuristic). */
    gapMin: number;
  };
  rewardMode: RewardMode;
  leadMin: number;
  announceMode: 'per-session' | 'per-day';
  /** Operating hours, local 'HH:MM'. End before start = runs past midnight. */
  opStart: string;
  opEnd: string;
  weights: { day: WeightMode; session: SessionWeightMode; mission: WeightMode };
  /** Weight per session length in minutes, used when sessions are weighted by length. */
  lengthWeights: Record<string, number>;
  /** 'budget': split a total. 'per-length': a set amount per session by its length (10 min = X, 20 min = Y). */
  prizeMode: 'budget' | 'per-length';
  lengthAmounts: Record<string, number | null>;
  payout: 'equal' | 'ranked';
  audience: { activePlayers: number | null; attemptShare: number | null; roundShare: number; switchMin: number; betsPerMin: Partial<Record<GameId, number>> };
  feasibility: Feasibility;
  closeMode: 'when-filled' | 'scheduled-end';
  policies: Record<PolicyKey, string>;
  useInTc: boolean;
}

export const MIN_LEAD = 40;
export const DURATIONS = [10, 15, 20];
/** Default: pool share in proportion to minutes (10 → 1, 15 → 1.5, 20 → 2). */
export const DEFAULT_LENGTH_WEIGHTS: Record<string, number> = { '10': 1, '15': 1.5, '20': 2 };
export const lengthWeight = (plan: Pick<DailyPlan, 'lengthWeights'>, minutes: number) => plan.lengthWeights[String(minutes)] ?? minutes / 10;

/** User-supplied: UTC hours ranked by player activity, busiest first (observed data). */
export const BUSIEST_UTC_HOURS = [22, 21, 23, 20, 19, 18, 12, 11, 13, 16, 10, 14, 17, 15, 9, 7, 8, 0, 6, 1, 5, 2, 4, 3];

export const POLICIES: { key: PolicyKey; label: string; options: string[] }[] = [
  { key: 'repeatWinners', label: 'Repeat winners', options: ['One slot per player per campaign', 'One slot per player per day', 'One slot per player per session', 'One slot per player per mission'] },
  { key: 'unfilledSlots', label: 'Unfilled slots', options: ['Expire at session end', 'Roll into the next session', 'Roll into the next day', 'Awarded by draw among partial finishers'] },
  { key: 'unawardedFunds', label: 'Unawarded funds', options: ['Returned to the operator / provider', 'Added to the final day', 'Spread across later sessions'] },
  { key: 'ties', label: 'Ties', options: ['Earliest qualifying round wins (server time)', 'Split the slot equally', 'Draw between tied players'] },
  { key: 'selection', label: 'Winner selection', options: ['First come, first served', 'Random draw among qualifiers', 'Leaderboard by catches'] },
];

export const blankPolicies = (): Record<PolicyKey, string> => ({ repeatWinners: '', unfilledSlots: '', unawardedFunds: '', ties: '', selection: '' });

export function defaultPlan(): DailyPlan {
  const plan: DailyPlan = {
    version: DAILY_VERSION,
    days: [],
    template: { sessionsPerDay: 4, missionsPerSession: 2, durationMin: 15, slotsPerMission: 10, bundleSlots: 10, rotation: [...EXACT_GAMES], gapMin: 0 },
    rewardMode: 'independent',
    leadMin: MIN_LEAD,
    announceMode: 'per-session',
    opStart: '',
    opEnd: '',
    weights: { day: 'equal', session: 'length', mission: 'equal' },
    lengthWeights: { ...DEFAULT_LENGTH_WEIGHTS },
    prizeMode: 'budget',
    lengthAmounts: { '10': null, '15': null, '20': null },
    payout: 'equal',
    audience: { activePlayers: null, attemptShare: null, roundShare: 1, switchMin: 1, betsPerMin: {} },
    feasibility: { ...DEFAULT_FEASIBILITY },
    closeMode: 'when-filled',
    policies: blankPolicies(),
    useInTc: true,
  };
  return setLength(plan, 7, '');
}

// ---------- building days from the template ----------

const fitCache = new Map<string, { threshold: number; catches: number }>();
/** A mission sized for the window: the best fit from the search, or a safe fallback. */
export function sizedMission(game: GameId, durationMin: number, f: Feasibility = DEFAULT_FEASIBILITY): Pick<DMission, 'threshold' | 'catches'> {
  const key = `${game}|${durationMin}|${f.minP}|${f.maxP}|${f.minFill}|${f.maxFill}`;
  let hit = fitCache.get(key);
  if (!hit) {
    const s = searchFits(game, durationMin, f)[0];
    hit = s ? { threshold: s.threshold, catches: s.catches } : { threshold: game === 'aviator' ? 10 : 5, catches: 2 };
    fitCache.set(key, hit);
  }
  return { ...hit };
}

export function newMission(game: GameId, durationMin: number, slots: number, f?: Feasibility): DMission {
  return { id: uid(), game, kind: 'catch', ...sizedMission(game, durationMin, f), slots, minBet: null, countPer: 'round', chanceOverride: null, weight: null };
}

/** Session #globalIndex: Aviator first, then the rotating games. */
export function templateSession(plan: Pick<DailyPlan, 'template' | 'feasibility'>, globalIndex: number, start: string): DSession {
  const t = plan.template;
  const rot = t.rotation.length ? t.rotation : EXACT_GAMES;
  const missions: DMission[] = [];
  for (let j = 0; j < Math.max(1, t.missionsPerSession); j++) {
    const game: GameId = j === 0 ? 'aviator' : rot[(globalIndex + j - 1) % rot.length];
    missions.push(newMission(game, t.durationMin, t.slotsPerMission, plan.feasibility));
  }
  return { id: uid(), start, durationMin: t.durationMin, missions, leadMin: null, bundleSlots: null, weight: null };
}

/** Re-sizes a session's catch missions for a new length: shorter = easier, longer = harder. */
export function resizeSession(s: DSession, durationMin: number, f?: Feasibility): DSession {
  return {
    ...s,
    durationMin,
    missions: s.missions.map((m) => (m.kind === 'catch' && m.chanceOverride == null ? { ...m, ...sizedMission(m.game, durationMin, f) } : m)),
  };
}

export function templateDay(plan: DailyPlan, dayIndex: number, tz: string): DDay {
  const starts = suggestStarts(plan, tz);
  const n = plan.template.sessionsPerDay;
  return {
    id: uid(),
    sessions: Array.from({ length: n }, (_, s) => templateSession(plan, dayIndex * n + s, starts[s] ?? '')),
    weight: null,
    edited: false,
    announceTime: '',
    announcePrevDay: false,
  };
}

/** Rebuilds every day that was not edited by hand (or all days when force). */
export function applyTemplate(plan: DailyPlan, tz: string, force = false): DailyPlan {
  return { ...plan, days: plan.days.map((d, i) => (force || !d.edited ? { ...templateDay(plan, i, tz), id: d.id, weight: d.weight } : d)) };
}

/** Changes the campaign length, keeping existing days and adding template days. */
export function setLength(plan: DailyPlan, days: number, tz: string): DailyPlan {
  const n = Math.max(1, Math.min(60, Math.round(days)));
  const kept = plan.days.slice(0, n);
  const added = Array.from({ length: n - kept.length }, (_, i) => templateDay(plan, kept.length + i, tz));
  return { ...plan, days: [...kept, ...added] };
}

export function setTemplate(plan: DailyPlan, patch: Partial<DailyPlan['template']>, tz: string): DailyPlan {
  const next = applyTemplate({ ...plan, template: { ...plan.template, ...patch } }, tz);
  if (patch.durationMin == null || patch.durationMin === plan.template.durationMin) return next;
  // A new session length also applies to days edited by hand: their games and times stay, missions re-size.
  return { ...next, days: next.days.map((d) => (d.edited ? { ...d, sessions: d.sessions.map((s) => resizeSession(s, patch.durationMin!, next.feasibility)) } : d)) };
}

/** Copies one day onto others (marks them edited so the template leaves them alone). */
export function copyDay(plan: DailyPlan, from: number, to: number[] | 'all'): DailyPlan {
  const src = plan.days[from];
  if (!src) return plan;
  const targets = to === 'all' ? plan.days.map((_, i) => i).filter((i) => i !== from) : to;
  return {
    ...plan,
    days: plan.days.map((d, i) => (targets.includes(i) ? { ...cloneDay(src), id: d.id, edited: true } : d)),
  };
}

export function cloneDay(d: DDay): DDay {
  return { ...d, id: uid(), sessions: d.sessions.map((s) => ({ ...s, id: uid(), missions: s.missions.map((m) => ({ ...m, id: uid() })) })) };
}

/** Changes one day only and marks it edited. */
export function editDay(plan: DailyPlan, index: number, fn: (d: DDay) => DDay): DailyPlan {
  return { ...plan, days: plan.days.map((d, i) => (i === index ? { ...fn(d), edited: true } : d)) };
}

// ---------- session times from the busiest hours ----------

/** UTC offset (minutes) of a zone near now; 0 for UTC / unknown. */
export function zoneOffsetMin(tz: string, at = Date.now()): number | null {
  const t = tz.trim();
  if (!t) return null;
  if (/^(utc|gmt|z)$/i.test(t)) return 0;
  const m = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(t);
  if (m) return (Number(m[2]) * 60 + Number(m[3] ?? 0)) * (m[1] === '-' ? -1 : 1);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: t, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
    const get = (type: string) => Number(parts.find((x) => x.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return Math.round((asUtc - Math.floor(at / 60000) * 60000) / 60000);
  } catch {
    return null;
  }
}

export const hm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const minOf = (t: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

/** Is [start, start+dur] inside the operating hours (which may run past midnight)? Blank hours = yes. */
export function insideHours(startMin: number, dur: number, opStart: string, opEnd: string): boolean {
  const a = minOf(opStart);
  const b = minOf(opEnd);
  if (a == null || b == null) return true;
  const len = b > a ? b - a : b + 1440 - a;
  const off = (startMin - a + 1440) % 1440;
  return off + dur <= len;
}

export const hoursLength = (opStart: string, opEnd: string) => {
  const a = minOf(opStart);
  const b = minOf(opEnd);
  if (a == null || b == null) return null;
  return b > a ? b - a : b + 1440 - a;
};

/**
 * Session starts from the busiest UTC hours, converted to the campaign zone,
 * kept inside operating hours and apart by duration + gap. Sorted by time of day
 * (a 00:30 start is early on that day's date, before its evening sessions).
 */
export function suggestStarts(plan: Pick<DailyPlan, 'template' | 'opStart' | 'opEnd'>, tz: string, at?: number): string[] {
  const n = plan.template.sessionsPerDay;
  const dur = plan.template.durationMin;
  const gap = plan.template.gapMin;
  const off = zoneOffsetMin(tz, at) ?? 0;
  const chosen: number[] = [];
  const clash = (x: number) => chosen.some((c) => Math.min((x - c + 1440) % 1440, (c - x + 1440) % 1440) < dur + gap);
  // First pass on whole hours, then half hours, so more sessions than busy hours still fit.
  for (const step of [0, 30, 15, 45]) {
    for (const h of BUSIEST_UTC_HOURS) {
      if (chosen.length >= n) break;
      const local = (((h * 60 + step + off) % 1440) + 1440) % 1440;
      if (!insideHours(local, dur, plan.opStart, plan.opEnd) || clash(local)) continue;
      chosen.push(local);
    }
  }
  // A start is a time on the day's own date, so plain clock order is real order.
  return chosen.sort((x, y) => x - y).map(hm);
}

/** Busiest start times still free on a day (not clashing with its other sessions), best first. */
export function freePeakStarts(plan: Pick<DailyPlan, 'template' | 'opStart' | 'opEnd'>, tz: string, day: DDay, except: number, limit = 3): string[] {
  const off = zoneOffsetMin(tz) ?? 0;
  const others = day.sessions.filter((_, i) => i !== except).flatMap((s) => (minOf(s.start) == null ? [] : [{ a: minOf(s.start)!, d: s.durationMin }]));
  const dur = day.sessions[except]?.durationMin ?? plan.template.durationMin;
  const gap = plan.template.gapMin;
  const out: string[] = [];
  for (const step of [0, 30]) {
    for (const h of BUSIEST_UTC_HOURS) {
      if (out.length >= limit) return out;
      const local = (((h * 60 + step + off) % 1440) + 1440) % 1440;
      if (!insideHours(local, dur, plan.opStart, plan.opEnd)) continue;
      if (others.some((o) => local < o.a + o.d + gap && o.a < local + dur + gap)) continue;
      if (!out.includes(hm(local))) out.push(hm(local));
    }
  }
  return out;
}

/** Rank of a local start time in the busiest-hours list (0 = busiest), or null. */
export function peakRank(start: string, tz: string): number | null {
  const m = minOf(start);
  if (m == null) return null;
  const off = zoneOffsetMin(tz) ?? 0;
  const utcHour = Math.floor((((m - off) % 1440) + 1440) % 1440 / 60);
  const i = BUSIEST_UTC_HOURS.indexOf(utcHour);
  return i < 0 ? null : i;
}

export function placeAtBusiest(plan: DailyPlan, tz: string, days: number[] | 'all'): DailyPlan {
  const idx = days === 'all' ? plan.days.map((_, i) => i) : days;
  return {
    ...plan,
    days: plan.days.map((d, i) => {
      if (!idx.includes(i)) return d;
      const starts = suggestStarts({ ...plan, template: { ...plan.template, sessionsPerDay: d.sessions.length, durationMin: Math.max(...d.sessions.map((s) => s.durationMin), 1) } }, tz);
      return { ...d, sessions: d.sessions.map((s, j) => ({ ...s, start: starts[j] ?? s.start })) };
    }),
  };
}

// ---------- totals ----------

export interface Totals {
  days: number;
  sessions: number;
  missions: number;
  slots: number;
  /** Same counts for every day? */
  uniform: boolean;
  sessionsPerDay: number;
  missionsPerSession: number;
  missionsPerDay: number;
  /** "7 × 4 × 2 = 56" when uniform. */
  formula: string;
  slotFormula: string;
}

export const sessionSlots = (plan: DailyPlan, s: DSession) =>
  plan.rewardMode === 'bundle' ? (s.bundleSlots ?? plan.template.bundleSlots) : s.missions.reduce((a, m) => a + (m.slots ?? 0), 0);

export function totals(plan: DailyPlan): Totals {
  const days = plan.days.length;
  const sessions = plan.days.reduce((a, d) => a + d.sessions.length, 0);
  const missions = plan.days.reduce((a, d) => a + d.sessions.reduce((b, s) => b + s.missions.length, 0), 0);
  const slots = plan.days.reduce((a, d) => a + d.sessions.reduce((b, s) => b + sessionSlots(plan, s), 0), 0);
  const spd = new Set(plan.days.map((d) => d.sessions.length));
  const mps = new Set(plan.days.flatMap((d) => d.sessions.map((s) => s.missions.length)));
  const uniform = spd.size <= 1 && mps.size <= 1;
  const sessionsPerDay = uniform ? (plan.days[0]?.sessions.length ?? 0) : sessions / Math.max(1, days);
  const missionsPerSession = uniform ? (plan.days[0]?.sessions[0]?.missions.length ?? 0) : missions / Math.max(1, sessions);
  const missionsPerDay = uniform ? sessionsPerDay * missionsPerSession : missions / Math.max(1, days);
  const slotSet = new Set(plan.days.flatMap((d) => d.sessions.flatMap((s) => (plan.rewardMode === 'bundle' ? [s.bundleSlots ?? plan.template.bundleSlots] : s.missions.map((m) => m.slots ?? 0)))));
  const formula = uniform ? `${days} × ${sessionsPerDay} × ${missionsPerSession} = ${missions}` : `${missions} (days differ)`;
  const slotFormula =
    uniform && slotSet.size === 1
      ? plan.rewardMode === 'bundle'
        ? `${sessions} sessions × ${[...slotSet][0]} shared slots = ${slots}`
        : `${missions} missions × ${[...slotSet][0]} slots = ${slots}`
      : `${slots} (slot counts differ)`;
  return { days, sessions, missions, slots, uniform, sessionsPerDay, missionsPerSession, missionsPerDay, formula, slotFormula };
}

// ---------- comparison presets ----------

export const PRESETS = [
  { id: 'light', label: 'Light', sessionsPerDay: 2, missionsPerSession: 2 },
  { id: 'standard', label: 'Standard', sessionsPerDay: 4, missionsPerSession: 2 },
  { id: 'frequent', label: 'Frequent', sessionsPerDay: 8, missionsPerSession: 2 },
] as const;
export const LENGTHS = [3, 7, 14];

export interface PresetRow {
  label: string;
  days: number;
  sessionsPerDay: number;
  missionsPerSession: number;
  missionsPerDay: number;
  sessions: number;
  missions: number;
  slots: number;
  slotShare: number;
  minutesPerDay: number;
}

export function presetRow(label: string, days: number, spd: number, mps: number, slotsPerMission: number, durationMin: number): PresetRow {
  const missions = days * spd * mps;
  const slots = missions * slotsPerMission;
  return { label, days, sessionsPerDay: spd, missionsPerSession: mps, missionsPerDay: spd * mps, sessions: days * spd, missions, slots, slotShare: slots ? 1 / slots : 0, minutesPerDay: spd * durationMin };
}

export const TRADEOFFS: Record<string, string> = {
  light: 'Fewer, bigger moments: each slot is worth more and announcements are simple, but players who miss two windows miss the day.',
  standard: 'Spreads play across the busiest evening hours; more chances to join, with each slot smaller than in Light.',
  frequent: 'Many short windows and the most chances to join, but each slot is small, operations and announcements are heavier and sessions start to crowd the operating hours.',
};

// ---------- persistence: versioned, tolerant of old or damaged data ----------

const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const numOrNull = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const GAME_IDS: GameId[] = ['aviator', 'pilot-chicken', 'plinko', 'mines', 'goal', 'keno', 'keno-80', 'trader'];
const game = (v: unknown): GameId => (GAME_IDS.includes(v as GameId) ? (v as GameId) : 'aviator');

export interface NormalizeResult {
  plan: DailyPlan;
  warnings: string[];
}

/** Reads a stored or imported plan, repairing what it can. Throws only for a newer, unknown version. */
export function normalizeDaily(raw: unknown): NormalizeResult {
  const warnings: string[] = [];
  const b = defaultPlan();
  if (!raw || typeof raw !== 'object') return { plan: b, warnings: ['No plan found; started from the defaults.'] };
  const r = raw as Record<string, unknown>;
  const version = num(r.version, 1);
  if (version > DAILY_VERSION) throw new Error(`This plan was saved by a newer version (v${version}) of the planner.`);
  const t = (r.template ?? {}) as Record<string, unknown>;
  const template: DailyPlan['template'] = {
    sessionsPerDay: num(t.sessionsPerDay, b.template.sessionsPerDay, 1, 24),
    missionsPerSession: num(t.missionsPerSession, b.template.missionsPerSession, 1, 10),
    durationMin: num(t.durationMin, b.template.durationMin, 1, 240),
    slotsPerMission: num(t.slotsPerMission, b.template.slotsPerMission, 1, 100000),
    bundleSlots: num(t.bundleSlots, b.template.bundleSlots, 1, 100000),
    rotation: Array.isArray(t.rotation) && t.rotation.length ? (t.rotation as unknown[]).map(game) : b.template.rotation,
    gapMin: num(t.gapMin, 0, 0, 240),
  };
  const mission = (m: unknown): DMission => {
    const x = (m ?? {}) as Record<string, unknown>;
    return {
      id: str(x.id) || uid(),
      game: game(x.game),
      kind: x.kind === 'bets' ? 'bets' : 'catch',
      threshold: numOrNull(x.threshold),
      catches: numOrNull(x.catches),
      slots: numOrNull(x.slots),
      minBet: numOrNull(x.minBet),
      countPer: x.countPer === 'bet' ? 'bet' : 'round',
      chanceOverride: numOrNull(x.chanceOverride),
      weight: numOrNull(x.weight),
    };
  };
  const session = (s: unknown): DSession => {
    const x = (s ?? {}) as Record<string, unknown>;
    return {
      id: str(x.id) || uid(),
      start: str(x.start),
      durationMin: num(x.durationMin, template.durationMin, 1, 240),
      missions: Array.isArray(x.missions) ? x.missions.map(mission) : [],
      leadMin: numOrNull(x.leadMin),
      bundleSlots: numOrNull(x.bundleSlots),
      weight: numOrNull(x.weight),
    };
  };
  let days: DDay[] = [];
  if (Array.isArray(r.days)) {
    days = r.days.map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return {
        id: str(x.id) || uid(),
        sessions: Array.isArray(x.sessions) ? x.sessions.map(session) : [],
        weight: numOrNull(x.weight),
        edited: x.edited === true,
        announceTime: str(x.announceTime),
        announcePrevDay: x.announcePrevDay === true,
      };
    });
  } else warnings.push('The plan had no days; rebuilt them from the template.');
  const w = (r.weights ?? {}) as Record<string, unknown>;
  const wm = (v: unknown): WeightMode => (v === 'custom' ? 'custom' : 'equal');
  const a = (r.audience ?? {}) as Record<string, unknown>;
  const f = (r.feasibility ?? {}) as Record<string, unknown>;
  const pol = (r.policies ?? {}) as Record<string, unknown>;
  const plan: DailyPlan = {
    version: DAILY_VERSION,
    days,
    template,
    rewardMode: r.rewardMode === 'bundle' ? 'bundle' : 'independent',
    leadMin: num(r.leadMin, MIN_LEAD, 0, 10080),
    announceMode: r.announceMode === 'per-day' ? 'per-day' : 'per-session',
    opStart: str(r.opStart),
    opEnd: str(r.opEnd),
    weights: { day: wm(w.day), session: w.session === 'custom' ? 'custom' : w.session === 'equal' && version >= 2 ? 'equal' : 'length', mission: wm(w.mission) },
    prizeMode: r.prizeMode === 'per-length' ? 'per-length' : 'budget',
    lengthAmounts: { '10': null, '15': null, '20': null, ...(typeof r.lengthAmounts === 'object' && r.lengthAmounts ? Object.fromEntries(Object.entries(r.lengthAmounts as Record<string, unknown>).map(([k, v]) => [k, numOrNull(v)])) : {}) },
    lengthWeights: typeof r.lengthWeights === 'object' && r.lengthWeights ? { ...DEFAULT_LENGTH_WEIGHTS, ...(r.lengthWeights as Record<string, number>) } : { ...DEFAULT_LENGTH_WEIGHTS },
    payout: r.payout === 'ranked' ? 'ranked' : 'equal',
    audience: {
      activePlayers: numOrNull(a.activePlayers),
      attemptShare: numOrNull(a.attemptShare),
      roundShare: num(a.roundShare, 1, 0.01, 1),
      switchMin: num(a.switchMin, 1, 0, 30),
      betsPerMin: typeof a.betsPerMin === 'object' && a.betsPerMin ? (a.betsPerMin as Partial<Record<GameId, number>>) : {},
    },
    feasibility: { minP: num(f.minP, b.feasibility.minP, 0, 100), maxP: num(f.maxP, b.feasibility.maxP, 0, 100), minFill: num(f.minFill, b.feasibility.minFill, 0, 300), maxFill: num(f.maxFill, b.feasibility.maxFill, 0, 300) },
    closeMode: r.closeMode === 'scheduled-end' ? 'scheduled-end' : 'when-filled',
    policies: { repeatWinners: str(pol.repeatWinners), unfilledSlots: str(pol.unfilledSlots), unawardedFunds: str(pol.unawardedFunds), ties: str(pol.ties), selection: str(pol.selection) },
    useInTc: r.useInTc !== false,
  };
  if (!plan.days.length) return { plan: setLength(plan, 7, ''), warnings };
  return { plan, warnings };
}
