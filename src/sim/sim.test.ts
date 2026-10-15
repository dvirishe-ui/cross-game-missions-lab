import { describe, expect, it } from 'vitest';
import { calibrate, gameMap, simulate } from './engine';
import { SIM_GAMES, chanceAtLeast, oneIn } from './games';
import { CALIBRATION_DAYS, ENGAGED_SHARE_FROM_DATA, simMissionsForDay } from './days';
import { KENO_PAYTABLE, PLINKO_TABLES, goalMultiplier, kenoHitChance, minesMultiplier, rtpOfKeno, rtpOfPlinko } from './paytables';

const games = gameMap(SIM_GAMES);
const base = { starters: 160, engagedShare: 0.6, prizes: 50, eventMinutes: 300, spread: 0.5, speed: 1, runs: 80, seed: 3 };

describe('paytables reproduce the published 97% RTP', () => {
  it.each(Object.keys(KENO_PAYTABLE))('Keno %s picks', (picks) => expect(rtpOfKeno(Number(picks))).toBeCloseTo(0.97, 2));
  it.each(PLINKO_TABLES.map((t) => [`${t.rows} ${t.colour}`, t] as const))('Plinko %s', (_, t) => expect(rtpOfPlinko(t)).toBeCloseTo(0.97, 3));
  it('Keno hit chances sum to 1', () => {
    const total = Array.from({ length: 8 }, (_, h) => kenoHitChance(7, h)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
  });
  it('Mines and Goal match published multipliers', () => {
    expect(minesMultiplier(3, 1)).toBeCloseTo(1.1023, 3);
    expect(minesMultiplier(3, 10)).toBeCloseTo(4.9033, 3);
    expect(goalMultiplier(5, 10)).toBeCloseTo(9.03, 2);
    expect(Math.floor(goalMultiplier(4, 7) * 100) / 100).toBe(7.26); // published values are truncated
    expect(goalMultiplier(3, 4)).toBeCloseTo(4.91, 2);
  });
});

describe('game chances', () => {
  it('Aviator uses RTP / X', () => expect(chanceAtLeast(games.aviator, 30).p).toBeCloseTo(0.97 / 30, 12));
  it('Keno 30× or more is about 1 in 1,496 (7 picks, 6+ hits)', () => {
    const c = chanceAtLeast(games.keno, 30);
    expect(c.p).toBeCloseTo((210 * 26 + 120) / 8347680, 10);
    expect(oneIn(c.p)).toBe('1 in 1,496');
  });
  it('Keno cannot exceed its 100× maximum', () => expect(chanceAtLeast(games.keno, 150).p).toBe(0));
  it('Plinko 15× or more is best on 12 rows red', () => {
    const c = chanceAtLeast(games.plinko, 15);
    expect(c.setup).toBe('12 rows, red');
    expect(c.p).toBeCloseTo(26 / 4096, 12);
  });
  it('Goal can never reach 10×', () => expect(chanceAtLeast(games.goal, 10).p).toBe(0));
  it('Mines picks the best grid for the target', () => {
    const c = chanceAtLeast(games.mines, 30);
    expect(c.pays).toBeGreaterThanOrEqual(30);
    expect(c.p).toBeCloseTo(0.97 / c.pays, 12);
  });
});

describe('simulation', () => {
  it('maps the previous campaign missions', () => {
    expect(simMissionsForDay(6).find((m) => m.game === 'keno')).toEqual({ game: 'keno', kind: 'catch', target: 20, threshold: 30 });
    expect(CALIBRATION_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(ENGAGED_SHARE_FROM_DATA).toBeGreaterThan(0.55);
    expect(ENGAGED_SHARE_FROM_DATA).toBeLessThan(0.65);
  });
  it('is reproducible with the same seed', () => {
    const a = simulate(simMissionsForDay(7), games, base);
    const b = simulate(simMissionsForDay(7), games, base);
    expect(a.finalPrize).toEqual(b.finalPrize);
  });
  it('a faster speed factor shortens time in proportion', () => {
    const slow = simulate(simMissionsForDay(1), games, base, 6000);
    const fast = simulate(simMissionsForDay(1), games, { ...base, speed: 2 }, 6000);
    expect(fast.finalPrize!.median / slow.finalPrize!.median).toBeCloseTo(0.5, 2);
  });
  it('Day 6 produces no winners with the real Keno paytable', () => {
    const r = simulate(simMissionsForDay(6), games, { ...base, starters: 191, speed: 2 });
    expect(r.avgWinners).toBe(0);
    expect(r.missionDoneMedian[simMissionsForDay(6).findIndex((m) => m.game === 'keno')]).toBe(0);
  });
  it('a chance override replaces the game model', () => {
    const r = simulate([{ game: 'keno', kind: 'catch', target: 5, threshold: 30, chanceOverride: 0 }], games, base);
    expect(r.avgWinners).toBe(0);
  });
  it('winners never exceed prizes, and bottleneck shares sum to 1', () => {
    const r = simulate(simMissionsForDay(3), games, base);
    expect(r.runs.every((x) => x.winners <= 50)).toBe(true);
    expect(r.bottleneckShare.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it('calibration lines up with the reported days', () => {
    const cal = calibrate(CALIBRATION_DAYS, games, { ...base, runs: 60 });
    expect(cal.speed).toBeGreaterThan(0.5);
    expect(cal.speed).toBeLessThan(5);
    for (const d of cal.perDay) expect(Math.abs(Math.log(d.simulated / d.reported))).toBeLessThan(0.7);
  });
});

describe('turnout sweep', () => {
  it('fewer players than prizes can never claim them all', async () => {
    const { sweepPoint } = await import('./engine');
    const p = sweepPoint(simMissionsForDay(2), games, { ...base, speed: 2, runs: 30 }, 25);
    expect(p.pAllClaimed).toBe(0);
    expect(p.median).toBe(Infinity);
  });
  it('finds the turnout where prizes start running out', async () => {
    const { playersToEmptyPrizes } = await import('./engine');
    const pts = [
      { players: 50, p10: 0, median: Infinity, p90: Infinity, pAllClaimed: 0.2, avgWinners: 40 },
      { players: 100, p10: 0, median: 200, p90: 250, pAllClaimed: 0.8, avgWinners: 50 },
    ];
    expect(playersToEmptyPrizes(pts)).toBe(75);
  });
  it('Day 6 never empties the prizes at any turnout', async () => {
    const { sweepPoint } = await import('./engine');
    expect(sweepPoint(simMissionsForDay(6), games, { ...base, speed: 2, runs: 20 }, 1000).pAllClaimed).toBe(0);
  });
});
