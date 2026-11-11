// Daily Promo Planner: Campaign → Day → Session → Mission → Winner slots.
// Reads and writes the shared project (dates, time zone, budget, currency)
// plus its versioned `daily` plan. Planning only: nothing is sent, bet or paid.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chip, DateField, Grid, NumberField, Section, SelectField, TextField, TimeField, useToolkit } from '../components/Fields';
import type { GameId } from '../../data/games';
import { DEFAULT_POPULARITY, POPULARITY, POPULARITY_SOURCE } from '../../data/gamePopularity';
import { DEFAULT_CLOCK, meanRoundSec } from '../../timer/clock';
import { copyText, saveFile, slug } from '../model/exporting';
import { fmtMoney } from '../model/money';
import { addDays, fmtShort, parseZone, validDate } from '../model/time';
import { allocate, fromMinor, pct, slotScenario } from '../daily/allocate';
import {
  DEFAULT_ASSUMPTIONS,
  MODEL_GAMES,
  GAME_BY_ID,
  betsPerMinFor,
  individualChance,
  modelKind,
  population,
  searchFits,
  type Assumptions,
  type EstMission,
  type PopulationResult,
} from '../daily/estimate';
import { announcementDraft, exportCsv, exportJson, importJson } from '../daily/io';
import {
  BUSIEST_UTC_HOURS,
  DAILY_VERSION,
  DURATIONS,
  LENGTHS,
  MIN_LEAD,
  POLICIES,
  PRESETS,
  TRADEOFFS,
  applyTemplate,
  copyDay,
  defaultPlan,
  editDay,
  freePeakStarts,
  peakFactor,
  popularGames,
  regameDays,
  peakRank,
  resizeSession,
  sizedMission,
  newMission,
  placeAtBusiest,
  presetRow,
  sessionSlots,
  setLength,
  setTemplate,
  templateDay,
  totals,
  zoneOffsetMin,
  type DailyPlan,
  type DDay,
  type DMission,
  type DSession,
} from '../daily/plan';
import { dayDateOf, scheduleRows, validatePlan, type DIssue, type SessionRow } from '../daily/schedule';

const PLAN_GAMES: GameId[] = ['aviator', 'plinko', 'mines', 'goal', 'keno', 'trader', 'pilot-chicken', 'keno-80'];
const gameName = (g: GameId) => GAME_BY_ID[g]?.name ?? g;
const pctOrDash = (x: number | null, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');

function Seg<T extends string | number>({ id, value, options, onChange, label }: { id?: string; label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="k-seg" role="group" aria-label={label} id={id}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" className="t-btn" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="k-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function DailyPromo() {
  const { project: p, update, goTab } = useToolkit();
  const seed = useMemo(() => defaultPlan(), [p.id]);
  const plan: DailyPlan = p.daily ?? seed;
  const tz = p.schedule.timezone;
  const startDate = p.schedule.startDate;
  const currency = p.prizes.currency;
  const budget = p.prizes.totalPool;
  const tooNew = (plan.version ?? 1) > DAILY_VERSION;

  const setPlan = (fn: (pl: DailyPlan) => DailyPlan) => update((x) => ({ ...x, daily: fn(x.daily ?? seed) }));
  const setSchedule = (patch: Partial<typeof p.schedule>) => update((x) => ({ ...x, schedule: { ...x.schedule, ...patch } }));

  const [dayIdx, setDayIdx] = useState(0);
  const di = Math.min(dayIdx, plan.days.length - 1);
  const day = plan.days[di];
  const [confirmAll, setConfirmAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const t = totals(plan);
  const issues = useMemo(() => validatePlan(plan, startDate, tz), [plan, startDate, tz]);
  const rows = useMemo(() => scheduleRows(plan, startDate, tz), [plan, startDate, tz]);
  const alloc = useMemo(() => allocate(plan, budget, currency, tz), [plan, budget, currency, tz]);
  const assumptions: Assumptions = { ...DEFAULT_ASSUMPTIONS, betsPerMin: plan.audience.betsPerMin, roundShare: plan.audience.roundShare, switchMin: plan.audience.switchMin };
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const editedCount = plan.days.filter((d) => d.edited).length;
  const zone = parseZone(tz);
  const zoneLabel = zone?.label ?? 'local time (no zone set)';
  const money = (minor: number | null) => (minor == null ? '—' : fmtMoney(fromMinor(minor, currency), currency));
  const hasMoney = alloc.budgetMinor != null;

  // With an amount per session length, the campaign total is their sum: keep the shared budget in step.
  const perLengthTotal = plan.prizeMode === 'per-length' && alloc.budgetMinor != null ? fromMinor(alloc.budgetMinor, currency) : null;
  useEffect(() => {
    if (perLengthTotal != null && perLengthTotal !== budget) update((x) => ({ ...x, prizes: { ...x.prizes, totalPool: perLengthTotal } }));
  }, [perLengthTotal]);

  if (tooNew)
    return (
      <div className="k-page">
        <div className="k-status bad">
          <b>This Daily Promo plan was saved by a newer version of the toolkit.</b>
          <span>It is kept exactly as stored and is not changed here. Open it in the newer version, or export it from there.</span>
        </div>
      </div>
    );

  const setTpl = (patch: Partial<DailyPlan['template']>) => setPlan((pl) => setTemplate(pl, patch, tz));
  const editThisDay = (fn: (d: DDay) => DDay) => setPlan((pl) => editDay(pl, di, fn));
  const editSession = (si: number, fn: (s: DSession) => DSession) => editThisDay((d) => ({ ...d, sessions: d.sessions.map((s, j) => (j === si ? fn(s) : s)) }));
  const editMission = (si: number, mi: number, patch: Partial<DMission>) => editSession(si, (s) => ({ ...s, missions: s.missions.map((m, k) => (k === mi ? { ...m, ...patch } : m)) }));

  const dayRows = rows.filter((r) => r.dayIndex === di);
  const sessionPrize = (si: number) => {
    const pools = alloc.pools.filter((x) => x.day === di && x.session === si);
    if (!pools.length) return null;
    if (hasMoney) return money(pools.reduce((a, x) => a + (x.minor ?? 0), 0));
    return pct(pools.reduce((a, x) => a + x.share, 0), 2);
  };
  const dayIssues = issues.filter((i) => i.day === di);

  // ---------- exports ----------
  const doExport = async (kind: 'json' | 'csv') => {
    const name = `${slug(p.promo.name || 'daily-promo')}-daily-promo.${kind}`;
    const r = await saveFile(name, kind === 'json' ? exportJson(p, plan) : exportCsv(p, plan), kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
    setMsg(r === 'saved' ? `Saved ${name}.` : r === 'declined' ? 'Download cancelled.' : 'Downloads are not available here.');
  };
  const doImport = async (file: File) => {
    const res = importJson(await file.text());
    if (!res.ok) {
      setMsg(`Import failed: ${res.error} Your current plan is unchanged.`);
      return;
    }
    const c = res.campaign;
    update((x) => ({
      ...x,
      daily: res.plan,
      schedule: c ? { ...x.schedule, startDate: c.startDate || x.schedule.startDate, timezone: c.timezone || x.schedule.timezone } : x.schedule,
      prizes: c ? { ...x.prizes, currency: c.currency || x.prizes.currency, totalPool: c.budget ?? x.prizes.totalPool } : x.prizes,
    }));
    setDayIdx(0);
    setMsg(`Imported ${res.plan.days.length} days.${res.warnings.length ? ' ' + res.warnings.join(' ') : ''}`);
  };

  return (
    <div className="k-page dp">
      <div className="k-page-head">
        <div>
          <h1>Daily Promo</h1>
          <p className="k-muted">Days, sessions, missions, prizes and announcement times. Planning only: nothing is sent.</p>
        </div>
      </div>

      {/* ---------- summary ---------- */}
      <div className="dp-summary" id="dp-summary" aria-live="polite">
        <div className="dp-hero">
          <small>Missions per day</small>
          <b>{Number.isInteger(t.missionsPerDay) ? t.missionsPerDay : t.missionsPerDay.toFixed(1)}</b>
          <span className="k-muted">
            {t.uniform ? `${t.sessionsPerDay} sessions × ${t.missionsPerSession} missions` : 'days differ (average)'}
          </span>
        </div>
        <div>
          <small>Days</small>
          <b>{t.days}</b>
        </div>
        <div>
          <small>Sessions</small>
          <b>{t.sessions}</b>
          <span className="k-muted">{t.uniform ? `${t.days} × ${t.sessionsPerDay}` : ''}</span>
        </div>
        <div>
          <small>Missions</small>
          <b>{t.missions}</b>
          <span className="k-muted">{t.uniform ? t.formula.split(' = ')[0] : ''}</span>
        </div>
        <div>
          <small>Winner slots</small>
          <b>{t.slots}</b>
          <span className="k-muted">slots, not people</span>
        </div>
        <div className={errors.length ? 'bad' : warnings.length ? 'warn' : 'ok'}>
          <small>Checks</small>
          <b>{errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'}` : 'No errors'}</b>
          <span className="k-muted">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* ---------- essentials ---------- */}
      <Section title="Campaign">
        <Grid cols={4}>
          <DateField id="dp-start" label="Start date" value={startDate} onChange={(v) => setSchedule({ startDate: v })} />
          <TextField id="dp-tz" label="Time zone" value={tz} placeholder="UTC, UTC+1, Africa/Lagos" onChange={(v) => {
              setSchedule({ timezone: v });
              if (parseZone(v)) setPlan((pl) => placeAtBusiest(pl, v, pl.days.map((_, i) => i).filter((i) => !pl.days[i].edited)));
            }} />
          <Field label="Campaign length">
            <span className="k-row">
              <Seg label="Campaign length" value={LENGTHS.includes(t.days) ? t.days : -1} options={[...LENGTHS.map((n) => ({ id: n, label: `${n}d` })), { id: -1, label: 'Custom' }]} onChange={(n) => (n > 0 ? setPlan((pl) => setLength(pl, n, tz)) : document.getElementById('dp-days')?.focus())} />
              <input id="dp-days" type="number" min={1} max={60} value={t.days} style={{ width: 64 }} aria-label="Days" onChange={(e) => num(e.target.value) && setPlan((pl) => setLength(pl, num(e.target.value)!, tz))} />
            </span>
          </Field>
          <Field label="Reward structure">
            <Seg id="dp-mode" label="Reward structure" value={plan.rewardMode} options={[{ id: 'independent', label: 'Independent missions' }, { id: 'bundle', label: 'Bundle (shared pool)' }]} onChange={(rewardMode) => setPlan((pl) => ({ ...pl, rewardMode }))} />
          </Field>
          <NumberField id="dp-spd" label="Sessions per day" min={1} value={plan.template.sessionsPerDay} onChange={(v) => v && v >= 1 && setTpl({ sessionsPerDay: Math.min(24, Math.round(v)) })} />
          <NumberField id="dp-mps" label="Missions per session" min={1} value={plan.template.missionsPerSession} onChange={(v) => v && v >= 1 && setTpl({ missionsPerSession: Math.min(10, Math.round(v)) })} />
          <Field label="Session length">
            <span className="k-row">
              <Seg label="Session length" value={DURATIONS.includes(plan.template.durationMin) ? plan.template.durationMin : -1} options={[...DURATIONS.map((n) => ({ id: n, label: `${n} min` }))]} onChange={(n) => setTpl({ durationMin: n })} />
            </span>
          </Field>
          {plan.rewardMode === 'independent' ? (
            <NumberField id="dp-slots" label="Winner slots per mission" min={1} value={plan.template.slotsPerMission} onChange={(v) => v && v >= 1 && setTpl({ slotsPerMission: Math.round(v) })} />
          ) : (
            <NumberField id="dp-bslots" label="Shared slots per session" min={1} value={plan.template.bundleSlots} onChange={(v) => v && v >= 1 && setPlan((pl) => ({ ...pl, template: { ...pl.template, bundleSlots: Math.round(v) } }))} />
          )}
          <TimeField id="dp-op-start" label="Operating hours from" value={plan.opStart} onChange={(opStart) => setPlan((pl) => ({ ...pl, opStart }))} />
          <TimeField id="dp-op-end" label="Operating hours to" value={plan.opEnd} onChange={(opEnd) => setPlan((pl) => ({ ...pl, opEnd }))} />
          <NumberField id="dp-lead" label="Announcement lead" min={MIN_LEAD} suffix="min" value={plan.leadMin} onChange={(v) => v != null && setPlan((pl) => ({ ...pl, leadMin: Math.round(v) }))} />
          <Field label="Announcements">
            <Seg id="dp-ann" label="Announcements" value={plan.announceMode} options={[{ id: 'per-session', label: 'One per session' }, { id: 'per-day', label: 'One per day' }]} onChange={(announceMode) => setPlan((pl) => ({ ...pl, announceMode }))} />
          </Field>
        </Grid>
        <Field label="Games next to Aviator (by popularity)">
          <div className="k-checks">
            {PLAN_GAMES.filter((g) => g !== 'aviator')
              .sort((a, b) => (plan.popularity[b] ?? -1) - (plan.popularity[a] ?? -1))
              .map((g) => (
              <label key={g}>
                <input
                  type="checkbox"
                  checked={plan.template.rotation.includes(g)}
                  onChange={(e) => {
                    const rot = e.target.checked ? [...plan.template.rotation, g] : plan.template.rotation.filter((x) => x !== g);
                    if (rot.length) setTpl({ rotation: rot });
                  }}
                />
                {gameName(g)}
                {plan.popularity[g] != null && <small className="k-muted">{plan.popularity[g]}%</small>}
              </label>
            ))}
            <label className="dp-weighted">
              <input type="checkbox" checked={plan.popularityWeighted} onChange={(e) => setPlan((pl) => regameDays({ ...pl, popularityWeighted: e.target.checked }))} />
              Popular games more often
            </label>
          </div>
        </Field>
        <div className="k-row">
          <button type="button" className="t-btn" onClick={() => setPlan((pl) => placeAtBusiest(pl, tz, plan.days.map((_, i) => i).filter((i) => !pl.days[i].edited)))}>
            Move sessions to peak hours
          </button>
          {confirmAll ? (
            <span className="k-confirm">
              Rebuild all {t.days} days from these settings{editedCount ? `, including ${editedCount} edited by hand` : ''}?
              <button type="button" className="t-btn danger" onClick={() => (setPlan((pl) => applyTemplate(pl, tz, true)), setConfirmAll(false))}>
                Rebuild all days
              </button>
              <button type="button" className="t-btn ghost" onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="t-btn" onClick={() => setConfirmAll(true)}>
              Apply settings to all days
            </button>
          )}
          {validDate(startDate) && (
            <button type="button" className="t-btn ghost" onClick={() => setSchedule({ endDate: addDays(startDate, t.days - 1) })} title="Sets the campaign end date used by the Promo Checker, Timeline and T&C">
              Use {t.days}-day length as campaign end ({fmtShort(addDays(startDate, t.days - 1))})
            </button>
          )}
        </div>

      </Section>

      {/* ---------- compare ---------- */}
      <Compare plan={plan} onUse={(spd, mps, days) => setPlan((pl) => setLength(setTemplate(pl, { sessionsPerDay: spd, missionsPerSession: mps }, tz), days, tz))} />

      {/* ---------- day + timeline ---------- */}
      <section className="k-section" id="dp-days-section">
        <div className="k-section-head">
          <h3>Days and sessions</h3>
        </div>
        <div className="dp-daytabs" role="tablist" aria-label="Day">
          {plan.days.map((d, i) => {
            const n = issues.filter((x) => x.day === i && x.level === 'error').length;
            const date = dayDateOf(startDate, i);
            return (
              <button key={d.id} type="button" role="tab" aria-selected={i === di} className={n ? 'has-err' : ''} onClick={() => setDayIdx(i)}>
                <b>Day {i + 1}</b>
                <small>{date ? fmtShort(date) : `${d.sessions.length} sessions`}</small>
                {d.edited && <i title="Edited by hand">✎</i>}
                {n > 0 && <em aria-label={`${n} errors`}>{n}</em>}
              </button>
            );
          })}
        </div>
        {day && (
          <>
            <div className="k-day-head">
              <b>
                Day {di + 1}
                {dayDateOf(startDate, di) ? ` · ${fmtShort(dayDateOf(startDate, di))}` : ''}
              </b>
              {day.edited && <Chip tone="info">Edited</Chip>}
              <span className="k-day-actions">
                <button type="button" className="k-link" disabled={di >= plan.days.length - 1} onClick={() => setPlan((pl) => copyDay(pl, di, [di + 1]))}>
                  Duplicate to Day {di + 2}
                </button>
                <button type="button" className="k-link" onClick={() => setPlan((pl) => copyDay(pl, di, 'all'))}>
                  Copy to all days
                </button>
                <button type="button" className="k-link" onClick={() => setPlan((pl) => placeAtBusiest(pl, tz, [di]))}>
                  Peak hours
                </button>
                <button type="button" className="k-link" onClick={() => setPlan((pl) => ({ ...pl, days: pl.days.map((d, i) => (i === di ? { ...templateDay(pl, i, tz), id: d.id } : d)) }))}>
                  Reset to settings
                </button>
              </span>
            </div>
            {plan.announceMode === 'per-day' && (
              <div className="k-row">
                <TimeField id="dp-day-ann" label="Announcement time (blank = latest allowed)" value={day.announceTime} onChange={(announceTime) => editThisDay((d) => ({ ...d, announceTime }))} />
                <label className="k-inline-check">
                  <input type="checkbox" checked={day.announcePrevDay} onChange={(e) => editThisDay((d) => ({ ...d, announcePrevDay: e.target.checked }))} />
                  on the previous date
                </label>
              </div>
            )}
            {plan.weights.day === 'custom' && <NumberField id="dp-day-weight" label="Day weight (share of the pool)" min={0} value={day.weight ?? 1} onChange={(v) => editThisDay((d) => ({ ...d, weight: v }))} />}
            <DayTimeline rows={dayRows} tz={tz} plan={plan} />
            <div className="dp-sessions">
              {day.sessions.map((s, si) => (
                <SessionCard
                  key={s.id}
                  plan={plan}
                  s={s}
                  si={si}
                  row={dayRows[si]}
                  currency={currency}
                  zoneLabel={zoneLabel}
                  assumptions={assumptions}
                  issues={dayIssues.filter((x) => x.session === si)}
                  peaks={freePeakStarts(plan, tz, day, si)}
                  isPeak={(peakRank(s.start, tz) ?? 99) < Math.max(6, day.sessions.length)}
                  prize={sessionPrize(si)}
                  boost={plan.prizeByHour === 'even' ? null : peakFactor(plan, s.start, tz)}
                  onSession={(fn) => editSession(si, fn)}
                  onMission={(mi, patch) => editMission(si, mi, patch)}
                  onRemove={() => editThisDay((d) => ({ ...d, sessions: d.sessions.filter((_, j) => j !== si) }))}
                />
              ))}
            </div>
            <button
              type="button"
              className="t-btn"
              onClick={() =>
                editThisDay((d) => {
                  const fresh = templateDay({ ...plan, template: { ...plan.template, sessionsPerDay: d.sessions.length + 1 } }, di, tz).sessions;
                  return { ...d, sessions: [...d.sessions, { ...fresh[fresh.length - 1], start: '' }] };
                })
              }
            >
              + Add session
            </button>
          </>
        )}
      </section>

      {/* ---------- feasibility ---------- */}
      <Feasibility plan={plan} day={day} di={di} setPlan={setPlan} assumptions={assumptions} />

      {/* ---------- prizes ---------- */}
      <Section title="Prizes" id="dp-prizes" note={hasMoney ? undefined : 'Shares only until amounts and a currency are set'}>
        <Grid cols={4}>
          <Field label="How prizes are set">
            <Seg
              id="dp-prize-mode"
              label="How prizes are set"
              value={plan.prizeMode}
              options={[
                { id: 'per-length', label: 'Amount per session length' },
                { id: 'budget', label: 'Split a total' },
              ]}
              onChange={(prizeMode) => setPlan((pl) => ({ ...pl, prizeMode }))}
            />
          </Field>
          <TextField id="dp-currency" label="Currency" placeholder="USD" value={currency} onChange={(c) => update((x) => ({ ...x, prizes: { ...x.prizes, currency: c.toUpperCase() } }))} />
          <Field label="Payout per slot">
            <Seg label="Payout per slot" value={plan.payout} options={[{ id: 'equal', label: 'Equal' }, { id: 'ranked', label: 'Ranked' }]} onChange={(payout) => setPlan((pl) => ({ ...pl, payout }))} />
          </Field>
          <Field label="Prize by time of day">
            <Seg
              id="dp-by-hour"
              label="Prize by time of day"
              value={plan.prizeByHour}
              options={[
                { id: 'peak', label: 'More at peak' },
                { id: 'even', label: 'Same' },
                { id: 'offpeak', label: 'More off-peak' },
              ]}
              onChange={(prizeByHour) => setPlan((pl) => ({ ...pl, prizeByHour }))}
            />
          </Field>
          {plan.prizeByHour !== 'even' && (
            <NumberField id="dp-peak-strength" label="How much the hour counts" min={0} suffix="%" value={plan.peakStrength} onChange={(v) => v != null && setPlan((pl) => ({ ...pl, peakStrength: Math.min(100, Math.max(0, v)) }))} />
          )}
          {plan.prizeMode === 'per-length' ? (
            DURATIONS.map((n) => (
              <NumberField
                key={n}
                id={`dp-amount-${n}`}
                label={`${n}-minute session${plan.prizeByHour !== 'even' ? ' (base)' : ''}`}
                min={0}
                suffix={currency || undefined}
                value={plan.lengthAmounts[String(n)] ?? null}
                onChange={(v) => setPlan((pl) => ({ ...pl, lengthAmounts: { ...pl.lengthAmounts, [String(n)]: v } }))}
              />
            ))
          ) : (
            <>
              <NumberField id="dp-budget" label="Total budget" min={0} value={budget} onChange={(totalPool) => update((x) => ({ ...x, prizes: { ...x.prizes, totalPool } }))} />
              <Field label="Split between sessions">
                <Seg
                  label="Split between sessions"
                  value={plan.weights.session}
                  options={[
                    { id: 'length', label: 'By length' },
                    { id: 'equal', label: 'Equal' },
                    { id: 'custom', label: 'Custom' },
                  ]}
                  onChange={(m) => setPlan((pl) => ({ ...pl, weights: { ...pl.weights, session: m } }))}
                />
              </Field>
              {(['day', 'mission'] as const).map((lvl) => (
                <Field key={lvl} label={`Split between ${lvl}s`}>
                  <Seg
                    label={`Split between ${lvl}s`}
                    value={plan.weights[lvl]}
                    options={[
                      { id: 'equal', label: 'Equal' },
                      { id: 'custom', label: 'Custom' },
                    ]}
                    onChange={(m) => setPlan((pl) => ({ ...pl, weights: { ...pl.weights, [lvl]: m } }))}
                  />
                </Field>
              ))}
              {plan.weights.session === 'length' &&
                DURATIONS.map((n) => (
                  <NumberField key={n} id={`dp-lw-${n}`} label={`${n} min weight`} min={0} value={plan.lengthWeights[String(n)] ?? n / 10} onChange={(v) => v != null && setPlan((pl) => ({ ...pl, lengthWeights: { ...pl.lengthWeights, [String(n)]: v } }))} />
                ))}
            </>
          )}
        </Grid>
        <div className="k-tl-summary">
          <div>
            <small>Each {plan.rewardMode === 'bundle' ? 'session pool' : 'mission'} (if all equal)</small>
            <b>{alloc.pools.length ? `1/${alloc.pools.length} = ${pct(1 / alloc.pools.length)}` : '—'}</b>
          </div>
          <div>
            <small>Each winner slot</small>
            <b>{t.slots ? `1/${t.slots} = ${pct(1 / t.slots)}` : '—'}</b>
          </div>
          <div>
            <small>{plan.prizeMode === 'per-length' ? 'Total (sum of sessions)' : 'Budget'}</small>
            <b>{hasMoney ? money(alloc.budgetMinor) : 'Not set'}</b>
          </div>
          <div>
            <small>Allocated</small>
            <b>{hasMoney ? money(alloc.totalMinor) : '100% in shares'}</b>
          </div>
        </div>
        {alloc.flags.length > 0 && (
          <ul className="k-issues">
            {alloc.flags.map((f) => (
              <li key={f} className="warning">
                <span className="k-icon">!</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="k-tablewrap">
          <table className="k-table" id="dp-alloc-table">
            <caption className="k-small k-muted" style={{ textAlign: 'left' }}>
              Day {di + 1} pools
            </caption>
            <thead>
              <tr>
                <th>Pool</th>
                <th className="num">Share of campaign</th>
                <th className="num">Slots</th>
                <th className="num">Per slot{plan.payout === 'ranked' ? ' (1st → last)' : ''}</th>
                <th className="num">Pool amount</th>
                <th className="num">Per slot amount</th>
              </tr>
            </thead>
            <tbody>
              {alloc.pools
                .filter((x) => x.day === di)
                .map((x) => {
                  const first = x.payouts[0];
                  const last = x.payouts[x.payouts.length - 1];
                  const both = plan.payout === 'ranked' && x.payouts.length > 1;
                  return (
                    <tr key={x.key} className={x.short ? 'bad' : ''}>
                      <td>{x.label.replace(/^Day \d+ · /, '')}</td>
                      <td className="num">{pct(x.share, 4)}</td>
                      <td className="num">{x.slots}</td>
                      <td className="num">{first ? (both ? `${pct(first.share, 4)} → ${pct(last.share, 4)}` : pct(first.share, 4)) : '—'}</td>
                      <td className="num">{money(x.minor)}</td>
                      <td className="num">{first && first.minor != null ? (both ? `${money(first.minor)} → ${money(last.minor)}` : x.remainder ? `${money(first.minor)} / ${money(last.minor)}` : money(first.minor)) : '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <details>
          <summary className="k-small">All days and slot-count scenarios</summary>
          <div className="k-tablewrap">
            <table className="k-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Share</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {plan.days.map((d, i) => (
                  <tr key={d.id}>
                    <td>Day {i + 1}</td>
                    <td className="num">{pct(alloc.dayShares[i], 3)}</td>
                    <td className="num">{money(alloc.daysMinor[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="k-table" id="dp-scenarios">
              <caption className="k-small k-muted" style={{ textAlign: 'left' }}>
                If every one of the {t.missions} missions had 5, 10 or 20 slots (equal split)
              </caption>
              <thead>
                <tr>
                  <th>Slots per mission</th>
                  <th className="num">Total slots</th>
                  <th className="num">Each mission</th>
                  <th className="num">Each slot</th>
                  <th className="num">Each slot (money, rounded down)</th>
                </tr>
              </thead>
              <tbody>
                {[5, 10, 20].map((n) => {
                  const sc = slotScenario(t.missions, n, alloc.budgetMinor);
                  return (
                    <tr key={n}>
                      <td>{n}</td>
                      <td className="num">{sc.totalSlots}</td>
                      <td className="num">{pct(sc.missionShare, 4)}</td>
                      <td className="num">{pct(sc.slotShare, 5)}</td>
                      <td className="num">{money(sc.slotMinorFloor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      {/* ---------- policies ---------- */}
      <Section title="Rules to decide" id="dp-policies">
        <Grid cols={3}>
          {POLICIES.map((pol) => (
            <SelectField
              key={pol.key}
              id={`dp-policy-${kebab(pol.label)}`}
              label={pol.label}
              value={plan.policies[pol.key]}
              options={[{ id: '', label: 'Unresolved' }, ...pol.options.map((o) => ({ id: o, label: o }))]}
              onChange={(v) => setPlan((pl) => ({ ...pl, policies: { ...pl.policies, [pol.key]: v } }))}
            />
          ))}
          <SelectField
            id="dp-close"
            label="When all slots are filled"
            value={plan.closeMode}
            options={[
              { id: 'when-filled', label: 'Close the mission' },
              { id: 'scheduled-end', label: 'Keep playing to the scheduled end' },
            ]}
            onChange={(closeMode) => setPlan((pl) => ({ ...pl, closeMode }))}
          />
        </Grid>
        <div className="k-row">
          <label className="k-inline-check">
            <input type="checkbox" checked={plan.useInTc} onChange={(e) => setPlan((pl) => ({ ...pl, useInTc: e.target.checked }))} />
            Add a Daily Promo section to the T&C draft
          </label>
          <button type="button" className="k-link" onClick={() => goTab('tc')}>
            Open T&C Generator →
          </button>
        </div>
      </Section>

      {/* ---------- readiness ---------- */}
      <Readiness plan={plan} issues={issues} tz={tz} startDate={startDate} hasMoney={hasMoney} onDay={setDayIdx} />

      {/* ---------- announcements ---------- */}
      <Announcements plan={plan} rows={dayRows} di={di} currency={currency} zoneLabel={zoneLabel} />

      {/* ---------- export ---------- */}
      <Section title="Export and import" id="dp-export">
        <div className="k-row">
          <button type="button" className="t-btn" onClick={() => doExport('csv')}>
            Download CSV
          </button>
          <button type="button" className="t-btn" onClick={() => doExport('json')}>
            Download JSON
          </button>
          <button type="button" className="t-btn ghost" onClick={() => fileRef.current?.click()}>
            Import JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            id="dp-import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
          {msg && <span className="k-small" role="status">{msg}</span>}
        </div>

      </Section>

      <Assumptions plan={plan} setPlan={setPlan} tz={tz} />
    </div>
  );
}

// ---------- compare presets ----------

function Compare({ plan, onUse }: { plan: DailyPlan; onUse: (spd: number, mps: number, days: number) => void }) {
  const t = totals(plan);
  const lengths = LENGTHS.includes(t.days) ? LENGTHS : [...LENGTHS, t.days];
  const slots = plan.rewardMode === 'bundle' ? plan.template.bundleSlots : plan.template.slotsPerMission;
  return (
    <Section title="Compare campaign shapes" id="dp-compare" collapsible open={false} >
      <div className="k-tablewrap">
        <table className="k-table">
          <thead>
            <tr>
              <th>Shape</th>
              <th className="num">Days</th>
              <th className="num">Sessions × missions</th>
              <th className="num">Missions / day</th>
              <th className="num">Sessions</th>
              <th className="num">Missions</th>
              <th className="num">{plan.rewardMode === 'bundle' ? 'Shared slots' : 'Slots'}</th>
              <th className="num">Each slot</th>
              <th className="num">Live min / day</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {PRESETS.flatMap((pr) =>
              lengths.map((d) => {
                const r = presetRow(pr.label, d, pr.sessionsPerDay, pr.missionsPerSession, slots, plan.template.durationMin);
                const totalSlots = plan.rewardMode === 'bundle' ? r.sessions * slots : r.slots;
                const current = t.uniform && t.days === d && t.sessionsPerDay === pr.sessionsPerDay && t.missionsPerSession === pr.missionsPerSession;
                return (
                  <tr key={`${pr.id}-${d}`} className={current ? 'current' : ''}>
                    <td>
                      {pr.label}
                      {current && <Chip tone="info">current</Chip>}
                    </td>
                    <td className="num">{d}</td>
                    <td className="num">
                      {pr.sessionsPerDay} × {pr.missionsPerSession}
                    </td>
                    <td className="num">{r.missionsPerDay}</td>
                    <td className="num">{r.sessions}</td>
                    <td className="num">{r.missions}</td>
                    <td className="num">{totalSlots}</td>
                    <td className="num">{pct(1 / totalSlots, 4)}</td>
                    <td className="num">{r.minutesPerDay}</td>
                    <td>
                      <button type="button" className="k-link" onClick={() => onUse(pr.sessionsPerDay, pr.missionsPerSession, d)}>
                        Use
                      </button>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <ul className="k-small dp-tradeoffs">
        {PRESETS.map((pr) => (
          <li key={pr.id}>
            <b>{pr.label}:</b> {TRADEOFFS[pr.id]}
          </li>
        ))}
        <li>Longer campaigns spread the same budget thinner per slot; shorter ones concentrate it. None of these is best on its own: it depends on audience size, budget and how many sessions the team can run and announce.</li>
      </ul>
    </Section>
  );
}

// ---------- day timeline ----------

function DayTimeline({ rows, tz, plan }: { rows: SessionRow[]; tz: string; plan: DailyPlan }) {
  const off = zoneOffsetMin(tz) ?? 0;
  const rank = (localHour: number) => {
    const utc = (((localHour * 60 - off) / 60) % 24 + 24) % 24;
    const i = BUSIEST_UTC_HOURS.indexOf(Math.floor(utc));
    return i < 0 ? 0 : 1 - i / BUSIEST_UTC_HOURS.length;
  };
  const pos = (t: string) => {
    const m = /^(\d\d):(\d\d)$/.exec(t);
    return m ? ((Number(m[1]) * 60 + Number(m[2])) / 1440) * 100 : null;
  };
  const opA = pos(plan.opStart);
  const opB = pos(plan.opEnd);
  return (
    <div className="dp-timeline" aria-label="Day timeline">
      <div className="dp-heat" title="Busier hours are darker (from your UTC activity ranking)">
        {Array.from({ length: 24 }, (_, h) => (
          <i key={h} style={{ opacity: 0.08 + rank(h) * 0.5 }} />
        ))}
      </div>
      {opA != null && opB != null && (opA < opB ? <span className="dp-op" style={{ left: `${opA}%`, width: `${opB - opA}%` }} /> : <><span className="dp-op" style={{ left: `${opA}%`, width: `${100 - opA}%` }} /><span className="dp-op" style={{ left: 0, width: `${opB}%` }} /></>)}
      {rows.map((r) => {
        const a = pos(r.start);
        if (a == null) return null;
        const w = (r.session.durationMin / 1440) * 100;
        const d = r.deadline ? pos(r.deadline.time) : null;
        return (
          <span key={r.session.id}>
            <span className="dp-block" style={{ left: `${a}%`, width: `max(${w}%, 4px)` }} title={`Session ${r.sessionIndex + 1}: ${r.start}–${r.end?.time ?? ''}`}>
              <em>{r.sessionIndex + 1}</em>
            </span>
            {d != null && <span className={`dp-dead ${r.prevDate ? 'prev' : ''}`} style={{ left: `${r.prevDate ? 0 : d}%` }} title={`Announce by ${r.deadline?.time}${r.prevDate ? ' (previous date)' : ''}`} />}
          </span>
        );
      })}
      <div className="dp-hours">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- session card ----------

function SessionCard({
  plan,
  s,
  si,
  row,
  currency,
  zoneLabel,
  assumptions,
  issues,
  peaks,
  isPeak,
  prize,
  boost,
  onSession,
  onMission,
  onRemove,
}: {
  plan: DailyPlan;
  s: DSession;
  si: number;
  row: SessionRow | undefined;
  currency: string;
  zoneLabel: string;
  assumptions: Assumptions;
  issues: DIssue[];
  /** Busiest free start times for this session, best first. */
  peaks: string[];
  /** The current start is one of the busiest hours. */
  isPeak: boolean;
  /** Session prize: money or share. */
  prize: string | null;
  /** Prize multiplier from the start hour (null = same at every hour). */
  boost: number | null;
  onSession: (fn: (s: DSession) => DSession) => void;
  onMission: (mi: number, patch: Partial<DMission>) => void;
  onRemove: () => void;
}) {
  const [fitsFor, setFitsFor] = useState<number | null>(null);
  const lead = row?.leadMin;
  const better = peaks.filter((x) => x !== s.start);
  const slotText =
    plan.rewardMode === 'bundle'
      ? `${s.bundleSlots ?? plan.template.bundleSlots} shared slots`
      : new Set(s.missions.map((m) => m.slots)).size === 1
        ? `${s.missions[0]?.slots ?? '?'} slots per mission`
        : s.missions.map((m) => m.slots ?? '?').join(' / ') + ' slots';
  return (
    <div className={`k-day dp-session ${issues.some((i) => i.level === 'error') ? 'has-err' : ''}`} id={`dp-session-${si}`}>
      <div className="k-day-head">
        <b>Session {si + 1}</b>
        <span className="k-muted">
          {s.start || '--:--'}–{row?.end?.time ?? '--:--'} {zoneLabel}
        </span>
        {prize && <span className="dp-prize" title="This session's prize">{prize}</span>}
        {boost != null && Math.abs(boost - 1) >= 0.05 && <span className={`dp-boost ${boost > 1 ? 'up' : 'down'}`} title="Prize adjusted for how busy this hour is">{boost > 1 ? '+' : '−'}{Math.round(Math.abs(boost - 1) * 100)}%</span>}
        <span className="k-day-actions">
          <button type="button" className="k-link danger" aria-label={`Remove session ${si + 1}`} title="Remove session" onClick={onRemove}>
            ✕
          </button>
        </span>
      </div>
      <div className="dp-session-row">
        <TimeField id={`dp-s${si}-start`} label="Start" value={s.start} onChange={(start) => onSession((x) => ({ ...x, start }))} />
        <Field label="Length">
          <Seg label="Length" value={s.durationMin} options={DURATIONS.map((n) => ({ id: n, label: `${n}` }))} onChange={(durationMin) => onSession((x) => resizeSession(x, durationMin, plan.feasibility))} />
        </Field>
      </div>
      {(better.length > 0 && !isPeak) || !s.start ? (
        <div className="dp-peaks">
          <span>{s.start ? 'Busier times:' : 'Best free times:'}</span>
          {better.map((t) => (
            <button key={t} type="button" className="dp-peak" onClick={() => onSession((x) => ({ ...x, start: t }))}>
              {t}
            </button>
          ))}
        </div>
      ) : (
        <div className="dp-peaks ok">Peak hour</div>
      )}
      <div className="dp-missions">
        {s.missions.map((m, mi) => {
          const est: EstMission = { game: m.game, threshold: m.kind === 'catch' ? m.threshold : 1, catches: m.catches, countPer: m.countPer, chanceOverride: m.chanceOverride };
          const ind = m.kind === 'catch' ? individualChance(est, s.durationMin, assumptions) : null;
          const fits = fitsFor === mi ? searchFits(m.game, s.durationMin, plan.feasibility, assumptions, { countPer: m.countPer, chanceOverride: m.chanceOverride }) : null;
          const noModel = modelKind(m.game, m.chanceOverride) === 'none';
          return (
            <div key={m.id} className="dp-mission">
              <div className="k-task">
                <select aria-label="Game" value={m.game} onChange={(e) => onMission(mi, { game: e.target.value as GameId, chanceOverride: null, ...(m.kind === 'catch' ? sizedMission(e.target.value as GameId, s.durationMin, plan.feasibility) : {}) })}>
                  {PLAN_GAMES.map((g) => (
                    <option key={g} value={g}>
                      {gameName(g)}
                    </option>
                  ))}
                </select>
                {m.kind === 'catch' ? (
                  <span className="k-inline">
                    catch
                    <input aria-label="Multiplier" type="number" min={1} step="any" value={m.threshold ?? ''} onChange={(e) => onMission(mi, { threshold: num(e.target.value) })} />×
                  </span>
                ) : (
                  <span className="k-inline">place</span>
                )}
                <span className="k-inline">
                  <input aria-label={m.kind === 'catch' ? 'Required catches' : 'Bets'} type="number" min={1} step={1} value={m.catches ?? ''} onChange={(e) => onMission(mi, { catches: num(e.target.value) })} />
                  {m.kind === 'catch' ? 'times' : 'bets'}
                </span>
                {m.kind === 'catch' && <span className="k-per" title={ind == null ? 'No chance model for this game' : `${Math.round(ind * 100)}% of players who ${m.game === 'aviator' ? 'bet every round' : 'play at the assumed pace'} finish in ${s.durationMin} min`}>{ind == null ? 'n/a' : `${Math.round(ind * 100)}%`}</span>}
                <span className="k-task-actions">
                  {m.kind === 'catch' && !noModel && (
                    <button type="button" className="k-link" aria-expanded={fitsFor === mi} title="Suggest multiplier and catches for this length" onClick={() => setFitsFor(fitsFor === mi ? null : mi)}>
                      Fits
                    </button>
                  )}
                  <button type="button" className="k-link danger" aria-label={`Remove mission ${mi + 1}`} onClick={() => onSession((x) => ({ ...x, missions: x.missions.filter((_, k) => k !== mi) }))}>
                    ✕
                  </button>
                </span>
              </div>
              {noModel && m.kind === 'catch' && (
                <div className="dp-mission-more">
                  <span className="k-inline">
                    Chance per bet <input aria-label="Chance per bet" type="number" min={0} max={1} step="any" placeholder="0.05" value={m.chanceOverride ?? ''} onChange={(e) => onMission(mi, { chanceOverride: num(e.target.value) })} />
                  </span>
                </div>
              )}
              {fits && (
                <ul className="dp-fits">
                  {fits.length === 0 && <li className="k-muted">Nothing fits {s.durationMin} min with the current settings.</li>}
                  {fits.map((f) => (
                    <li key={`${f.threshold}-${f.catches}`}>
                      <b>
                        {f.threshold}× × {f.catches}
                      </b>
                      <span>{f.why}</span>
                      <button type="button" className="k-link" onClick={() => (onMission(mi, { threshold: f.threshold, catches: f.catches, kind: 'catch' }), setFitsFor(null))}>
                        Use
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <button type="button" className="k-link" onClick={() => onSession((x) => ({ ...x, missions: [...x.missions, newMission(x.missions.some((y) => y.game === 'aviator') ? (popularGames(plan.popularity).find((g) => !x.missions.some((y) => y.game === g)) ?? plan.template.rotation[0] ?? 'mines') : 'aviator', x.durationMin, plan.template.slotsPerMission, plan.feasibility)] }))}>
          + Add mission
        </button>
      </div>
      <details className="dp-more">
        <summary>
          {slotText}
          {row?.deadline && (
            <span className={lead != null && lead < MIN_LEAD ? 'bad' : ''}>
              {' '}
              · announce by {row.prevDate && row.deadline.date ? `${validDate(row.deadline.date) ? fmtShort(row.deadline.date) : row.deadline.date} ` : ''}
              {row.deadline.time}
            </span>
          )}
          {row?.status === 'nonexistent' && <span className="bad"> · time does not exist (DST)</span>}
          {row?.status === 'ambiguous' && <span className="bad"> · time happens twice (DST)</span>}
        </summary>
        <div className="dp-more-body">
          {plan.rewardMode === 'bundle' ? (
            <label className="k-inline">
              Shared slots <input type="number" min={1} value={s.bundleSlots ?? plan.template.bundleSlots} onChange={(e) => onSession((x) => ({ ...x, bundleSlots: num(e.target.value) }))} />
            </label>
          ) : (
            s.missions.map((m, mi) => (
              <label key={m.id} className="k-inline">
                {gameName(m.game)} slots <input aria-label={`Winner slots mission ${mi + 1}`} type="number" min={1} step={1} value={m.slots ?? ''} onChange={(e) => onMission(mi, { slots: num(e.target.value) })} />
              </label>
            ))
          )}
          {s.missions.map((m, mi) => (
            <label key={`mb-${m.id}`} className="k-inline">
              {gameName(m.game)} min bet <input aria-label={`Minimum bet mission ${mi + 1}`} type="number" min={0} step="any" value={m.minBet ?? ''} onChange={(e) => onMission(mi, { minBet: num(e.target.value) })} /> {currency}
            </label>
          ))}
          {s.missions.map((m, mi) =>
            m.game === 'aviator' && m.kind === 'catch' ? (
              <select key={`cp-${m.id}`} aria-label="How catches count" value={m.countPer} onChange={(e) => onMission(mi, { countPer: e.target.value as DMission['countPer'] })}>
                <option value="round">Aviator: once per round</option>
                <option value="bet">Aviator: each bet counts</option>
              </select>
            ) : null,
          )}
          {s.missions.map((m, mi) => (
            <select key={`k-${m.id}`} aria-label={`Mission ${mi + 1} type`} value={m.kind} onChange={(e) => onMission(mi, { kind: e.target.value as DMission['kind'] })}>
              <option value="catch">{gameName(m.game)}: catch a multiplier</option>
              <option value="bets">{gameName(m.game)}: place bets</option>
            </select>
          ))}
          {plan.announceMode === 'per-session' && (
            <label className="k-inline">
              Lead <input aria-label="Lead override" type="number" min={MIN_LEAD} placeholder={String(plan.leadMin)} value={s.leadMin ?? ''} onChange={(e) => onSession((x) => ({ ...x, leadMin: num(e.target.value) }))} /> min
            </label>
          )}
          {plan.weights.session === 'custom' && (
            <label className="k-inline">
              Session weight <input type="number" min={0} step="any" value={s.weight ?? 1} onChange={(e) => onSession((x) => ({ ...x, weight: num(e.target.value) }))} />
            </label>
          )}
          {plan.weights.mission === 'custom' &&
            plan.rewardMode === 'independent' &&
            s.missions.map((m, mi) => (
              <label key={`w-${m.id}`} className="k-inline">
                {gameName(m.game)} weight <input type="number" min={0} step="any" value={m.weight ?? 1} onChange={(e) => onMission(mi, { weight: num(e.target.value) })} />
              </label>
            ))}
        </div>
      </details>
      {issues.filter((i) => i.level !== 'info').length > 0 && (
        <ul className="k-issues">
          {issues
            .filter((i) => i.level !== 'info')
            .map((i, k) => (
              <li key={k} className={i.level}>
                <span className="k-icon">{i.level === 'error' ? '!' : '?'}</span>
                <span>{i.msg.replace(/^Day \d+, session \d+(, mission \d+ \([^)]*\))?: /, '')}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ---------- feasibility ----------

function Feasibility({ plan, day, di, setPlan, assumptions }: { plan: DailyPlan; day: DDay | undefined; di: number; setPlan: (fn: (pl: DailyPlan) => DailyPlan) => void; assumptions: Assumptions }) {
  const aud = plan.audience;
  const results = useMemo(() => {
    if (!day) return [];
    const out: { key: string; label: string; window: number; slots: number; ind: number | null; pop: PopulationResult }[] = [];
    day.sessions.forEach((s, si) => {
      const ms: EstMission[] = s.missions.filter((m) => m.kind === 'catch').map((m) => ({ game: m.game, threshold: m.threshold, catches: m.catches, countPer: m.countPer, chanceOverride: m.chanceOverride }));
      if (plan.rewardMode === 'bundle') {
        const slots = sessionSlots(plan, s);
        const indParts = ms.map((m) => individualChance(m, Math.max(0, (s.durationMin - aud.switchMin * (ms.length - 1)) / ms.length), assumptions));
        const ind = indParts.some((x) => x == null) || ms.length < s.missions.length ? null : indParts.reduce((a, b) => a! * b!, 1);
        out.push({ key: s.id, label: `Session ${si + 1} · all ${s.missions.length} missions`, window: s.durationMin, slots, ind, pop: ms.length < s.missions.length ? { expectedCompletions: null, pAllFill: null, fillMin: null, fillShare: null, expectedUnfilled: null, reason: '“Place bets” missions have no completion model here.' } : population({ missions: ms, slots, bundle: true, windowMin: s.durationMin }, aud, assumptions, 200, 11 + si) });
      } else {
        s.missions.forEach((m, mi) => {
          const e: EstMission = { game: m.game, threshold: m.threshold, catches: m.catches, countPer: m.countPer, chanceOverride: m.chanceOverride };
          const label = `S${si + 1} · ${gameName(m.game)} ${m.kind === 'catch' ? `${m.threshold ?? '?'}× × ${m.catches ?? '?'}` : `${m.catches ?? '?'} bets`}`;
          if (m.kind !== 'catch') {
            out.push({ key: m.id, label, window: s.durationMin, slots: m.slots ?? 0, ind: null, pop: { expectedCompletions: null, pAllFill: null, fillMin: null, fillShare: null, expectedUnfilled: null, reason: 'No completion model for “place bets”.' } });
            return;
          }
          out.push({ key: m.id, label, window: s.durationMin, slots: m.slots ?? 0, ind: individualChance(e, s.durationMin, assumptions), pop: population({ missions: [e], slots: m.slots ?? 0, bundle: false, windowMin: s.durationMin }, aud, assumptions, 200, 11 + si * 10 + mi) });
        });
      }
    });
    return out;
  }, [day, plan.rewardMode, plan.template.bundleSlots, aud, assumptions.roundShare, assumptions.switchMin, assumptions.betsPerMin]);

  const verdict = (r: (typeof results)[number]) => {
    if (r.pop.pAllFill == null) return <Chip tone="muted">Insufficient data</Chip>;
    if (r.pop.pAllFill < 0.5) return <Chip tone="warn">Slots likely left over</Chip>;
    if (r.pop.fillMin != null && r.pop.fillMin < r.window * 0.3) return <Chip tone="warn">Fills very early</Chip>;
    return <Chip tone="ok">Fits</Chip>;
  };
  const setAud = (patch: Partial<DailyPlan['audience']>) => setPlan((pl) => ({ ...pl, audience: { ...pl.audience, ...patch } }));
  return (
    <Section title={`Feasibility · Day ${di + 1}`} id="dp-feasibility" >
      <Grid cols={4}>
        <NumberField id="dp-aud" label="Active players per session" hint="User input" min={0} value={aud.activePlayers} onChange={(activePlayers) => setAud({ activePlayers })} />
        <NumberField id="dp-attempt" label="Share who attempt a mission" hint="User input" min={0} suffix="%" value={aud.attemptShare} onChange={(attemptShare) => setAud({ attemptShare })} />
        <NumberField id="dp-roundshare" label="Aviator rounds a player bets in" hint="Model assumption (editable)" min={1} suffix="%" value={Math.round(aud.roundShare * 100)} onChange={(v) => v != null && setAud({ roundShare: Math.min(1, Math.max(0.01, v / 100)) })} />
        {plan.rewardMode === 'bundle' ? <NumberField id="dp-switch" label="Switching time between games" hint="Model assumption (editable)" min={0} suffix="min" value={aud.switchMin} onChange={(v) => v != null && setAud({ switchMin: v })} /> : <span />}
      </Grid>
      <div className="k-tablewrap">
        <table className="k-table" id="dp-feas-table">
          <thead>
            <tr>
              <th>{plan.rewardMode === 'bundle' ? 'Session (bundle)' : 'Mission'}</th>
              <th className="num">Slots</th>
              <th className="num" title="Chance one player finishes in time">Individual chance</th>
              <th className="num">Expected completions</th>
              <th className="num">All slots fill</th>
              <th className="num">Time to fill</th>
              <th className="num">Unfilled slots</th>
              <th>Heuristic</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">{r.slots}</td>
                <td className="num">{r.ind == null ? 'Insufficient data' : pctOrDash(r.ind)}</td>
                {r.pop.expectedCompletions == null ? (
                  <td colSpan={4} className="dp-insufficient">
                    Insufficient data{r.pop.reason ? `: ${r.pop.reason}` : ''}
                  </td>
                ) : (
                  <>
                    <td className="num">{r.pop.expectedCompletions.toFixed(r.pop.expectedCompletions < 10 ? 1 : 0)}</td>
                    <td className="num">{pctOrDash(r.pop.pAllFill)}</td>
                    <td className="num">{r.pop.fillMin == null ? `not in ${r.window} min` : `${r.pop.fillMin.toFixed(1)} min${(r.pop.fillShare ?? 1) < 0.95 ? ` (${pctOrDash(r.pop.fillShare)} of simulated sessions)` : ''}`}</td>
                    <td className="num">{r.pop.expectedUnfilled == null ? '—' : r.pop.expectedUnfilled.toFixed(1)}</td>
                  </>
                )}
                <td>{verdict(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="k-small k-muted">Aviator players share every round, so fill chances come from shared rounds, not independent players. Method and assumptions are listed at the bottom.</p>
    </Section>
  );
}

// ---------- readiness ----------

function Readiness({ plan, issues, tz, startDate, hasMoney, onDay }: { plan: DailyPlan; issues: DIssue[]; tz: string; startDate: string; hasMoney: boolean; onDay: (i: number) => void }) {
  const errors = issues.filter((i) => i.level === 'error');
  const unresolved = POLICIES.filter((x) => !plan.policies[x.key]);
  const items: { ok: boolean; label: string; note?: string }[] = [
    { ok: !!parseZone(tz), label: 'Time zone set' },
    { ok: validDate(startDate), label: 'Start date set' },
    { ok: !!(plan.opStart && plan.opEnd), label: 'Operating hours set' },
    { ok: errors.length === 0, label: 'No schedule or mission errors', note: errors.length ? `${errors.length} to fix` : undefined },
    { ok: plan.leadMin >= MIN_LEAD, label: `Announcement lead ≥ ${MIN_LEAD} min for every session` },
    { ok: unresolved.length === 0, label: 'Policies decided', note: unresolved.length ? unresolved.map((x) => x.label).join(', ') : undefined },
    { ok: plan.audience.activePlayers != null && plan.audience.attemptShare != null, label: 'Audience entered (for fill forecasts)' },
    { ok: hasMoney, label: 'Budget and currency (optional: percent-only mode works without)' },
  ];
  const done = items.filter((i) => i.ok).length;
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? issues : issues.filter((i) => i.level !== 'info').slice(0, 12);
  return (
    <Section title="Readiness" id="dp-readiness" note={`${done} of ${items.length} done`}>
      <ul className="k-checklist dp-check">
        {items.map((i) => (
          <li key={i.label} className={i.ok ? 'ok' : 'todo'}>
            <span aria-hidden>{i.ok ? '✓' : '○'}</span> {i.label}
            {i.note && <small className="k-muted"> · {i.note}</small>}
          </li>
        ))}
      </ul>
      {issues.length > 0 && (
        <>
          <ul className="k-issues" id="dp-issues">
            {list.map((i, k) => (
              <li key={k} className={i.level}>
                <span className="k-icon">{i.level === 'error' ? '!' : i.level === 'warning' ? '?' : 'i'}</span>
                <span>
                  {i.msg}{' '}
                  {i.day != null && (
                    <button type="button" className="k-link" onClick={() => onDay(i.day!)}>
                      Go to Day {i.day + 1}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {issues.length > list.length || showAll ? (
            <button type="button" className="k-link" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${issues.length} (including notes)`}
            </button>
          ) : null}
        </>
      )}
    </Section>
  );
}

// ---------- announcements ----------

function Announcements({ plan, rows, di, currency, zoneLabel }: { plan: DailyPlan; rows: SessionRow[]; di: number; currency: string; zoneLabel: string }) {
  const { project: p } = useToolkit();
  const [copied, setCopied] = useState<string | null>(null);
  const groups = plan.announceMode === 'per-day' ? [rows] : rows.map((r) => [r]);
  return (
    <Section title={`Announcement drafts · Day ${di + 1}`} id="dp-announce" collapsible open={false} note="Drafts to copy">
      {groups.map((g, k) => {
        const text = announcementDraft(p, plan, g, currency);
        const dl = g[0]?.deadline;
        const key = `${di}-${k}`;
        return (
          <div key={key} className="dp-draft">
            <div className="k-row between">
              <span className="k-small">
                {plan.announceMode === 'per-day' ? 'Day announcement' : `Session ${g[0]?.sessionIndex + 1}`} · send by{' '}
                <b>
                  {dl ? `${dl.date && validDate(dl.date) ? fmtShort(dl.date) + ' ' : dl.date ? dl.date + ' ' : ''}${dl.time} ${zoneLabel}` : 'set a start time'}
                </b>
              </span>
              <button type="button" className="k-link" onClick={async () => setCopied((await copyText(text)) ? key : null)}>
                {copied === key ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea readOnly rows={Math.min(14, text.split('\n').length + 1)} value={text} />
          </div>
        );
      })}
    </Section>
  );
}

// ---------- assumptions ----------

function Assumptions({ plan, setPlan, tz }: { plan: DailyPlan; setPlan: (fn: (pl: DailyPlan) => DailyPlan) => void; tz: string }) {
  const f = plan.feasibility;
  const setF = (patch: Partial<typeof f>) => setPlan((pl) => ({ ...pl, feasibility: { ...pl.feasibility, ...patch } }));
  const a: Assumptions = { ...DEFAULT_ASSUMPTIONS, betsPerMin: plan.audience.betsPerMin };
  const rows: { what: string; value: string; kind: 'Observed data' | 'Model assumption' | 'User input' | 'Heuristic' | 'Not used'; note: string }[] = [
    { what: 'Aviator: share of rounds reaching X×', value: '97% ÷ X', kind: 'Model assumption', note: 'From the provably-fair crash formula (checked against published round hashes). A property of rounds, not of players.' },
    { what: 'Aviator round length', value: `${meanRoundSec(DEFAULT_CLOCK).toFixed(1)} s average (5 s betting + flight + 1.5 s pause)`, kind: 'Model assumption', note: 'Public measurements; Spribe does not publish timing.' },
    { what: 'Two Aviator bets in one round', value: 'Same outcome', kind: 'Model assumption', note: 'They share the crash point, so they are never two independent chances.' },
    { what: 'Plinko, Keno, Mines, Goal chances per bet', value: 'Exact', kind: 'Observed data', note: 'Published paytables and game rules. The Aviator formula is never used for them.' },
    { what: 'Pilot Chicken, Trader chances per bet', value: '97% ÷ X', kind: 'Model assumption', note: 'RTP rule for cash-out games with a constant 97% RTP; each player’s own result, not Aviator’s shared rounds.' },
    { what: 'Keno 80', value: 'No model', kind: 'Not used', note: 'Insufficient data unless you enter a chance per bet.' },
    { what: 'Game popularity (1-month retention)', value: POPULARITY.filter((r) => r.game).map((r) => `${r.name} ${plan.popularity[r.game!] ?? r.retention}%`).join(', '), kind: 'Observed data', note: `${POPULARITY_SOURCE}. Decides which games are used and how often; edit below when it changes. Bets per player shown below are not used for timing (the period is not stated). "Pilot" read as Pilot Chicken.` },
    { what: 'Bets per minute (non-Aviator)', value: MODEL_GAMES.map((g) => `${gameName(g)} ${betsPerMinFor(g, a)}`).join(', '), kind: 'Model assumption', note: 'Editable below.' },
    { what: 'Busiest hours', value: 'UTC 22, 21, 23, 20, 19, 18, 12, 11, 13, 16 …', kind: 'Observed data', note: `Your ranking; converted to ${tz || 'UTC'} for session placement and the timeline shading.` },
    { what: 'Active players, attempt share', value: plan.audience.activePlayers == null ? 'not entered' : `${plan.audience.activePlayers}, ${plan.audience.attemptShare ?? '?'}%`, kind: 'User input', note: 'Needed for completions, fill chance, fill time and unfilled slots.' },
    { what: 'Feasibility band', value: `${f.minP}–${f.maxP}% finish; typical finish at ${f.minFill}–${f.maxFill}% of the window`, kind: 'Heuristic', note: 'Used to rank suggestions; not a rule.' },
    { what: 'Stake size', value: 'No effect on chances', kind: 'Model assumption', note: 'A bigger bet changes the payout, never the chance of a multiplier. Minimum bet only decides which bets count.' },
    { what: 'SPRIBE Adventure (5-hour days)', value: '—', kind: 'Not used', note: 'Multi-hour days are not validation for 10–20 minute sessions, so they are not used here.' },
  ];
  return (
    <Section title="Assumptions and data sources" id="dp-assumptions" collapsible open={false} >
      <div className="k-tablewrap">
        <table className="k-table dp-assume">
          <thead>
            <tr>
              <th>Input</th>
              <th>Value</th>
              <th>Kind</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.what}>
                <td>{r.what}</td>
                <td>{r.value}</td>
                <td>
                  <Chip tone={r.kind === 'Observed data' ? 'ok' : r.kind === 'User input' ? 'info' : r.kind === 'Not used' ? 'muted' : 'warn'}>{r.kind}</Chip>
                </td>
                <td className="dp-wrap">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Grid cols={4}>
        <NumberField id="dp-f-minp" label="Finish chance from" suffix="%" value={f.minP} onChange={(v) => v != null && setF({ minP: v })} />
        <NumberField id="dp-f-maxp" label="Finish chance to" suffix="%" value={f.maxP} onChange={(v) => v != null && setF({ maxP: v })} />
        <NumberField id="dp-f-minfill" label="Typical finish from" suffix="% of window" value={f.minFill} onChange={(v) => v != null && setF({ minFill: v })} />
        <NumberField id="dp-f-maxfill" label="Typical finish to" suffix="% of window" value={f.maxFill} onChange={(v) => v != null && setF({ maxFill: v })} />
        {MODEL_GAMES.map((g) => (
          <NumberField key={g} id={`dp-bpm-${g}`} label={`${gameName(g)} bets / min`} min={0.1} value={betsPerMinFor(g, a)} onChange={(v) => v != null && v > 0 && setPlan((pl) => ({ ...pl, audience: { ...pl.audience, betsPerMin: { ...pl.audience.betsPerMin, [g]: v } } }))} />
        ))}
      </Grid>
      <div className="k-tablewrap">
        <table className="k-table" id="dp-popularity">
          <caption className="k-small k-muted" style={{ textAlign: 'left' }}>
            Game popularity · {POPULARITY_SOURCE}
          </caption>
          <thead>
            <tr>
              <th>Game</th>
              <th className="num">1-month retention %</th>
              <th className="num">Bets per player</th>
              <th>In the planner</th>
            </tr>
          </thead>
          <tbody>
            {POPULARITY.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">
                  {r.game ? (
                    <input
                      aria-label={`${r.name} retention`}
                      type="number"
                      min={0}
                      step="any"
                      value={plan.popularity[r.game] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        if (v != null && v >= 0) setPlan((pl) => regameDays({ ...pl, popularity: { ...pl.popularity, [r.game!]: v } }));
                      }}
                    />
                  ) : (
                    r.retention
                  )}
                </td>
                <td className="num">{r.betsPerPlayer}</td>
                <td>{r.game ? (plan.template.rotation.includes(r.game) ? <Chip tone="ok">used</Chip> : <Chip tone="muted">available</Chip>) : <Chip tone="muted">not in toolkit yet</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="k-link" onClick={() => setPlan((pl) => regameDays({ ...pl, popularity: { ...DEFAULT_POPULARITY }, template: { ...pl.template, rotation: popularGames(DEFAULT_POPULARITY) } }))}>
        Reset games to the supplied data
      </button>
    </Section>
  );
}
