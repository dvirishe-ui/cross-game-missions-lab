import { useState } from 'react';
import { Chip, DateField, Grid, Section, SelectField, TextField, TimeField, useToolkit } from '../components/Fields';
import { PROMO_TYPES } from '../model/project';
import { daysBetween, fmtDate, fmtShort, todayLocal, validDate } from '../model/time';
import { defaultMilestones, milestoneDate, milestoneStatus, newMilestone, setManualDate, type Anchor, type Milestone, type Status } from '../timeline/timeline';

const ANCHORS: { id: Anchor; label: string }[] = [
  { id: 'announce', label: 'announcement' },
  { id: 'start', label: 'campaign start' },
  { id: 'end', label: 'campaign end' },
];

function StatusChip({ s }: { s: Status }) {
  if (s.kind === 'done') return <Chip tone="ok">Done</Chip>;
  if (s.kind === 'overdue') return <Chip tone="bad">Overdue by {s.days} day{s.days === 1 ? '' : 's'}</Chip>;
  if (s.kind === 'today') return <Chip tone="warn">Due today</Chip>;
  if (s.kind === 'soon') return <Chip tone="warn">In {s.days} day{s.days === 1 ? '' : 's'}</Chip>;
  if (s.kind === 'nodate') return <Chip tone="muted">No date</Chip>;
  return <Chip tone="muted">In {s.days} days</Chip>;
}

export function TimelinePage() {
  const { project: p, update } = useToolkit();
  const [confirmReset, setConfirmReset] = useState(false);
  const ms = p.timeline ?? defaultMilestones(p.promo.type);
  const setMs = (fn: (m: Milestone[]) => Milestone[]) => update((x) => ({ ...x, timeline: fn(x.timeline ?? defaultMilestones(x.promo.type)) }));
  const setM = (id: string, patch: Partial<Milestone>) => setMs((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const move = (i: number, d: number) =>
    setMs((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const out = [...list];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  const s = p.schedule;
  const anchors = { announce: s.announceDate, start: s.startDate, end: s.endDate };
  const today = todayLocal();
  const rows = ms.map((m) => {
    const d = milestoneDate(m, anchors);
    return { m, ...d, status: milestoneStatus(m, d.date, today) };
  });
  const overdue = rows.filter((r) => r.status.kind === 'overdue').length;
  const next = rows.filter((r) => !r.m.done && r.date && r.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const set = (patch: Partial<typeof s>) => update((x) => ({ ...x, schedule: { ...x.schedule, ...patch } }));

  return (
    <div className="k-page">
      <div className="k-page-head">
        <div>
          <h1>Promotion Timeline</h1>
          <p className="k-muted">Preparation steps worked back from the announcement and the campaign start. Offsets are planning defaults, not official deadlines.</p>
        </div>
      </div>
      <Section title="Campaign dates" note="Same dates as the Promo Checker">
        <Grid cols={4}>
          <TextField id="tl-name" label="Promotion name" value={p.promo.name} onChange={(name) => update((x) => ({ ...x, promo: { ...x.promo, name } }))} />
          <SelectField id="tl-type" label="Promotion type" value={p.promo.type} options={PROMO_TYPES} onChange={(type) => update((x) => ({ ...x, promo: { ...x.promo, type } }))} />
          <TextField id="tl-tz" label="Time zone" value={s.timezone} onChange={(timezone) => set({ timezone })} />
          <span />
          <DateField id="tl-announce" label="Announcement" value={s.announceDate} onChange={(announceDate) => set({ announceDate })} />
          <DateField id="tl-start" label="Campaign start" value={s.startDate} onChange={(startDate) => set({ startDate })} />
          <TimeField id="tl-start-time" label="Start time" value={s.startTime} onChange={(startTime) => set({ startTime })} />
          <DateField id="tl-end" label="Campaign end" value={s.endDate} onChange={(endDate) => set({ endDate })} />
        </Grid>
      </Section>

      <div className="k-tl-summary">
        <div>
          <small>Today (your browser)</small>
          <b>{fmtShort(today)}</b>
        </div>
        <div>
          <small>Next step</small>
          <b>{next ? `${next.m.name} · ${fmtShort(next.date)}` : '—'}</b>
        </div>
        <div className={overdue ? 'bad' : ''}>
          <small>Overdue</small>
          <b>{overdue}</b>
        </div>
        <div>
          <small>Done</small>
          <b>
            {ms.filter((m) => m.done).length} / {ms.length}
          </b>
        </div>
        {validDate(s.startDate) && (
          <div>
            <small>Campaign starts</small>
            <b>{daysBetween(today, s.startDate) >= 0 ? `in ${daysBetween(today, s.startDate)} days` : `${-daysBetween(today, s.startDate)} days ago`}</b>
          </div>
        )}
      </div>

      <Section title="Milestones" note="Change a date to lock it; locked dates stay put when campaign dates move">
        <ol className="k-tl">
          {rows.map(({ m, date, fallback, status }, i) => (
            <li key={m.id} className={`${m.major ? 'major' : ''} ${status.kind}`}>
              <input type="checkbox" aria-label={`Mark ${m.name} complete`} checked={m.done} onChange={(e) => setM(m.id, { done: e.target.checked })} />
              <div className="k-tl-date">
                <b>{date ? fmtShort(date) : '—'}</b>
                <small>{date ? fmtDate(date) : 'set dates'}</small>
              </div>
              <div className="k-tl-main">
                <input className="k-tl-name" aria-label="Milestone name" value={m.name} onChange={(e) => setM(m.id, { name: e.target.value })} />
                <div className="k-tl-rule">
                  {m.locked ? (
                    <>
                      Locked to {fmtDate(m.lockedDate)}{' '}
                      <button className="k-link" onClick={() => setM(m.id, { locked: false })}>
                        Unlock
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        aria-label="Days from anchor"
                        type="number"
                        value={Math.abs(m.offsetDays)}
                        min={0}
                        onChange={(e) => setM(m.id, { offsetDays: (m.offsetDays > 0 ? 1 : -1) * Math.abs(Number(e.target.value) || 0) })}
                      />
                      <select aria-label="Before or after" value={m.offsetDays > 0 ? 'after' : 'before'} onChange={(e) => setM(m.id, { offsetDays: Math.abs(m.offsetDays) * (e.target.value === 'after' ? 1 : -1) })}>
                        <option value="before">days before</option>
                        <option value="after">days after</option>
                      </select>
                      <select aria-label="Anchor" value={m.anchor} onChange={(e) => setM(m.id, { anchor: e.target.value as Anchor })}>
                        {ANCHORS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                      {fallback && <span className="k-muted"> (no announcement date: using start)</span>}
                    </>
                  )}
                </div>
              </div>
              <input className="k-tl-pick" aria-label="Set date" type="date" value={date} onChange={(e) => e.target.value && setM(m.id, setManualDate(m, e.target.value))} />
              <StatusChip s={status} />
              <span className="k-tl-actions">
                <button className="k-link" aria-label="Move up" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button className="k-link" aria-label="Move down" onClick={() => move(i, 1)}>
                  ↓
                </button>
                {!m.major && (
                  <button className="k-link danger" aria-label={`Remove ${m.name}`} onClick={() => setMs((list) => list.filter((x) => x.id !== m.id))}>
                    ×
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
        <div className="k-row">
          <button className="t-btn" onClick={() => setMs((list) => [...list, newMilestone()])}>
            + Add milestone
          </button>
          <button
            className="t-btn ghost"
            onClick={() => setMs((list) => [...list].sort((a, b) => (milestoneDate(a, anchors).date || '9').localeCompare(milestoneDate(b, anchors).date || '9')))}
          >
            Sort by date
          </button>
          {!confirmReset ? (
            <button className="t-btn ghost" onClick={() => setConfirmReset(true)}>
              Reset to defaults
            </button>
          ) : (
            <span className="k-confirm">
              Replace all milestones with the defaults for {PROMO_TYPES.find((t) => t.id === p.promo.type)!.label.toLowerCase()}?{' '}
              <button
                className="t-btn"
                onClick={() => {
                  update((x) => ({ ...x, timeline: defaultMilestones(x.promo.type) }));
                  setConfirmReset(false);
                }}
              >
                Replace
              </button>
              <button className="k-link" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
        {!validDate(s.startDate) && (
          <p className="k-muted">
            Set the campaign start to place the milestones.{' '}
            <button className="k-link" onClick={() => document.getElementById('tl-start')?.focus()}>
              Set start date
            </button>
          </p>
        )}
      </Section>
    </div>
  );
}
