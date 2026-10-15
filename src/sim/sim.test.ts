import { describe, expect, it } from 'vitest';
import { calibrate, gameMap, simulate } from './engine';
import { SIM_GAMES, chanceAtLeast, oneIn } from './games';
import { CALIBRATION_DAYS, ENGAGED_SHARE_FROM_DATA, simMissionsForDay } from './days';
import { zeroFinisherCeiling } from './kenoCheck';

const games = gameMap(SIM_GAMES);
const base = { starters: 160, engagedShare: 0.6, prizes: 50, eventMinutes: 300, spread: 0.5, speed: 1, runs: 80, seed: 3 };

describe('game chances', () => {
  it('aim and crash games use RTP / X', () => {
    expect(chanceAtLeast(games.aviator, 30)).toBeCloseTo(0.97 / 30, 12);
    expect(chanceAtLeast(games.mines, 2)).toBeCloseTo(0.485, 12);
  });
  it('paytable games scale the best case', () => {
    expect(chanceAtLeast({ ...games.keno, paytableShare: 0.1 }, 30)).toBeCloseTo(0.097 / 30, 12);
  });
  it('formats odds', () => {
    expect(oneIn(0.97 / 30)).toBe('1 in 31');
    expect(oneIn(0)).toBe('never');
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
  it('an impossible mission produces no winners', () => {
    const r = simulate([{ game: 'keno', kind: 'catch', target: 5, threshold: 30 }], gameMap(SIM_GAMES.map((g) => (g.id === 'keno' ? { ...g, paytableShare: 0 } : g))), base);
    expect(r.avgWinners).toBe(0);
    expect(r.pAllClaimed).toBe(0);
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
  it('Day 6 implies Keno 30× was far rarer than the best case', () => {
    const ceiling = zeroFinisherCeiling({ k: 20, betsPerMin: 6 * 1.7, minutes: 299, engaged: 115, spread: 0.5 });
    expect(ceiling).toBeLessThan(chanceAtLeast(games.keno, 30) / 5);
  });
});
