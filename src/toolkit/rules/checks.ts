// Promo Checker rules. Each rule reads the project and reports issues; no
// rule changes the project. Thresholds live in RULES so they are easy to
// tune. ERROR = cannot be right, WARNING = probably wrong or worth
// confirming, INFO = useful facts.

import { chanceAtLeast, SIM_GAMES } from '../../sim/games';
import { allowedGames, calculatedTotal, dayDate, dayEnd, dayPool, dayStart, dayWindowMin, dayWinners, GAME_NAME, taskText } from '../model/campaign';
import { FIELDS, dayField, slotField, taskField, type FieldRef } from '../model/fields';
import { cents, fmtMoney, validCurrency } from '../model/money';
import { tasksKey, type Project } from '../model/project';
import { daysBetween, fmtDate, fmtSpan, isAmbiguousZone, parseZone, toInstant, validDate, validTime } from '../model/time';
import { splitStats } from '../split/split';
import type { MasterTemplate } from '../tc/master';

export type Level = 'error' | 'warning' | 'info';
export type Area = 'dates' | 'duration' | 'tasks' | 'prizes' | 'missions' | 'content';

export interface Issue {
  level: Level;
  area: Area;
  message: string;
  ref?: FieldRef;
}

/** Tunable thresholds. */
export const RULES = {
  /** Warn when the campaign starts within this many hours. */
  startsSoonHours: 72,
  /** Warn when the whole promotion is shorter than this. */
  shortPromoHours: 6,
  /** Warn when the whole promotion is longer than this. */
  longPromoDays: 60,
  /** A catch task needing more than this many bets on average is flagged. */
  maxExpectedBets: 10000,
  /** Estimated mission time may differ from the target by this share before a warning. */
  durationTolerance: 0.15,
  /** Wording that only belongs to leaderboard-style rewards. */
  leaderboardWords: /\b(leaderboard|ranking|ranked|highest score|top \d+ players)\b/i,
  fcfsWords: /first come,? first served/i,
};

export const AREA_LABEL: Record<Area, string> = {
  dates: 'Dates and times',
  duration: 'Duration',
  tasks: 'Tasks',
  prizes: 'Prizes',
  missions: 'Mission timing',
  content: 'Content consistency',
};

const GAMES = Object.fromEntries(SIM_GAMES.map((g) => [g.id, g]));
const n = (v: number) => new Intl.NumberFormat('en-US').format(v);

export interface CheckOptions {
  now: number;
  master: MasterTemplate;
  /** The T&C text as it will be published (edited or generated), for wording checks. */
  tcText?: string;
}

export function checkProject(p: Project, o: CheckOptions): Issue[] {
  const out: Issue[] = [];
  const push = (level: Level, area: Area, message: string, ref?: FieldRef) => out.push({ level, area, message, ref });
  checkDates(p, o, push);
  checkTasks(p, push);
  checkPrizes(p, push);
  checkMissions(p, push);
  checkContent(p, o, push);
  return out;
}

type Push = (level: Level, area: Area, message: string, ref?: FieldRef) => void;

function checkDates(p: Project, o: CheckOptions, push: Push) {
  const s = p.schedule;
  const zone = parseZone(s.timezone);
  if (!s.timezone.trim()) push('error', 'dates', 'Time zone is missing.', FIELDS.timezone);
  else if (isAmbiguousZone(s.timezone)) push('warning', 'dates', `“${s.timezone}” is ambiguous. Use UTC, an offset such as UTC+1, or a zone name such as Africa/Lagos.`, FIELDS.timezone);
  else if (!zone) push('error', 'dates', `Time zone “${s.timezone}” is not recognised. Use UTC, UTC+1 or a zone name such as Europe/Malta.`, FIELDS.timezone);
  else if (zone.kind === 'iana') push('info', 'dates', `${zone.label} follows daylight saving; times are read as local time there.`, FIELDS.timezone);

  for (const [d, t, dRef, tRef, what] of [
    [s.startDate, s.startTime, FIELDS.startDate, FIELDS.startTime, 'Campaign start'],
    [s.endDate, s.endTime, FIELDS.endDate, FIELDS.endTime, 'Campaign end'],
  ] as const) {
    if (!d) push('error', 'dates', `${what} date is missing.`, dRef);
    else if (!validDate(d)) push('error', 'dates', `${what} date is not a valid date.`, dRef);
    if (!t) push('error', 'dates', `${what} time is missing.`, tRef);
    else if (!validTime(t)) push('error', 'dates', `${what} time is not a valid time.`, tRef);
  }
  if (!s.announceDate) push('warning', 'dates', 'No announcement date. Timeline tasks tied to the announcement will use the campaign start instead.', FIELDS.announceDate);
  else if (!s.announceTime) push('warning', 'dates', 'Announcement time is missing.', FIELDS.announceTime);

  const start = toInstant(s.startDate, s.startTime, s.timezone);
  const end = toInstant(s.endDate, s.endTime, s.timezone);
  const ann = toInstant(s.announceDate, s.announceTime, s.timezone);

  if (start != null && end != null) {
    if (end <= start) {
      if (s.startDate === s.endDate) push('error', 'dates', 'End time is before the start time on the same day.', FIELDS.endTime);
      else push('error', 'dates', 'Campaign end is before the campaign start.', FIELDS.endDate);
    } else {
      const mins = (end - start) / 60000;
      const span = daysBetween(s.startDate, s.endDate) + 1;
      push('info', 'duration', `Promotion runs ${fmtSpan(mins)} (${span} calendar day${span === 1 ? '' : 's'}: ${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}).`);
      if (mins < RULES.shortPromoHours * 60) push('warning', 'duration', `The promotion lasts only ${fmtSpan(mins)}. Confirm this is intentional.`, FIELDS.endTime);
      if (mins > RULES.longPromoDays * 1440) push('warning', 'duration', `The promotion lasts ${fmtSpan(mins)}, longer than ${RULES.longPromoDays} days. Confirm this is intentional.`, FIELDS.endDate);
      if (p.promo.declaredDays != null && p.promo.declaredDays !== span)
        push('warning', 'duration', `Declared ${p.promo.declaredDays} days, but the dates span ${span} calendar days.`, FIELDS.declaredDays);
    }
  }
  if (ann != null && start != null && ann >= start) push('error', 'dates', 'Announcement is not before the campaign start.', FIELDS.announceDate);
  if (start != null) {
    const hours = (start - o.now) / 3600000;
    if (hours < 0) push('info', 'dates', 'Campaign start is in the past (running or finished).', FIELDS.startDate);
    else if (hours < RULES.startsSoonHours) push('warning', 'dates', `Campaign starts in ${fmtSpan(hours * 60)}. Check there is time to configure and announce it.`, FIELDS.startDate);
  }

  // Daily mission hours.
  if (p.days.length) {
    if (!s.dailyStart || !s.dailyEnd) push('warning', 'dates', 'Daily mission hours are missing.', FIELDS.dailyStart);
    else if (s.dailyStart === s.dailyEnd) push('error', 'dates', 'Daily mission start and end are the same time.', FIELDS.dailyEnd);
    else if (s.dailyEnd < s.dailyStart) push('warning', 'dates', `Daily window ${s.dailyStart}–${s.dailyEnd} crosses midnight. Confirm this is intentional.`, FIELDS.dailyEnd);
  }

  // Day dates: inside the campaign, consecutive, no duplicates.
  const dates = p.days.map((_, i) => dayDate(p, i));
  if (p.days.length && dates.some((d) => !d)) push('warning', 'dates', 'Some days have no date. Set the campaign start or give each day a date.', FIELDS.startDate);
  p.days.forEach((d, i) => {
    const date = dates[i];
    const ds = toInstant(date, dayStart(p, d), s.timezone);
    let de = toInstant(date, dayEnd(p, d), s.timezone);
    if (ds != null && de != null && de <= ds) de += 86400000;
    if (ds != null && start != null && ds < start) push('error', 'dates', `Day ${i + 1} (${fmtDate(date)} ${dayStart(p, d)}) starts before the campaign start.`, dayField(i, 'date', `Day ${i + 1} date`));
    if (de != null && end != null && de > end) push('error', 'dates', `Day ${i + 1} (${fmtDate(date)} ${dayEnd(p, d)}) ends after the campaign end.`, dayField(i, 'date', `Day ${i + 1} date`));
  });
  if (p.promo.consecutive) {
    for (let i = 1; i < dates.length; i++)
      if (dates[i] && dates[i - 1] && daysBetween(dates[i - 1], dates[i]) !== 1)
        push('warning', 'dates', `Days are declared consecutive, but Day ${i} is ${fmtDate(dates[i - 1])} and Day ${i + 1} is ${fmtDate(dates[i])}.`, dayField(i, 'date', `Day ${i + 1} date`));
  }
  const seen = new Map<string, number>();
  dates.forEach((d, i) => {
    if (!d) return;
    if (seen.has(d)) push('warning', 'dates', `Day ${seen.get(d)! + 1} and Day ${i + 1} are both on ${fmtDate(d)}.`, dayField(i, 'date', `Day ${i + 1} date`));
    else seen.set(d, i);
  });

  // Day count.
  if (p.promo.declaredDays != null && p.days.length !== p.promo.declaredDays)
    push('warning', 'duration', `Declared ${p.promo.declaredDays} daily missions, but ${p.days.length} days are configured.`, FIELDS.days);
}

function checkTasks(p: Project, push: Push) {
  const allowed = allowedGames(p);
  const mismatched: string[] = [];
  p.days.forEach((d, i) => {
    const day = `Day ${i + 1}`;
    if (!d.tasks.length) push('error', 'tasks', `${day} has no tasks.`, dayField(i, 'tasks', `${day} tasks`));
    const keys = new Set<string>();
    d.tasks.forEach((t, j) => {
      const ref = taskField(i, j, `${day} task ${j + 1}`);
      const game = GAME_NAME[t.game] ?? t.game;
      if (!t.game) push('error', 'tasks', `${day} task ${j + 1} has no game.`, ref);
      else if (allowed.length && !allowed.includes(t.game)) push('warning', 'tasks', `${day}: ${game} is not in the campaign’s game list.`, ref);
      if (t.target == null || !Number.isFinite(t.target)) push('error', 'tasks', `${day}, ${game}: the task value is empty.`, ref);
      else if (t.target <= 0) push('error', 'tasks', `${day}, ${game}: ${t.kind === 'bets' ? 'bet count' : 'value'} must be above 0.`, ref);
      if (t.kind === 'catch') {
        if (t.threshold == null || !Number.isFinite(t.threshold)) push('error', 'tasks', `${day}, ${game}: the multiplier is empty.`, ref);
        else if (t.threshold <= 0) push('error', 'tasks', `${day}, ${game}: the multiplier must be above 0.`, ref);
        else if (t.threshold <= 1) push('warning', 'tasks', `${day}, ${game}: a ${t.threshold}x multiplier is reached by every bet.`, ref);
        else if (GAMES[t.game] && Number.isFinite(t.target) && t.target > 0) {
          const c = chanceAtLeast(GAMES[t.game], t.threshold);
          if (c.p === 0) push('error', 'tasks', `${day}, ${game}: ${t.threshold}x cannot be reached in ${game}.`, ref);
          else if (t.target / c.p > RULES.maxExpectedBets)
            push('warning', 'tasks', `${day}, ${game}: “${taskText(t)}” needs about ${n(Math.round(t.target / c.p))} bets on average (1 in ${n(Math.round(1 / c.p))} per bet). Players may not finish.`, ref);
        }
      }
      const key = `${t.game}|${t.kind}|${t.threshold ?? ''}|${t.target}`;
      if (keys.has(key)) push('warning', 'tasks', `${day}: the same ${game} task appears twice.`, ref);
      keys.add(key);
    });
    if (p.promo.declaredTasksPerDay != null && d.tasks.length !== p.promo.declaredTasksPerDay) mismatched.push(`Day ${i + 1}: ${d.tasks.length}`);
    if (p.games.anchor && d.tasks.length && !d.tasks.some((t) => t.game === p.games.anchor))
      push('warning', 'tasks', `${day} has no ${GAME_NAME[p.games.anchor]} task, but ${GAME_NAME[p.games.anchor]} is the anchor game.`, dayField(i, 'tasks', `${day} tasks`));
  });
  if (mismatched.length)
    push('warning', 'tasks', `Declared task count does not match configured tasks. Declared ${p.promo.declaredTasksPerDay} per day; configured ${mismatched.join(', ')}.`, FIELDS.declaredTasks);
}

function checkPrizes(p: Project, push: Push) {
  const pr = p.prizes;
  const cur = pr.currency;
  const money = (v: number) => fmtMoney(v, cur);
  if (!cur.trim()) push('error', 'prizes', 'Currency is missing.', FIELDS.currency);
  else if (!validCurrency(cur)) push('warning', 'prizes', `“${cur}” is not a standard currency code (e.g. USD, EUR).`, FIELDS.currency);
  if (pr.totalPool == null) push('error', 'prizes', 'Total prize pool is missing.', FIELDS.totalPool);
  else if (pr.totalPool < 0) push('error', 'prizes', 'Total prize pool is negative.', FIELDS.totalPool);
  if (pr.winnersPerDay == null) push('warning', 'prizes', 'Winners per day is missing.', FIELDS.winnersPerDay);
  else if (pr.winnersPerDay <= 0) push('error', 'prizes', 'Winners per day must be above 0.', FIELDS.winnersPerDay);

  p.days.forEach((d, i) => {
    const day = `Day ${i + 1}`;
    const w = dayWinners(p, d);
    if (w == null) push('error', 'prizes', `${day}: number of winners is missing.`, dayField(i, 'winners', `${day} winners`));
    else if (w <= 0) push('error', 'prizes', `${day}: number of winners is ${w}.`, dayField(i, 'winners', `${day} winners`));
    else if (d.winners != null && pr.winnersPerDay != null && d.winners !== pr.winnersPerDay)
      push('warning', 'prizes', `${day} winner count (${n(d.winners)}) differs from the campaign default (${n(pr.winnersPerDay)}).`, dayField(i, 'winners', `${day} winners`));
    if (d.reward == null) push('error', 'prizes', `${day}: reward per winner is missing.`, dayField(i, 'reward', `${day} reward`));
    else if (d.reward < 0) push('error', 'prizes', `${day}: reward per winner is negative.`, dayField(i, 'reward', `${day} reward`));
    else if (d.reward === 0) push('warning', 'prizes', `${day}: reward per winner is 0.`, dayField(i, 'reward', `${day} reward`));
    const pool = dayPool(p, d);
    if (d.poolOverride != null && pool != null && cents(d.poolOverride) !== pool)
      push('error', 'prizes', `${day}: entered daily pool ${money(d.poolOverride)} ≠ ${n(w!)} winners × ${money(d.reward!)} = ${money(pool)}.`, dayField(i, 'pool', `${day} daily pool`));
  });

  if (/progressive/i.test(pr.rewardStructure)) {
    const r = p.days.map((d) => d.reward);
    for (let i = 1; i < r.length; i++)
      if (r[i] != null && r[i - 1] != null && r[i]! < r[i - 1]!)
        push('warning', 'prizes', `Reward structure is progressive, but Day ${i + 1} (${money(r[i]!)}) pays less than Day ${i} (${money(r[i - 1]!)}).`, dayField(i, 'reward', `Day ${i + 1} reward`));
  }

  const calc = calculatedTotal(p);
  if (pr.structureSource === 'daily' && p.days.length && calc != null && pr.totalPool != null) {
    const diff = cents(pr.totalPool - calc);
    if (diff !== 0)
      push('error', 'prizes', `Daily prize allocation (${money(calc)}) does not equal the configured total prize pool (${money(pr.totalPool)}). Difference ${money(Math.abs(diff))}.`, FIELDS.totalPool);
    else push('info', 'prizes', `Daily prizes add up: ${money(calc)} = configured total.`);
  }
  if (pr.structureSource === 'split') {
    if (!p.split?.ranges.length) push('error', 'prizes', 'Prize structure comes from the prize split, but no split is set up.', FIELDS.totalPool);
    else {
      const st = splitStats(p.split);
      if (p.split.pool != null && pr.totalPool != null && p.split.pool !== pr.totalPool)
        push('warning', 'prizes', `Prize split uses a ${money(p.split.pool)} pool, the campaign total is ${money(pr.totalPool)}.`, FIELDS.totalPool);
      if (st.remaining > 0) push('warning', 'prizes', `${money(st.remaining)} of the split pool is not allocated.`);
      if (st.remaining < 0) push('error', 'prizes', `Prize split allocates ${money(-st.remaining)} more than the pool.`);
      if (st.overlaps.length) push('error', 'prizes', `Prize split lists some positions twice (e.g. ${st.overlaps.slice(0, 3).join(', ')}).`);
      if (st.gaps.length) push('warning', 'prizes', `Prize split leaves ${st.gaps.length} winner position(s) without a prize.`);
    }
  }
}

function checkMissions(p: Project, push: Push) {
  if (!p.days.length) return;
  let any = false;
  p.days.forEach((d, i) => {
    const e = p.estimates[d.id];
    if (!e || e.key !== tasksKey(d.tasks)) return;
    any = true;
    const window = dayWindowMin(p, d) ?? e.windowMin;
    const target = p.mission.targetMin ?? window;
    const day = `Day ${i + 1}`;
    if (e.median == null || e.pAllGone < 0.5) {
      push('warning', 'missions', `${day}: prizes are likely left over at the end of the ${fmtSpan(window)} window (all ${dayWinners(p, d) ?? ''} prizes go on ${Math.round(e.pAllGone * 100)}% of simulated days).`, dayField(i, 'tasks', `${day} tasks`));
      return;
    }
    const diff = e.median - target;
    if (Math.abs(diff) > target * RULES.durationTolerance)
      push('warning', 'missions', `${day}: estimated ${fmtSpan(e.median)}, ${fmtSpan(Math.abs(diff))} ${diff > 0 ? 'longer' : 'shorter'} than the ${fmtSpan(target)} target.`, dayField(i, 'tasks', `${day} tasks`));
    else push('info', 'missions', `${day}: estimated ${fmtSpan(e.median)} against a ${fmtSpan(target)} target.`);
  });
  if (!any) push('info', 'missions', 'No duration estimates yet. Press “Estimate all days” to compare mission time with the target.');
}

function checkContent(p: Project, o: CheckOptions, push: Push) {
  if (p.progress.resetDaily && p.progress.carryOver)
    push('error', 'content', 'Progress is set to both reset daily and carry over. Choose one.', { tab: 'tc', id: 'f-progress-reset', label: 'Progress resets daily' });
  const method = p.prizes.rewardMethod;
  if (method !== 'fcfs' && !o.master.slots[`reward.${method}`]?.trim())
    push('warning', 'content', `No approved T&C wording for the “${method}” reward method yet. The T&C will show it as missing.`, slotField(`reward.${method}`, 'Approved wording'));
  if (p.payout.method !== 'automatic' && !o.master.slots[`payout.${p.payout.method}`]?.trim())
    push('warning', 'content', `No approved T&C wording for ${p.payout.method} payout yet.`, slotField(`payout.${p.payout.method}`, 'Approved wording'));
  if (o.tcText) {
    if (method === 'fcfs' && RULES.leaderboardWords.test(o.tcText))
      push('error', 'content', 'Reward methodology is inconsistent: the campaign is first come, first served, but the T&C mentions a leaderboard or ranking.', FIELDS.rewardMethod);
    if (method !== 'fcfs' && RULES.fcfsWords.test(o.tcText))
      push('error', 'content', 'Reward methodology is inconsistent: the T&C says “first come, first served”, but the campaign uses another reward method.', FIELDS.rewardMethod);
  }
}

export const countBy = (issues: Issue[]) => ({
  error: issues.filter((i) => i.level === 'error').length,
  warning: issues.filter((i) => i.level === 'warning').length,
  info: issues.filter((i) => i.level === 'info').length,
});
