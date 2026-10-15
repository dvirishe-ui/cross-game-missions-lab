import { useMemo, useState } from 'react';
import { GAME_BY_ID } from '../../data/games';
import { evaluateScenario, type Scenario, type ScenarioResult } from '../../math/campaign';
import { fmtDuration, fmtNumber, fmtPercent } from '../../math/format';
import { Badge, SelectField } from '../../components/ui';
import { useApp } from '../../state/AppContext';
import { describeTask } from '../../state/scenarios';

const PROG = { simultaneous: 'Simultaneous', sequential: 'Sequential', staged: 'Scheduled stages' };

function metrics(s: Scenario, r: ScenarioResult): [string, string][] {
  const u = r.units[0];
  const rows: [string, string][] = [
    ['Progression', PROG[s.progression]],
    ['Completion rule', s.progression === 'sequential' ? 'All, in order' : s.completion === 'all' ? 'All missions' : `Any ${s.anyK ?? '?'} of ${s.tasks.length}`],
    ['Missions', String(s.tasks.length)],
    ['Deadline', fmtDuration(s.deadline)],
    ['Entrants / prize places', `${fmtNumber(s.entrants)} / ${fmtNumber(s.prizePlaces)}`],
    ['Status', r.ok ? (r.illustrative ? 'Computed (illustrative inputs)' : 'Computed') : `Blocked: ${r.missing.length} missing, ${r.errors.length} errors`],
  ];
  if (r.ok && u) {
    rows.push([`P(individual finish by deadline)${r.units.length > 1 ? ` · ${u.name}` : ''}`, fmtPercent(u.pByDeadline)]);
    rows.push(['Individual median', fmtDuration(u.median)]);
    rows.push(['P(all places filled by deadline)', u.first ? fmtPercent(u.first.pAllClaimed) : 'Missing data']);
    rows.push(['Median final-prize time', u.first ? fmtDuration(u.first.finalPrize.median) : 'Missing data']);
  }
  return rows;
}

export function CompareScenarios() {
  const { saved, current, setCurrent, setSaved, toast } = useApp();
  const options = [{ id: '__current', s: current }, ...saved.map((s) => ({ id: s.id, s }))];
  const [a, setA] = useState('__current');
  const [b, setB] = useState(saved[0]?.id ?? '__current');
  const sa = options.find((o) => o.id === a)?.s ?? current;
  const sb = options.find((o) => o.id === b)?.s ?? current;
  const ra = useMemo(() => evaluateScenario(sa), [sa]);
  const rb = useMemo(() => evaluateScenario(sb), [sb]);
  const ma = metrics(sa, ra);
  const mb = metrics(sb, rb);
  const missionKey = (t: Scenario['tasks'][number]) => `${GAME_BY_ID[t.game].name} · ${t.label || describeTask(t)}`;
  const ka = new Set(sa.tasks.map(missionKey));
  const kb = new Set(sb.tasks.map(missionKey));
  const allMissions = [...new Set([...ka, ...kb])];

  return (
    <article className="card" id="compare">
      <div className="card-head">
        <div className="stack-sm">
          <h3>Saved scenarios and comparison</h3>
          <span className="small muted">{saved.length ? `${saved.length} saved in this browser.` : 'Nothing saved yet. Use “Save scenario” above.'}</span>
        </div>
        <Badge kind="proposed">Proposed designs</Badge>
      </div>
      {saved.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Origin</th>
                <th className="num">Missions</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {saved.map((x) => (
                <tr key={x.id} className={x.id === current.id ? 'hl' : undefined}>
                  <td>{x.name}</td>
                  <td className="small muted">{x.origin}</td>
                  <td className="num">{x.tasks.length}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="small" onClick={() => { setCurrent(structuredClone(x)); toast(`Loaded “${x.name}”.`); }}>
                        Load
                      </button>
                      <button className="danger small" onClick={() => setSaved(saved.filter((y) => y.id !== x.id))}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <SelectField label="Scenario A" value={a} onChange={setA} options={options.map((o) => ({ value: o.id, label: o.id === '__current' ? `Current: ${o.s.name}` : o.s.name }))} />
        <SelectField label="Scenario B" value={b} onChange={setB} options={options.map((o) => ({ value: o.id, label: o.id === '__current' ? `Current: ${o.s.name}` : o.s.name }))} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>A · {sa.name}</th>
              <th>B · {sb.name}</th>
            </tr>
          </thead>
          <tbody>
            {ma.map(([k, v], i) => (
              <tr key={k} className={mb[i] && mb[i][1] !== v ? 'changed' : undefined}>
                <td className="small muted">{k}</td>
                <td className="num small">{v}</td>
                <td className="num small">{mb.find((x) => x[0] === k)?.[1] ?? '—'}</td>
              </tr>
            ))}
            {allMissions.map((m) => (
              <tr key={m} className={ka.has(m) && kb.has(m) ? undefined : ka.has(m) ? 'removed' : 'added'}>
                <td className="small muted">Mission</td>
                <td className="small">{ka.has(m) ? m : '—'}</td>
                <td className="small">{kb.has(m) ? m : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">Model outputs for comparison of designs only. Amber rows differ; red missions appear only in A, green only in B.</p>
    </article>
  );
}
