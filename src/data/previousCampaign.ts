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
export const DAY_OBSERVATIONS: DayObservation[] = [1, 2, 3, 4, 5]
  .map(
    (day): DayObservation => ({
      day,
      tone: 'fast',
      badge: 'Prizes claimed too quickly',
      detail: 'Team report: prizes were claimed too quickly on Days 1–5. No timestamps supplied.',
    }),
  )
  .concat([
    {
      day: 6,
      tone: 'blocked',
      badge: 'Keno mission not completed',
      detail:
        'Team report: nobody completed the Keno mission requiring a multiplier of 30× or more twenty times. Cause not established.',
    },
    {
      day: 7,
      tone: 'ok',
      badge: 'Timing reported as working well',
      detail: 'Team report: the timing worked well. No timestamps, player counts or throughput data supplied.',
    },
  ]);

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
