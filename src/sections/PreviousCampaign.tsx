import { useMemo, useState } from 'react';
import { CAMPAIGN_GAMES, GAME_BY_ID, type GameId } from '../data/games';
import { DAYS, DAY_OBSERVATIONS, KIND_LABEL, PREVIOUS_MISSIONS, diffDays, missionsForDay, participation, resultForDay, shareOfStartersNeeded, type TaskKind } from '../data/previousCampaign';
import { fmtDuration, fmtNumber, fmtPercent } from '../math/format';
import { ReportedResults } from './ReportedResults';
import { Badge, GAME_COLOR, GameChip, Notice, SectionHead, SelectField, Stat } from '../components/ui';
import { useApp } from '../state/AppContext';
import { cloneDay } from '../state/scenarios';

const CHANGE_LABEL = { same: 'Unchanged', changed: 'Changed', added: 'Only in B', removed: 'Only in A' };

export function PreviousCampaign() {
  const { observations, setObservation, openInBuilder } = useApp();
  const [day, setDay] = useState(6);
  const [game, setGame] = useState<'all' | GameId>('all');
  const [kind, setKind] = useState<'all' | TaskKind>('all');
  const [dayA, setDayA] = useState(5);
  const [dayB, setDayB] = useState(7);

  const games = CAMPAIGN_GAMES.filter((g) => PREVIOUS_MISSIONS.some((m) => m.game === g));
  const filtered = useMemo(() => PREVIOUS_MISSIONS.filter((m) => (game === 'all' || m.game === game) && (kind === 'all' || m.kind === kind)), [game, kind]);
  const obs = DAY_OBSERVATIONS.find((o) => o.day === day)!;
  const diff = useMemo(() => diffDays(dayA, dayB), [dayA, dayB]);
  const dayObs = observations[day] ?? { firstFinisher: '', finalPrize: '', entrants: '', prizes: '' };
  const res = resultForDay(day)!;

  return (
    <section className="section" id="previous">
      <SectionHead id="previous" n={2} title="Previous SPRIBE campaign">
        The seven-day campaign as run, with the original mission wording and the day-level results reported by our team. These are internal observations:
        aggregates without bet-level timestamps or qualifying probabilities.
      </SectionHead>

      <div className="days" role="group" aria-label="Select a campaign day">
        {DAYS.map((d) => {
          const o = DAY_OBSERVATIONS.find((x) => x.day === d)!;
          return (
            <button key={d} className="day-card" aria-pressed={day === d} onClick={() => setDay(d)}>
              <span className="row-between">
                <span className="dn">Day {d}</span>
                <span className="tiny muted num">{missionsForDay(d).length} tasks</span>
              </span>
              <span className="games" aria-hidden="true">
                {missionsForDay(d).map((m) => (
                  <i key={m.game} className="game-pip" style={{ ['--game-color' as string]: GAME_COLOR[m.game] }} title={GAME_BY_ID[m.game].name} />
                ))}
              </span>
              <span className={`outcome ${o.tone}`}>{o.badge}</span>
            </button>
          );
        })}
      </div>

      <div className="split">
        <article className="card">
          <div className="card-head">
            <div className="stack-sm">
              <h3>Day {day} missions</h3>
              <span className="small muted">All tasks were mandatory and could be played simultaneously.</span>
            </div>
            <button className="primary" onClick={() => openInBuilder(cloneDay(day), `Day ${day} duplicated into the builder. Game parameters are left blank.`)}>
              Duplicate into builder
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Mission (original wording)</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {missionsForDay(day).map((m) => (
                  <tr key={m.game} className={day === 6 && m.game === 'keno' ? 'removed' : undefined}>
                    <td>
                      <GameChip game={m.game} />
                    </td>
                    <td>{m.text}</td>
                    <td className="small muted">{KIND_LABEL[m.kind]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`notice ${obs.tone === 'blocked' ? 'block' : obs.tone === 'ok' ? 'ok' : 'warn'}`}>
            <span className="ico" aria-hidden="true">
              {obs.tone === 'blocked' ? '×' : obs.tone === 'ok' ? '✓' : '!'}
            </span>
            <div className="stack-sm">
              <div className="row">
                <strong>{obs.badge}</strong>
                <Badge kind="internal" />
              </div>
              <span className="small">{obs.detail}</span>
            </div>
          </div>
          {day === 6 && (
            <p className="small muted">
              Zero finishers does not by itself prove a particular probability or identify the technical cause. See the{' '}
              <a href="#keno-check">Keno investigation checklist</a>.
            </p>
          )}
        </article>

        <article className="card">
          <div className="card-head">
            <h3>Day {day} reported results</h3>
            <Badge kind="internal" />
          </div>
          <div className="stats">
            <Stat k="Registered" v={fmtNumber(res.registered)} small />
            <Stat k="Started ≥1 task" v={fmtNumber(res.started)} s={`${fmtPercent(participation(res), 1)} participation`} small />
            <Stat k="Winners" v={res.winners} s={res.winners === 0 ? 'No prizes claimed' : `${fmtPercent(shareOfStartersNeeded(res), 1)} of starters`} small />
            <Stat k="Reported duration" v={fmtDuration(res.durationMin)} s={res.winners === 0 ? 'Event ran to the end' : 'Read as final-prize time'} small />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Task (as reported)</th>
                  <th className="num">Completed</th>
                </tr>
              </thead>
              <tbody>
                <tr className={res.least.completed === 0 ? 'removed' : undefined}>
                  <td className="small muted">Least completed</td>
                  <td>{res.least.reported}</td>
                  <td className="num">{res.least.completed}</td>
                </tr>
                <tr>
                  <td className="small muted">Most completed</td>
                  <td>{res.most.reported}</td>
                  <td className="num">{res.most.completed}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {res.discrepancy && <Notice tone="warn">{res.discrepancy}</Notice>}
          <label className="field" htmlFor={`obs-${day}-first`}>
            <span className="lbl">
              First-finisher time
              {dayObs.firstFinisher ? <Badge kind="internal">Entered</Badge> : <Badge kind="missing">Missing</Badge>}
            </span>
            <input
              id={`obs-${day}-first`}
              className={dayObs.firstFinisher ? '' : 'is-missing'}
              value={dayObs.firstFinisher}
              placeholder="e.g. 0h 31m after start"
              onChange={(e) => setObservation(day, 'firstFinisher', e.target.value)}
            />
          </label>
          <p className="tiny muted">Still missing for every day: first-finisher time, per-player completion timestamps, and bet-level telemetry.</p>
        </article>
      </div>

      <ReportedResults />

      <article className="card">
        <div className="card-head">
          <h3>Full comparison table</h3>
          <div className="row">
            <SelectField
              label="Game"
              value={game}
              onChange={setGame}
              options={[{ value: 'all', label: 'All games' }, ...games.map((g) => ({ value: g, label: GAME_BY_ID[g].name }))]}
            />
            <SelectField
              label="Task type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'All task types' },
                { value: 'multiplier', label: KIND_LABEL.multiplier },
                { value: 'accumulate', label: KIND_LABEL.accumulate },
                { value: 'count', label: KIND_LABEL.count },
              ]}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty">No missions match these filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  {DAYS.map((d) => (
                    <th key={d}>Day {d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games
                  .filter((g) => filtered.some((m) => m.game === g))
                  .map((g) => (
                    <tr key={g}>
                      <td>
                        <GameChip game={g} />
                      </td>
                      {DAYS.map((d) => {
                        const m = filtered.find((x) => x.game === g && x.day === d);
                        return (
                          <td key={d} className="small" style={{ minWidth: 130 }}>
                            {m ? m.text : <span className="muted">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted">
          Showing {filtered.length} of {PREVIOUS_MISSIONS.length} missions. “—” means the game was not part of that day, or is hidden by the task-type filter.
        </p>
      </article>

      <article className="card">
        <div className="card-head">
          <h3>Compare two days</h3>
          <div className="row">
            <SelectField label="Day A" value={String(dayA)} onChange={(v) => setDayA(Number(v))} options={DAYS.map((d) => ({ value: String(d), label: `Day ${d}` }))} />
            <SelectField label="Day B" value={String(dayB)} onChange={(v) => setDayB(Number(v))} options={DAYS.map((d) => ({ value: String(d), label: `Day ${d}` }))} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Day {dayA}</th>
                <th>Day {dayB}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((r) => (
                <tr key={r.game} className={r.change === 'same' ? '' : r.change}>
                  <td>
                    <GameChip game={r.game} />
                  </td>
                  <td>{r.a?.text ?? <span className="muted">Not included</span>}</td>
                  <td>{r.b?.text ?? <span className="muted">Not included</span>}</td>
                  <td className="small">{CHANGE_LABEL[r.change]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">
          {diff.filter((r) => r.change !== 'same').length} of {diff.length} game rows differ. Amber = changed requirement, green = only in Day B, red = only in Day A.
        </p>
      </article>
    </section>
  );
}
