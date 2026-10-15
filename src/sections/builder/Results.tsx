import { modelCdf } from '../../math/calculators';
import type { Scenario, ScenarioResult, UnitResult } from '../../math/campaign';
import { fmtClock, fmtDuration, fmtNumber, fmtPercent } from '../../math/format';
import { GAME_BY_ID } from '../../data/games';
import { resultForDay } from '../../data/previousCampaign';
import { ProbabilityChart } from '../../components/charts';
import { Badge, Notice, Stat } from '../../components/ui';

export function horizonFor(units: UnitResult[], deadline: number): number {
  const p90 = Math.max(...units.map((u) => (Number.isFinite(u.p90) ? u.p90 : 0)));
  return Math.max(deadline * 1.25, Math.min(p90 * 1.15, deadline * 6));
}

export const SHARED_ROUND_LIMITATION =
  'Illustrative independent-player model. Players in the same Aviator round share one crash outcome, and multiple bets in one shared round are not independent outcomes, so real finishers are correlated. This is not a validated shared-round forecast.';

function UnitBlock({ unit, horizon }: { unit: UnitResult; horizon: number }) {
  const pts = (f: (t: number) => number) => Array.from({ length: 181 }, (_, i) => ({ t: (horizon * i) / 180, y: f((horizon * i) / 180) }));
  const series = [{ name: 'Individual completion F(t)', color: 'var(--sim)', points: pts(unit.dist.cdf) }];
  if (unit.first) series.push({ name: 'P(all prize places claimed by t)', color: 'var(--aviator)', points: pts(unit.first.finalPrizeCdf) });
  const ff = unit.first;
  return (
    <div className="stack">
      {unit.name !== 'Whole campaign' && (
        <div className="row-between">
          <h4>{unit.name}</h4>
          <span className="tiny muted num">
            window {fmtClock(unit.window[0])} – {fmtClock(unit.window[1])}
          </span>
        </div>
      )}
      <div className="stats">
        <Stat k="Individual: P(finish by deadline)" v={fmtPercent(unit.pByDeadline)} s={unit.dist.method === 'monte-carlo' ? `${fmtNumber(unit.dist.samples)} simulated players, seed ${unit.dist.seed}` : 'Exact under the model'} />
        <Stat k="Individual median finish" v={fmtDuration(unit.median)} s="after event start" />
        <Stat k="Individual 90th pct" v={fmtDuration(unit.p90)} />
      </div>
      <div id="builder-first" className="stack-sm">
        <div className="row-between">
          <h4>First-finisher analysis</h4>
          <div className="row">
            <Badge kind="calculated" />
            <Badge kind="assumption">Independent players</Badge>
          </div>
        </div>
        {!ff ? (
          <Notice tone="block">
            Missing data: {unit.firstMissing.join(', ') || 'prize places for this unit'}. Final-prize timing is not shown until these are entered.
          </Notice>
        ) : (
          <>
            <div className="stats">
              <Stat k="Share of entrants needed" v={fmtPercent(ff.shareNeeded, 1)} s={`${fmtNumber(ff.places)} prizes / ${fmtNumber(ff.entrants)} entrants`} />
              <Stat k="Expected finishers by deadline" v={fmtNumber(ff.expectedFinishers, 1)} />
              <Stat k="P(all places filled by deadline)" v={fmtPercent(ff.pAllClaimed)} />
              <Stat k="P(prizes left unclaimed)" v={fmtPercent(ff.pUnclaimed)} />
            </div>
            <div className="stats">
              <Stat k="Final-prize time · median" v={fmtDuration(ff.finalPrize.median)} s="K-th valid finisher" small />
              <Stat k="Final-prize time · 10–90%" v={`${fmtDuration(ff.finalPrize.p10)} – ${fmtDuration(ff.finalPrize.p90)}`} small />
            </div>
            {ff.note && <Notice tone="warn">{ff.note}</Notice>}
            {Number.isFinite(ff.finalPrize.median) && ff.finalPrize.median < unit.median && (
              <p className="small">
                The last prize is likely claimed at about <strong>{fmtDuration(ff.finalPrize.median)}</strong>, while the median player would need{' '}
                <strong>{fmtDuration(unit.median)}</strong>. Most players cannot win once places are exhausted.
              </p>
            )}
            {unit.dist.method === 'monte-carlo' && ff.places / Math.max(1, ff.entrants) < 20 / (unit.dist.samples ?? 1) && (
              <Notice tone="warn">Prize share is below the simulation’s resolution. Increase simulated players for a stable final-prize estimate.</Notice>
            )}
          </>
        )}
        <div className="limitation">{SHARED_ROUND_LIMITATION}</div>
      </div>
      <ProbabilityChart horizon={horizon} deadline={unit.window[1]} series={series} yLabel="Probability" />
    </div>
  );
}

function Baseline({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  const r = scenario.baselineDay != null ? resultForDay(scenario.baselineDay) : undefined;
  if (!r) return null;
  const model = result.ok ? result.units[0]?.first : undefined;
  return (
    <div className="card tight flat">
      <div className="row-between">
        <h4>Reported Day {r.day} outcome</h4>
        <Badge kind="internal" />
      </div>
      <p className="small">
        {r.started} players started a task · {r.winners} winners ·{' '}
        {r.winners > 0 ? `last prize at ${fmtDuration(r.durationMin)} (reported duration)` : `no winners in ${fmtDuration(r.durationMin)}`} · least completed: {r.least.reported} (
        {r.least.completed})
      </p>
      {model ? (
        <p className="small">
          Model median final-prize time: <strong>{fmtDuration(model.finalPrize.median)}</strong> vs reported <strong>{r.winners > 0 ? fmtDuration(r.durationMin) : 'never'}</strong>. A
          large gap means the entered rates or probabilities do not match how Day {r.day} played out.
        </p>
      ) : (
        <p className="tiny muted">Enter the missing game parameters to compare the model with this outcome.</p>
      )}
    </div>
  );
}

export function Results({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  if (!result.ok) {
    return (
      <div className="stack">
        <Baseline scenario={scenario} result={result} />
        {result.errors.length > 0 && (
          <Notice tone="block">
            <strong>Fix these inputs:</strong>
            <ul className="clean">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
        {result.missing.length > 0 && (
          <div className="stack-sm">
            <div className="row">
              <Badge kind="missing" />
              <span className="small">No completion estimate is shown until every required input is supplied. Missing values are never filled with defaults.</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mission</th>
                    <th>Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {result.missing.map((m) => (
                    <tr key={m.taskId}>
                      <td className="small">{m.label}</td>
                      <td className="small" style={{ color: 'var(--block)' }}>
                        {m.items.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">
              Source these from telemetry (see <a href="#data">Data needed</a>) or from game documentation.
            </p>
          </div>
        )}
      </div>
    );
  }
  const horizon = horizonFor(result.units, scenario.deadline);
  return (
    <div className="stack">
      <div className="row">
        <Badge kind="calculated" />
        {result.illustrative && <Badge kind="assumption">Uses illustrative inputs</Badge>}
        {result.approximate && <Badge kind="assumption">Includes rough approximations</Badge>}
        <span className="badge neutral plain">{result.method === 'exact' ? 'Exact (independence model)' : 'Monte Carlo simulation'}</span>
      </div>
      <Baseline scenario={scenario} result={result} />
      {result.impossible && <Notice tone="block">At least one mission cannot be completed with these inputs. Under “all tasks required”, nobody can finish.</Notice>}
      <p className="small muted">Simulated model output, not actual SPRIBE performance.</p>
      {result.units.map((u) => (
        <div key={u.name} className="card flat">
          <UnitBlock unit={u} horizon={horizon} />
        </div>
      ))}
      <details>
        <summary>Per-mission breakdown</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Mission</th>
                <th className="num">Effective rate</th>
                <th className="num">P(done by deadline)*</th>
              </tr>
            </thead>
            <tbody>
              {result.tasks.map((e) => (
                <tr key={e.task.id}>
                  <td className="small">{GAME_BY_ID[e.task.game].name}</td>
                  <td className="small">{e.task.label}</td>
                  <td className="num small">{e.effectiveRate != null ? `${fmtNumber(e.effectiveRate, 2)}/min` : '—'}</td>
                  <td className="num small">{e.model ? fmtPercent(modelCdf(e.model, scenario.deadline)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">* Single mission started at T+0, ignoring stages and start spread.</p>
      </details>
      <div className="stack-sm">
        <span className="eyebrow">Model assumptions</span>
        <ul className="clean small">
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
