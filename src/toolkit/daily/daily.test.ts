import { describe, expect, it } from 'vitest';
import { blankProject, normalize, referenceProject } from '../model/project';
import { actions, loadStore, saveStore, seedState, type StoreState } from '../model/store';
import { tcBlocks, toPlain } from '../tc/generate';
import { loadMaster } from '../tc/master';
import { allocate, largestRemainder, slotScenario } from './allocate';
import { aviatorRoundChance, binomAtLeast, individualChance, population, searchFits } from './estimate';
import { exportCsv, exportJson, importJson } from './io';
import { copyDay, defaultPlan, editDay, normalizeDaily, setLength, setTemplate, suggestStarts, totals, type DailyPlan } from './plan';
import { fromInstant, localTimeStatus, scheduleRows, validatePlan } from './schedule';

const errors = (plan: DailyPlan, date = '2026-12-01', tz = 'UTC') => validatePlan(plan, date, tz).filter((i) => i.level === 'error');

describe('Daily Promo: counts', () => {
  it('1–2. defaults: 7 × 4 × 2 = 56 missions, 560 winner slots', () => {
    const t = totals(defaultPlan());
    expect(t.missionsPerDay).toBe(8);
    expect(t.sessions).toBe(28);
    expect(t.missions).toBe(56);
    expect(t.slots).toBe(560);
    expect(t.formula).toBe('7 × 4 × 2 = 56');
  });
  it('4. 8 sessions × 2 missions × 7 days = 112 missions', () => {
    const p = setTemplate(defaultPlan(), { sessionsPerDay: 8 }, 'UTC');
    expect(totals(p).missions).toBe(112);
    expect(totals(p).missionsPerDay).toBe(16);
  });
  it('every default session has Aviator plus a rotating game', () => {
    const p = defaultPlan();
    for (const d of p.days) for (const s of d.sessions) {
      expect(s.missions[0].game).toBe('aviator');
      expect(s.missions[1].game).not.toBe('aviator');
    }
    const second = new Set(p.days[0].sessions.map((s) => s.missions[1].game));
    expect(second.size).toBeGreaterThan(1);
  });
});

describe('Daily Promo: shares and money', () => {
  it('3. equal allocation: 1/56 per mission, 1/560 per slot', () => {
    const a = allocate({ ...defaultPlan(), prizeByHour: 'even' }, null, '');
    expect(a.pools).toHaveLength(56);
    for (const pool of a.pools) {
      expect(pool.share).toBeCloseTo(1 / 56, 12);
      for (const s of pool.payouts) expect(s.share).toBeCloseTo(1 / 560, 12);
    }
  });
  it('9. a blank budget gives shares with no money', () => {
    const a = allocate(defaultPlan(), null, 'USD');
    expect(a.budgetMinor).toBeNull();
    expect(a.pools.every((p) => p.minor === null && p.payouts.every((x) => x.minor === null))).toBe(true);
    expect(allocate(defaultPlan(), 1000, '').budgetMinor).toBeNull(); // no currency → no money either
  });
  it('10. bundle pools are one per session, never duplicated per mission', () => {
    const p = { ...defaultPlan(), rewardMode: 'bundle' as const };
    const a = allocate(p, 10000, 'USD');
    expect(a.pools).toHaveLength(28);
    expect(a.pools.every((x) => x.mission === -1 && x.slots === 10)).toBe(true);
    expect(a.pools.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12);
    expect(totals(p).slots).toBe(280);
  });
  it('11. rounding keeps the exact budget (equal and ranked, odd amounts)', () => {
    for (const payout of ['equal', 'ranked'] as const)
      for (const budget of [1000, 9999.99, 12345.67, 0.57]) {
        const a = allocate({ ...defaultPlan(), payout }, budget, 'USD');
        const sum = a.pools.reduce((s, p) => s + p.payouts.reduce((b, x) => b + x.minor!, 0), 0);
        expect(sum).toBe(Math.round(budget * 100));
        expect(a.totalMinor).toBe(Math.round(budget * 100));
      }
    expect(largestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(defaultPlan(), 1000, 'JPY').budgetMinor).toBe(1000);
  });
  it('flags pools that cannot pay every slot', () => {
    const a = allocate(defaultPlan(), 5, 'USD'); // 500 cents for 560 slots
    expect(a.flags.join(' ')).toMatch(/cannot give every slot/);
  });
  it('custom weights change shares but still add up to the whole', () => {
    let p = defaultPlan();
    p = { ...p, weights: { ...p.weights, day: 'custom' }, days: p.days.map((d, i) => ({ ...d, weight: i + 1 })) };
    const a = allocate(p, null, '');
    expect(a.dayShares[6] / a.dayShares[0]).toBeCloseTo(7, 9);
    expect(a.pools.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12);
  });
  it('5 / 10 / 20 slot scenarios', () => {
    expect(slotScenario(56, 5, null).totalSlots).toBe(280);
    expect(slotScenario(56, 20, 1_000_000).slotMinorFloor).toBe(Math.floor(1_000_000 / 1120));
  });
});

describe('Daily Promo: schedule and deadlines', () => {
  const one = (start: string, lead = 40) => {
    const p = defaultPlan();
    p.leadMin = lead;
    p.days = [{ ...p.days[0], sessions: [{ ...p.days[0].sessions[0], start }] }];
    return p;
  };
  it('5. 16:00 with 40 min lead → 15:20 the same day', () => {
    const r = scheduleRows(one('16:00'), '2026-12-01', 'UTC')[0];
    expect(r.deadline).toEqual({ date: '2026-12-01', time: '15:20' });
    expect(r.prevDate).toBe(false);
  });
  it('6. 00:20 → 23:40 on the previous date', () => {
    const r = scheduleRows(one('00:20'), '2026-12-01', 'UTC')[0];
    expect(r.deadline).toEqual({ date: '2026-11-30', time: '23:40' });
    expect(r.prevDate).toBe(true);
    // also without a time zone (wall-clock fallback)
    expect(scheduleRows(one('00:20'), '2026-12-01', '')[0].deadline).toEqual({ date: '2026-11-30', time: '23:40' });
  });
  it('7. a 39-minute lead is invalid (campaign and per session)', () => {
    expect(errors(one('16:00', 39)).some((e) => /at least 40/.test(e.msg))).toBe(true);
    const p = one('16:00');
    p.days[0].sessions[0].leadMin = 39;
    expect(errors(p).some((e) => /under 40/.test(e.msg))).toBe(true);
    expect(errors(one('16:00', 40)).filter((e) => /lead/i.test(e.msg))).toHaveLength(0);
  });
  it('8. missing Aviator or fewer than 2 missions is invalid', () => {
    const p = one('16:00');
    p.days[0].sessions[0].missions = p.days[0].sessions[0].missions.slice(1);
    const e = errors(p).map((x) => x.msg).join(' ');
    expect(e).toMatch(/at least 2 missions/);
    expect(e).toMatch(/Aviator/);
  });
  it('missing time zone and date are errors; overlaps and hours are caught', () => {
    expect(validatePlan(defaultPlan(), '', '').filter((i) => i.level === 'error').map((i) => i.msg).join(' ')).toMatch(/Time zone is missing.*Start date is missing/s);
    const p = defaultPlan();
    p.days[0].sessions[1].start = p.days[0].sessions[0].start; // same start
    expect(errors(p).some((e) => /overlaps/.test(e.msg))).toBe(true);
    const q = { ...defaultPlan(), opStart: '18:00', opEnd: '20:30' };
    expect(errors(q).some((e) => /outside operating hours/.test(e.msg))).toBe(true);
    const tight = { ...setTemplate(defaultPlan(), { sessionsPerDay: 8, durationMin: 20 }, 'UTC'), opStart: '20:00', opEnd: '22:00' };
    expect(errors(tight).some((e) => /operating hours give only 120 min/.test(e.msg))).toBe(true);
  });
  it('sessions past midnight overlap the next day when they should', () => {
    const p = defaultPlan();
    p.days = p.days.slice(0, 2);
    p.days[0].sessions = [{ ...p.days[0].sessions[0], start: '23:55', durationMin: 20 }, p.days[0].sessions[1]];
    p.days[0].sessions[1] = { ...p.days[0].sessions[1], start: '20:00' };
    p.days[1].sessions = [{ ...p.days[1].sessions[0], start: '00:05' }, { ...p.days[1].sessions[1], start: '21:00' }];
    expect(errors(p).some((e) => /Day 2, session 1 overlaps Day 1, session 1/.test(e.msg))).toBe(true);
  });
  it('DST: gaps and overlaps are detected, deadlines cross the change correctly', () => {
    expect(localTimeStatus('2026-03-29', '01:30', 'Europe/London')).toBe('nonexistent');
    expect(localTimeStatus('2026-03-29', '02:30', 'Europe/London')).toBe('ok');
    expect(localTimeStatus('2026-10-25', '01:30', 'Europe/London')).toBe('ambiguous');
    expect(localTimeStatus('2026-10-25', '12:00', 'Europe/London')).toBe('ok');
    // 02:10 BST on the spring-forward day minus 40 real minutes = 00:30 GMT (wall-clock maths would give 01:30, which does not exist)
    const r = scheduleRows(one('02:10'), '2026-03-29', 'Europe/London')[0];
    expect(r.deadline).toEqual({ date: '2026-03-29', time: '00:30' });
    expect(errors(one('01:30'), '2026-03-29', 'Europe/London').some((e) => /does not exist/.test(e.msg))).toBe(true);
    expect(fromInstant(Date.UTC(2026, 0, 1, 12), 'UTC+3')).toEqual({ date: '2026-01-01', time: '15:00' });
  });
  it('one announcement per day is checked against every session', () => {
    const p = defaultPlan();
    p.announceMode = 'per-day';
    p.days = [{ ...p.days[0], announceTime: '19:50' }];
    const e = errors(p);
    expect(e.some((x) => /only 10 min/.test(x.msg))).toBe(true); // 20:00 session
    p.days[0].announceTime = '19:00';
    expect(errors(p).filter((x) => /announcement gives/.test(x.msg))).toHaveLength(0);
  });
  it('session starts come from the busiest UTC hours, converted and inside hours', () => {
    expect(suggestStarts(defaultPlan(), 'UTC')).toEqual(['20:00', '21:00', '22:00', '23:00']);
    expect(suggestStarts(defaultPlan(), 'UTC+1')).toEqual(['00:00', '21:00', '22:00', '23:00']);
    const p = { ...defaultPlan(), opStart: '10:00', opEnd: '20:00' };
    const s = suggestStarts(p, 'UTC');
    expect(s).toEqual(['11:00', '12:00', '18:00', '19:00']); // 19, 18, 12, 11 are the busiest hours that fit 10:00–20:00
  });
});

describe('Daily Promo: editing and persistence', () => {
  it('13. editing one day leaves the others alone, also after template changes', () => {
    let p = defaultPlan();
    const before = JSON.stringify(p.days[3]);
    p = editDay(p, 2, (d) => ({ ...d, sessions: d.sessions.map((s, i) => (i === 0 ? { ...s, start: '18:00' } : s)) }));
    expect(JSON.stringify(p.days[3])).toBe(before);
    expect(p.days[2].sessions[0].start).toBe('18:00');
    p = setTemplate(p, { missionsPerSession: 3 }, 'UTC');
    expect(p.days[2].sessions[0].start).toBe('18:00');
    expect(p.days[2].sessions[0].missions).toHaveLength(2);
    expect(p.days[0].sessions[0].missions).toHaveLength(3);
    p = copyDay(p, 2, [5]);
    expect(p.days[5].sessions[0].start).toBe('18:00');
    expect(p.days[5].id).not.toBe(p.days[2].id);
    expect(p.days[5].sessions[0].id).not.toBe(p.days[2].sessions[0].id);
    expect(setLength(p, 3, 'UTC').days).toHaveLength(3);
  });
  it('14. save / reload and export / import keep the campaign', () => {
    const pr = { ...blankProject('Daily test'), daily: setTemplate(defaultPlan(), { sessionsPerDay: 2 }, 'UTC') };
    pr.schedule.timezone = 'Africa/Lagos';
    pr.schedule.startDate = '2026-12-01';
    let state: StoreState = { projects: [pr], currentId: pr.id };
    const mem: Record<string, string> = {};
    saveStore(state, { setItem: (k, v) => (mem[k] = v) });
    state = loadStore({ getItem: (k) => mem[k] ?? null });
    expect(state.projects[0].daily).toEqual(pr.daily);
    const json = exportJson(pr, pr.daily!);
    const back = importJson(json);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.plan).toEqual(pr.daily);
      expect(back.campaign?.timezone).toBe('Africa/Lagos');
    }
  });
  it('invalid imports are rejected or repaired, never crash', () => {
    expect(importJson('not json').ok).toBe(false);
    expect(importJson('{"hello":1}').ok).toBe(false);
    expect(importJson(JSON.stringify({ kind: 'promo-toolkit/daily-promo', plan: { version: 99, days: [], template: {} } }))).toEqual({ ok: false, error: expect.stringMatching(/newer version/) });
    const repaired = importJson(JSON.stringify({ kind: 'promo-toolkit/daily-promo', plan: { template: { sessionsPerDay: 'x' }, days: [{ sessions: [{ start: '20:00', missions: [{ game: 'nope', threshold: -3 }] }] }] } }));
    expect(repaired.ok).toBe(true);
    if (repaired.ok) {
      expect(repaired.plan.template.sessionsPerDay).toBe(4);
      expect(repaired.plan.days[0].sessions[0].missions[0].game).toBe('aviator');
      expect(repaired.plan.days[0].sessions[0].missions[0].threshold).toBeNull();
    }
    expect(normalizeDaily(null).plan.days).toHaveLength(7);
  });
  it('15. existing projects keep working: older saves get daily = null, reference unchanged', () => {
    const old = referenceProject() as Partial<ReturnType<typeof referenceProject>>;
    delete old.daily;
    const n = normalize(old);
    expect(n.daily).toBeNull();
    expect(n.days).toHaveLength(7);
    const s = actions.update(seedState(), (p) => ({ ...p, daily: defaultPlan() }));
    expect(s.projects[0].daily?.days).toHaveLength(7);
    // T&C unchanged without a plan; with one it adds the Daily Promo section with policy placeholders
    const master = loadMaster();
    const base = toPlain(tcBlocks(referenceProject(), master));
    expect(base).not.toMatch(/Daily Promo/);
    const withPlan = toPlain(tcBlocks({ ...referenceProject(), daily: defaultPlan() }, master));
    expect(withPlan).toMatch(/The Daily Promo runs for 7 days/);
    expect(withPlan).toMatch(/\[MISSING: Repeat winners policy\]/);
  });
  it('CSV has dates, time zone, deadlines, slots, shares and money only with a budget', () => {
    const pr = { ...blankProject('CSV'), daily: { ...defaultPlan(), prizeByHour: 'even' as const } };
    pr.schedule.startDate = '2026-12-01';
    pr.schedule.timezone = 'UTC';
    let csv = exportCsv(pr, pr.daily!).split('\n');
    expect(csv).toHaveLength(1 + 56);
    expect(csv[0]).toMatch(/announcement_deadline_time/);
    expect(csv[1]).toMatch(/^1,2026-12-01,UTC,1,20:00,20:15,15,2026-12-01,19:20,40,1,Aviator/);
    expect(csv[1].split(',').slice(-2)).toEqual(['', '']);
    pr.prizes.totalPool = 5600;
    pr.prizes.currency = 'USD';
    csv = exportCsv(pr, pr.daily!).split('\n');
    expect(csv[1].split(',').slice(-3)).toEqual(['USD', '100.00', '10.00']);
  });
});

describe('Daily Promo: estimator', () => {
  it('Aviator round chance is RTP / X; game outcome is separate from player qualifying', () => {
    expect(aviatorRoundChance(10)).toBeCloseTo(0.097, 9);
    const m = { game: 'aviator' as const, threshold: 10, catches: 2, countPer: 'round' as const, chanceOverride: null };
    const all = individualChance(m, 15)!;
    const half = individualChance(m, 15, { ...{ clock: { betSec: 5, pauseSec: 1.5, k: 0.065, rtp: 0.97 }, betsPerRound: 2, betsPerMin: {}, roundShare: 0.5, switchMin: 1 } })!;
    expect(half).toBeLessThan(all);
    // counting per bet with two bets halves the rounds needed — same shared rounds, not double the chances
    const perBet = individualChance({ ...m, catches: 4, countPer: 'bet' }, 15)!;
    expect(perBet).toBeCloseTo(all, 12);
  });
  it('games without a model give no number; others use their own paytables', () => {
    expect(individualChance({ game: 'keno-80', threshold: 10, catches: 1, countPer: 'round', chanceOverride: null }, 15)).toBeNull();
    expect(individualChance({ game: 'keno-80', threshold: 10, catches: 1, countPer: 'round', chanceOverride: 0.05 }, 15)).not.toBeNull();
    expect(individualChance({ game: 'plinko', threshold: 5, catches: 2, countPer: 'round', chanceOverride: null }, 15)).toBeGreaterThan(0);
  });
  it('12. no audience → insufficient data, never a forecast', () => {
    const r = population({ missions: [{ game: 'aviator', threshold: 10, catches: 2, countPer: 'round', chanceOverride: null }], slots: 10, bundle: false, windowMin: 15 }, { activePlayers: null, attemptShare: null });
    expect(r.expectedCompletions).toBeNull();
    expect(r.pAllFill).toBeNull();
    expect(r.fillMin).toBeNull();
    expect(r.reason).toMatch(/Enter/);
  });
  it('shared rounds: all-or-nothing when everyone bets every round', () => {
    const spec = { missions: [{ game: 'aviator' as const, threshold: 20, catches: 1, countPer: 'round' as const, chanceOverride: null }], slots: 10, bundle: false, windowMin: 10 };
    const r = population(spec, { activePlayers: 1000, attemptShare: 100 });
    // P(all fill) ≈ P(at least one 20× round in 10 minutes), not ≈ 1 as independent players would suggest
    const pRound = 1 - binomAtLeast(Math.floor((10 * 60) / 21.42), aviatorRoundChance(20), 1);
    expect(r.pAllFill!).toBeGreaterThan(1 - pRound - 0.12);
    expect(r.pAllFill!).toBeLessThan(0.97);
  });
  it('bundle mode is harder than each mission alone (switching time and both needed)', () => {
    const av = { game: 'aviator' as const, threshold: 10, catches: 2, countPer: 'round' as const, chanceOverride: null };
    const pl = { game: 'plinko' as const, threshold: 5, catches: 2, countPer: 'round' as const, chanceOverride: null };
    const aud = { activePlayers: 500, attemptShare: 50 };
    const ind = population({ missions: [av], slots: 10, bundle: false, windowMin: 15 }, aud);
    const bun = population({ missions: [av, pl], slots: 10, bundle: true, windowMin: 15 }, aud);
    expect(bun.expectedCompletions!).toBeLessThan(ind.expectedCompletions!);
  });
  it('search returns fits with reasons inside the heuristic band', () => {
    const s = searchFits('aviator', 15);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      expect(x.chance).toBeGreaterThanOrEqual(0.25);
      expect(x.chance).toBeLessThanOrEqual(0.75);
      expect(x.why).toMatch(/rounds reach/);
    }
    expect(searchFits('keno-80', 15)).toEqual([]);
  });
});

describe('Daily Promo: length, peak hours and prizes per length', () => {
  it('a longer session gets harder missions, a shorter one easier', async () => {
    const { resizeSession } = await import('./plan');
    const { medianMinutes } = await import('./estimate');
    const s = defaultPlan().days[0].sessions[0];
    const time = (x: typeof s) => x.missions.map((m) => medianMinutes({ game: m.game, threshold: m.threshold, catches: m.catches, countPer: m.countPer, chanceOverride: null })!);
    const t10 = time(resizeSession(s, 10));
    const t20 = time(resizeSession(s, 20));
    t10.forEach((x, i) => expect(t20[i]).toBeGreaterThan(x));
    // changing the campaign length also re-sizes days edited by hand
    let p = editDay(defaultPlan(), 0, (d) => ({ ...d, sessions: d.sessions.map((x) => ({ ...x, start: x.start })) }));
    p = setTemplate(p, { durationMin: 20 }, 'UTC');
    expect(p.days[0].sessions[0].durationMin).toBe(20);
    expect(p.days[0].sessions[0].missions[0]).toEqual({ ...p.days[0].sessions[0].missions[0], ...resizeSession(defaultPlan().days[0].sessions[0], 20).missions[0], id: p.days[0].sessions[0].missions[0].id, slots: 10 });
  });
  it('more sessions start earlier, still at the busiest hours', () => {
    const p8 = setTemplate(defaultPlan(), { sessionsPerDay: 8 }, 'UTC');
    expect(p8.days[0].sessions.map((s) => s.start)).toEqual(['11:00', '12:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00']);
  });
  it('suggests the busiest free times for a session', async () => {
    const { freePeakStarts, peakRank } = await import('./plan');
    const p = defaultPlan();
    const d = { ...p.days[0], sessions: p.days[0].sessions.map((s, i) => (i === 0 ? { ...s, start: '04:00' } : s)) };
    expect(freePeakStarts(p, 'UTC', d, 0)).toEqual(['20:00', '19:00', '18:00']);
    expect(peakRank('22:00', 'UTC')).toBe(0);
    expect(peakRank('23:00', 'UTC+1')).toBe(0);
  });
  it('amount per session length: 10 min = X, 20 min = Y, total is their sum', () => {
    let p = { ...defaultPlan(), prizeByHour: 'even' as const, prizeMode: 'per-length' as const, lengthAmounts: { '10': 100, '15': 150, '20': 200 } };
    p = { ...p, days: p.days.map((d) => ({ ...d, sessions: d.sessions.map((s, i) => ({ ...s, durationMin: i === 0 ? 10 : i === 1 ? 20 : 15 })) })) };
    const a = allocate(p, 999, 'USD');
    const sess = (si: number) => a.pools.filter((x) => x.day === 0 && x.session === si).reduce((s, x) => s + x.minor!, 0);
    expect(sess(0)).toBe(10000);
    expect(sess(1)).toBe(20000);
    expect(sess(2)).toBe(15000);
    expect(a.budgetMinor).toBe(7 * (100 + 200 + 150 + 150) * 100);
    // missing an amount → shares only, never invented money
    const b = allocate({ ...p, lengthAmounts: { '10': 100, '15': null, '20': 200 } }, null, 'USD');
    expect(b.budgetMinor).toBeNull();
  });
  it('split a total by length: a 20-minute session gets twice a 10-minute one', () => {
    const p = { ...defaultPlan(), prizeByHour: 'even' as const };
    p.days = [{ ...p.days[0], sessions: [{ ...p.days[0].sessions[0], durationMin: 10 }, { ...p.days[0].sessions[1], durationMin: 20 }] }];
    const a = allocate(p, 300, 'USD');
    expect(a.sessionsMinor[0]).toEqual([10000, 20000]);
  });
  it('plans saved before by-length prizes move to it', () => {
    const v1 = { ...defaultPlan(), version: 1, weights: { day: 'equal', session: 'equal', mission: 'equal' } };
    expect(normalizeDaily(v1).plan.weights.session).toBe('length');
    expect(normalizeDaily({ ...v1, version: 2 }).plan.weights.session).toBe('equal');
  });
});

describe('Daily Promo: prizes follow peak hours', () => {
  it('busier hours get more, quieter hours less; the total stays exact', async () => {
    const { peakFactor } = await import('./plan');
    const p = defaultPlan(); // sessions at 20, 21, 22, 23 UTC; 22 is the busiest hour
    expect(peakFactor(p, '22:00', 'UTC')).toBeCloseTo(1.5, 9);
    expect(peakFactor(p, '03:00', 'UTC')).toBeLessThan(0.6);
    expect(peakFactor({ ...p, prizeByHour: 'even' }, '22:00', 'UTC')).toBe(1);
    expect(peakFactor({ ...p, prizeByHour: 'offpeak' }, '03:00', 'UTC')).toBeGreaterThan(1.4);
    const a = allocate(p, 1000, 'USD', 'UTC');
    const s = a.sessionsMinor[0] as number[];
    expect(s[2]).toBe(Math.max(...s)); // 22:00 session
    expect(a.totalMinor).toBe(100000);
    // amount per length scales with the hour too
    const b = allocate({ ...p, prizeMode: 'per-length', lengthAmounts: { '10': 100, '15': 100, '20': 100 } }, null, 'USD', 'UTC');
    expect(b.sessionsMinor[0]![2]).toBe(15000);
  });
});

describe('Daily Promo: popular games', () => {
  it('uses only popular games next to Aviator, more popular ones more often', async () => {
    const { popularGames } = await import('./plan');
    expect(popularGames()).toEqual(['pilot-chicken', 'mines', 'keno', 'trader', 'goal', 'hi-lo']);
    const p = defaultPlan();
    const games = p.days.flatMap((d) => d.sessions.map((s) => s.missions[1].game));
    const count = (g: string) => games.filter((x) => x === g).length;
    expect(new Set(games)).toEqual(new Set(['pilot-chicken', 'mines', 'keno', 'trader', 'goal', 'hi-lo']));
    expect(count('pilot-chicken')).toBeGreaterThan(count('goal'));
    expect(count('mines')).toBeGreaterThan(count('goal'));
    // spread out: no game twice in a row
    for (let i = 1; i < games.length; i++) expect(games[i]).not.toBe(games[i - 1]);
    // each day differs from the day before
    for (let d = 1; d < p.days.length; d++) expect(p.days[d].sessions.map((s) => s.missions[1].game)).not.toEqual(p.days[d - 1].sessions.map((s) => s.missions[1].game));
  });
  it('no repeated game inside a session with 3+ missions', () => {
    const p = setTemplate(defaultPlan(), { missionsPerSession: 4 }, 'UTC');
    for (const d of p.days) for (const s of d.sessions) expect(new Set(s.missions.map((m) => m.game)).size).toBe(4);
  });
  it('Pilot Chicken and Trader get estimates from the 97% RTP rule', () => {
    const c = individualChance({ game: 'pilot-chicken', threshold: 10, catches: 2, countPer: 'round', chanceOverride: null }, 15);
    expect(c).toBeGreaterThan(0);
    expect(searchFits('trader', 15).length).toBeGreaterThan(0);
  });
  it('older plans on the old game list move to the popular games, keeping times', () => {
    const old = defaultPlan();
    old.version = 2;
    old.template = { ...old.template, rotation: ['plinko', 'mines', 'goal', 'keno'] };
    old.days[0].sessions[0].start = '18:30';
    const n = normalizeDaily(old).plan;
    expect(n.template.rotation).toEqual(['pilot-chicken', 'mines', 'keno', 'trader', 'goal', 'hi-lo']);
    expect(n.days[0].sessions[0].start).toBe('18:30');
    expect(n.days[0].sessions[0].missions[0].game).toBe('aviator');
  });
});

describe('Dice and Hi-Lo', () => {
  it('Dice hits X× on 97% ÷ X of bets; Hi-Lo uses its card steps and chains', async () => {
    const { SIM_GAMES, chanceAtLeast } = await import('../../sim/games');
    const dice = SIM_GAMES.find((g) => g.id === 'dice')!;
    const hilo = SIM_GAMES.find((g) => g.id === 'hi-lo')!;
    expect(chanceAtLeast(dice, 10).p).toBeCloseTo(0.097, 9);
    expect(chanceAtLeast(dice, 9901).p).toBe(0);
    expect(chanceAtLeast(hilo, 12).p).toBeCloseTo(1 / 13, 9); // one guess on a King (12.61×)
    expect(chanceAtLeast(hilo, 2).p).toBeCloseTo(6 / 13, 9); // 2.10× with 6 winning ranks
    expect(chanceAtLeast(hilo, 20).p).toBeLessThan(0.97 / 20); // a chain loses 3% per guess
    expect(individualChance({ game: 'dice', threshold: 5, catches: 3, countPer: 'round', chanceOverride: null }, 15)).toBeGreaterThan(0);
    expect(searchFits('hi-lo', 15).length).toBeGreaterThan(0);
  });
});

describe('Daily Promo: collect and place bets', () => {
  it('estimates collect N× and place N bets; more needed = harder', async () => {
    const { betsAvailable } = await import('./estimate');
    const col = (n: number) => individualChance({ game: 'aviator', kind: 'collect', threshold: null, catches: n, countPer: 'round', chanceOverride: null }, 15)!;
    expect(col(20)).toBeGreaterThan(col(80));
    expect(col(80)).toBeGreaterThan(0);
    const bets = (n: number) => individualChance({ game: 'mines', kind: 'bets', threshold: null, catches: n, countPer: 'round', chanceOverride: null }, 10)!;
    expect(betsAvailable('mines', 10)).toBe(60);
    expect(bets(60)).toBe(1);
    expect(bets(61)).toBe(0);
    // place bets works even for a game without a chance model
    expect(individualChance({ game: 'keno-80', kind: 'bets', threshold: null, catches: 10, countPer: 'round', chanceOverride: null }, 10)).toBe(1);
  });
  it('changing type or length re-sizes the mission and keeps it doable', async () => {
    const { sizedMission, resizeSession } = await import('./plan');
    const c15 = sizedMission('plinko', 15, undefined, 'collect');
    const c20 = sizedMission('plinko', 20, undefined, 'collect');
    expect(c20.catches!).toBeGreaterThan(c15.catches!);
    const b10 = sizedMission('aviator', 10, undefined, 'bets');
    expect(b10.catches!).toBeLessThanOrEqual(56); // 28 rounds × 2 bets in 10 minutes
    const s = { ...defaultPlan().days[0].sessions[0] };
    s.missions = s.missions.map((m) => ({ ...m, kind: 'collect' as const, ...sizedMission(m.game, 15, undefined, 'collect') }));
    const longer = resizeSession(s, 20);
    longer.missions.forEach((m, i) => expect(m.catches!).toBeGreaterThanOrEqual(s.missions[i].catches!));
  });
  it('population forecasts work for collect and bets, and the type survives save/load', () => {
    const r = population({ missions: [{ game: 'aviator', kind: 'collect', threshold: null, catches: 40, countPer: 'round', chanceOverride: null }], slots: 10, bundle: false, windowMin: 15 }, { activePlayers: 500, attemptShare: 40 });
    expect(r.expectedCompletions).not.toBeNull();
    const p = defaultPlan();
    p.days[0].sessions[0].missions[1].kind = 'collect';
    expect(normalizeDaily(JSON.parse(JSON.stringify(p))).plan.days[0].sessions[0].missions[1].kind).toBe('collect');
  });
});
