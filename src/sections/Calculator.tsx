import { useMemo, useState } from 'react';
import { CAMPAIGN_GAMES, GAME_BY_ID, type GameId } from '../data/games';
import { requiredProbability } from '../math/binomial';
import {
  DEFAULT_DEFINITION,
  calcAccumulate,
  calcCount,
  calcMultiplier,
  curvePoints,
  parseOutcomes,
  type AccumulateDefinition,
  type ProbabilitySource,
} from '../math/calculators';
import { atLeastK } from '../math/campaign';
import { fmtDuration, fmtHours, fmtNumber, fmtPercent } from '../math/format';
import { DurationBars, ProbabilityChart } from '../components/charts';
import { Badge, NumberField, Notice, PercentField, SectionHead, Segmented, SelectField, Stat } from '../components/ui';

type Tab = 'count' | 'multiplier' | 'accumulate' | 'examples';

function StatusNotes({ status, messages }: { status: string; messages: string[] }) {
  if (!messages.length) return null;
  const tone = status === 'missing' ? 'block' : status === 'invalid' ? 'block' : status === 'impossible' || status === 'no-progress' ? 'block' : 'info';
  return (
    <Notice tone={tone}>
      <ul className="clean">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </Notice>
  );
}

// ---------------------------------------------------------------- A
function CountCalc() {
  const [target, setTarget] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [unit, setUnit] = useState<'rounds' | 'bets'>('rounds');
  const [bpr, setBpr] = useState<number | null>(null);
  const [delay, setDelay] = useState<number | null>(0);
  const [active, setActive] = useState<number | null>(null);
  const res = calcCount({ target, rate, unit, betsPerRound: bpr, startDelay: delay, activeFraction: active == null ? null : active / 100 });
  return (
    <div className="split">
      <div className="card">
        <h3>A · Qualifying-round count</h3>
        <div className="formula">T = start delay + N / (r × bets per round × active fraction)</div>
        <Segmented label="Counting unit" value={unit} onChange={setUnit} options={[{ value: 'rounds', label: 'Count rounds' }, { value: 'bets', label: 'Count individual bets' }]} />
        <div className="form-grid">
          <NumberField id="ca-n" label={`Target ${unit} N`} value={target} onChange={setTarget} required />
          <NumberField id="ca-r" label="Qualifying rounds / min r" value={rate} onChange={setRate} required suffix="/min" />
          {unit === 'bets' && <NumberField id="ca-b" label="Bets per round" value={bpr} onChange={setBpr} required hint="Some games allow more than one bet per round." />}
          <NumberField id="ca-d" label="Start delay" value={delay} onChange={setDelay} suffix="min" />
          <NumberField id="ca-f" label="Active-play fraction" value={active} onChange={setActive} suffix="%" hint="Optional. Share of time the player is actively playing." />
        </div>
        <p className="tiny muted">Blank fields are missing data. No round speeds are pre-filled.</p>
      </div>
      <div className="card">
        <div className="row-between">
          <h3>Result</h3>
          {res.status === 'ok' || res.status === 'complete' ? <Badge kind="calculated" /> : <Badge kind="missing">{res.status === 'missing' ? 'Missing data' : 'Cannot compute'}</Badge>}
        </div>
        <StatusNotes status={res.status} messages={res.messages} />
        {res.minutes != null && (
          <>
            <div className="stats">
              <Stat k="Completion time" v={fmtDuration(res.minutes)} s={`${fmtNumber(res.minutes, 2)} minutes · ${fmtHours(res.minutes)}`} />
              {res.effectiveRate != null && <Stat k={`Effective ${unit} / min`} v={fmtNumber(res.effectiveRate, 2)} small />}
            </div>
            <p className="small muted">Deterministic estimate under the supplied constant rate. Real players pause, switch games and vary their speed.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- B
interface MultState {
  game: GameId;
  config: string;
  threshold: number | null;
  condition: 'gte' | 'eq';
  k: number | null;
  p: number | null;
  rate: number | null;
  deadline: number | null;
  canProduce: 'yes' | 'no' | 'unknown';
  source: ProbabilitySource;
  illustrative: boolean;
}

const EMPTY_MULT: MultState = { game: 'keno', config: '', threshold: null, condition: 'gte', k: null, p: null, rate: null, deadline: 300, canProduce: 'unknown', source: 'measured', illustrative: false };

function MultiplierCalc({ state, setState }: { state: MultState; setState: (s: MultState) => void }) {
  const set = <K extends keyof MultState>(k: K, v: MultState[K]) => setState({ ...state, [k]: v, illustrative: k === 'source' ? v === 'illustrative' : state.illustrative });
  const res = calcMultiplier({ threshold: state.threshold, condition: state.condition, k: state.k, p: state.p, rate: state.rate, deadline: state.deadline, canProduce: state.canProduce });
  const horizon = useMemo(() => {
    if (!res.model || state.deadline == null) return 300;
    const p90 = res.p90Minutes ?? state.deadline;
    return Math.max(state.deadline * 1.25, Math.min(Number.isFinite(p90) ? p90 * 1.15 : state.deadline * 2, state.deadline * 8));
  }, [res.model, res.p90Minutes, state.deadline]);
  const points = res.model ? curvePoints(res.model, horizon, 200) : [];
  const n = res.attemptsByDeadline;
  const needed90 = n != null && state.k != null && state.k > 0 && n >= state.k ? requiredProbability(state.k, n, 0.9) : null;
  const ok = res.status === 'ok' || res.status === 'deterministic';
  return (
    <div className="split">
      <div className="card">
        <div className="row-between">
          <h3>B · Repeated qualifying multiplier</h3>
          {state.illustrative && <Badge kind="assumption">Illustrative scenario loaded</Badge>}
        </div>
        <div className="formula">P(finish by t) = P(Binomial(⌊r·t⌋, p) ≥ k) · mean time = k / (r·p)</div>
        <div className="form-grid">
          <SelectField id="cb-game" label="Game" value={state.game} onChange={(v) => set('game', v)} options={[...CAMPAIGN_GAMES, 'generic' as GameId].map((g) => ({ value: g, label: GAME_BY_ID[g].name }))} />
          <label className="field" htmlFor="cb-config">
            <span className="lbl">Game configuration</span>
            <input id="cb-config" value={state.config} placeholder="e.g. 10 picks, medium risk" onChange={(e) => set('config', e.target.value)} />
          </label>
          <NumberField id="cb-th" label="Threshold multiplier" value={state.threshold} onChange={(v) => set('threshold', v)} suffix="×" required />
          <SelectField id="cb-cond" label="Condition" value={state.condition} onChange={(v) => set('condition', v)} options={[{ value: 'gte', label: '≥ at least' }, { value: 'eq', label: '= exactly' }]} />
          <NumberField id="cb-k" label="Required successes k" value={state.k} onChange={(v) => set('k', v)} required />
          <PercentField id="cb-p" label="Probability per attempt p" value={state.p} onChange={(v) => set('p', v)} required hint="Enter as a percentage: 0.5 means 0.5% = 0.005." />
          <NumberField id="cb-r" label="Attempts per minute r" value={state.rate} onChange={(v) => set('rate', v)} suffix="/min" required />
          <NumberField id="cb-t" label="Time limit t" value={state.deadline} onChange={(v) => set('deadline', v)} suffix="min" required hint="300 minutes = 5 hours" />
          <SelectField
            id="cb-src"
            label="Probability source"
            value={state.source}
            onChange={(v) => set('source', v)}
            options={[
              { value: 'measured', label: 'Measured (telemetry)' },
              { value: 'documented', label: 'Documented (game spec)' },
              { value: 'illustrative', label: 'Illustrative' },
            ]}
          />
          <SelectField
            id="cb-can"
            label="Configuration can produce threshold?"
            value={state.canProduce}
            onChange={(v) => set('canProduce', v)}
            options={[
              { value: 'unknown', label: 'Not verified' },
              { value: 'yes', label: 'Yes, verified' },
              { value: 'no', label: 'No: impossible' },
            ]}
          />
        </div>
        {state.condition === 'eq' && <Notice tone="warn">“Exactly” and “at least” have different probabilities. Make sure p was measured for the same condition.</Notice>}
        <p className="tiny muted">Do not infer p from RTP, and do not assume a 30× result happens once every 30 bets.</p>
        <div className="row">
          <button className="ghost small" onClick={() => setState(EMPTY_MULT)}>
            Clear inputs
          </button>
        </div>
      </div>
      <div className="card">
        <div className="row-between">
          <h3>Result</h3>
          <div className="row">
            {ok && <Badge kind="calculated" />}
            {ok && state.source === 'illustrative' && <Badge kind="assumption" />}
            {res.status === 'missing' && <Badge kind="missing" />}
          </div>
        </div>
        <StatusNotes status={res.status} messages={res.messages} />
        {ok && (
          <>
            <div className="stats">
              <Stat k="P(finish by deadline)" v={fmtPercent(res.pByDeadline)} s={`${fmtNumber(n)} attempts in ${fmtDuration(state.deadline)}`} />
              <Stat k="Mean time" v={fmtDuration(res.meanMinutes)} s={`${fmtNumber(res.meanAttempts, 1)} attempts expected`} />
              <Stat k="Median" v={fmtDuration(res.medianMinutes)} />
              <Stat k="90th percentile" v={fmtDuration(res.p90Minutes)} />
            </div>
            <ProbabilityChart
              horizon={horizon}
              deadline={state.deadline ?? undefined}
              yLabel="P(player finished)"
              series={[{ name: 'Completion probability', color: 'var(--sim)', points }]}
              markers={[
                { t: res.medianMinutes!, label: 'median', color: 'var(--violet)' },
                { t: res.p90Minutes!, label: '90th percentile', color: 'var(--warn)' },
              ]}
            />
            {needed90 != null && (
              <p className="small">
                For a 90% chance of {state.k} successes within {fmtDuration(state.deadline)} at {state.rate} attempts/min, each attempt needs p ≈{' '}
                <strong className="num">{fmtPercent(needed90, 4)}</strong>.
              </p>
            )}
            <dl className="kv">
              <dt>Input provenance</dt>
              <dd>
                p: {state.source}; r: as entered; game: {GAME_BY_ID[state.game].name}
                {state.config ? ` (${state.config})` : ' (configuration not specified)'}
              </dd>
              <dt>Model</dt>
              <dd>Independent attempts at a constant rate. Quantiles use total attempts = failures before the k-th success + k.</dd>
            </dl>
            {res.meanMinutes != null && state.deadline != null && Math.abs(res.meanMinutes - state.deadline) / state.deadline < 0.05 && (
              <Notice tone="warn">The mean is close to the deadline, but only about {fmtPercent(res.pByDeadline, 0)} of players finish by it. A mean is not a guarantee.</Notice>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- C
const DEF_LABELS: { key: keyof AccumulateDefinition; label: string }[] = [
  { key: 'includesStake', label: 'Payout includes the returned stake (unchecked: count net win only)' },
  { key: 'countBelowOne', label: 'Returns below 1× count toward the sum' },
  { key: 'losingZero', label: 'Losing bets contribute zero' },
  { key: 'betsSeparate', label: 'Multiple bets within one round count separately' },
  { key: 'excludeVoid', label: 'Void / refunded bets are excluded' },
];

function AccumulateCalc() {
  const [target, setTarget] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<number | null>(300);
  const [mode, setMode] = useState<'mean' | 'distribution'>('mean');
  const [mu, setMu] = useState<number | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [dist, setDist] = useState('');
  const [def, setDef] = useState<AccumulateDefinition>(DEFAULT_DEFINITION);
  const [samples, setSamples] = useState<number | null>(10000);
  const [seed, setSeed] = useState<number | null>(12345);
  const parsed = parseOutcomes(dist);
  const res = useMemo(
    () =>
      parsed.errors.length && mode === 'distribution'
        ? { status: 'invalid' as const, messages: parsed.errors }
        : calcAccumulate({ target, rate, mode, mu, outcomes: parsed.outcomes, cap, definition: def, deadline, samples: samples ?? 10000, seed: seed ?? 1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, rate, mode, mu, dist, cap, def, deadline, samples, seed],
  );
  const r = res as ReturnType<typeof calcAccumulate>;
  const horizon = deadline ? Math.max(deadline * 1.25, Math.min((r.p90Minutes ?? deadline) * 1.15, deadline * 8)) : 300;
  return (
    <div className="split">
      <div className="card">
        <h3>C · Accumulated multipliers</h3>
        <div className="formula">{mode === 'mean' ? 'Rough planning time ≈ S / (r × μ)' : 'Simulate rounds until counted sum ≥ S (seeded)'}</div>
        <Segmented label="Input mode" value={mode} onChange={setMode} options={[{ value: 'mean', label: 'Average contribution only' }, { value: 'distribution', label: 'Full outcome distribution' }]} />
        <div className="form-grid">
          <NumberField id="cc-s" label="Target sum S" value={target} onChange={setTarget} suffix="×" required />
          <NumberField id="cc-r" label="Qualifying rounds / min r" value={rate} onChange={setRate} suffix="/min" required />
          <NumberField id="cc-t" label="Deadline" value={deadline} onChange={setDeadline} suffix="min" />
          <NumberField id="cc-cap" label="Contribution cap per round" value={cap} onChange={setCap} suffix="×" />
          {mode === 'mean' && <NumberField id="cc-mu" label="Average counted contribution μ" value={mu} onChange={setMu} suffix="×" required />}
          {mode === 'distribution' && (
            <>
              <NumberField id="cc-n" label="Simulated players" value={samples} onChange={setSamples} />
              <NumberField id="cc-seed" label="Random seed" value={seed} onChange={setSeed} />
            </>
          )}
        </div>
        {mode === 'distribution' && (
          <label className="field" htmlFor="cc-dist">
            <span className="lbl">Outcome distribution: one “multiplier: probability” per line (probabilities must sum to 100%)</span>
            <textarea id="cc-dist" rows={6} value={dist} placeholder={'0: 55%\n1.5: 30%\n5: 15%'} onChange={(e) => setDist(e.target.value)} />
          </label>
        )}
        <fieldset className="stack-sm" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}>
          <legend className="small muted">Definition of the counted multiplier (confirm with the game team)</legend>
          {DEF_LABELS.map((d) => (
            <label key={d.key} className="check">
              <input type="checkbox" checked={def[d.key]} onChange={(e) => setDef({ ...def, [d.key]: e.target.checked })} />
              {d.label}
            </label>
          ))}
          <span className="tiny muted">The last two choices change how telemetry is counted; they do not change this simulation, which models one bet per draw.</span>
        </fieldset>
      </div>
      <div className="card">
        <div className="row-between">
          <h3>Result</h3>
          {r.status === 'ok' && (r.approximate ? <Badge kind="assumption">Rough approximation</Badge> : <Badge kind="calculated">Simulated</Badge>)}
          {r.status === 'missing' && <Badge kind="missing" />}
        </div>
        <StatusNotes status={r.status} messages={r.messages} />
        {r.status === 'ok' && r.approximate && (
          <div className="stats">
            <Stat k="Planning time (rough)" v={fmtDuration(r.planningMinutes)} s="No percentiles from a mean alone" />
          </div>
        )}
        {r.status === 'ok' && !r.approximate && (
          <>
            <div className="stats">
              <Stat k="Mean time" v={fmtDuration(r.meanMinutes)} s={`± ${fmtNumber((r.meanSE ?? 0) * 1.96, 2)} min (95% MC error)`} />
              <Stat k="Median" v={fmtDuration(r.medianMinutes)} />
              <Stat k="90th percentile" v={fmtDuration(r.p90Minutes)} />
              {r.pByDeadline != null && (
                <Stat k="P(finish by deadline)" v={fmtPercent(r.pByDeadline)} s={`95% CI ${fmtPercent(r.pByDeadlineCI![0])} – ${fmtPercent(r.pByDeadlineCI![1])}`} />
              )}
            </div>
            <p className="tiny muted">
              Sample size {fmtNumber(r.samples)} · seed {r.seed} · mean counted contribution {fmtNumber(r.meanContribution, 4)}× per round. Same inputs and seed give the
              same result.
            </p>
            <ProbabilityChart horizon={horizon} deadline={deadline ?? undefined} yLabel="P(player finished)" series={[{ name: 'Simulated completion', color: 'var(--violet)', points: curvePoints(r.model!, horizon, 160) }]} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Examples
const KENO_PS = [0.001, 0.003, 0.005, 0.02 / 3, 0.01];

function Examples({ loadKeno }: { loadKeno: (p: number) => void }) {
  const rows = KENO_PS.map((p) => ({ p, r: calcMultiplier({ threshold: 30, condition: 'gte', k: 20, p, rate: 10, deadline: 300, canProduce: 'unknown' }) }));
  const tasks = [40, 25, 30, 20, 45, 35];
  const colors = ['var(--sim)', 'var(--violet)', 'var(--ok)', 'var(--warn)', 'var(--aviator)', 'var(--internal)'];
  return (
    <div className="stack">
      <Notice tone="warn">
        Every number on this tab is an <strong>illustrative assumption</strong> used to check the calculations. None of it is a SPRIBE game parameter.
      </Notice>
      <div className="grid g2">
        <article className="card">
          <div className="row-between">
            <h3>Keno-style example</h3>
            <Badge kind="assumption" />
          </div>
          <p className="small muted">k = 20 successes · r = 10 attempts/min · deadline 300 min · 3,000 attempts.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">p per attempt</th>
                  <th className="num">Mean time</th>
                  <th className="num">P(done by 5 h)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, r }) => (
                  <tr key={p}>
                    <td className="num">{fmtPercent(p, p === 0.02 / 3 ? 7 : 2)}</td>
                    <td className="num">{fmtHours(r.meanMinutes!)}</td>
                    <td className="num">{fmtPercent(r.pByDeadline, 2)}</td>
                    <td>
                      <button className="small sim" onClick={() => loadKeno(p)}>
                        Load
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">
            A five-hour mean (p ≈ 0.6667%) gives only about 53% completion by five hours. About <strong className="num">{fmtPercent(requiredProbability(20, 3000, 0.9), 4)}</strong> per
            attempt is needed for a 90% chance.
          </p>
        </article>
        <article className="card">
          <div className="row-between">
            <h3>Six mandatory tasks</h3>
            <Badge kind="assumption">Independence assumed</Badge>
          </div>
          <div className="stats">
            <Stat k="Six tasks at 90% each" v={fmtPercent(atLeastK(Array(6).fill(0.9), 6), 4)} s="0.9⁶ combined completion" />
            <Stat k="Each task for 90% combined" v={fmtPercent(Math.pow(0.9, 1 / 6), 4)} s="0.9^(1/6)" />
          </div>
          <p className="small muted">Independence between tasks is a model assumption. Shared player behaviour (stopping early, budget) usually correlates tasks.</p>
          <hr className="divider" />
          <h4>Round-count arithmetic for a 30-minute target</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Rounds / min</th>
                  <th className="num">Target rounds</th>
                </tr>
              </thead>
              <tbody>
                {[2, 5, 10, 20].map((r) => (
                  <tr key={r}>
                    <td className="num">{r}</td>
                    <td className="num">{r * 30}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
      <article className="card">
        <div className="row-between">
          <h3>Parallel versus sequential duration</h3>
          <Badge kind="assumption" />
        </div>
        <p className="small muted">Task times 40, 25, 30, 20, 45 and 35 minutes. Assumes concurrency does not reduce individual speeds.</p>
        <div className="grid g2">
          <div className="stack-sm">
            <Stat k="Fully parallel" v="45 min" s="max of task times" small />
            <DurationBars mode="parallel" items={tasks.map((m, i) => ({ label: `Task ${i + 1}`, minutes: m, color: colors[i] }))} />
          </div>
          <div className="stack-sm">
            <Stat k="Sequential" v="195 min" s="sum of task times" small />
            <DurationBars mode="sequential" items={tasks.map((m, i) => ({ label: `Task ${i + 1}`, minutes: m, color: colors[i] }))} />
          </div>
        </div>
      </article>
    </div>
  );
}

export function Calculator() {
  const [tab, setTab] = useState<Tab>('multiplier');
  const [mult, setMult] = useState<MultState>(EMPTY_MULT);
  const loadKeno = (p: number) => {
    setMult({ game: 'generic', config: 'Illustrative Keno-style example', threshold: 30, condition: 'gte', k: 20, p, rate: 10, deadline: 300, canProduce: 'unknown', source: 'illustrative', illustrative: true });
    setTab('multiplier');
  };
  return (
    <section className="section" id="calculator">
      <SectionHead id="calculator" n={4} title="Mission calculator">
        Estimate a single mission’s completion time for one player. Every input starts blank: enter measured or documented values, or load the clearly labelled
        illustrative scenario.
      </SectionHead>
      <div className="row-between">
        <Segmented
          label="Calculator"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'count', label: 'A · Round count' },
            { value: 'multiplier', label: 'B · Repeated multiplier' },
            { value: 'accumulate', label: 'C · Accumulated multipliers' },
            { value: 'examples', label: 'Verified examples' },
          ]}
        />
        <button className="sim" onClick={() => loadKeno(0.005)}>
          Illustrative scenario
        </button>
      </div>
      <div hidden={tab !== 'count'}>
        <CountCalc />
      </div>
      <div hidden={tab !== 'multiplier'}>
        <MultiplierCalc state={mult} setState={setMult} />
      </div>
      <div hidden={tab !== 'accumulate'}>
        <AccumulateCalc />
      </div>
      <div hidden={tab !== 'examples'}>
        <Examples loadKeno={loadKeno} />
      </div>
    </section>
  );
}
