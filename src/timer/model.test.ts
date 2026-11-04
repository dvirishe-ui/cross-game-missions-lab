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
    const fit = fitSpeed(FIT_DAYS, games, { ...base, spread: 0, runs: 50 });
    expect(fit.speed).toBeGreaterThan(1);
    expect(fit.speed).toBeLessThan(2);
    for (const d of fit.perDay) expect(Math.abs(Math.log(d.median / d.reported))).toBeLessThan(0.6);
  }, 120_000);
  it('more players on auto barely move the last prize', () => {
    const at = (players: number) => simulateDay(simMissionsForDay(7), games, { ...base, players, spread: 0, speed: 1.4, runs: 100 }).median;
    expect(Math.abs(Math.log(at(500) / at(100)))).toBeLessThan(0.2);
  });
  it('suggests a larger Aviator count to push the last prize later', () => {
    const missions = simMissionsForDay(2);
    const i = missions.findIndex((m) => m.game === 'aviator');
    const s = suggestTarget(missions, games, { ...base, speed: 2, runs: 60 }, 200, i);
    expect(s).not.toBeNull();
    expect(s!.to).toBeGreaterThan(s!.from);
  });
});

describe('consistent answers', () => {
  it('more of a task never makes the day shorter, less never makes it longer', async () => {
    const { suggestedSet } = await import('./generate');
    const set = suggestedSet(240, games, 1.4, DEFAULT_CLOCK, 2);
    const s = { ...base, spread: 0, speed: 1.4, runs: 150, windowMin: 300 };
    for (const i of [0, 1, 2]) {
      let prev = -Infinity;
      for (const f of [0.6, 0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
        const m = set.map((t, j) => (j === i ? { ...t, target: Math.max(1, Math.round(t.target * f)) } : t));
        const med = simulateDay(m, games, s, 900).median;
        expect(med).toBeGreaterThanOrEqual(prev);
        prev = med;
      }
    }
  }, 120_000);
  it('changing one task does not change another task’s time', () => {
    const set = simMissionsForDay(7);
    const s = { ...base, spread: 0, speed: 1.4, runs: 80 };
    const a = simulateDay(set, games, s, 900);
    const b = simulateDay(set.map((t, j) => (j === 1 ? { ...t, target: t.target + 5 } : t)), games, s, 900);
    expect(b.missionNthMedian[0]).toBe(a.missionNthMedian[0]);
    expect(b.missionNthMedian[3]).toBe(a.missionNthMedian[3]);
  }, 60_000);
});
