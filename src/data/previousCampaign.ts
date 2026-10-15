import type { GameId } from './games';

// The previous SPRIBE campaign exactly as supplied. Mission wording is kept
// verbatim; parsed fields are derived from it, never the other way round.
export type TaskKind = 'multiplier' | 'accumulate' | 'count';

export interface CampaignMission {
  day: number;
  game: GameId;
  /** Original task wording. */
  text: string;
  kind: TaskKind;
  /** Multiplier threshold for "catch" missions (× value). */
  threshold?: number;
  /** Required successes, required sum (×) or required bets. */
  target: number;
}

const RAW: [number, GameId, string][] = [
  [1, 'aviator', 'Catch multiplier 30× or more 10 times'],
  [1, 'pilot-chicken', 'Collect 100× in total'],
  [1, 'plinko', 'Place 100 individual bets'],
  [1, 'mines', 'Collect 100× in total'],
  [2, 'aviator', 'Catch multiplier 30× or more 10 times'],
  [2, 'goal', 'Collect 100× in total'],
  [2, 'keno', 'Place 100 individual bets'],
  [2, 'trader', 'Collect 100× in total'],
  [3, 'aviator', 'Catch multiplier 30× or more 10 times'],
  [3, 'pilot-chicken', 'Place 200 individual bets'],
  [3, 'mines', 'Collect 150× in total'],
  [3, 'plinko', 'Place 300 individual bets'],
  [3, 'trader', 'Catch multiplier 20× or more 10 times'],
  [3, 'keno', 'Collect 150× in total'],
  [4, 'aviator', 'Catch multiplier 30× or more 10 times'],
  [4, 'trader', 'Collect 200× in total'],
  [4, 'keno', 'Place 300 individual bets'],
  [4, 'mines', 'Collect 200× in total'],
  [4, 'pilot-chicken', 'Place 200 individual bets'],
  [4, 'plinko', 'Catch multiplier 15× or more 10 times'],
  [5, 'aviator', 'Catch multiplier 30× or more 30 times'],
  [5, 'pilot-chicken', 'Collect 300× in total'],
  [5, 'trader', 'Catch multiplier 30× or more 10 times'],
  [5, 'mines', 'Collect 300× in total'],
  [5, 'plinko', 'Catch multiplier 15× or more 20 times'],
  [5, 'goal', 'Place 300 individual bets'],
  [6, 'aviator', 'Catch multiplier 30× or more 30 times'],
  [6, 'plinko', 'Collect 300× in total'],
  [6, 'keno', 'Catch multiplier 30× or more 20 times'],
  [6, 'goal', 'Collect 300× in total'],
  [6, 'pilot-chicken', 'Place 300 individual bets'],
  [6, 'trader', 'Catch multiplier 30× or more 20 times'],
  [7, 'aviator', 'Catch multiplier 30× or more 30 times'],
  [7, 'pilot-chicken', 'Catch multiplier 30× or more 20 times'],
  [7, 'plinko', 'Catch multiplier 15× or more 20 times'],
  [7, 'mines', 'Place 300 individual bets'],
  [7, 'trader', 'Collect 300× in total'],
  [7, 'goal', 'Collect 300× in total'],
];

export function parseMissionText(text: string): { kind: TaskKind; threshold?: number; target: number } {
  const catchMatch = /^Catch multiplier (\d+(?:\.\d+)?)× or more (\d+) times$/.exec(text);
  if (catchMatch) return { kind: 'multiplier', threshold: Number(catchMatch[1]), target: Number(catchMatch[2]) };
  const collect = /^Collect (\d+(?:\.\d+)?)× in total$/.exec(text);
  if (collect) return { kind: 'accumulate', target: Number(collect[1]) };
  const place = /^Place (\d+) individual bets$/.exec(text);
  if (place) return { kind: 'count', target: Number(place[1]) };
  throw new Error(`Unrecognised mission wording: ${text}`);
}

export const PREVIOUS_MISSIONS: CampaignMission[] = RAW.map(([day, game, text]) => ({
  day,
  game,
  text,
  ...parseMissionText(text),
}));

export const DAYS = [1, 2, 3, 4, 5, 6, 7];

export type OutcomeTone = 'fast' | 'blocked' | 'ok';

export interface DayObservation {
  day: number;
  tone: OutcomeTone;
  badge: string;
  detail: string;
}

/** Internal observations reported by our team. Not independently verified. */
export const DAY_OBSERVATIONS: DayObservation[] = [
  { day: 1, tone: 'fast', badge: 'Prizes gone in 1h 20m', detail: 'Team report: 50 winners; reported duration 1h 20m. Prizes were claimed too quickly.' },
  { day: 2, tone: 'fast', badge: 'Prizes gone in 49m', detail: 'Team report: 50 winners; reported duration 49m. Prizes were claimed too quickly.' },
  { day: 3, tone: 'fast', badge: 'Prizes gone in 1h 03m', detail: 'Team report: 50 winners; reported duration 1h 03m. Prizes were claimed too quickly.' },
  { day: 4, tone: 'fast', badge: 'Prizes gone in 1h 31m', detail: 'Team report: 50 winners; reported duration 1h 31m. Prizes were claimed too quickly.' },
  { day: 5, tone: 'fast', badge: 'Prizes gone in 2h 08m', detail: 'Team report: 50 winners; reported duration 2h 08m. Prizes were claimed too quickly.' },
  {
    day: 6,
    tone: 'blocked',
    badge: '0 winners · Keno 0 completions',
    detail:
      'Team report: 0 winners; nobody completed the Keno mission requiring a multiplier of 30× or more twenty times (0 completions among 191 players who started a task). Cause not established.',
  },
  { day: 7, tone: 'ok', badge: '50 winners in 3h 39m', detail: 'Team report: 50 winners; reported duration 3h 39m. The team judged the timing as working well.' },
];

export function missionsForDay(day: number): CampaignMission[] {
  return PREVIOUS_MISSIONS.filter((m) => m.day === day);
}

export type MissionChange = 'same' | 'changed' | 'added' | 'removed';

export interface DayDiffRow {
  game: GameId;
  a?: CampaignMission;
  b?: CampaignMission;
  change: MissionChange;
}

/** Compares two days game by game. */
export function diffDays(dayA: number, dayB: number): DayDiffRow[] {
  const a = missionsForDay(dayA);
  const b = missionsForDay(dayB);
  const games: GameId[] = [];
  for (const m of [...a, ...b]) if (!games.includes(m.game)) games.push(m.game);
  return games.map((game) => {
    const ma = a.find((m) => m.game === game);
    const mb = b.find((m) => m.game === game);
    const change: MissionChange = !ma ? 'added' : !mb ? 'removed' : ma.text === mb.text ? 'same' : 'changed';
    return { game, a: ma, b: mb, change };
  });
}

export const KIND_LABEL: Record<TaskKind, string> = {
  multiplier: 'Repeated multiplier',
  accumulate: 'Accumulated multipliers',
  count: 'Bet / round count',
};

// ---------------------------------------------------------------------------
// Day-level results reported by our team. Internal observations: aggregates,
// not bet-level telemetry. Task labels are kept exactly as reported.
// ---------------------------------------------------------------------------

export interface ReportedTask {
  game: GameId;
  /** Label as written in the report. */
  reported: string;
  /** Players who completed this task (as reported). */
  completed: number;
}

export interface DayResult {
  day: number;
  registered: number;
  started: number;
  /** Participation rate as reported (%). */
  participationPct: number;
  /** "Duration" as reported, in minutes. */
  durationMin: number;
  winners: number;
  least: ReportedTask;
  most: ReportedTask;
  /** Mismatch between the report and the mission dataset, if any. */
  discrepancy?: string;
}

export const DAY_RESULTS: DayResult[] = [
  { day: 1, registered: 1501, started: 158, participationPct: 10.5, durationMin: 80, winners: 50, least: { game: 'pilot-chicken', reported: 'Pilot Chicken – Collect 100x', completed: 64 }, most: { game: 'plinko', reported: 'Plinko – place 100 bets', completed: 84 } },
  {
    day: 2,
    registered: 1302,
    started: 156,
    participationPct: 12.0,
    durationMin: 49,
    winners: 50,
    least: { game: 'trader', reported: 'Trader – Place 100 bets', completed: 58 },
    most: { game: 'aviator', reported: 'Aviator – Catch 30x ×10', completed: 101 },
    discrepancy:
      'The report names “Trader – Place 100 bets”, but the Day 2 mission list has Trader “Collect 100× in total” and Keno “Place 100 individual bets”. Confirm which task had 58 completions.',
  },
  { day: 3, registered: 1270, started: 164, participationPct: 12.9, durationMin: 63, winners: 50, least: { game: 'aviator', reported: 'Aviator – Catch 30x ×10', completed: 62 }, most: { game: 'plinko', reported: 'Plinko – place 300 bets', completed: 113 } },
  { day: 4, registered: 1257, started: 157, participationPct: 12.5, durationMin: 91, winners: 50, least: { game: 'plinko', reported: 'Plinko – Catch 15x x10', completed: 50 }, most: { game: 'keno', reported: 'Keno - place 300 bets', completed: 96 } },
  { day: 5, registered: 1298, started: 150, participationPct: 11.6, durationMin: 128, winners: 50, least: { game: 'aviator', reported: 'Aviator – Catch 30x ×30', completed: 58 }, most: { game: 'goal', reported: 'Goal – place 300 bets', completed: 97 } },
  { day: 6, registered: 1580, started: 191, participationPct: 12.1, durationMin: 299, winners: 0, least: { game: 'keno', reported: 'Keno – Catch 30x ×20', completed: 0 }, most: { game: 'plinko', reported: 'Plinko – Collect 300x', completed: 88 } },
  { day: 7, registered: 1530, started: 171, participationPct: 11.2, durationMin: 219, winners: 50, least: { game: 'aviator', reported: 'Aviator – Catch 30x ×30', completed: 52 }, most: { game: 'goal', reported: 'Goal – Collect 300x', completed: 102 } },
];

export const PRIZE_PLACES_REPORTED = 50;

export function resultForDay(day: number): DayResult | undefined {
  return DAY_RESULTS.find((r) => r.day === day);
}

/** Participation rate recomputed from the reported counts (decimal). */
export const participation = (r: DayResult) => r.started / r.registered;

/** Share of players who started a task that had to finish everything to fill all prize places. */
export const shareOfStartersNeeded = (r: DayResult, places = PRIZE_PLACES_REPORTED) => places / r.started;
