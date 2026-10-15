import { describe, expect, it } from 'vitest';
import { binomTailGE, negBinomQuantileAttempts, requiredProbability } from './binomial';
import { calcAccumulate, calcCount, calcMultiplier, DEFAULT_DEFINITION, parseOutcomes } from './calculators';
import { atLeastK, combineParallel, combineSequential, evaluateScenario, firstFinisher, kthSmallest } from './campaign';
import { decimalToPercent, fmtDuration, fmtPercent, hoursToMinutes, minutesToHours, percentToDecimal } from './format';
import { calcEconomics } from './economics';
import { cloneDay, defaultScenario, illustrativeScenario, newTask, scenarioFromJson, scenarioToJson, experimentB } from '../state/scenarios';
import { DAY_RESULTS, PREVIOUS_MISSIONS, diffDays, participation } from '../data/previousCampaign';
import { hoursBetween } from '../data/competitors';

const keno = (p: number) => calcMultiplier({ threshold: 30, condition: 'gte', k: 20, p, rate: 10, deadline: 300, canProduce: 'unknown' });

describe('Keno-style illustrative example (k = 20, r = 10/min, t = 300 min)', () => {
  it('uses 3,000 attempts', () => expect(keno(0.01).attemptsByDeadline).toBe(3000));
  const cases: [number, number, number, number][] = [
    // p, mean hours, P(by 5h), relative tolerance
    [0.001, 33.33, 7.94e-11, 0.01],
    [0.003, 11.11, 0.001036, 0.005],
    [0.005, 6.67, 0.1242, 0.002],
    [0.006666667, 5.0, 0.53, 0.002],
    [0.01, 3.33, 0.9786, 0.0005],
  ];
  it.each(cases)('p = %f', (p, meanH, prob, tol) => {
    const r = keno(p);
    expect(minutesToHours(r.meanMinutes!)).toBeCloseTo(meanH, 1);
    expect(Math.abs(r.pByDeadline! - prob) / prob).toBeLessThan(tol);
  });
  it('a five-hour mean does not mean most players finish in five hours', () => {
    const r = keno(20 / 3000);
    expect(r.meanMinutes).toBeCloseTo(300, 3);
    expect(r.pByDeadline!).toBeLessThan(0.6);
  });
  it('needs ≈ 0.8624% per attempt for a 90% chance', () => {
    expect(requiredProbability(20, 3000, 0.9) * 100).toBeCloseTo(0.8624, 3);
  });
  it('quantiles follow the total-attempts convention (failures + k)', () => {
    expect(negBinomQuantileAttempts(0.5, 1, 1)).toBe(1);
    expect(negBinomQuantileAttempts(0.5, 1, 0.5)).toBe(1); // P(N<=1)=0.5
    expect(negBinomQuantileAttempts(0.75, 1, 0.5)).toBe(2);
    const r = keno(0.01);
    expect(r.medianMinutes!).toBeGreaterThan(150);
    expect(r.p90Minutes!).toBeGreaterThan(r.medianMinutes!);
  });
});

describe('probability edge cases', () => {
  it('p = 0 is impossible when k > 0', () => expect(keno(0).status).toBe('impossible'));
  it('p = 1 is deterministic', () => {
    const r = keno(1);
    expect(r.status).toBe('deterministic');
    expect(r.meanMinutes).toBe(2);
    expect(r.pByDeadline).toBe(1);
  });
  it('r = 0 makes no progress', () => expect(calcMultiplier({ threshold: 30, condition: 'gte', k: 5, p: 0.1, rate: 0, deadline: 300, canProduce: 'yes' }).status).toBe('no-progress'));
  it('k = 0 is already complete', () => expect(calcMultiplier({ threshold: 30, condition: 'gte', k: 0, p: 0.1, rate: 1, deadline: 300, canProduce: 'yes' }).status).toBe('complete'));
  it('rejects invalid probabilities and negative values', () => {
    expect(keno(1.5).status).toBe('invalid');
    expect(keno(-0.1).status).toBe('invalid');
    expect(calcMultiplier({ threshold: 30, condition: 'gte', k: 5, p: 0.1, rate: -2, deadline: 300, canProduce: 'yes' }).status).toBe('invalid');
  });
  it('a configuration that cannot produce the threshold is impossible', () =>
    expect(calcMultiplier({ threshold: 30, condition: 'eq', k: 5, p: 0.1, rate: 2, deadline: 300, canProduce: 'no' }).status).toBe('impossible'));
  it('missing inputs are reported, never defaulted', () => {
    const r = calcMultiplier({ threshold: 30, condition: 'gte', k: 20, p: null, rate: null, deadline: 300, canProduce: 'unknown' });
    expect(r.status).toBe('missing');
    expect(r.messages.join(' ')).toMatch(/probability/);
  });
  it('binomial tail is exact on small cases', () => {
    expect(binomTailGE(1, 2, 0.5)).toBeCloseTo(0.75, 12);
    expect(binomTailGE(3, 3, 0.5)).toBeCloseTo(0.125, 12);
    expect(binomTailGE(0, 10, 0.3)).toBe(1);
    expect(binomTailGE(11, 10, 0.3)).toBe(0);
  });
});

describe('percent / decimal and minutes / hours', () => {
  it('converts percent input to decimals', () => {
    expect(percentToDecimal('0.5')).toBeCloseTo(0.005, 12);
    expect(percentToDecimal('0.5%')).toBeCloseTo(0.005, 12);
    expect(percentToDecimal('')).toBeNull();
    expect(Number.isNaN(percentToDecimal('abc'))).toBe(true);
    expect(decimalToPercent(0.006666667)).toBe('0.6666667');
  });
  it('formats probabilities', () => {
    expect(fmtPercent(0.1242)).toBe('12.42%');
    expect(fmtPercent(7.94e-11)).toBe('7.94 × 10^-11');
    expect(fmtPercent(0.001036)).toBe('0.10%');
  });
  it('converts minutes and hours', () => {
    expect(minutesToHours(2000)).toBeCloseTo(33.333, 3);
    expect(hoursToMinutes(5)).toBe(300);
    expect(fmtDuration(45)).toBe('45 min');
    expect(fmtDuration(300)).toBe('5 h 00 min');
    expect(fmtDuration(Infinity)).toBe('Never');
  });
});

describe('round-count and bet counting', () => {
  it('generic 30-minute examples', () => {
    for (const [r, n] of [[2, 60], [5, 150], [10, 300], [20, 600]]) expect(calcCount({ target: n, rate: r, unit: 'rounds', betsPerRound: null, startDelay: 0, activeFraction: null }).minutes).toBe(30);
  });
  it('counts bets separately from rounds', () => {
    const rounds = calcCount({ target: 300, rate: 5, unit: 'rounds', betsPerRound: null, startDelay: 0, activeFraction: 1 });
    const bets = calcCount({ target: 300, rate: 5, unit: 'bets', betsPerRound: 2, startDelay: 0, activeFraction: 1 });
    expect(rounds.minutes).toBe(60);
    expect(bets.minutes).toBe(30);
  });
  it('adds start delay and active fraction', () => {
    expect(calcCount({ target: 100, rate: 10, unit: 'rounds', betsPerRound: null, startDelay: 5, activeFraction: 0.5 }).minutes).toBe(25);
  });
  it('flags missing bets-per-round', () => expect(calcCount({ target: 100, rate: 10, unit: 'bets', betsPerRound: null, startDelay: 0, activeFraction: null }).status).toBe('missing'));
});

describe('mandatory tasks and concurrency examples', () => {
  it('six 90% tasks combine to 53.1441%', () => expect(atLeastK(Array(6).fill(0.9), 6)).toBeCloseTo(0.531441, 10));
  it('90% combined needs 98.2593% each', () => expect(Math.pow(0.9, 1 / 6)).toBeCloseTo(0.982593, 6));
  it('parallel max versus sequential sum', () => {
    const times = [40, 25, 30, 20, 45, 35];
    expect(combineSequential(times)).toBe(195);
    expect(combineParallel(times)).toBe(45);
  });
  it('any K uses the K-th completed task', () => {
    expect(kthSmallest([40, 25, 30, 20, 45, 35], 4)).toBe(35);
    expect(kthSmallest([10, Infinity, 20], 2)).toBe(20);
    expect(kthSmallest([10, Infinity, 20], 3)).toBe(Infinity);
  });
});

function deterministicScenario(times: number[]) {
  const s = defaultScenario();
  s.tasks = times.map((m) => newTask({ type: 'count', unit: 'rounds', target: m, rate: 1, label: `${m} rounds` }));
  return s;
}

describe('scenario engine', () => {
  it('parallel completes at the slowest task', () => {
    const r = evaluateScenario(deterministicScenario([40, 25, 30, 20, 45, 35]));
    expect(r.ok).toBe(true);
    expect(r.units[0].median).toBeCloseTo(45, 4);
  });
  it('sequential completes at the sum', () => {
    const s = deterministicScenario([40, 25, 30, 20, 45, 35]);
    s.progression = 'sequential';
    expect(evaluateScenario(s).units[0].median).toBeCloseTo(195, 6);
  });
  it('any K of G uses the K-th task', () => {
    const s = deterministicScenario([40, 25, 30, 20, 45, 35]);
    s.completion = 'anyK';
    s.anyK = 3;
    expect(evaluateScenario(s).units[0].median).toBeCloseTo(30, 4);
  });
  it('concurrency factor slows simultaneous play but not sequential play', () => {
    const s = deterministicScenario([40, 25]);
    s.concurrencyFactor = 50;
    expect(evaluateScenario(s).units[0].median).toBeCloseTo(80, 4);
    s.progression = 'sequential';
    expect(evaluateScenario(s).units[0].median).toBeCloseTo(65, 6);
  });
  it('blocks results when inputs are missing', () => {
    const r = evaluateScenario(cloneDay(7));
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBe(6);
  });
  it('enforces scheduled release times', () => {
    const s = defaultScenario();
    s.progression = 'staged';
    s.stageEntry = 'gated';
    s.stages = [
      { id: 'a', name: 'Stage 1', release: 0, deadline: null, prizeShare: null },
      { id: 'b', name: 'Stage 2', release: 120, deadline: null, prizeShare: null },
    ];
    s.tasks = [newTask({ type: 'count', target: 30, rate: 1, stage: 0, label: 'a' }), newTask({ type: 'count', target: 30, rate: 1, stage: 1, label: 'b' })];
    expect(evaluateScenario(s).units[0].median).toBe(150); // waits for release at 120, then 30 min
    s.stageCarryover = 'carry';
    expect(evaluateScenario(s).units[0].median).toBe(120); // progressed early, unlocked at release
  });
  it('independent hourly stages report each hour separately', () => {
    const s = experimentB();
    s.tasks.forEach((t) => {
      t.target = 30;
      t.rate = 1;
      t.betsPerRound = 1;
    });
    s.entrants = 100;
    s.prizePlaces = 50;
    const r = evaluateScenario(s);
    expect(r.units).toHaveLength(5);
    expect(r.units[2].median).toBe(150);
    expect(r.units[2].prizePlaces).toBe(10);
  });
  it('simulations are reproducible with the same seed', () => {
    const s = illustrativeScenario();
    const a = evaluateScenario(s, { forceMonteCarlo: true });
    const b = evaluateScenario(s, { forceMonteCarlo: true });
    expect(a.units[0].median).toBe(b.units[0].median);
    s.seed = 99;
    const c = evaluateScenario(s, { forceMonteCarlo: true });
    expect(c.units[0].median).not.toBe(a.units[0].median);
  });
  it('Monte Carlo agrees with the exact calculation', () => {
    const s = illustrativeScenario();
    const exact = evaluateScenario(s).units[0].pByDeadline;
    const mc = evaluateScenario(s, { forceMonteCarlo: true }).units[0].pByDeadline;
    expect(Math.abs(exact - mc)).toBeLessThan(0.02);
  });
  it('alternative routes complete at the faster route', () => {
    const s = deterministicScenario([100, 40]);
    s.tasks.forEach((t) => (t.route = 'R'));
    expect(evaluateScenario(s).units[0].median).toBeCloseTo(40, 4);
  });
});

describe('first-finisher model', () => {
  it('only 5% need to finish to exhaust 50 prizes among 1,000 entrants', () => {
    const r = firstFinisher(() => 0.1, 1000, 50, 300);
    expect(r.shareNeeded).toBe(0.05);
    expect(r.expectedFinishers).toBe(100);
    expect(r.pAllClaimed).toBeGreaterThan(0.999);
  });
  it('P(all claimed) = P(Binomial(M, F) ≥ K)', () => {
    const r = firstFinisher(() => 0.05, 1000, 50, 300);
    expect(r.pAllClaimed).toBeCloseTo(binomTailGE(50, 1000, 0.05), 12);
    expect(r.pUnclaimed).toBeCloseTo(1 - r.pAllClaimed, 12);
  });
  it('final-prize time comes before the median player finishes', () => {
    const F = (t: number) => Math.min(1, t / 600);
    const r = firstFinisher(F, 1000, 50, 300);
    expect(r.finalPrize.median).toBeLessThan(60);
  });
});

describe('accumulated multipliers', () => {
  it('mean-only gives a labelled rough approximation', () => {
    const r = calcAccumulate({ target: 300, rate: 5, mode: 'mean', mu: 0.96, outcomes: [], cap: null, definition: DEFAULT_DEFINITION, deadline: 300, samples: 1000, seed: 1 });
    expect(r.approximate).toBe(true);
    expect(r.planningMinutes).toBeCloseTo(62.5, 6);
    expect(r.medianMinutes).toBeUndefined();
  });
  it('distribution simulation is reproducible and reports sample size', () => {
    const { outcomes } = parseOutcomes('0: 50%\n2: 50%');
    const input = { target: 100, rate: 10, mode: 'distribution' as const, mu: null, outcomes, cap: null, definition: DEFAULT_DEFINITION, deadline: 15, samples: 2000, seed: 7 };
    const a = calcAccumulate(input);
    const b = calcAccumulate(input);
    expect(a.samples).toBe(2000);
    expect(a.medianMinutes).toBe(b.medianMinutes);
    expect(a.meanMinutes!).toBeGreaterThan(9);
    expect(a.meanMinutes!).toBeLessThan(11);
  });
  it('rejects distributions that do not sum to 100%', () => {
    const { outcomes } = parseOutcomes('0: 50%\n2: 40%');
    expect(calcAccumulate({ target: 100, rate: 10, mode: 'distribution', mu: null, outcomes, cap: null, definition: DEFAULT_DEFINITION, deadline: 15, samples: 500, seed: 7 }).status).toBe('invalid');
  });
});

describe('data integrity', () => {
  it('keeps all 38 previous missions', () => expect(PREVIOUS_MISSIONS).toHaveLength(38));
  it('Days 5 and 7 share Aviator and Plinko requirements', () => {
    const d = diffDays(5, 7);
    expect(d.find((r) => r.game === 'aviator')!.change).toBe('same');
    expect(d.find((r) => r.game === 'plinko')!.change).toBe('same');
  });
  it('reported participation rates match the reported counts', () => {
    for (const r of DAY_RESULTS) expect(Math.abs(participation(r) * 100 - r.participationPct)).toBeLessThan(0.06);
  });
  it('winners never exceed completions of the least-completed task', () => {
    for (const r of DAY_RESULTS) {
      expect(r.winners).toBeLessThanOrEqual(r.least.completed);
      expect(r.least.completed).toBeLessThanOrEqual(r.most.completed);
    }
  });
  it('cloning a day uses players who started and 50 prize places', () => {
    const s = cloneDay(7);
    expect(s.entrants).toBe(171);
    expect(s.prizePlaces).toBe(50);
    expect(s.baselineDay).toBe(7);
  });
  it('Supabets duration is 53 hours', () => expect(hoursBetween('2026-08-21T18:00', '2026-08-23T23:00')).toBe(53));
  it('scenario JSON round-trips', () => {
    const s = cloneDay(6);
    const back = scenarioFromJson(scenarioToJson(s)).scenario!;
    expect(back.tasks.map((t) => t.label)).toEqual(s.tasks.map((t) => t.label));
    expect(scenarioFromJson('{').error).toBeTruthy();
  });
  it('economics needs every input', () => {
    expect(calcEconomics({ games: [{ game: 'Aviator', turnover: 1000, rtp: null, rtpSource: '' }], rewards: 0, otherCosts: 0 }).ok).toBe(false);
    const r = calcEconomics({ games: [{ game: 'Aviator', turnover: 1000, rtp: 0.97, rtpSource: 'doc' }], rewards: 10, otherCosts: 5 });
    expect(r.expectedMargin).toBeCloseTo(30, 9);
    expect(r.contribution).toBeCloseTo(15, 9);
  });
});
