// CSV export/import and telemetry validation. Telemetry must use anonymous
// identifiers; names, emails and payment details are rejected.

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export type FieldType = 'string' | 'int' | 'number' | 'timestamp' | 'boolean';

export interface TelemetryField {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
}

export const TELEMETRY_FIELDS: TelemetryField[] = [
  { name: 'campaign_id', type: 'string', required: true, description: 'Campaign identifier.' },
  { name: 'day', type: 'int', required: true, description: 'Campaign day number.' },
  { name: 'player_id', type: 'string', required: true, description: 'Anonymous player ID (hashed). No names or emails.' },
  { name: 'opt_in_at', type: 'timestamp', required: false, description: 'Opt-in / mission start timestamp (ISO 8601 with timezone).' },
  { name: 'game', type: 'string', required: true, description: 'Game, e.g. aviator, keno, keno-80.' },
  { name: 'game_version', type: 'string', required: false, description: 'Game version (ordinary Keno vs Keno 80 must differ).' },
  { name: 'config_id', type: 'string', required: false, description: 'Configuration identifier (risk level, number selections, rows…).' },
  { name: 'round_id', type: 'string', required: false, description: 'Shared round ID (same for all players in a shared round).' },
  { name: 'bet_id', type: 'string', required: true, description: 'Unique bet ID.' },
  { name: 'bet_placed_at', type: 'timestamp', required: true, description: 'Bet placement timestamp.' },
  { name: 'bet_settled_at', type: 'timestamp', required: true, description: 'Bet settlement timestamp.' },
  { name: 'stake', type: 'number', required: true, description: 'Stake amount.' },
  { name: 'payout', type: 'number', required: true, description: 'Payout amount (state whether it includes the returned stake).' },
  { name: 'multiplier', type: 'number', required: false, description: 'Settled multiplier as recorded by the game.' },
  { name: 'bet_status', type: 'string', required: false, description: 'settled / void / refunded.' },
  { name: 'mission_id', type: 'string', required: false, description: 'Mission this bet counted toward.' },
  { name: 'progress_increment', type: 'number', required: false, description: 'Progress added to the mission by this bet.' },
  { name: 'mission_completed_at', type: 'timestamp', required: false, description: 'Mission completion timestamp (on the completing row).' },
  { name: 'session_stop_at', type: 'timestamp', required: false, description: 'Session stop timestamp.' },
  { name: 'concurrent_games', type: 'int', required: false, description: 'Number of games the player had open at bet time.' },
  { name: 'prize_eligible', type: 'boolean', required: false, description: 'Whether the player became prize eligible.' },
  { name: 'prize_claimed_at', type: 'timestamp', required: false, description: 'Prize claim timestamp.' },
  { name: 'prize_amount', type: 'number', required: false, description: 'Prize amount.' },
  { name: 'prize_places_available', type: 'int', required: false, description: 'Prize places available for that campaign day.' },
];

const FORBIDDEN = /(^|_)(name|first_?name|last_?name|email|e_?mail|phone|address|card|iban|account_?number|payment|dob|birth)(_|$)/i;

export const TEMPLATE_EXAMPLE: (string | number)[] = [
  'CGM-2026-07',
  7,
  'p_9f2c1a',
  '2026-07-07T12:00:05Z',
  'keno',
  'keno-standard',
  'picks-10',
  'r_558812',
  'b_1000001',
  '2026-07-07T12:00:41Z',
  '2026-07-07T12:00:44Z',
  1,
  0,
  0,
  'settled',
  'day7-keno',
  0,
  '',
  '',
  2,
  'false',
  '',
  '',
  50,
];

export function telemetryTemplateCsv(): string {
  return toCsv([TELEMETRY_FIELDS.map((f) => f.name), TEMPLATE_EXAMPLE]);
}

export interface TelemetryRow {
  [k: string]: string | number | boolean | null;
}

export interface ValidationIssue {
  row: number; // 1-based data row (0 = header)
  field: string;
  message: string;
}

export interface ValidationResult {
  rows: TelemetryRow[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  columns: string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function parseTimestamp(v: string): number | null {
  if (!ISO.test(v.trim())) return null;
  const t = Date.parse(v.trim().replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

export function validateTelemetry(text: string, maxIssues = 200): ValidationResult {
  const table = parseCsv(text);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (table.length === 0) return { rows: [], errors: [{ row: 0, field: '', message: 'The file is empty.' }], warnings, columns: [] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const known = new Map(TELEMETRY_FIELDS.map((f) => [f.name, f]));
  for (const h of header) {
    if (FORBIDDEN.test(h)) errors.push({ row: 0, field: h, message: `Column "${h}" looks like personal or payment data. Remove it and use anonymous IDs only.` });
    else if (!known.has(h)) warnings.push({ row: 0, field: h, message: `Unknown column "${h}" will be ignored.` });
  }
  for (const f of TELEMETRY_FIELDS) if (f.required && !header.includes(f.name)) errors.push({ row: 0, field: f.name, message: `Required column "${f.name}" is missing.` });
  if (errors.length) return { rows: [], errors, warnings, columns: header };

  const rows: TelemetryRow[] = [];
  const betIds = new Set<string>();
  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const row: TelemetryRow = {};
    const push = (field: string, message: string) => errors.length < maxIssues && errors.push({ row: i, field, message });
    if (raw.length !== header.length) push('', `Expected ${header.length} fields, found ${raw.length}.`);
    header.forEach((h, j) => {
      const f = known.get(h);
      if (!f) return;
      const v = (raw[j] ?? '').trim();
      if (v === '') {
        row[h] = null;
        if (f.required) push(h, 'Required value is empty.');
        return;
      }
      switch (f.type) {
        case 'int':
          if (!/^-?\d+$/.test(v)) push(h, `"${v}" is not a whole number.`);
          row[h] = Number(v);
          break;
        case 'number':
          if (!Number.isFinite(Number(v))) push(h, `"${v}" is not a number.`);
          row[h] = Number(v);
          break;
        case 'timestamp': {
          const t = parseTimestamp(v);
          if (t == null) push(h, `"${v}" is not an ISO 8601 timestamp (e.g. 2026-07-07T12:00:41Z).`);
          else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v)) warnings.length < maxIssues && warnings.push({ row: i, field: h, message: 'Timestamp has no timezone; it is read as local time.' });
          row[h] = t;
          break;
        }
        case 'boolean':
          if (!/^(true|false|1|0|yes|no)$/i.test(v)) push(h, `"${v}" is not true/false.`);
          row[h] = /^(true|1|yes)$/i.test(v);
          break;
        default:
          row[h] = v;
      }
    });
    if (typeof row.player_id === 'string' && row.player_id.includes('@')) push('player_id', 'Player ID looks like an email address. Use an anonymous ID.');
    if (typeof row.bet_id === 'string') {
      if (betIds.has(row.bet_id)) push('bet_id', `Duplicate bet ID "${row.bet_id}".`);
      betIds.add(row.bet_id);
    }
    const placed = row.bet_placed_at as number | null;
    const settled = row.bet_settled_at as number | null;
    if (placed != null && settled != null && settled < placed) push('bet_settled_at', 'Settlement is earlier than placement.');
    const optIn = row.opt_in_at as number | null;
    if (optIn != null && placed != null && placed < optIn) warnings.length < maxIssues && warnings.push({ row: i, field: 'bet_placed_at', message: 'Bet placed before opt-in.' });
    if (typeof row.stake === 'number' && row.stake <= 0) push('stake', 'Stake must be greater than zero.');
    if (typeof row.payout === 'number' && row.payout < 0) push('payout', 'Payout cannot be negative.');
    if (typeof row.multiplier === 'number' && typeof row.stake === 'number' && typeof row.payout === 'number' && row.stake > 0) {
      const implied = row.payout / row.stake;
      if (Math.abs(implied - row.multiplier) > Math.max(0.01, implied * 0.01))
        warnings.length < maxIssues && warnings.push({ row: i, field: 'multiplier', message: `Recorded multiplier ${row.multiplier} differs from payout ÷ stake (${implied.toFixed(4)}).` });
    }
    rows.push(row);
  }
  return { rows, errors, warnings, columns: header };
}
