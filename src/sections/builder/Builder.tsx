import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { evaluateScenario, type Scenario, type Stage } from '../../math/campaign';
import { fmtClock, fmtDuration } from '../../math/format';
import { Badge, NumberField, Notice, SectionHead, Segmented, SourceSelect } from '../../components/ui';
import { useApp } from '../../state/AppContext';
import { cloneDay, defaultScenario, illustrativeScenario, missionsCsv, newTask, scenarioFromJson, scenarioToJson, uid } from '../../state/scenarios';
import { Results } from './Results';
import { TaskEditor } from './TaskEditor';
import { CompareScenarios } from './Compare';
import { Economics } from './Economics';

export function Builder() {
  const { current: s, setCurrent, saved, setSaved, toast, exportFile, openSummary, resetAll } = useApp();
  const deferred = useDeferredValue(s);
  const result = useMemo(() => evaluateScenario(deferred), [deferred]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const evalById = new Map(result.tasks.map((e) => [e.task.id, e]));

  const update = (patch: Partial<Scenario>) => setCurrent({ ...s, ...patch });
  const setTasks = (tasks: Scenario['tasks']) => update({ tasks });
  const setStage = (i: number, patch: Partial<Stage>) => update({ stages: s.stages.map((st, j) => (j === i ? { ...st, ...patch } : st)) });

  const save = () => {
    const exists = saved.findIndex((x) => x.id === s.id);
    const copy = structuredClone(s);
    setSaved(exists >= 0 ? saved.map((x, i) => (i === exists ? copy : x)) : [...saved, copy]);
    toast(exists >= 0 ? `Updated saved scenario “${s.name}”.` : `Saved “${s.name}” in this browser.`);
  };

  const importJson = async (file: File) => {
    const { scenario, error } = scenarioFromJson(await file.text());
    if (error || !scenario) toast(`Import failed: ${error}`);
    else {
      setCurrent(scenario);
      toast(`Imported “${scenario.name}”.`);
    }
  };

  const fileName = s.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scenario';

  return (
    <section className="section" id="builder">
      <SectionHead id="builder" n={5} title="Campaign builder">
        Combine missions into a campaign and see when individual players finish and when the last prize is likely claimed. Unknown game parameters stay visibly
        missing until you enter them.
      </SectionHead>

      <div className="card flat">
        <div className="row-between">
          <div className="row">
            <span className="small muted">Start from</span>
            <button onClick={() => setCurrent(defaultScenario())}>Blank 5-hour campaign</button>
            <button onClick={() => setCurrent(cloneDay(6))}>Clone Day 6</button>
            <button onClick={() => setCurrent(cloneDay(7))}>Clone Day 7</button>
            <button className="sim" onClick={() => setCurrent(illustrativeScenario())}>
              Illustrative demo
            </button>
          </div>
          <div className="toolbar">
            <button className="primary" onClick={save}>
              Save scenario
            </button>
            <button onClick={() => exportFile(`${fileName}.json`, scenarioToJson(s), 'application/json')}>Export JSON</button>
            <button onClick={() => fileRef.current?.click()}>Import JSON</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = '';
              }}
            />
            <button onClick={() => exportFile(`${fileName}-missions.csv`, missionsCsv(s), 'text/csv')} disabled={s.tasks.length === 0}>
              Export missions CSV
            </button>
            <button onClick={openSummary}>Research summary</button>
          </div>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <article className="card">
            <div className="card-head">
              <label className="field" htmlFor="scn-name" style={{ flex: 1, minWidth: 220 }}>
                <span className="lbl">Scenario name</span>
                <input id="scn-name" value={s.name} onChange={(e) => update({ name: e.target.value })} />
              </label>
              <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                <Badge kind={s.origin.startsWith('Illustrative') ? 'assumption' : 'proposed'} />
                <span className="tiny muted" style={{ maxWidth: 260, textAlign: 'right' }}>
                  {s.origin}
                </span>
              </div>
            </div>
            {s.notes && <Notice tone="info">{s.notes}</Notice>}
            <div className="form-grid">
              <NumberField id="scn-deadline" label="Event deadline" value={s.deadline} onChange={(v) => update({ deadline: v ?? 0 })} suffix="min" required hint="Scheduled event duration. 300 min = 5 h." />
              <NumberField id="scn-entrants" label="Entrants M" value={s.entrants} onChange={(v) => update({ entrants: v })} required />
              <NumberField id="scn-places" label="Prize places K" value={s.prizePlaces} onChange={(v) => update({ prizePlaces: v })} required />
              <NumberField id="scn-amount" label="Prize amount per place" value={s.prizeAmount} onChange={(v) => update({ prizeAmount: v })} suffix={s.currency} />
              <label className="field" htmlFor="scn-cur">
                <span className="lbl">Currency</span>
                <input id="scn-cur" value={s.currency} onChange={(e) => update({ currency: e.target.value.toUpperCase().slice(0, 4) })} />
              </label>
            </div>
            <p className="tiny muted">
              Deadline = {fmtDuration(s.deadline)} scheduled. Entrants and prize places start blank: the first-finisher analysis stays hidden until they are entered.
            </p>
          </article>

          <article className="card">
            <h3>Progression and completion rule</h3>
            <Segmented
              label="Progression"
              value={s.progression}
              onChange={(v) => update({ progression: v })}
              options={[
                { value: 'simultaneous', label: 'Simultaneous' },
                { value: 'sequential', label: 'Sequential' },
                { value: 'staged', label: 'Scheduled stages' },
              ]}
            />
            <p className="small muted">
              {s.progression === 'simultaneous' && 'All missions open at once and can be played in parallel. Completion = slowest required mission (or the K-th for “any K”).'}
              {s.progression === 'sequential' && 'One mission at a time in the listed order; progress does not carry over. Completion = sum of mission times.'}
              {s.progression === 'staged' && 'Missions are grouped into stages with release times. Missions within a stage run in parallel.'}
            </p>
            {s.progression !== 'sequential' && (
              <div className="row">
                <Segmented label="Completion rule" value={s.completion} onChange={(v) => update({ completion: v })} options={[{ value: 'all', label: 'All missions required' }, { value: 'anyK', label: 'Any K of G' }]} />
                {s.completion === 'anyK' && (
                  <div style={{ width: 120 }}>
                    <NumberField id="scn-k" label="K" value={s.anyK} onChange={(v) => update({ anyK: v })} required />
                  </div>
                )}
              </div>
            )}
            {s.progression === 'sequential' && s.completion === 'anyK' && <p className="tiny muted">“Any K” is not applied in sequential mode: every mission in the chain is required.</p>}
            <p className="tiny muted">Missions sharing an alternative-route group count as one requirement completed by whichever route finishes first.</p>

            {s.progression === 'staged' && (
              <div className="stack-sm">
                <div className="row">
                  <Segmented
                    label="Stage entry"
                    value={s.stageEntry}
                    onChange={(v) => update({ stageEntry: v })}
                    options={[
                      { value: 'independent', label: 'Independent entry per stage' },
                      { value: 'gated', label: 'Must finish previous stage' },
                    ]}
                  />
                  <Segmented
                    label="Carryover"
                    value={s.stageCarryover}
                    onChange={(v) => update({ stageCarryover: v })}
                    options={[
                      { value: 'reset', label: 'Progress starts at release' },
                      { value: 'carry', label: 'Progress carries over' },
                    ]}
                  />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th>Release (min)</th>
                        <th>Deadline (min)</th>
                        <th>Prize share %</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {s.stages.map((st, i) => (
                        <tr key={st.id}>
                          <td>
                            <input aria-label="Stage name" value={st.name} onChange={(e) => setStage(i, { name: e.target.value })} />
                          </td>
                          <td>
                            <input aria-label={`${st.name} release minute`} className="num-input" inputMode="decimal" value={st.release} onChange={(e) => setStage(i, { release: Number(e.target.value) || 0 })} />
                            <span className="tiny muted">{fmtClock(st.release)}</span>
                          </td>
                          <td>
                            <input
                              aria-label={`${st.name} deadline minute`}
                              className="num-input"
                              inputMode="decimal"
                              placeholder="event end"
                              value={st.deadline ?? ''}
                              onChange={(e) => setStage(i, { deadline: e.target.value.trim() === '' ? null : Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${st.name} prize share percent`}
                              className={`num-input ${st.prizeShare == null && s.stageEntry === 'independent' ? 'is-missing' : ''}`}
                              inputMode="decimal"
                              placeholder="Missing"
                              value={st.prizeShare ?? ''}
                              onChange={(e) => setStage(i, { prizeShare: e.target.value.trim() === '' ? null : Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <button
                              className="ghost small"
                              disabled={s.stages.length === 1}
                              onClick={() =>
                                update({
                                  stages: s.stages.filter((_, j) => j !== i),
                                  tasks: s.tasks.filter((t) => t.stage !== i).map((t) => (t.stage > i ? { ...t, stage: t.stage - 1 } : t)),
                                })
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row">
                  <button
                    className="small"
                    onClick={() => {
                      const last = s.stages[s.stages.length - 1];
                      const release = last ? (last.deadline ?? last.release + 60) : 0;
                      update({ stages: [...s.stages, { id: uid('stage'), name: `Stage ${s.stages.length + 1}`, release, deadline: release + 60, prizeShare: null }] });
                    }}
                  >
                    Add stage
                  </button>
                  <span className="tiny muted">Release times are enforced: nobody completes a stage before it opens. Unreserved prize share is not modelled; publish unclaimed-prize rules.</span>
                </div>
              </div>
            )}
          </article>

          <article className="card">
            <div className="row-between">
              <h3>Play-speed assumptions</h3>
              <Badge kind="assumption" />
            </div>
            <p className="small muted">These are shown on every result. Replace them with measured values when telemetry is available.</p>
            <div className="form-grid">
              <NumberField
                id="scn-conc"
                label="Concurrent speed kept"
                value={s.concurrencyFactor}
                onChange={(v) => update({ concurrencyFactor: v ?? 100 })}
                suffix="%"
                hint="Share of solo speed kept while several missions run at once. Per-mission concurrent rates override this."
                badge={<SourceSelect label="Source" value={s.concurrencySource} onChange={(v) => update({ concurrencySource: v })} />}
              />
              <NumberField
                id="scn-active"
                label="Active-play fraction"
                value={s.activeFraction}
                onChange={(v) => update({ activeFraction: v ?? 100 })}
                suffix="%"
                badge={<SourceSelect label="Source" value={s.activeFractionSource} onChange={(v) => update({ activeFractionSource: v })} />}
              />
              <NumberField
                id="scn-spread"
                label="Start spread"
                value={s.startSpread}
                onChange={(v) => update({ startSpread: v ?? 0 })}
                suffix="min"
                hint="Players start uniformly within this many minutes after the event opens."
                badge={<SourceSelect label="Source" value={s.startSpreadSource} onChange={(v) => update({ startSpreadSource: v })} />}
              />
              <NumberField id="scn-samples" label="Simulated players" value={s.samples} onChange={(v) => update({ samples: v ?? 20000 })} hint="Used for sequential and staged progression." />
              <NumberField id="scn-seed" label="Random seed" value={s.seed} onChange={(v) => update({ seed: v ?? 1 })} />
            </div>
          </article>

          <article className="card">
            <div className="row-between">
              <h3>Missions ({s.tasks.length})</h3>
              <button className="primary" onClick={() => setTasks([...s.tasks, newTask({ stage: Math.max(0, s.stages.length - 1) })])}>
                Add mission
              </button>
            </div>
            {s.tasks.length === 0 ? (
              <div className="empty">
                No missions yet. Add one, clone a previous day, or adapt a competitor mechanic.
                <div className="row">
                  <button onClick={() => setTasks([newTask()])}>Add mission</button>
                  <a href="#competitors">Browse competitor mechanics</a>
                </div>
              </div>
            ) : (
              <div className="stack">
                {s.tasks.map((t, i) => (
                  <TaskEditor
                    key={t.id}
                    task={t}
                    index={i}
                    total={s.tasks.length}
                    scenario={s}
                    evaluation={evalById.get(t.id)}
                    onChange={(nt) => setTasks(s.tasks.map((x) => (x.id === t.id ? nt : x)))}
                    onRemove={() => setTasks(s.tasks.filter((x) => x.id !== t.id))}
                    onDuplicate={() => {
                      const copy = { ...t, id: uid('task') };
                      const next = [...s.tasks];
                      next.splice(i + 1, 0, copy);
                      setTasks(next);
                    }}
                    onMove={(dir) => {
                      const next = [...s.tasks];
                      const j = i + dir;
                      [next[i], next[j]] = [next[j], next[i]];
                      setTasks(next);
                    }}
                  />
                ))}
              </div>
            )}
          </article>
        </div>

        <aside className="card sticky-results" aria-live="polite">
          <div className="row-between">
            <h3>Timing estimate</h3>
            {deferred !== s && <span className="tiny muted">Updating…</span>}
          </div>
          <Results scenario={deferred} result={result} />
        </aside>
      </div>

      <CompareScenarios />

      <div className="row-between">
        <span className="small muted">Saved scenarios, observations and checklists live only in this browser.</span>
        {confirmReset ? (
          <div className="row">
            <span className="small">Delete all locally saved work?</span>
            <button className="danger small" onClick={() => {
                resetAll();
                setConfirmReset(false);
              }}>
              Yes, reset everything
            </button>
            <button className="small" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="danger small" onClick={() => setConfirmReset(true)}>
            Reset local data
          </button>
        )}
      </div>

      <Economics />
    </section>
  );

}

