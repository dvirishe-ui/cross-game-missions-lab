import { describe, expect, it } from 'vitest';
import { calculatedTotal, dayDate, dayPool, dayWindowMin } from './model/campaign';
import { fmtMoney } from './model/money';
import { blankProject, referenceProject, type Project } from './model/project';
import { actions, loadStore, saveStore, seedState, STORE_KEY } from './model/store';
import { daysBetween, parseZone, toInstant } from './model/time';
import { checkProject, type Issue } from './rules/checks';
import { balanceToFirst, splitStats, suggestSplit, type SplitState } from './split/split';
import { defaultMilestones, milestoneDate, milestoneStatus, setManualDate } from './timeline/timeline';
import { checklist, missingRefs, tcBlocks, briefBlocks, toPlain } from './tc/generate';
import { referenceTemplate } from './tc/master';

const NOW = Date.UTC(2026, 9, 26, 9, 0);
const master = referenceTemplate();
const check = (p: Project, tcText?: string) => checkProject(p, { now: NOW, master, tcText });
const has = (issues: Issue[], level: Issue['level'], re: RegExp) => issues.some((i) => i.level === level && re.test(i.message));

describe('time zones', () => {
  it('reads UTC, offsets and IANA names', () => {
    expect(parseZone('UTC')?.kind).toBe('utc');
    expect(parseZone('UTC+3')).toMatchObject({ kind: 'offset', offsetMin: 180 });
    expect(parseZone('GMT-05:30')).toMatchObject({ kind: 'offset', offsetMin: -330 });
    expect(parseZone('Africa/Lagos')?.kind).toBe('iana');
    expect(parseZone('Mars/Base')).toBeNull();
  });
  it('converts local times to instants', () => {
    expect(toInstant('2026-10-05', '19:00', 'UTC')).toBe(Date.UTC(2026, 9, 5, 19));
    expect(toInstant('2026-10-05', '20:00', 'UTC+1')).toBe(Date.UTC(2026, 9, 5, 19));
    expect(toInstant('2026-10-05', '20:00', 'Africa/Lagos')).toBe(Date.UTC(2026, 9, 5, 19));
    // Malta is on summer time (UTC+2) in early October.
    expect(toInstant('2026-10-05', '21:00', 'Europe/Malta')).toBe(Date.UTC(2026, 9, 5, 19));
  });
});

describe('reference campaign (SPRIBE Adventure)', () => {
  const p = referenceProject();
  const issues = check(p);
  it('adds up: 7 days, $15,000', () => {
    expect(p.days.map((d) => dayPool(p, d))).toEqual([1250, 1500, 1750, 2000, 2500, 2750, 3250]);
    expect(calculatedTotal(p)).toBe(15000);
    expect(has(issues, 'info', /Daily prizes add up: \$15,000/)).toBe(true);
    expect(issues.some((i) => i.area === 'prizes' && i.level === 'error')).toBe(false);
  });
  it('derives consecutive dates and a 5-hour window', () => {
    expect(dayDate(p, 0)).toBe('2026-10-05');
    expect(dayDate(p, 6)).toBe('2026-10-11');
    expect(dayWindowMin(p, p.days[0])).toBe(300);
  });
  it('flags the declared 4 tasks per day against the configured tasks', () => {
    const i = issues.find((x) => /Declared task count does not match/.test(x.message));
    expect(i?.level).toBe('warning');
    expect(i?.message).toMatch(/Day 3: 6/);
    expect(i?.message).not.toMatch(/Day 1:/);
  });
  it('flags the Day 6 Keno task as very unlikely to be finished', () => {
    expect(has(issues, 'warning', /Day 6, Keno: .*29,9\d\d bets/)).toBe(true);
  });
  it('has no date errors', () => {
    expect(issues.filter((i) => i.area === 'dates' && i.level === 'error')).toEqual([]);
  });
});

describe('promo checker rules', () => {
  const ref = referenceProject();
  it('end before start is an error', () => {
    const p = { ...ref, schedule: { ...ref.schedule, endDate: '2026-10-04' } };
    expect(has(check(p), 'error', /end is before the campaign start/)).toBe(true);
  });
  it('same-day end time before start time is an error', () => {
    const p = { ...ref, schedule: { ...ref.schedule, endDate: '2026-10-05', endTime: '18:00' } };
    expect(has(check(p), 'error', /End time is before the start time/)).toBe(true);
  });
  it('a short promotion is a warning, not an error', () => {
    const p = { ...ref, schedule: { ...ref.schedule, endDate: '2026-10-05', endTime: '22:00' } };
    expect(has(check(p), 'warning', /lasts only 3h 00m/)).toBe(true);
  });
  it('missing or ambiguous time zones', () => {
    expect(has(check({ ...ref, schedule: { ...ref.schedule, timezone: '' } }), 'error', /Time zone is missing/)).toBe(true);
    expect(has(check({ ...ref, schedule: { ...ref.schedule, timezone: 'IST' } }), 'warning', /ambiguous/)).toBe(true);
  });
  it('announcement after start is an error', () => {
    const p = { ...ref, schedule: { ...ref.schedule, announceDate: '2026-10-06' } };
    expect(has(check(p), 'error', /Announcement is not before/)).toBe(true);
  });
  it('a starting-soon campaign is a warning', () => {
    const p = { ...ref, schedule: { ...ref.schedule, announceDate: '2026-10-20', startDate: '2026-10-27', endDate: '2026-11-02' } };
    expect(has(check(p), 'warning', /Campaign starts in/)).toBe(true);
  });
  it('daily allocation that misses the total is an error with the difference', () => {
    const p = { ...ref, days: ref.days.map((d, i) => (i === 6 ? { ...d, reward: 55 } : d)) };
    const i = check(p).find((x) => /does not equal the configured total/.test(x.message));
    expect(i?.level).toBe('error');
    expect(i?.message).toMatch(/\$14,500.*\$15,000.*\$500/);
  });
  it('winner count that differs from the default is a warning', () => {
    const p = { ...ref, days: ref.days.map((d, i) => (i === 3 ? { ...d, winners: 100 } : d)) };
    expect(has(check(p), 'warning', /Day 4 winner count \(100\) differs/)).toBe(true);
  });
  it('zero winners, negative rewards and bad task values are errors', () => {
    const p = {
      ...ref,
      days: ref.days.map((d, i) => (i === 0 ? { ...d, winners: 0, reward: -5, tasks: [{ ...d.tasks[0], threshold: 0 }, { ...d.tasks[1], target: NaN }] } : d)),
    };
    const issues = check(p);
    expect(has(issues, 'error', /Day 1: number of winners is 0/)).toBe(true);
    expect(has(issues, 'error', /Day 1: reward per winner is negative/)).toBe(true);
    expect(has(issues, 'error', /multiplier must be above 0/)).toBe(true);
    expect(has(issues, 'error', /task value is empty/)).toBe(true);
  });
  it('configured days vs declared days', () => {
    const p = { ...ref, days: ref.days.slice(0, 6) };
    expect(has(check(p), 'warning', /Declared 7 daily missions, but 6 days are configured/)).toBe(true);
  });
  it('contradictory progress settings and reward wording', () => {
    const p = { ...ref, progress: { ...ref.progress, carryOver: true } };
    expect(has(check(p), 'error', /both reset daily and carry over/)).toBe(true);
    expect(has(check(ref, 'Top 10 players on the leaderboard win.'), 'error', /Reward methodology is inconsistent/)).toBe(true);
  });
  it('does not invent problems on the reference data', () => {
    expect(check(ref).filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('prize split', () => {
  it.each(['balanced', 'top-heavy', 'flat'] as const)('%s always adds up to the pool', (style) => {
    for (const [pool, winners] of [
      [10000, 100],
      [15000, 50],
      [999, 7],
      [50000, 1000],
    ]) {
      const s: SplitState = { pool, winners, currency: 'USD', style, mode: 'fixed', ranges: suggestSplit(pool, winners, style) };
      const st = splitStats(s);
      expect(st.allocated).toBe(pool);
      expect(st.remaining).toBe(0);
      expect(st.gaps).toEqual([]);
      expect(st.rising).toEqual([]);
    }
  });
  it('top heavy gives 1st place more than flat', () => {
    const share = (style: 'top-heavy' | 'flat') => splitStats({ pool: 10000, winners: 100, currency: 'USD', style, mode: 'fixed', ranges: suggestSplit(10000, 100, style) }).firstShare;
    expect(share('top-heavy')).toBeGreaterThan(share('flat') * 3);
  });
  it('a manual edit shows the remainder, and balancing restores the total', () => {
    const base: SplitState = { pool: 10000, winners: 100, currency: 'USD', style: 'custom', mode: 'fixed', ranges: suggestSplit(10000, 100, 'balanced') };
    const edited = { ...base, ranges: base.ranges.map((r, i) => (i === 1 ? { ...r, amount: r.amount - 250 } : r)) };
    expect(splitStats(edited).remaining).toBe(250);
    expect(splitStats(balanceToFirst(edited)).remaining).toBe(0);
  });
  it('detects positions listed twice', () => {
    const s: SplitState = { pool: 300, winners: 3, currency: 'USD', style: 'custom', mode: 'fixed', ranges: [{ id: 'a', from: 1, to: 2, amount: 100, percent: 0 }, { id: 'b', from: 2, to: 3, amount: 50, percent: 0 }] };
    expect(splitStats(s).overlaps).toEqual([2]);
  });
});

describe('timeline', () => {
  const dates = { announce: '2026-09-28', start: '2026-10-05', end: '2026-10-11' };
  it('places milestones from their anchor and recalculates when dates move', () => {
    const ms = defaultMilestones('cross-game-mission');
    const qa = ms.find((m) => m.name === 'Campaign configuration QA')!;
    expect(milestoneDate(qa, dates).date).toBe('2026-10-02');
    expect(milestoneDate(qa, { ...dates, start: '2026-10-12' }).date).toBe('2026-10-09');
    const tc = ms.find((m) => m.name === 'T&C final approval')!;
    expect(milestoneDate(tc, dates).date).toBe('2026-09-25');
  });
  it('a locked milestone keeps its date', () => {
    const qa = setManualDate(defaultMilestones('cross-game-mission').find((m) => m.name === 'Campaign configuration QA')!, '2026-10-01');
    expect(milestoneDate(qa, { ...dates, start: '2026-10-20' }).date).toBe('2026-10-01');
  });
  it('falls back to the start when there is no announcement', () => {
    const tc = defaultMilestones('tournament').find((m) => m.name === 'T&C final approval')!;
    expect(milestoneDate(tc, { ...dates, announce: '' })).toEqual({ date: '2026-10-02', fallback: true });
  });
  it('shows overdue days against today', () => {
    const m = defaultMilestones('other')[0];
    expect(milestoneStatus(m, '2026-12-07', '2026-12-08')).toEqual({ kind: 'overdue', days: 1 });
    expect(milestoneStatus({ ...m, done: true }, '2026-12-07', '2026-12-08').kind).toBe('done');
    expect(daysBetween('2026-12-08', '2026-12-10')).toBe(2);
  });
  it('only includes milestones for the promotion type', () => {
    expect(defaultMilestones('tournament').some((m) => m.name === 'Mission mechanics finalised')).toBe(false);
  });
});

describe('T&C generator', () => {
  const ref = referenceProject();
  it('reproduces the reference daily breakdown and totals', () => {
    const text = toPlain(tcBlocks(ref, master));
    expect(text).toContain('• Day 1: 50 winners will share a $1,250 prize pool ($25 per winner).');
    expect(text).toContain('• Day 7: 50 winners will share a $3,250 prize pool ($65 per winner).');
    expect(text).toContain('Winners will share a $15,000 total prize pool.');
    expect(text).toContain('The first 50 eligible players to complete all tasks will receive a cash prize.');
    expect(text).toContain('Cash prizes will be awarded automatically within 72 hours after each Daily Mission ends.');
    expect(text).toContain('A player can receive one reward per Daily Mission.');
    expect(text).not.toContain('$15.000');
  });
  it('keeps fixed clauses verbatim', () => {
    const text = toPlain(tcBlocks(ref, master));
    expect(text).toContain(master.wording.cheating);
    expect(text).toContain(master.wording.changes);
  });
  it('marks missing data instead of guessing', () => {
    const p = blankProject('Test');
    const blocks = briefBlocks(p, master);
    const text = toPlain(blocks);
    expect(text).toContain('[MISSING: Time zone]');
    expect(text).toContain('[MISSING: Total prize pool]');
    expect(missingRefs(blocks).length).toBeGreaterThan(5);
    expect(toPlain(briefBlocks(ref, master))).toContain('[MISSING: Eligible markets]');
  });
  it('non-FCFS methods need approved wording', () => {
    const p = { ...ref, prizes: { ...ref.prizes, rewardMethod: 'leaderboard' as const } };
    const text = toPlain(tcBlocks(p, master));
    expect(text).toContain('[MISSING: Approved wording — Reward method: leaderboard]');
    expect(text).not.toContain('first come, first served');
    expect(text).not.toContain('The first 50 eligible players');
    const approved = { ...master, slots: { ...master.slots, 'reward.leaderboard': 'Approved leaderboard clause.' } };
    expect(toPlain(tcBlocks(p, approved))).toContain('Approved leaderboard clause.');
  });
  it('omits clauses that are switched off and never shows contradictory ones', () => {
    const p = { ...ref, eligibility: { ...ref.eligibility, joinRequired: false, verifiedOnly: false }, clauses: { ...ref.clauses, combinable: true } };
    const text = toPlain(tcBlocks(p, master));
    expect(text).not.toContain('Join');
    expect(text).not.toContain('verified Casino Players');
    expect(text).not.toContain('cannot be used in conjunction');
    const both = { ...ref, progress: { ...ref.progress, carryOver: true } };
    const t2 = toPlain(tcBlocks(both, master));
    expect(t2).not.toContain('does not carry over');
    expect(t2).toContain('[MISSING: Progress cannot both reset and carry over');
  });
  it('checklist passes on the reference except markets', () => {
    const failing = checklist(ref, master).filter((c) => !c.ok).map((c) => c.label);
    expect(failing).toEqual(['Eligibility (markets)']);
  });
  it('formats money consistently', () => {
    expect(fmtMoney(15000, 'USD')).toBe('$15,000');
    expect(fmtMoney(1250.5, 'EUR')).toBe('€1,250.50');
  });
});

describe('projects', () => {
  it('create, rename, duplicate, delete, open', () => {
    let s = seedState();
    s = actions.create(s, 'blank', 'Halloween Cross-Game Mission');
    const hallo = s.currentId;
    s = actions.rename(s, hallo, 'Halloween Mission');
    s = actions.duplicate(s, hallo);
    expect(s.projects).toHaveLength(3);
    expect(s.projects[2].promo.name).toBe('Halloween Mission (copy)');
    s = actions.open(s, hallo);
    s = actions.update(s, (p) => ({ ...p, prizes: { ...p.prizes, totalPool: 5000 } }));
    expect(s.projects.find((p) => p.id === hallo)!.prizes.totalPool).toBe(5000);
    expect(s.projects[2].prizes.totalPool).toBeNull();
    s = actions.remove(s, hallo);
    expect(s.projects).toHaveLength(2);
    expect(s.currentId).not.toBe(hallo);
  });
  it('survives a save and load', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    let s = seedState();
    s = actions.update(s, (p) => ({ ...p, estimates: { x: { median: null, perTask: [null], pAllGone: 0, windowMin: 300, key: 'k' } } }));
    saveStore(s, storage);
    expect(mem.has(STORE_KEY)).toBe(true);
    const back = loadStore(storage);
    expect(back.projects[0].promo.name).toBe('SPRIBE Adventure');
    expect(back.projects[0].days).toHaveLength(7);
    expect(back.projects[0].estimates.x.median).toBeNull();
  });
  it('falls back to the reference project on corrupt storage', () => {
    expect(loadStore({ getItem: () => '{not json' }).projects[0].promo.name).toBe('SPRIBE Adventure');
  });
});

describe('timeline ids', () => {
  it('default milestones keep the same ids between renders', () => {
    expect(defaultMilestones('cross-game-mission').map((m) => m.id)).toEqual(defaultMilestones('cross-game-mission').map((m) => m.id));
  });
});

describe('equal split and growing days', () => {
  it('equal split gives everyone the same and adds up exactly', async () => {
    const { equalSplit, splitStats } = await import('./split/split');
    const s = (pool: number, winners: number) => ({ pool, winners, currency: 'USD', style: 'equal' as const, mode: 'fixed' as const, ranges: equalSplit(pool, winners) });
    expect(equalSplit(10000, 100)).toMatchObject([{ from: 1, to: 100, amount: 100 }]);
    expect(splitStats(s(10000, 100)).remaining).toBe(0);
    const odd = s(1000, 3);
    expect(splitStats(odd).remaining).toBe(0);
    expect(odd.ranges.map((r) => r.amount)).toEqual([333.34, 333.33]);
  });
  it('daily rewards grow every day and add up to the pool', async () => {
    const { growingDailyRewards } = await import('./split/split');
    for (const [mode, f] of [['steps', 2.6], ['percent', 15], ['steps', 1]] as const) {
      const g = growingDailyRewards(15000, [50, 50, 50, 50, 50, 50, 50], mode, f);
      for (let i = 1; i < 7; i++) expect(g.rewards[i]).toBeGreaterThan(g.rewards[i - 1]);
      expect(g.allocated + g.remaining).toBe(15000);
      expect(g.remaining).toBe(0);
    }
    const mixed = growingDailyRewards(10000, [20, 50, 100], 'steps', 3);
    expect(mixed.rewards[0]).toBeLessThan(mixed.rewards[1]);
    expect(mixed.rewards[1]).toBeLessThan(mixed.rewards[2]);
    expect(mixed.remaining).toBeGreaterThanOrEqual(0);
  });
});
