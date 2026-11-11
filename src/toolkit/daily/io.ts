// Daily Promo import / export, announcement drafts and the T&C section.
// Drafts are text to copy; nothing is sent or scheduled from here.

import type { Project } from '../model/project';
import { fmtMoney } from '../model/money';
import { fmtDate, fmtShort, parseZone } from '../model/time';
import { allocate, fromMinor, minorDigits, pct } from './allocate';
import { GAME_BY_ID } from './estimate';
import { DAILY_VERSION, POLICIES, normalizeDaily, totals, type DailyPlan, type DMission } from './plan';
import { scheduleRows, type SessionRow } from './schedule';

export const EXPORT_KIND = 'promo-toolkit/daily-promo';

export interface CampaignExport {
  kind: typeof EXPORT_KIND;
  version: number;
  exportedAt: string;
  campaign: { name: string; startDate: string; timezone: string; currency: string; budget: number | null; markets: string };
  plan: DailyPlan;
}

export function exportJson(p: Project, plan: DailyPlan): string {
  const data: CampaignExport = {
    kind: EXPORT_KIND,
    version: DAILY_VERSION,
    exportedAt: new Date().toISOString(),
    campaign: { name: p.promo.name, startDate: p.schedule.startDate, timezone: p.schedule.timezone, currency: p.prizes.currency, budget: p.prizes.totalPool, markets: p.eligibility.markets },
    plan,
  };
  return JSON.stringify(data, null, 2);
}

export type ImportResult = { ok: true; plan: DailyPlan; campaign: CampaignExport['campaign'] | null; warnings: string[] } | { ok: false; error: string };

/** Reads an exported file. Never throws; an invalid file leaves the current plan untouched. */
export function importJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'The file does not contain a plan.' };
  const r = raw as Record<string, unknown>;
  const planRaw = r.kind === EXPORT_KIND ? r.plan : 'days' in r && 'template' in r ? r : null;
  if (!planRaw) return { ok: false, error: 'This is not a Daily Promo export.' };
  try {
    const { plan, warnings } = normalizeDaily(planRaw);
    const c = (r.campaign ?? null) as Record<string, unknown> | null;
    const campaign = c
      ? {
          name: typeof c.name === 'string' ? c.name : '',
          startDate: typeof c.startDate === 'string' ? c.startDate : '',
          timezone: typeof c.timezone === 'string' ? c.timezone : '',
          currency: typeof c.currency === 'string' ? c.currency : '',
          budget: typeof c.budget === 'number' && Number.isFinite(c.budget) ? c.budget : null,
          markets: typeof c.markets === 'string' ? c.markets : '',
        }
      : null;
    return { ok: true, plan, campaign, warnings };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function missionText(m: DMission): string {
  const g = GAME_BY_ID[m.game]?.name ?? m.game;
  if (m.kind === 'bets') return `${g}: place ${m.catches ?? '?'} bets`;
  if (m.kind === 'collect') return `${g}: collect ${m.catches ?? '?'}× in total`;
  const per = m.game === 'aviator' && m.countPer === 'bet' ? ' (each bet counts)' : '';
  return `${g}: cash out at ${m.threshold ?? '?'}× or more ${m.catches ?? '?'} time${m.catches === 1 ? '' : 's'}${per}`;
}

/** What exactly counts, in words: a round reaching X× is not the same as a player qualifying. */
export function qualifyingText(m: DMission, currency: string): string {
  const g = GAME_BY_ID[m.game]?.name ?? m.game;
  const bet = m.minBet != null ? ` of at least ${fmtMoney(m.minBet, currency)}` : '';
  if (m.kind === 'bets') return `Each settled ${g} bet${bet} placed during the session counts once.`;
  if (m.kind === 'collect') return `The win multipliers of every settled ${g} bet${bet} placed during the session are added up; the mission is complete when the total reaches ${m.catches ?? '?'}×.`;
  if (m.game === 'aviator')
    return `A catch is a settled Aviator bet${bet} placed during the session that is cashed out (manually or by auto cash-out) at ${m.threshold ?? '?'}× or higher. A round reaching ${m.threshold ?? '?'}× only counts for players who had a qualifying bet in it and cashed out at or above ${m.threshold ?? '?'}×. ${m.countPer === 'bet' ? 'Each of a player’s two bets in one round counts separately.' : 'A round counts once per player, even with two bets in it.'}`;
  return `A catch is a settled ${g} bet${bet} placed during the session whose result pays ${m.threshold ?? '?'}× the stake or more.`;
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(p: Project, plan: DailyPlan): string {
  const tz = p.schedule.timezone;
  const rows = scheduleRows(plan, p.schedule.startDate, tz);
  const alloc = allocate(plan, p.prizes.totalPool, p.prizes.currency, p.schedule.timezone);
  const money = (minor: number | null) => (minor == null ? '' : fromMinor(minor, p.prizes.currency).toFixed(minorDigits(p.prizes.currency)));
  const head = ['day', 'date', 'timezone', 'session', 'start', 'end', 'duration_min', 'announcement_deadline_date', 'announcement_deadline_time', 'lead_min', 'mission', 'game', 'mission_text', 'threshold_x', 'required', 'min_bet', 'reward_mode', 'slots', 'pool_pct_of_campaign', 'pct_per_slot', 'currency', 'pool_amount', 'amount_per_slot'];
  const out = [head.join(',')];
  for (const r of rows) {
    r.session.missions.forEach((m, mi) => {
      const pool = alloc.pools.find((x) => x.day === r.dayIndex && x.session === r.sessionIndex && x.mission === (plan.rewardMode === 'bundle' ? -1 : mi));
      const perSlot = pool && pool.payouts.length ? pool.payouts[0] : null;
      out.push(
        [
          r.dayIndex + 1,
          r.date,
          tz,
          r.sessionIndex + 1,
          r.start,
          r.end?.time ?? '',
          r.session.durationMin,
          r.deadline?.date ?? '',
          r.deadline?.time ?? '',
          r.leadMin ?? '',
          mi + 1,
          GAME_BY_ID[m.game]?.name ?? m.game,
          missionText(m),
          m.kind === 'catch' ? (m.threshold ?? '') : '',
          m.catches ?? '',
          m.minBet ?? '',
          plan.rewardMode === 'bundle' ? 'bundle (shared session pool)' : 'independent',
          pool?.slots ?? '',
          pool ? pct(pool.share, 4) : '',
          perSlot ? pct(perSlot.share, 5) + (plan.payout === 'ranked' ? ' (1st)' : '') : '',
          alloc.budgetMinor != null ? p.prizes.currency : '',
          plan.rewardMode === 'bundle' && mi > 0 ? 'shared' : pool ? money(pool.minor) : '',
          plan.rewardMode === 'bundle' && mi > 0 ? 'shared' : perSlot ? money(perSlot.minor) : '',
        ]
          .map(csvCell)
          .join(','),
      );
    });
  }
  return out.join('\n');
}

export function announcementDraft(p: Project, plan: DailyPlan, rows: SessionRow[], currency: string): string {
  const tz = parseZone(p.schedule.timezone)?.label ?? '[MISSING: time zone]';
  const first = rows[0];
  if (!first) return '';
  const day = first.dayIndex + 1;
  const date = first.date ? `${fmtShort(first.date)} (${fmtDate(first.date)})` : '[MISSING: start date]';
  const lines = [`${p.promo.name || 'Daily Promo'} · Day ${day}, ${date}`];
  const alloc = allocate(plan, p.prizes.totalPool, currency, p.schedule.timezone);
  for (const r of rows) {
    const end = r.end?.time ?? '?';
    lines.push('', `Session ${r.sessionIndex + 1}: ${r.start || '[MISSING: start]'}–${end} ${tz} (${r.session.durationMin} min)`);
    r.session.missions.forEach((m, mi) => {
      const pool = alloc.pools.find((x) => x.day === r.dayIndex && x.session === r.sessionIndex && x.mission === mi);
      const slots = plan.rewardMode === 'independent' ? ` · ${m.slots ?? '?'} winner slots` : '';
      const amount = pool && pool.payouts[0]?.minor != null && plan.payout === 'equal' ? ` · ${fmtMoney(fromMinor(pool.payouts[0].minor!, currency), currency)} each` : '';
      lines.push(`  • ${missionText(m)}${slots}${amount}`);
    });
    if (plan.rewardMode === 'bundle') {
      const pool = alloc.pools.find((x) => x.day === r.dayIndex && x.session === r.sessionIndex && x.mission === -1);
      const amount = pool && pool.payouts[0]?.minor != null && plan.payout === 'equal' ? `, ${fmtMoney(fromMinor(pool.payouts[0].minor!, currency), currency)} each` : '';
      lines.push(`  Complete every mission above to claim one of ${pool?.slots ?? '?'} shared winner slots${amount}.`);
    }
  }
  lines.push('', plan.policies.selection ? `Winners: ${plan.policies.selection.toLowerCase()}.` : 'Winners: [MISSING: winner selection policy]', 'Full terms apply.');
  return lines.join('\n');
}

/** T&C section for the Daily Promo, with [MISSING] placeholders for unresolved policies. */
export function dailyTcLines(p: Project, plan: DailyPlan): { text: string; missing: string | null }[] {
  const t = totals(plan);
  const tz = parseZone(p.schedule.timezone)?.label ?? null;
  const out: { text: string; missing: string | null }[] = [];
  const line = (text: string, missing: string | null = null) => out.push({ text, missing });
  line(`The Daily Promo runs for ${t.days} day${t.days === 1 ? '' : 's'}${p.schedule.startDate ? ` from ${fmtDate(p.schedule.startDate)}` : ''}, with ${t.uniform ? t.sessionsPerDay : 'up to ' + Math.max(...plan.days.map((d) => d.sessions.length))} timed session${t.sessionsPerDay === 1 ? '' : 's'} per day. Session times are stated in ${tz ?? '[MISSING: time zone]'}.`, tz ? null : 'Time zone');
  line(`Each session lasts the stated number of minutes and has at least two missions, including at least one Aviator mission. Only bets placed and settled within the session count.`);
  if (plan.rewardMode === 'independent') line(`Each mission has its own winner slots (${t.slotFormula}). Completing a mission qualifies a player for that mission’s slots only. Slot counts are slots, not unique people.`);
  else line(`Each session has one shared prize pool. A player must complete every mission in the session to qualify for one of its shared winner slots. The pool is not paid per mission.`);
  line(plan.closeMode === 'when-filled' ? 'A mission (or session pool) closes as soon as all its winner slots are filled.' : 'Play continues until the scheduled end of each session, even after all slots are filled; only the stated number of slots is awarded.');
  line(`A higher stake does not change the chance of reaching a multiplier; the minimum qualifying bet, where stated, only sets which bets count.`);
  for (const pol of POLICIES) {
    const v = plan.policies[pol.key];
    line(`${pol.label}: ${v || `[MISSING: ${pol.label.toLowerCase()} policy]`}`, v ? null : pol.label);
  }
  return out;
}
