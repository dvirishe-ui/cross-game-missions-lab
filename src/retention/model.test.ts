import { describe, expect, it } from 'vitest';
import { change, parseCsv, perDay, summarize, templateCsv, validate } from './model';

describe('retention page model', () => {
  it('reads the template and a filled CSV', () => {
    expect(parseCsv(templateCsv()).rows).toHaveLength(6);
    const { rows, errors } = parseCsv('game,before_players,during_players,after_players,new_in_campaign,new_still_playing_after\nMines,100,300,150,220,60\nKeno,10,,12,,');
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ game: 'Mines', before: 100, during: 300, after: 150, newDuring: 220, newStillAfter: 60 });
    expect(rows[1].during).toBeNull();
  });
  it('accepts tab-separated text pasted from a spreadsheet', () => {
    const { rows } = parseCsv('game\tbefore\tduring\tafter\nPlinko\t1,372\t2000\t1500');
    expect(rows[0]).toMatchObject({ before: 1372, during: 2000, after: 1500 });
  });
  it('flags bad values and impossible combinations', () => {
    expect(parseCsv('game,before_players\nMines,abc').errors).toHaveLength(1);
    expect(validate({ game: 'X', before: 1, during: 10, after: 5, newDuring: 20, newStillAfter: 30 })).toHaveLength(3);
  });
  it('summarises only complete columns', () => {
    const s = summarize([
      { game: 'A', before: 10, during: 30, after: 20, newDuring: 25, newStillAfter: 5 },
      { game: 'B', before: 5, during: null, after: 10, newDuring: 15, newStillAfter: 3 },
    ]);
    expect(s.before).toBe(15);
    expect(s.during).toBeNull();
    expect(s.keptNew).toBeCloseTo(8 / 40, 12);
  });
  it('normalises by period length', () => {
    expect(perDay(70, 7)).toBe(10);
    expect(perDay(70, null)).toBe(70);
    expect(change(10, 15)).toBeCloseTo(0.5, 12);
    expect(change(0, 5)).toBeNull();
  });
});
