// Builds the campaign brief and the T&C from a project and the master
// template. Output is a list of blocks made of segments, so the preview can
// show which words are template wording, which are campaign values and which
// are missing. Nothing missing is ever filled with a guess.

import { allowedGames, calculatedTotal, dayDate, dayEnd, dayPool, dayStart, dayWinners, GAME_NAME, listText, taskText, usedGames } from '../model/campaign';
import { FIELDS, dayField, slotField, type FieldRef } from '../model/fields';
import { fmtMoney, validCurrency } from '../model/money';
import { PAYOUT_METHODS, REWARD_METHODS, type Project } from '../model/project';
import { fmtDate, parseZone, validDate, validTime } from '../model/time';
import { label as rangeLabel, perWinner, rangeSize } from '../split/split';
import { CLAUSES, SLOTS, type ClauseCategory, type MasterTemplate } from './master';

export type Seg = { k: 'text' | 'value' | 'missing'; s: string; ref?: FieldRef };
export interface Block {
  kind: 'title' | 'subtitle' | 'h2' | 'h3' | 'kv' | 'li' | 'bullet';
  segs: Seg[];
  label?: string;
  clause?: string;
  category?: ClauseCategory;
}

const text = (s: string): Seg => ({ k: 'text', s });
const value = (s: string): Seg => ({ k: 'value', s });
export const missing = (ref: FieldRef): Seg => ({ k: 'missing', s: `[MISSING: ${ref.label}]`, ref });
const segText = (segs: Seg[]) => segs.map((x) => x.s).join('');

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const fmtInt = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** Fills {{placeholders}}; an unknown or empty value becomes a [MISSING] marker. */
export function fill(template: string, values: Record<string, Seg>): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{\{(\w+)\}\}/g)) {
    if (m.index! > last) out.push(text(template.slice(last, m.index)));
    out.push(values[m[1]] ?? missing({ tab: 'tc', id: 'f-master', label: `value for {{${m[1]}}}` }));
    last = m.index! + m[0].length;
  }
  if (last < template.length) out.push(text(template.slice(last)));
  return out;
}

const money = (p: Project, n: number | null | undefined, ref: FieldRef): Seg => {
  if (n == null || !Number.isFinite(n)) return missing(ref);
  return validCurrency(p.prizes.currency) ? value(fmtMoney(n, p.prizes.currency)) : missing(FIELDS.currency);
};

function campaignValues(p: Project): Record<string, Seg> {
  const games = allowedGames(p).length ? allowedGames(p) : usedGames(p);
  const rt = p.prizes.rewardType.trim();
  const max = p.prizes.maxRewardsPerPlayer;
  return {
    games: games.length ? value(listText(games.map((g) => GAME_NAME[g] ?? g))) : missing(FIELDS.anchor),
    totalPool: money(p, p.prizes.totalPool, FIELDS.totalPool),
    winnersPerDay: p.prizes.winnersPerDay != null ? value(fmtInt(p.prizes.winnersPerDay)) : missing(FIELDS.winnersPerDay),
    qualification: p.eligibility.qualification.trim() ? value(p.eligibility.qualification.trim()) : missing(FIELDS.qualification),
    rewardTypeLower: rt ? value(rt.toLowerCase()) : missing(FIELDS.rewardType),
    rewardTypeCap: rt ? value(rt[0].toUpperCase() + rt.slice(1)) : missing(FIELDS.rewardType),
    maxRewards: max != null && max >= 1 ? value(`${NUMBER_WORDS[max] ?? fmtInt(max)} reward${max === 1 ? '' : 's'}`) : missing(FIELDS.maxRewards),
    payoutHours: p.payout.deadlineHours != null ? value(fmtInt(p.payout.deadlineHours)) : missing(FIELDS.payoutHours),
  };
}

const slotLabel = (id: string) => SLOTS.find((s) => s.id === id)?.label ?? id;
const approvedSlot = (t: MasterTemplate, id: string): Seg[] =>
  t.slots[id]?.trim() ? [text(t.slots[id].trim())] : [missing(slotField(id, `Approved wording — ${slotLabel(id)}`))];

const category = (id: string) => CLAUSES.find((c) => c.id === id)!.category;

/** The Terms and Conditions bullets, in the reference order. */
export function tcBlocks(p: Project, t: MasterTemplate): Block[] {
  const v = campaignValues(p);
  const out: Block[] = [];
  const add = (id: string, segs: Seg[]) => out.push({ kind: 'bullet', segs, clause: id, category: category(id) });
  const wording = (id: string) => fill(t.wording[id] ?? '', v);
  const fcfs = p.prizes.rewardMethod === 'fcfs';

  add('availability', wording('availability'));
  if (p.eligibility.joinRequired) add('join', wording('join'));
  else if (t.slots['join.notRequired']?.trim()) add('join', approvedSlot(t, 'join.notRequired'));
  if (p.progress.resetDaily && p.progress.carryOver) {
    add('reset', [missing({ ...FIELDS.days, tab: 'tc', id: 'f-progress-reset', label: 'Progress cannot both reset and carry over — choose one' })]);
  } else {
    if (p.progress.resetDaily) {
      add('independence', wording('independence'));
      add('reset', wording('reset'));
    }
    if (p.progress.carryOver) add('reset', approvedSlot(t, 'progress.carryOver'));
  }
  if (p.progress.completionDeadline) add('deadline', wording('deadline'));
  if (p.progress.updateAfterRound) add('progressUpdate', wording('progressUpdate'));
  if (p.progress.refreshNote) add('refresh', wording('refresh'));
  add('rewardMethod', fcfs ? wording('rewardMethod') : approvedSlot(t, `reward.${p.prizes.rewardMethod}`));
  add('totalPool', wording('totalPool'));
  if (fcfs) add('winnerEligibility', wording('winnerEligibility'));
  if (p.prizes.structureSource === 'split' && p.split) {
    const s = p.split;
    for (const r of [...s.ranges].sort((a, b) => a.from - b.from))
      add('dailyBreakdown', [value(rangeLabel(r)), text(': '), money(p, perWinner(s, r), FIELDS.totalPool), text(rangeSize(r) > 1 ? ' per winner.' : '.')]);
  } else if (!p.days.length) {
    add('dailyBreakdown', [missing(FIELDS.days)]);
  } else {
    p.days.forEach((d, i) => {
      const w = dayWinners(p, d);
      add(
        'dailyBreakdown',
        fill(t.wording.dailyBreakdown, {
          ...v,
          day: value(String(i + 1)),
          dayWinners: w != null ? value(fmtInt(w)) : missing(dayField(i, 'winners', `Day ${i + 1} winners`)),
          dayPool: money(p, dayPool(p, d), dayField(i, 'reward', `Day ${i + 1} reward per winner`)),
          dayReward: money(p, d.reward, dayField(i, 'reward', `Day ${i + 1} reward per winner`)),
        }),
      );
    });
  }
  if (fcfs) add('rewardCap', wording('rewardCap'));
  add('frequency', wording('frequency'));
  if (p.clauses.variableTasks) add('variableTasks', wording('variableTasks'));
  if (p.clauses.futureEligibility) add('futureEligibility', wording('futureEligibility'));
  add('payout', p.payout.method === 'automatic' ? wording('payout') : approvedSlot(t, `payout.${p.payout.method}`));
  if (p.eligibility.verifiedOnly) add('verification', wording('verification'));
  if (p.payout.currencyRule) add('payoutCurrency', wording('payoutCurrency'));
  if (!p.clauses.combinable) add('otherOffers', wording('otherOffers'));
  add('cheating', wording('cheating'));
  add('changes', wording('changes'));
  return out;
}

function when(p: Project, date: string, time: string, dateRef: FieldRef, timeRef: FieldRef): Seg[] {
  const tz = parseZone(p.schedule.timezone);
  return [
    validDate(date) ? value(fmtDate(date)) : missing(dateRef),
    text(' '),
    validTime(time) ? value(time) : missing(timeRef),
    text(' '),
    tz ? value(tz.label) : missing(FIELDS.timezone),
  ];
}

/** Full campaign brief: schedule, format, games, daily missions, prizes, then the T&C. */
export function briefBlocks(p: Project, t: MasterTemplate): Block[] {
  const b: Block[] = [];
  const kv = (label: string, segs: Seg[]) => b.push({ kind: 'kv', label, segs });
  const s = p.schedule;
  b.push({ kind: 'title', segs: [p.promo.name.trim() ? value(p.promo.name.trim()) : missing(FIELDS.name)] });
  if (p.promo.slogan.trim()) b.push({ kind: 'subtitle', segs: [value(p.promo.slogan.trim())] });

  b.push({ kind: 'h2', segs: [text('Campaign Schedule')] });
  kv('Announcement', when(p, s.announceDate, s.announceTime, FIELDS.announceDate, FIELDS.announceTime));
  kv('Campaign Start', when(p, s.startDate, s.startTime, FIELDS.startDate, FIELDS.startTime));
  kv('Campaign End', when(p, s.endDate, s.endTime, FIELDS.endDate, FIELDS.endTime));
  const tz = parseZone(s.timezone);
  kv('Daily Mission Hours', [
    validTime(s.dailyStart) ? value(s.dailyStart) : missing(FIELDS.dailyStart),
    text('–'),
    validTime(s.dailyEnd) ? value(s.dailyEnd) : missing(FIELDS.dailyEnd),
    text(' '),
    tz ? value(tz.label) : missing(FIELDS.timezone),
  ]);

  b.push({ kind: 'h2', segs: [text('Promotion Format')] });
  const days = p.promo.declaredDays;
  kv('Duration', days != null ? [value(`${days} ${p.promo.consecutive ? 'consecutive ' : ''}Daily Mission${days === 1 ? '' : 's'}`)] : [missing(FIELDS.declaredDays)]);
  kv('Format', p.promo.format.trim() ? [value(p.promo.format.trim())] : [missing(FIELDS.format)]);
  kv('Prizes', p.prizes.rewardType.trim() ? [value(`${p.prizes.rewardType.trim()} prize distribution`)] : [missing(FIELDS.rewardType)]);
  kv('Total Prize Pool', [money(p, p.prizes.totalPool, FIELDS.totalPool)]);
  kv('Winners', p.prizes.winnersPerDay != null ? [value(`${fmtInt(p.prizes.winnersPerDay)} winners per day`)] : [missing(FIELDS.winnersPerDay)]);
  if (p.prizes.rewardStructure.trim()) kv('Reward Structure', [value(p.prizes.rewardStructure.trim())]);
  kv('Reward Method', [value(REWARD_METHODS.find((r) => r.id === p.prizes.rewardMethod)!.label)]);

  b.push({ kind: 'h2', segs: [text('Games')] });
  kv('Anchor Game', p.games.anchor ? [value(GAME_NAME[p.games.anchor])] : [missing(FIELDS.anchor)]);
  const sec = p.games.secondary.filter((g) => g !== p.games.anchor);
  kv('Secondary Games', sec.length ? [value(listText(sec.map((g) => GAME_NAME[g])))] : [missing(FIELDS.secondary)]);

  b.push({ kind: 'h2', segs: [text('Eligibility')] });
  kv('Eligible Markets', p.eligibility.markets.trim() ? [value(p.eligibility.markets.trim())] : [missing(FIELDS.markets)]);
  if (p.eligibility.operators.trim()) kv('Eligible Operators', [value(p.eligibility.operators.trim())]);
  if (p.eligibility.conditions.trim()) kv('Conditions', [value(p.eligibility.conditions.trim())]);

  b.push({ kind: 'h2', segs: [text('Daily Missions')] });
  if (!p.days.length) b.push({ kind: 'li', segs: [missing(FIELDS.days)] });
  p.days.forEach((d, i) => {
    const date = dayDate(p, i);
    b.push({
      kind: 'h3',
      segs: [
        text(`Day ${i + 1}`),
        ...(date ? [text(' — '), value(fmtDate(date))] : []),
        ...(dayStart(p, d) && dayEnd(p, d) ? [text(', '), value(`${dayStart(p, d)}–${dayEnd(p, d)}`)] : []),
      ],
    });
    if (!d.tasks.length) b.push({ kind: 'li', segs: [missing(dayField(i, 'tasks', `Day ${i + 1} tasks`))] });
    d.tasks.forEach((task) => b.push({ kind: 'li', segs: [value(GAME_NAME[task.game] ?? task.game), text(' — '), value(taskText(task))] }));
  });

  b.push({ kind: 'h2', segs: [text('Prize Structure')] });
  if (p.prizes.structureSource === 'split' && p.split) {
    for (const r of [...p.split.ranges].sort((a, c) => a.from - c.from))
      b.push({ kind: 'li', segs: [value(rangeLabel(r)), text(': '), money(p, perWinner(p.split, r), FIELDS.totalPool), text(rangeSize(r) > 1 ? ' per winner' : '')] });
  } else {
    p.days.forEach((d, i) => {
      const w = dayWinners(p, d);
      b.push({
        kind: 'li',
        segs: [
          text(`Day ${i + 1}: `),
          w != null ? value(fmtInt(w)) : missing(dayField(i, 'winners', `Day ${i + 1} winners`)),
          text(' winners × '),
          money(p, d.reward, dayField(i, 'reward', `Day ${i + 1} reward per winner`)),
          text(' = '),
          money(p, dayPool(p, d), dayField(i, 'reward', `Day ${i + 1} reward per winner`)),
        ],
      });
    });
    const calc = calculatedTotal(p);
    b.push({ kind: 'li', segs: [text('Total: '), calc != null ? money(p, calc, FIELDS.totalPool) : missing(FIELDS.days)] });
  }

  b.push({ kind: 'h2', segs: [text('Terms and Conditions')] });
  b.push(...tcBlocks(p, t));
  return b;
}

export function toPlain(blocks: Block[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    const s = segText(b.segs);
    if (b.kind === 'title') lines.push(s.toUpperCase());
    else if (b.kind === 'subtitle') lines.push(s);
    else if (b.kind === 'h2') lines.push('', s);
    else if (b.kind === 'h3') lines.push('', s);
    else if (b.kind === 'kv') lines.push(`${b.label}: ${s}`);
    else if (b.kind === 'li') lines.push(`- ${s}`);
    else lines.push(`• ${s}`);
  }
  return lines.join('\n').trim() + '\n';
}

/** Every [MISSING] marker in the blocks, one per field. */
export function missingRefs(blocks: Block[]): FieldRef[] {
  const out = new Map<string, FieldRef>();
  for (const b of blocks) for (const s of b.segs) if (s.k === 'missing' && s.ref) out.set(s.ref.id + s.ref.label, s.ref);
  return [...out.values()];
}

export interface CheckItem {
  label: string;
  ok: boolean;
  ref: FieldRef;
}

/** The pre-generation checklist. */
export function checklist(p: Project, t: MasterTemplate): CheckItem[] {
  const s = p.schedule;
  const dated = (d: string, tm: string) => validDate(d) && validTime(tm);
  const daysOk =
    p.days.length > 0 && p.days.every((d) => d.tasks.length > 0 && d.tasks.every((x) => x.game && Number.isFinite(x.target) && (x.kind !== 'catch' || Number.isFinite(x.threshold))));
  const prizesOk =
    p.prizes.structureSource === 'split' ? !!p.split?.ranges.length : p.days.length > 0 && p.days.every((d) => dayPool(p, d) != null);
  const methodOk = p.prizes.rewardMethod === 'fcfs' || !!t.slots[`reward.${p.prizes.rewardMethod}`]?.trim();
  const payoutOk = p.payout.method === 'automatic' ? p.payout.deadlineHours != null : !!t.slots[`payout.${p.payout.method}`]?.trim();
  return [
    { label: 'Promotion name', ok: !!p.promo.name.trim(), ref: FIELDS.name },
    { label: 'Announcement date and time', ok: dated(s.announceDate, s.announceTime), ref: FIELDS.announceDate },
    { label: 'Campaign start', ok: dated(s.startDate, s.startTime), ref: FIELDS.startDate },
    { label: 'Campaign end', ok: dated(s.endDate, s.endTime), ref: FIELDS.endDate },
    { label: 'Time zone', ok: !!parseZone(s.timezone), ref: FIELDS.timezone },
    { label: 'Daily mission hours', ok: validTime(s.dailyStart) && validTime(s.dailyEnd), ref: FIELDS.dailyStart },
    { label: 'Games', ok: !!p.games.anchor || p.games.secondary.length > 0, ref: FIELDS.anchor },
    { label: 'Daily missions and tasks', ok: daysOk, ref: FIELDS.days },
    { label: 'Currency', ok: validCurrency(p.prizes.currency), ref: FIELDS.currency },
    { label: 'Total prize pool', ok: p.prizes.totalPool != null, ref: FIELDS.totalPool },
    { label: 'Winners per day', ok: p.prizes.winnersPerDay != null, ref: FIELDS.winnersPerDay },
    { label: 'Prize distribution', ok: prizesOk, ref: FIELDS.days },
    { label: 'Eligibility (markets)', ok: !!p.eligibility.markets.trim(), ref: FIELDS.markets },
    { label: `Reward method wording (${REWARD_METHODS.find((r) => r.id === p.prizes.rewardMethod)!.label})`, ok: methodOk, ref: methodOk ? FIELDS.rewardMethod : slotField(`reward.${p.prizes.rewardMethod}`, 'Approved wording') },
    { label: `Payout (${PAYOUT_METHODS.find((m) => m.id === p.payout.method)!.label})`, ok: payoutOk, ref: FIELDS.payoutHours },
  ];
}
