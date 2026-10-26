// Campaign data sections shared by the Promo Checker and the T&C Generator.
// Both pages edit the same project, so nothing is typed twice.

import type { GameId } from '../../data/games';
import type { SimMission } from '../../sim/engine';
import { chanceAtLeast, oneIn, SIM_GAMES } from '../../sim/games';
import { calculatedTotal, dayDate, dayPool, dayWindowMin, dayWinners, GAME_NAME, TASK_TYPES } from '../model/campaign';
import { estimateDay, canEstimate } from '../model/estimate';
import { FIELDS, dayField, taskField } from '../model/fields';
import { cents, fmtMoney } from '../model/money';
import { blankDay, PROMO_TYPES, REWARD_METHODS, tasksKey, uid, type DayConfig, type Estimate, type Project } from '../model/project';
import { daysBetween, fmtShort, fmtSpan, validDate } from '../model/time';
import { Chip, DateField, Grid, NumberField, Section, SelectField, TextField, TimeField, useToolkit, YesNo } from './Fields';

type Up = (fn: (p: Project) => Project) => void;
const at = <K extends keyof Project>(update: Up, key: K) => (patch: Partial<Project[K]>) => update((p) => ({ ...p, [key]: { ...(p[key] as object), ...patch } }));

export function DetailsSection() {
  const { project: p, update } = useToolkit();
  const set = at(update, 'promo');
  return (
    <Section title="Promotion details">
      <Grid cols={3}>
        <TextField id={FIELDS.name.id} label="Promotion name" value={p.promo.name} onChange={(name) => set({ name })} />
        <TextField id={FIELDS.slogan.id} label="Slogan" value={p.promo.slogan} onChange={(slogan) => set({ slogan })} />
        <SelectField id={FIELDS.type.id} label="Promotion type" value={p.promo.type} options={PROMO_TYPES} onChange={(type) => set({ type })} />
        <TextField id={FIELDS.format.id} label="Format" value={p.promo.format} placeholder="e.g. Daily Cross-Games Challenges" onChange={(format) => set({ format })} />
        <NumberField id={FIELDS.declaredDays.id} label="Number of days (declared)" min={1} value={p.promo.declaredDays} onChange={(declaredDays) => set({ declaredDays })} />
        <NumberField id={FIELDS.declaredTasks.id} label="Tasks per day (declared)" min={1} value={p.promo.declaredTasksPerDay} onChange={(declaredTasksPerDay) => set({ declaredTasksPerDay })} />
      </Grid>
    </Section>
  );
}

export function ScheduleSection() {
  const { project: p, update } = useToolkit();
  const set = at(update, 'schedule');
  const s = p.schedule;
  return (
    <Section title="Schedule" note="All times in the time zone below">
      <Grid cols={4}>
        <DateField id={FIELDS.announceDate.id} label="Announcement date" value={s.announceDate} onChange={(announceDate) => set({ announceDate })} />
        <TimeField id={FIELDS.announceTime.id} label="Announcement time" value={s.announceTime} onChange={(announceTime) => set({ announceTime })} />
        <TextField id={FIELDS.timezone.id} label="Time zone" value={s.timezone} placeholder="UTC, UTC+1, Africa/Lagos" onChange={(timezone) => set({ timezone })} />
        <YesNo id="f-consecutive" label="Consecutive daily missions" value={p.promo.consecutive} onChange={(consecutive) => at(update, 'promo')({ consecutive })} />
        <DateField id={FIELDS.startDate.id} label="Campaign start date" value={s.startDate} onChange={(startDate) => set({ startDate })} />
        <TimeField id={FIELDS.startTime.id} label="Start time" value={s.startTime} onChange={(startTime) => set({ startTime })} />
        <DateField id={FIELDS.endDate.id} label="Campaign end date" value={s.endDate} onChange={(endDate) => set({ endDate })} />
        <TimeField id={FIELDS.endTime.id} label="End time" value={s.endTime} onChange={(endTime) => set({ endTime })} />
        <TimeField id={FIELDS.dailyStart.id} label="Daily mission start" value={s.dailyStart} onChange={(dailyStart) => set({ dailyStart })} />
        <TimeField id={FIELDS.dailyEnd.id} label="Daily mission end" value={s.dailyEnd} onChange={(dailyEnd) => set({ dailyEnd })} />
      </Grid>
    </Section>
  );
}

export function GamesSection() {
  const { project: p, update } = useToolkit();
  const set = at(update, 'games');
  const toggle = (g: GameId) => set({ secondary: p.games.secondary.includes(g) ? p.games.secondary.filter((x) => x !== g) : [...p.games.secondary, g] });
  return (
    <Section title="Games">
      <Grid cols={3}>
        <SelectField<GameId | ''>
          id={FIELDS.anchor.id}
          label="Anchor (entry) game"
          value={p.games.anchor}
          options={[{ id: '', label: '— none —' }, ...SIM_GAMES.map((g) => ({ id: g.id as GameId, label: g.name }))]}
          onChange={(anchor) => set({ anchor })}
        />
        <div className="k-field wide2">
          <span>Secondary games</span>
          <div className="k-checks" id={FIELDS.secondary.id} tabIndex={-1}>
            {SIM_GAMES.filter((g) => g.id !== p.games.anchor).map((g) => (
              <label key={g.id}>
                <input type="checkbox" checked={p.games.secondary.includes(g.id as GameId)} onChange={() => toggle(g.id as GameId)} /> {g.name}
              </label>
            ))}
          </div>
        </div>
      </Grid>
    </Section>
  );
}

export function PrizesSection() {
  const { project: p, update } = useToolkit();
  const set = at(update, 'prizes');
  const calc = calculatedTotal(p);
  const conf = p.prizes.totalPool;
  const diff = calc != null && conf != null ? cents(conf - calc) : null;
  const money = (n: number | null) => fmtMoney(n, p.prizes.currency);
  return (
    <Section title="Prizes">
      <Grid cols={4}>
        <TextField id={FIELDS.currency.id} label="Currency" value={p.prizes.currency} placeholder="USD" onChange={(currency) => set({ currency: currency.toUpperCase() })} />
        <NumberField id={FIELDS.totalPool.id} label="Total prize pool" min={0} value={p.prizes.totalPool} onChange={(totalPool) => set({ totalPool })} />
        <NumberField id={FIELDS.winnersPerDay.id} label="Winners per day (default)" min={1} value={p.prizes.winnersPerDay} onChange={(winnersPerDay) => set({ winnersPerDay })} />
        <SelectField id={FIELDS.rewardMethod.id} label="Reward method" value={p.prizes.rewardMethod} options={REWARD_METHODS} onChange={(rewardMethod) => set({ rewardMethod })} />
        <TextField id={FIELDS.rewardStructure.id} label="Reward structure" value={p.prizes.rewardStructure} placeholder="e.g. Progressive Reward Structure" onChange={(rewardStructure) => set({ rewardStructure })} />
        <SelectField
          id="f-structure-source"
          label="T&C prize structure from"
          value={p.prizes.structureSource}
          options={[
            { id: 'daily', label: 'Daily prizes (winners × reward)' },
            { id: 'split', label: 'Prize split table' },
          ]}
          onChange={(structureSource) => set({ structureSource })}
        />
      </Grid>
      {p.prizes.structureSource === 'daily' && (
        <div className={`k-moneycheck ${diff == null ? '' : diff === 0 ? 'ok' : 'bad'}`}>
          <div>
            <small>Configured total</small>
            <b>{money(conf)}</b>
          </div>
          <div>
            <small>Sum of daily pools</small>
            <b>{money(calc)}</b>
          </div>
          <div>
            <small>Difference</small>
            <b>{diff == null ? '—' : money(Math.abs(diff))}</b>
          </div>
          <div>
            <small>Status</small>
            <b>{diff == null ? 'Incomplete' : diff === 0 ? 'Valid' : 'Does not add up'}</b>
          </div>
        </div>
      )}
    </Section>
  );
}

const moveIn = <T,>(xs: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

export function DaysEditor({ onOpenInCalc }: { onOpenInCalc?: (dayIndex: number) => void }) {
  const { project: p, update } = useToolkit();
  const setDays = (fn: (d: DayConfig[]) => DayConfig[]) => update((x) => ({ ...x, days: fn(x.days) }));
  const setDay = (i: number, patch: Partial<DayConfig>) => setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const setTask = (i: number, j: number, patch: Partial<SimMission>) => setDay(i, { tasks: p.days[i].tasks.map((t, k) => (k === j ? { ...t, ...patch } : t)) });
  const span = validDate(p.schedule.startDate) && validDate(p.schedule.endDate) ? daysBetween(p.schedule.startDate, p.schedule.endDate) + 1 : null;
  const wanted = p.promo.declaredDays ?? span;
  const money = (n: number | null) => fmtMoney(n, p.prizes.currency);

  // Simulate outside the state update (updaters must stay cheap and pure).
  const saveEstimates = (ids: string[]) => {
    const found: Record<string, Estimate> = {};
    for (const d of p.days) if (ids.includes(d.id)) {
      const e = estimateDay(p, d);
      if (e) found[d.id] = e;
    }
    update((x) => ({ ...x, estimates: { ...x.estimates, ...found } }));
  };
  const estimateAll = () => saveEstimates(p.days.map((d) => d.id));

  return (
    <Section
      title="Daily missions"
      id={FIELDS.days.id}
      note={
        <>
          {p.days.length} day{p.days.length === 1 ? '' : 's'} configured{p.promo.declaredDays != null ? ` · ${p.promo.declaredDays} declared` : ''}
        </>
      }
    >
      <div className="k-row">
        <button className="t-btn" onClick={() => setDays((ds) => [...ds, { ...blankDay(), tasks: ds[ds.length - 1]?.tasks.map((t) => ({ ...t })) ?? [] }])}>
          + Add day
        </button>
        {!p.days.length && wanted != null && wanted > 0 && wanted <= 60 && (
          <button className="t-btn" onClick={() => setDays(() => Array.from({ length: wanted }, blankDay))}>
            Create {wanted} days
          </button>
        )}
        {p.days.length > 0 && (
          <button className="t-btn primary" onClick={estimateAll} disabled={!p.days.some((d) => canEstimate(p, d))}>
            Estimate all days
          </button>
        )}
        <span className="k-muted k-small">Estimates use the Mission Calculator (everyone on auto, {p.calculator?.bets ?? 2} Aviator bets a round).</span>
      </div>
      {p.days.map((d, i) => {
        const date = dayDate(p, i);
        const pool = dayPool(p, d);
        const est = p.estimates[d.id];
        const fresh = est && est.key === tasksKey(d.tasks);
        const win = dayWindowMin(p, d);
        return (
          <div className="k-day" key={d.id}>
            <div className="k-day-head">
              <b>Day {i + 1}</b>
              <span className="k-muted">{date ? fmtShort(date) : 'no date'}</span>
              {win != null && <span className="k-muted">· {fmtSpan(win)} window</span>}
              {fresh && est.median != null && <Chip tone={est.pAllGone < 0.5 ? 'bad' : 'info'}>Est. {fmtSpan(est.median)}</Chip>}
              {fresh && est.median == null && <Chip tone="bad">Prizes likely left over</Chip>}
              {est && !fresh && <Chip tone="muted">Estimate out of date</Chip>}
              <span className="k-day-actions">
                {onOpenInCalc && (
                  <button className="k-link" onClick={() => onOpenInCalc(i)}>
                    Open in calculator
                  </button>
                )}
                <button className="k-link" disabled={!canEstimate(p, d)} onClick={() => saveEstimates([d.id])}>
                  Estimate
                </button>
                <button className="k-link" aria-label={`Move day ${i + 1} up`} onClick={() => setDays((ds) => moveIn(ds, i, -1))}>
                  ↑
                </button>
                <button className="k-link" aria-label={`Move day ${i + 1} down`} onClick={() => setDays((ds) => moveIn(ds, i, 1))}>
                  ↓
                </button>
                <button className="k-link" onClick={() => setDays((ds) => [...ds.slice(0, i + 1), { ...d, id: uid(), tasks: d.tasks.map((t) => ({ ...t })) }, ...ds.slice(i + 1)])}>
                  Duplicate
                </button>
                <button className="k-link danger" onClick={() => setDays((ds) => ds.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </span>
            </div>
            <div className="k-day-grid">
              <DateField id={dayField(i, 'date', '').id} label="Date (blank = consecutive)" value={d.date} onChange={(v) => setDay(i, { date: v })} />
              <NumberField id={dayField(i, 'winners', '').id} label={`Winners${d.winners == null && p.prizes.winnersPerDay != null ? ` (default ${p.prizes.winnersPerDay})` : ''}`} min={0} value={d.winners} onChange={(v) => setDay(i, { winners: v })} />
              <NumberField id={dayField(i, 'reward', '').id} label="Reward per winner" min={0} value={d.reward} onChange={(v) => setDay(i, { reward: v })} />
              <NumberField id={dayField(i, 'pool', '').id} label="Daily pool (optional check)" min={0} value={d.poolOverride} onChange={(v) => setDay(i, { poolOverride: v })} />
              <div className="k-field">
                <span>Calculated pool</span>
                <b className="k-calc">
                  {dayWinners(p, d) ?? '?'} × {money(d.reward)} = {money(pool)}
                </b>
              </div>
            </div>
            <div className="k-tasks" id={dayField(i, 'tasks', '').id} tabIndex={-1}>
              {d.tasks.map((t, j) => {
                const g = SIM_GAMES.find((x) => x.id === t.game);
                const c = t.kind === 'catch' && g && t.threshold != null && Number.isFinite(t.threshold) && t.threshold > 0 ? chanceAtLeast(g, t.threshold) : null;
                const per = fresh ? est.perTask[j] : undefined;
                return (
                  <div className="k-task" key={j}>
                    <span className="k-task-n">{j + 1}</span>
                    <select id={taskField(i, j, '').id} aria-label="Game" value={t.game} onChange={(e) => setTask(i, j, { game: e.target.value as GameId })}>
                      {SIM_GAMES.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Task type"
                      value={t.kind}
                      onChange={(e) => setTask(i, j, { kind: e.target.value as SimMission['kind'], threshold: e.target.value === 'catch' ? t.threshold ?? 10 : undefined })}
                    >
                      {Object.entries(TASK_TYPES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    {TASK_TYPES[t.kind].needsMultiplier && (
                      <label className="k-inline">
                        <input aria-label="Minimum multiplier" type="number" min={1} step="any" value={t.threshold == null || !Number.isFinite(t.threshold) ? '' : t.threshold} onChange={(e) => setTask(i, j, { threshold: e.target.value === '' ? NaN : Number(e.target.value) })} />x
                      </label>
                    )}
                    <label className="k-inline">
                      <input aria-label={TASK_TYPES[t.kind].targetLabel} type="number" min={1} value={Number.isFinite(t.target) ? t.target : ''} onChange={(e) => setTask(i, j, { target: e.target.value === '' ? NaN : Number(e.target.value) })} />
                      {TASK_TYPES[t.kind].targetLabel}
                    </label>
                    {c && <span className={`t-odds ${c.p >= 0.03 ? 'ok' : c.p >= 0.005 ? 'mid' : 'bad'}`}>{c.p > 0 ? oneIn(c.p) : 'impossible'}</span>}
                    {per !== undefined && <span className="k-per">{per == null ? 'not in time' : `≈ ${fmtSpan(per)}`}</span>}
                    <span className="k-task-actions">
                      <button className="k-link" aria-label="Move task up" onClick={() => setDay(i, { tasks: moveIn(d.tasks, j, -1) })}>
                        ↑
                      </button>
                      <button className="k-link" aria-label="Move task down" onClick={() => setDay(i, { tasks: moveIn(d.tasks, j, 1) })}>
                        ↓
                      </button>
                      <button className="k-link danger" aria-label={`Remove ${GAME_NAME[t.game]} task`} onClick={() => setDay(i, { tasks: d.tasks.filter((_, k) => k !== j) })}>
                        ×
                      </button>
                    </span>
                  </div>
                );
              })}
              <button className="k-link" onClick={() => setDay(i, { tasks: [...d.tasks, { game: p.games.anchor || 'mines', kind: 'bets', target: 100 }] })}>
                + Add task
              </button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

export function MissionTargetField() {
  const { project: p, update } = useToolkit();
  return (
    <NumberField
      id={FIELDS.missionTarget.id}
      label="Target daily mission length"
      hint="Minutes until the last prize. Blank = the whole daily window."
      suffix="min"
      min={1}
      value={p.mission.targetMin}
      onChange={(targetMin) => update((x) => ({ ...x, mission: { targetMin } }))}
    />
  );
}
