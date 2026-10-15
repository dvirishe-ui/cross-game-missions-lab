import { useMemo, useState } from 'react';
import { CAMPAIGN_GAMES, GAME_BY_ID, type GameId } from '../data/games';
import { DAYS, DAY_OBSERVATIONS, KIND_LABEL, PREVIOUS_MISSIONS, diffDays, missionsForDay, type TaskKind } from '../data/previousCampaign';
import { Badge, GAME_COLOR, GameChip, SectionHead, SelectField } from '../components/ui';
import { useApp } from '../state/AppContext';
import { cloneDay } from '../state/scenarios';

const OBS_FIELDS = [
  { key: 'firstFinisher', label: 'Actual first-finisher time', placeholder: 'e.g. 13:42 local or T+0:38' },
  { key: 'finalPrize', label: 'Actual final-prize time', placeholder: 'K-th claim timestamp' },
  { key: 'entrants', label: 'Entrants', placeholder: 'Opted-in players' },
  { key: 'prizes', label: 'Prize places', placeholder: 'Number available' },
] as const;

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

  return (
    <section className="section" id="previous">
      <SectionHead id="previous" n={2} title="Previous SPRIBE campaign">
        The seven-day campaign as run, with the original mission wording. Outcomes are internal observations from our team; no timestamps, player counts or
        qualifying probabilities were supplied.
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
            <h3>Day {day} actual results</h3>
            <Badge kind={OBS_FIELDS.every((f) => dayObs[f.key]) ? 'internal' : 'missing'} />
          </div>
          <p className="small muted">
            Blank until supplied from telemetry. Values you enter are stored only in this browser and labelled as internal observations.
          </p>
          <div className="form-grid">
            {OBS_FIELDS.map((f) => (
              <label key={f.key} className="field" htmlFor={`obs-${day}-${f.key}`}>
                <span className="lbl">
                  {f.label}
                  {dayObs[f.key] ? <Badge kind="internal">Entered</Badge> : <Badge kind="missing">Missing</Badge>}
                </span>
                <input
                  id={`obs-${day}-${f.key}`}
                  className={dayObs[f.key] ? '' : 'is-missing'}
                  value={dayObs[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setObservation(day, f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="callout">
            <span className="badge calculated plain">Note</span>
            <p className="small">
              <strong>Days 5 and 7 had the same Aviator and Plinko requirements.</strong> Their different reported outcomes cannot be explained by those target
              counts alone.
            </p>
          </div>
        </article>
      </div>

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
