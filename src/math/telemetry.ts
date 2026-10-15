import { wilsonInterval } from './binomial';
import type { TelemetryRow } from './csv';

// Analyses that are only shown when the uploaded columns support them.

export interface AnalysisAvailability {
  id: string;
  title: string;
  needs: string[];
  available: boolean;
  missingColumns: string[];
}

export const ANALYSES: { id: string; title: string; needs: string[] }[] = [
  { id: 'finishers', title: 'Mission finishers and completion timestamps', needs: ['mission_id', 'mission_completed_at'] },
  { id: 'final-prize', title: 'Final prize-winning finisher (K-th claim)', needs: ['prize_claimed_at', 'prize_places_available'] },
  { id: 'frequency', title: 'Observed settled-multiplier frequency', needs: ['multiplier'] },
  { id: 'throughput', title: 'Settled bets per active minute', needs: ['bet_settled_at'] },
  { id: 'rounds-vs-bets', title: 'Rounds versus bets', needs: ['round_id'] },
  { id: 'concurrency', title: 'Concurrent-game activity', needs: ['concurrent_games'] },
];

export function availability(columns: string[], rows: TelemetryRow[]): AnalysisAvailability[] {
  return ANALYSES.map((a) => {
    const missingColumns = a.needs.filter((c) => !columns.includes(c) || !rows.some((r) => r[c] != null));
    return { ...a, available: rows.length > 0 && missingColumns.length === 0, missingColumns };
  });
}

const isSettled = (r: TelemetryRow) => r.bet_status == null || String(r.bet_status).toLowerCase() === 'settled';
const key = (r: TelemetryRow) => `${r.campaign_id} · day ${r.day}`;

export interface FinisherRow {
  group: string;
  mission: string;
  finishers: number;
  first: number;
  last: number;
}

export function finishers(rows: TelemetryRow[]): FinisherRow[] {
  const map = new Map<string, { group: string; mission: string; players: Map<string, number> }>();
  for (const r of rows) {
    if (r.mission_completed_at == null || r.mission_id == null) continue;
    const k = `${key(r)}|${r.mission_id}`;
    if (!map.has(k)) map.set(k, { group: key(r), mission: String(r.mission_id), players: new Map() });
    const players = map.get(k)!.players;
    const prev = players.get(String(r.player_id));
    const t = r.mission_completed_at as number;
    if (prev == null || t < prev) players.set(String(r.player_id), t);
  }
  return [...map.values()].map((v) => {
    const ts = [...v.players.values()].sort((a, b) => a - b);
    return { group: v.group, mission: v.mission, finishers: ts.length, first: ts[0], last: ts[ts.length - 1] };
  });
}

export interface FinalPrizeRow {
  group: string;
  places: number;
  claims: number;
  firstClaim?: number;
  finalPrizeClaim?: number; // K-th claim timestamp
  unclaimed: number;
}

export function finalPrize(rows: TelemetryRow[]): FinalPrizeRow[] {
  const groups = new Map<string, { places: number | null; claims: Map<string, number> }>();
  for (const r of rows) {
    const g = key(r);
    if (!groups.has(g)) groups.set(g, { places: null, claims: new Map() });
    const entry = groups.get(g)!;
    if (typeof r.prize_places_available === 'number') entry.places = r.prize_places_available;
    if (typeof r.prize_claimed_at === 'number') {
      const prev = entry.claims.get(String(r.player_id));
      if (prev == null || r.prize_claimed_at < prev) entry.claims.set(String(r.player_id), r.prize_claimed_at);
    }
  }
  return [...groups.entries()]
    .filter(([, v]) => v.places != null)
    .map(([group, v]) => {
      const ts = [...v.claims.values()].sort((a, b) => a - b);
      const places = v.places!;
      return {
        group,
        places,
        claims: ts.length,
        firstClaim: ts[0],
        finalPrizeClaim: ts.length >= places && places > 0 ? ts[places - 1] : undefined,
        unclaimed: Math.max(0, places - ts.length),
      };
    });
}

export interface FrequencyRow {
  game: string;
  version: string;
  config: string;
  settled: number;
  hits: number;
  rate: number;
  ci: [number, number];
}

/** Share of settled bets whose recorded multiplier meets the threshold. */
export function multiplierFrequency(rows: TelemetryRow[], threshold: number, condition: 'gte' | 'eq'): FrequencyRow[] {
  const map = new Map<string, FrequencyRow>();
  for (const r of rows) {
    if (!isSettled(r) || typeof r.multiplier !== 'number') continue;
    const k = `${r.game}|${r.game_version ?? ''}|${r.config_id ?? ''}`;
    if (!map.has(k)) map.set(k, { game: String(r.game), version: String(r.game_version ?? '—'), config: String(r.config_id ?? '—'), settled: 0, hits: 0, rate: 0, ci: [0, 1] });
    const e = map.get(k)!;
    e.settled += 1;
    const hit = condition === 'gte' ? r.multiplier >= threshold : Math.abs(r.multiplier - threshold) < 1e-9;
    if (hit) e.hits += 1;
  }
  return [...map.values()].map((e) => ({ ...e, rate: e.hits / e.settled, ci: wilsonInterval(e.hits, e.settled) }));
}

export interface ThroughputRow {
  game: string;
  players: number;
  bets: number;
  medianBetsPerMinute: number;
}

export function throughput(rows: TelemetryRow[]): ThroughputRow[] {
  const byGame = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    if (!isSettled(r) || typeof r.bet_settled_at !== 'number') continue;
    const g = String(r.game);
    if (!byGame.has(g)) byGame.set(g, new Map());
    const p = byGame.get(g)!;
    const id = String(r.player_id);
    if (!p.has(id)) p.set(id, []);
    p.get(id)!.push(r.bet_settled_at);
  }
  return [...byGame.entries()].map(([game, players]) => {
    const rates: number[] = [];
    let bets = 0;
    for (const ts of players.values()) {
      bets += ts.length;
      if (ts.length < 2) continue;
      const span = (Math.max(...ts) - Math.min(...ts)) / 60000;
      if (span > 0) rates.push((ts.length - 1) / span);
    }
    rates.sort((a, b) => a - b);
    return { game, players: players.size, bets, medianBetsPerMinute: rates.length ? rates[Math.floor((rates.length - 1) / 2)] : NaN };
  });
}

export function roundsVsBets(rows: TelemetryRow[]): { game: string; bets: number; rounds: number }[] {
  const map = new Map<string, { bets: number; rounds: Set<string> }>();
  for (const r of rows) {
    const g = String(r.game);
    if (!map.has(g)) map.set(g, { bets: 0, rounds: new Set() });
    const e = map.get(g)!;
    e.bets += 1;
    if (r.round_id != null) e.rounds.add(String(r.round_id));
  }
  return [...map.entries()].map(([game, e]) => ({ game, bets: e.bets, rounds: e.rounds.size }));
}

export function concurrencyShare(rows: TelemetryRow[]): { bets: number; concurrent: number } {
  const withCol = rows.filter((r) => typeof r.concurrent_games === 'number');
  return { bets: withCol.length, concurrent: withCol.filter((r) => (r.concurrent_games as number) > 1).length };
}
