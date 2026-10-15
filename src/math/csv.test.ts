import { describe, expect, it } from 'vitest';
import { parseCsv, telemetryTemplateCsv, toCsv, validateTelemetry } from './csv';
import { availability, finalPrize, multiplierFrequency } from './telemetry';

describe('CSV', () => {
  it('round-trips quoted fields', () => {
    const csv = toCsv([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
  it('the template validates', () => {
    const r = validateTelemetry(telemetryTemplateCsv());
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
  it('rejects personal-data columns and missing required columns', () => {
    const r = validateTelemetry('campaign_id,day,email\nX,1,a@b.c');
    expect(r.errors.some((e) => e.field === 'email')).toBe(true);
    expect(r.errors.some((e) => e.field === 'bet_id')).toBe(true);
  });
  it('validates timestamps and ordering', () => {
    const head = 'campaign_id,day,player_id,game,bet_id,bet_placed_at,bet_settled_at,stake,payout';
    const r = validateTelemetry(`${head}\nC,1,p1,keno,b1,yesterday,2026-07-07T12:00:00Z,1,0\nC,1,p1,keno,b2,2026-07-07T12:00:10Z,2026-07-07T12:00:00Z,1,0`);
    expect(r.errors.some((e) => e.row === 1 && e.field === 'bet_placed_at')).toBe(true);
    expect(r.errors.some((e) => e.row === 2 && e.field === 'bet_settled_at')).toBe(true);
  });
  it('only lists analyses supported by the uploaded columns', () => {
    const r = validateTelemetry(telemetryTemplateCsv());
    const a = availability(r.columns, r.rows);
    expect(a.find((x) => x.id === 'frequency')!.available).toBe(true);
    expect(a.find((x) => x.id === 'finishers')!.available).toBe(false);
  });
  it('computes frequency and K-th claim', () => {
    const head = 'campaign_id,day,player_id,game,bet_id,bet_placed_at,bet_settled_at,stake,payout,multiplier,prize_claimed_at,prize_places_available';
    const rows = [
      `C,6,p1,keno,b1,2026-07-06T12:00:00Z,2026-07-06T12:00:01Z,1,30,30,2026-07-06T13:00:00Z,2`,
      `C,6,p2,keno,b2,2026-07-06T12:00:00Z,2026-07-06T12:00:01Z,1,0,0,2026-07-06T14:00:00Z,2`,
      `C,6,p3,keno,b3,2026-07-06T12:00:00Z,2026-07-06T12:00:01Z,1,0,0,,2`,
    ];
    const v = validateTelemetry([head, ...rows].join('\n'));
    expect(v.errors).toEqual([]);
    const f = multiplierFrequency(v.rows, 30, 'gte');
    expect(f[0].hits).toBe(1);
    expect(f[0].settled).toBe(3);
    const fp = finalPrize(v.rows);
    expect(fp[0].finalPrizeClaim).toBe(Date.parse('2026-07-06T14:00:00Z'));
  });
});
