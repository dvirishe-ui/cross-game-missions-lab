// Paste a schedule table (from a sheet or a chat) straight into the planner.
// Reads start times and the target game for each day, in either layout:
//   time  game(Day 1)  game(Day 2) …      (one row per session)
// Spacing and tabs do not matter: the text is read as a stream of times and
// game names, so "16:40KenoHi-LoPlinko…" works as well as a tab-separated row.

import type { GameId } from '../../data/games';
import { blankProject, type Project } from '../model/project';
import { SESSION_MIN, cloneDay, defaultPlan, newMission, type DailyPlan, type DDay } from './plan';

const NAMES: [RegExp, GameId][] = [
  [/^keno\s*80|^multikeno/i, 'keno-80'],
  [/^pilot\s*chicken|^pilot/i, 'pilot-chicken'],
  [/^hi\s*-?\s*lo/i, 'hi-lo'],
  [/^aviator/i, 'aviator'],
  [/^keno/i, 'keno'],
  [/^plinko/i, 'plinko'],
  [/^dice/i, 'dice'],
  [/^mines/i, 'mines'],
  [/^goal/i, 'goal'],
  [/^trader/i, 'trader'],
  [/^balloon/i, 'balloon'],
];

export interface ParsedSchedule {
  /** 'UTC' when the header says so, else null (keep the campaign zone). */
  timezone: string | null;
  starts: string[];
  /** games[session][day]: the target game played next to Aviator. */
  games: GameId[][];
  days: number;
}

export type ParseResult = { ok: true; schedule: ParsedSchedule } | { ok: false; error: string };

export function parseSchedule(text: string): ParseResult {
  const tz = /\(\s*(utc|gmt)\s*\)/i.test(text) || /\butc\b/i.test(text) ? 'UTC' : null;
  // Drop header words ("Mission Start (UTC)", "Day 1" …) so their numbers are not read as data.
  // "Day 716:40" (no space) = "Day 7" then "16:40": take the shortest day number before a time.
  const body = text
    .replace(/mission\s*start/gi, ' ')
    .replace(/\((utc|gmt)[^)]*\)/gi, ' ')
    .replace(/day\s*\d+?(?=\d{2}:\d{2})/gi, ' ')
    .replace(/day\s*\d+/gi, ' ');
  const rows: { start: string; games: GameId[] }[] = [];
  let i = 0;
  const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)/;
  while (i < body.length) {
    const rest = body.slice(i);
    const t = timeRe.exec(rest);
    if (t) {
      rows.push({ start: `${t[1].padStart(2, '0')}:${t[2]}`, games: [] });
      i += t[0].length;
      continue;
    }
    const hit = NAMES.find(([re]) => re.test(rest));
    if (hit) {
      const m = hit[0].exec(rest)!;
      if (rows.length) rows[rows.length - 1].games.push(hit[1]);
      i += m[0].length;
      continue;
    }
    i++;
  }
  const filled = rows.filter((r) => r.games.length);
  if (!filled.length) return { ok: false, error: 'No session times with games found. Paste rows like "16:40 Keno Hi-Lo Plinko …".' };
  const days = Math.max(...filled.map((r) => r.games.length));
  const uneven = filled.find((r) => r.games.length !== days);
  if (uneven) return { ok: false, error: `The ${uneven.start} row has ${uneven.games.length} games but other rows have ${days}. Every row needs one game per day.` };
  return { ok: true, schedule: { timezone: tz, starts: filled.map((r) => r.start), games: filled.map((r) => r.games), days } };
}

/**
 * A plan with exactly this schedule: one day per column, one 20-minute session
 * per row (Aviator + that row's game), missions sized to ~10 minutes of play.
 * Days are marked as edited so template changes do not rebuild them.
 */
export function planFromSchedule(s: ParsedSchedule, base: DailyPlan = defaultPlan()): DailyPlan {
  const play = SESSION_MIN / 2;
  const slots = base.template.slotsPerMission;
  const rotation = [...new Set(s.games.flat().filter((g) => g !== 'aviator'))];
  const template = { ...base.template, sessionsPerDay: s.starts.length, missionsPerSession: 2, durationMin: SESSION_MIN, rotation: rotation.length ? rotation : base.template.rotation };
  const firstDay = base.days[0];
  const days: DDay[] = Array.from({ length: s.days }, (_, d) => {
    const day = firstDay ? cloneDay(firstDay) : ({ id: '', sessions: [], weight: null, edited: true, announceTime: '', announcePrevDay: false } as DDay);
    return {
      ...day,
      edited: true,
      sessions: s.starts.map((start, r) => {
        const g = s.games[r][d];
        const missions = g === 'aviator' ? [newMission('aviator', play, slots, base.feasibility)] : [newMission('aviator', play, slots, base.feasibility), newMission(g, play, slots, base.feasibility)];
        return { id: `${d}-${r}-${Math.random().toString(36).slice(2, 8)}`, start, durationMin: SESSION_MIN, missions, leadMin: null, bundleSlots: null, weight: null };
      }),
    };
  });
  return { ...base, template, days };
}

/** The schedule supplied on 12 Nov 2026: 7 days × 8 sessions, Keno / Hi-Lo / Plinko / Dice. */
export const SUPPLIED_SCHEDULE = `Mission Start (UTC) Day 1 Day 2 Day 3 Day 4 Day 5 Day 6 Day 7
16:40 Keno Hi-Lo Plinko Dice Keno Hi-Lo Plinko
17:40 Hi-Lo Plinko Dice Keno Hi-Lo Plinko Dice
18:40 Plinko Dice Keno Hi-Lo Plinko Dice Keno
19:40 Dice Keno Hi-Lo Plinko Dice Keno Hi-Lo
20:40 Keno Hi-Lo Plinko Dice Keno Hi-Lo Plinko
21:40 Hi-Lo Plinko Dice Keno Hi-Lo Plinko Dice
22:40 Plinko Dice Keno Hi-Lo Plinko Dice Keno
23:40 Dice Keno Hi-Lo Plinko Dice Keno Hi-Lo`;

export const SUPPLIED_PROJECT_NAME = 'Daily Promo · Keno / Hi-Lo / Plinko / Dice';

export function suppliedScheduleProject(): Project {
  const p = blankProject(SUPPLIED_PROJECT_NAME);
  const parsed = parseSchedule(SUPPLIED_SCHEDULE);
  if (!parsed.ok) return p;
  p.schedule.timezone = 'UTC';
  p.promo.format = 'Daily timed sessions';
  p.games = { anchor: 'aviator', secondary: ['keno', 'hi-lo', 'plinko', 'dice'] };
  p.daily = planFromSchedule(parsed.schedule);
  return p;
}
