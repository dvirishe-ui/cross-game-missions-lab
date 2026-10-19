// Before / during / after player counts for the non-Aviator mission games.
// All values come from the user; nothing is pre-filled.

export interface GameRow {
  game: string;
  before: number | null;
  during: number | null;
  after: number | null;
  /** Played during the campaign but not before. */
  newDuring: number | null;
  /** Of those new players, how many still played after. */
  newStillAfter: number | null;
}

export interface Periods {
  before: number | null; // days
  during: number | null;
  after: number | null;
}

export const DEFAULT_GAMES = ['Pilot Chicken', 'Plinko', 'Mines', 'Goal', 'Keno', 'Trader'];

export const emptyRow = (game: string): GameRow => ({ game, before: null, during: null, after: null, newDuring: null, newStillAfter: null });

export const CSV_HEADER = 'game,before_players,during_players,after_players,new_in_campaign,new_still_playing_after';

export function templateCsv(games = DEFAULT_GAMES): string {
  return [CSV_HEADER, ...games.map((g) => `${g},,,,,`)].join('\n');
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? '').trim().replace(/[ ,](?=\d{3}\b)/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export function parseCsv(text: string): { rows: GameRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ['Nothing to read.'] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const head = lines[0].toLowerCase().split(sep).map((h) => h.trim());
  const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const idx = {
    game: col(['game']),
    before: col(['before']),
    during: col(['during']),
    after: col(['after_players', 'after']),
    newDuring: col(['new_in', 'new_during', 'new players']),
    newStillAfter: col(['still']),
  };
  // "after" also matches "new_still_playing_after": prefer an exact-ish match.
  const exactAfter = head.findIndex((h) => h === 'after_players' || h === 'after');
  if (exactAfter >= 0) idx.after = exactAfter;
  if (idx.game < 0) return { rows: [], errors: ['Header needs a "game" column. Copy the template to see the format.'] };
  const rows: GameRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const f = line.split(sep);
    const get = (j: number) => (j >= 0 ? num(f[j]) : null);
    const row: GameRow = {
      game: (f[idx.game] ?? '').trim(),
      before: get(idx.before),
      during: get(idx.during),
      after: get(idx.after),
      newDuring: get(idx.newDuring),
      newStillAfter: get(idx.newStillAfter),
    };
    if (!row.game) return;
    const bad = (Object.keys(row) as (keyof GameRow)[]).filter((k) => k !== 'game' && Number.isNaN(row[k] as number));
    if (bad.length) errors.push(`Line ${i + 2} (${row.game}): ${bad.join(', ')} must be a whole number of 0 or more.`);
    rows.push(row);
  });
  return { rows, errors };
}

export function validate(r: GameRow): string[] {
  const e: string[] = [];
  if (r.newDuring != null && r.during != null && r.newDuring > r.during) e.push('new players cannot exceed players during');
  if (r.newStillAfter != null && r.newDuring != null && r.newStillAfter > r.newDuring) e.push('“still playing” cannot exceed new players');
  if (r.newStillAfter != null && r.after != null && r.newStillAfter > r.after) e.push('“still playing” cannot exceed players after');
  return e;
}

/** Players per day when period lengths are given, otherwise the raw count. */
export function perDay(n: number | null, days: number | null): number | null {
  if (n == null) return null;
  return days && days > 0 ? n / days : n;
}

export function change(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return to / from - 1;
}

export interface Summary {
  before: number | null;
  during: number | null;
  after: number | null;
  newDuring: number | null;
  newStillAfter: number | null;
  /** Share of campaign-new players still playing after. */
  keptNew: number | null;
}

/** Totals over games, only for columns every listed game has filled in. */
export function summarize(rows: GameRow[]): Summary {
  const sum = (k: keyof Omit<GameRow, 'game'>) => (rows.length && rows.every((r) => r[k] != null) ? rows.reduce((a, r) => a + (r[k] as number), 0) : null);
  const s = { before: sum('before'), during: sum('during'), after: sum('after'), newDuring: sum('newDuring'), newStillAfter: sum('newStillAfter') };
  return { ...s, keptNew: s.newDuring && s.newStillAfter != null ? s.newStillAfter / s.newDuring : null };
}
