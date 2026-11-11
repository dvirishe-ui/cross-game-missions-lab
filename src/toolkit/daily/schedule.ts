// Session times, announcement deadlines and every check the schedule needs.
// Deadlines are computed on real instants in the campaign time zone, so a
// 00:20 session with a 40-minute lead gets a 23:40 deadline on the previous
// date, and daylight-saving changes are respected. Local times that do not
// exist (spring forward) or happen twice (fall back) are flagged.

import { addDays, parseZone, toInstant, validDate, validTime } from '../model/time';
import { GAME_BY_ID, modelKind } from './estimate';
import { MIN_LEAD, hoursLength, insideHours, minOf, sessionSlots, type DailyPlan, type DDay, type DSession } from './plan';

export interface LocalDT {
  date: string;
  time: string;
}

/** Local wall-clock date and time of an instant in a zone. */
export function fromInstant(ms: number, tz: string): LocalDT | null {
  const z = parseZone(tz);
  if (!z) return null;
  const iso = (t: number) => new Date(t).toISOString();
  if (z.kind === 'utc') return { date: iso(ms).slice(0, 10), time: iso(ms).slice(11, 16) };
  if (z.kind === 'offset') {
    const s = iso(ms + z.offsetMin * 60000);
    return { date: s.slice(0, 10), time: s.slice(11, 16) };
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: z.iana, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(ms);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour').padStart(2, '0').replace('24', '00')}:${g('minute')}` };
}

export type LocalStatus = 'ok' | 'nonexistent' | 'ambiguous' | 'invalid';

/** Whether a local date/time exists once, never (DST gap) or twice (DST overlap) in the zone. */
export function localTimeStatus(date: string, time: string, tz: string): LocalStatus {
  const z = parseZone(tz);
  if (!z || !validDate(date) || !validTime(time)) return 'invalid';
  if (z.kind !== 'iana') return 'ok';
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const matches = new Set<number>();
  for (const probe of [-26, -13, -3, 0, 3, 13, 26]) {
    const ref = wall + probe * 3600000;
    const lt = fromInstant(ref, tz)!;
    const [ly, lmo, ld] = lt.date.split('-').map(Number);
    const [lh, lmi] = lt.time.split(':').map(Number);
    const off = Date.UTC(ly, lmo - 1, ld, lh, lmi) - Math.floor(ref / 60000) * 60000;
    const cand = wall - off;
    const back = fromInstant(cand, tz);
    if (back && back.date === date && back.time === time) matches.add(cand);
  }
  if (matches.size === 0) return 'nonexistent';
  return matches.size > 1 ? 'ambiguous' : 'ok';
}

export interface SessionRow {
  dayIndex: number;
  sessionIndex: number;
  session: DSession;
  date: string;
  start: string;
  end: LocalDT | null;
  startMs: number | null;
  endMs: number | null;
  /** Announcement deadline (latest time the announcement can go out). */
  deadline: LocalDT | null;
  deadlineMs: number | null;
  /** Actual lead in minutes (per-day announcements can give more than the minimum). */
  leadMin: number | null;
  /** The deadline falls on an earlier date than the session. */
  prevDate: boolean;
  status: LocalStatus;
}

export const dayDateOf = (startDate: string, i: number) => (validDate(startDate) ? addDays(startDate, i) : '');

/** Wall-clock arithmetic for when the zone or date is missing: minutes → date shift + time. */
function shiftWall(date: string, time: string, minutes: number): LocalDT | null {
  const m = minOf(time);
  if (m == null) return null;
  const total = m + minutes;
  const dayShift = Math.floor(total / 1440);
  const t = ((total % 1440) + 1440) % 1440;
  const hhmm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  return { date: date ? addDays(date, dayShift) : dayShift < 0 ? 'previous day' : dayShift > 0 ? 'next day' : '', time: hhmm };
}

const effectiveLead = (plan: DailyPlan, s: DSession) => s.leadMin ?? plan.leadMin;

/** Per-day announcement time: chosen time, or the earliest session deadline of the day. */
export function dayAnnouncement(plan: DailyPlan, day: DDay, date: string, tz: string): { at: LocalDT | null; ms: number | null } {
  if (day.announceTime && validTime(day.announceTime)) {
    const d = day.announcePrevDay && date ? addDays(date, -1) : date;
    return { at: { date: d, time: day.announceTime }, ms: toInstant(d, day.announceTime, tz) };
  }
  let best: { at: LocalDT | null; ms: number | null } = { at: null, ms: null };
  let bestKey = Infinity;
  for (const s of day.sessions) {
    if (!validTime(s.start)) continue;
    const startMs = toInstant(date, s.start, tz);
    const key = startMs ?? (minOf(s.start) ?? 0) * 60000;
    const lead = effectiveLead(plan, s);
    if (key - lead * 60000 < bestKey) {
      bestKey = key - lead * 60000;
      best = startMs != null ? { at: fromInstant(startMs - lead * 60000, tz), ms: startMs - lead * 60000 } : { at: shiftWall(date, s.start, -lead), ms: null };
    }
  }
  return best;
}

export function scheduleRows(plan: DailyPlan, startDate: string, tz: string): SessionRow[] {
  const rows: SessionRow[] = [];
  plan.days.forEach((day, di) => {
    const date = dayDateOf(startDate, di);
    const ann = plan.announceMode === 'per-day' ? dayAnnouncement(plan, day, date, tz) : null;
    day.sessions.forEach((s, si) => {
      const startMs = validTime(s.start) ? toInstant(date, s.start, tz) : null;
      const endMs = startMs != null ? startMs + s.durationMin * 60000 : null;
      let deadline: LocalDT | null;
      let deadlineMs: number | null;
      let leadMin: number | null;
      if (ann) {
        deadline = ann.at;
        deadlineMs = ann.ms;
        leadMin = startMs != null && ann.ms != null ? Math.round((startMs - ann.ms) / 60000) : ann.at && validTime(s.start) ? wallDiff(ann.at, date, s.start) : null;
      } else {
        leadMin = effectiveLead(plan, s);
        deadlineMs = startMs != null ? startMs - leadMin * 60000 : null;
        deadline = deadlineMs != null ? fromInstant(deadlineMs, tz) : validTime(s.start) ? shiftWall(date, s.start, -leadMin) : null;
      }
      rows.push({
        dayIndex: di,
        sessionIndex: si,
        session: s,
        date,
        start: s.start,
        end: endMs != null ? fromInstant(endMs, tz) : validTime(s.start) ? shiftWall(date, s.start, s.durationMin) : null,
        startMs,
        endMs,
        deadline,
        deadlineMs,
        leadMin,
        prevDate: !!deadline && (deadline.date === 'previous day' || (!!date && validDate(deadline.date) && deadline.date < date)),
        status: date && validTime(s.start) ? localTimeStatus(date, s.start, tz) : 'invalid',
      });
    });
  });
  return rows;
}

function wallDiff(at: LocalDT, date: string, start: string): number | null {
  const a = minOf(at.time);
  const b = minOf(start);
  if (a == null || b == null) return null;
  const days = validDate(at.date) && validDate(date) ? Math.round((Date.parse(date) - Date.parse(at.date)) / 86400000) : 0;
  return days * 1440 + b - a;
}

// ---------- validation ----------

export type DLevel = 'error' | 'warning' | 'info';
export interface DIssue {
  level: DLevel;
  msg: string;
  day?: number;
  session?: number;
  mission?: number;
}

export function validatePlan(plan: DailyPlan, startDate: string, tz: string): DIssue[] {
  const out: DIssue[] = [];
  const add = (level: DLevel, msg: string, at: Omit<DIssue, 'level' | 'msg'> = {}) => out.push({ level, msg, ...at });
  if (!tz.trim()) add('error', 'Time zone is missing: deadlines cannot be fixed to real times.');
  else if (!parseZone(tz)) add('error', `Time zone "${tz}" is not recognised. Use UTC, UTC+3 or a name like Africa/Lagos.`);
  if (!startDate) add('error', 'Start date is missing.');
  else if (!validDate(startDate)) add('error', 'Start date is not a valid date.');
  if (!plan.days.length) add('error', 'The campaign has no days.');
  if (plan.leadMin < MIN_LEAD) add('error', `Announcement lead is ${plan.leadMin} min; it must be at least ${MIN_LEAD} min before every session.`);
  const hoursSet = minOf(plan.opStart) != null && minOf(plan.opEnd) != null;
  if (!hoursSet) add('warning', 'Operating hours are not set, so sessions are not checked against them.');
  const len = hoursLength(plan.opStart, plan.opEnd);

  const rows = scheduleRows(plan, startDate, tz);
  plan.days.forEach((day, di) => {
    const at = { day: di };
    if (!day.sessions.length) add('error', `Day ${di + 1} has no sessions.`, at);
    if (len != null) {
      const need = day.sessions.reduce((a, s) => a + s.durationMin, 0) + Math.max(0, day.sessions.length - 1) * plan.template.gapMin;
      if (need > len) add('error', `Day ${di + 1} needs ${need} min of sessions${plan.template.gapMin ? ' and gaps' : ''} but operating hours give only ${len} min.`, at);
    }
    day.sessions.forEach((s, si) => {
      const where = { day: di, session: si };
      const name = `Day ${di + 1}, session ${si + 1}`;
      if (!validTime(s.start)) add('error', `${name}: start time is missing.`, where);
      if (!(s.durationMin > 0)) add('error', `${name}: duration must be more than 0 minutes.`, where);
      if (s.leadMin != null && s.leadMin < MIN_LEAD) add('error', `${name}: lead time ${s.leadMin} min is under ${MIN_LEAD} min.`, where);
      if (validTime(s.start) && hoursSet && !insideHours(minOf(s.start)!, s.durationMin, plan.opStart, plan.opEnd)) add('error', `${name} (${s.start}, ${s.durationMin} min) is outside operating hours ${plan.opStart}–${plan.opEnd}.`, where);
      if (s.missions.length < 2) add('error', `${name}: needs at least 2 missions (has ${s.missions.length}).`, where);
      if (!s.missions.some((m) => m.game === 'aviator')) add('error', `${name}: needs at least one Aviator mission.`, where);
      if (plan.rewardMode === 'bundle' && !(sessionSlots(plan, s) >= 1)) add('error', `${name}: shared slots must be at least 1.`, where);
      s.missions.forEach((m, mi) => {
        const mw = { ...where, mission: mi };
        const mname = `${name}, mission ${mi + 1} (${GAME_BY_ID[m.game]?.name ?? m.game})`;
        const g = GAME_BY_ID[m.game];
        if (m.kind === 'catch') {
          if (m.threshold == null || !(m.threshold > 1)) add('error', `${mname}: multiplier must be above 1×.`, mw);
          else if (g && m.threshold > g.maxMultiplier) add('error', `${mname}: ${m.threshold}× is above the game's top multiplier (${g.maxMultiplier}×).`, mw);
        }
        if (m.catches == null || !(m.catches >= 1) || !Number.isInteger(m.catches)) add('error', `${mname}: ${m.kind === 'catch' ? 'required catches' : m.kind === 'collect' ? 'total to collect' : 'number of bets'} must be a whole number of at least 1.`, mw);
        if (plan.rewardMode === 'independent' && (m.slots == null || !(m.slots >= 1) || !Number.isInteger(m.slots))) add('error', `${mname}: winner slots must be a whole number of at least 1.`, mw);
        if (m.chanceOverride != null && !(m.chanceOverride > 0 && m.chanceOverride <= 1)) add('error', `${mname}: chance per bet must be between 0 and 1.`, mw);
        if (modelKind(m.game, m.chanceOverride) === 'none') add('info', `${mname}: no verified chance model; estimates show "Insufficient data" unless you enter a chance per bet.`, mw);
      });
    });
  });

  for (const r of rows) {
    const where = { day: r.dayIndex, session: r.sessionIndex };
    const name = `Day ${r.dayIndex + 1}, session ${r.sessionIndex + 1}`;
    if (r.status === 'nonexistent') add('error', `${name}: ${r.start} does not exist on ${r.date} in ${tz} (clocks go forward).`, where);
    if (r.status === 'ambiguous') add('warning', `${name}: ${r.start} happens twice on ${r.date} in ${tz} (clocks go back); the first one is used. State the UTC offset in announcements.`, where);
    if (plan.announceMode === 'per-day' && r.leadMin != null && r.leadMin < MIN_LEAD) add('error', `${name}: the day's announcement gives only ${r.leadMin} min before it starts (minimum ${MIN_LEAD}).`, where);
    if (r.prevDate) add('info', `${name}: announcement deadline ${r.deadline?.time} is on the previous date.`, where);
  }

  // Overlaps across the whole campaign (real instants when possible, wall clock otherwise).
  const timed = rows
    .map((r) => ({ r, a: r.startMs ?? (validTime(r.start) ? r.dayIndex * 1440 * 60000 + minOf(r.start)! * 60000 : null) }))
    .filter((x): x is { r: SessionRow; a: number } => x.a != null)
    .sort((x, y) => x.a - y.a);
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    const cur = timed[i];
    const prevEnd = prev.a + prev.r.session.durationMin * 60000;
    if (cur.a < prevEnd) add('error', `Day ${cur.r.dayIndex + 1}, session ${cur.r.sessionIndex + 1} overlaps Day ${prev.r.dayIndex + 1}, session ${prev.r.sessionIndex + 1}.`, { day: cur.r.dayIndex, session: cur.r.sessionIndex });
  }
  return out;
}
