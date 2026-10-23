import { describe, expect, it } from 'vitest';
import { gameMap } from '../sim/engine';
import { SIM_GAMES } from '../sim/games';
import { simMissionsForDay } from '../sim/days';
import { DEFAULT_CLOCK, chanceAtLeastHits, flightSec, hitsPerHour, meanRoundSec, roundsPerHour } from './clock';
import { FIT_DAYS } from './days';
import { fitSpeed, simulateDay, suggestTarget, type TimerSettings } from './model';

const games = gameMap(SIM_GAMES);
const base: TimerSettings = { players: 100, prizes: 50, windowMin: 299, betsPerRound: 2, clock: DEFAULT_CLOCK, speed: 1, spread: 0.5, runs: 120, seed: 4 };

describe('Aviator clock', () => {
  it('average round is betting + RTP / k + pause', () => {
    expect(meanRoundSec(DEFAULT_CLOCK)).toBeCloseTo(5 + 0.97 / 0.065 + 1.5, 9);
    expect(roundsPerHour(DEFAULT_CLOCK)).toBeGreaterThan(160);
    expect(roundsPerHour(DEFAULT_CLOCK)).toBeLessThan(175);
  });
  it('30× is reached about 52 seconds after take-off', () => expect(flightSec(30, DEFAULT_CLOCK)).toBeCloseTo(52.3, 1));
  it('about 5.4 rounds an hour reach 30×', () => expect(hitsPerHour(30, DEFAULT_CLOCK)).toBeCloseTo(5.4, 1));
  it('simulated rounds match the average round length', () => {
    const one = simulateDay([{ game: 'aviator', kind: 'bets', target: 2000 }], games, { ...base, betsPerRound: 1, players: 50, prizes: 1, windowMin: 6000, runs: 20 });
    // 2,000 rounds should take about 2,000 average rounds.
    expect(one.median / ((2000 * meanRoundSec(DEFAULT_CLOCK)) / 60)).toBeCloseTo(1, 1);
  });
  it('one bet a round could not have finished Day 5 in 2h 08m', () => {
    expect(chanceAtLeastHits(30, 30, 128, DEFAULT_CLOCK)).toBeLessThan(0.001);
    expect(chanceAtLeastHits(15, 30, 128, DEFAULT_CLOCK)).toBeGreaterThan(0.1);
  });
});

describe('last-prize model', () => {
  it('is reproducible', () => {
    const a = simulateDay(simMissionsForDay(7), games, base);
    const b = simulateDay(simMissionsForDay(7), games, base);
    expect(a.median).toBe(b.median);
  });
  it('Day 6 leaves every prize (Keno 30× twenty times)', () => {
    const r = simulateDay(simMissionsForDay(6), games, { ...base, speed: 2, runs: 30 });
    expect(r.pAllGone).toBe(0);
  });
  it('the fit lands every reported day inside a sensible range', () => {
    const fit = fitSpeed(FIT_DAYS, games, { ...base, runs: 50 });
    expect(fit.speed).toBeGreaterThan(1.4);
    expect(fit.speed).toBeLessThan(2.9);
    for (const d of fit.perDay) expect(Math.abs(Math.log(d.median / d.reported))).toBeLessThan(0.6);
  }, 120_000);
  it('suggests a larger Aviator count to push the last prize later', () => {
    const missions = simMissionsForDay(2);
    const i = missions.findIndex((m) => m.game === 'aviator');
    const s = suggestTarget(missions, games, { ...base, speed: 2, runs: 60 }, 200, i);
    expect(s).not.toBeNull();
    expect(s!.to).toBeGreaterThan(s!.from);
  });
});
