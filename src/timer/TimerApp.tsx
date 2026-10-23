import { useEffect, useMemo, useState } from 'react';
import { DAY_RESULTS } from '../data/previousCampaign';
import type { GameId } from '../data/games';
import { gameMap, missionChance, type SimMission } from '../sim/engine';
import { SIM_GAMES, chanceAtLeast, fmtX, oneIn } from '../sim/games';
import { simMissionsForDay } from '../sim/days';
import { AVIATOR_SOURCES, DEFAULT_CLOCK, chanceAtLeastHits, clockBounds, flightSec, hitsPerHour, meanRoundSec, roundsPerHour, type AviatorClock } from './clock';
import { FIT_DAYS, playersForDay } from './days';
import { goneByCurve, simulateDay, suggestTarget, type Suggestion, type TimerResult, type TimerSettings } from './model';

/** Pace of the non-Aviator games fitted to Days 1–5 and 7 with two Aviator bets a round (see model.test.ts). */
export const FITTED_SPEED = 2;

const GAMES = gameMap(SIM_GAMES);
const START = '19:00';
const WINDOW_MIN = 299; // 19:00–23:59 UTC
const THRESHOLDS = [10, 15, 20, 30];

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
function clockAt(startMin: number, m: number): string {
  if (!Number.isFinite(m)) return 'after close';
  const t = Math.round(startMin + m) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
function dur(m: number): string {
  if (!Number.isFinite(m)) return 'never';
  const r = Math.round(m);
  return r < 60 ? `${r}m` : `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, '0')}m`;
}
function describe(m: SimMission): string {
  const n = GAMES[m.game].name;
  if (m.kind === 'catch') return `${n}: catch ${m.threshold}× or more ${m.target} times`;
  if (m.kind === 'collect') return `${n}: collect ${m.target}× in total`;
  return `${n}: place ${m.target} bets`;
}

type Verdict = 'early' | 'ontime' | 'late' | 'left';
const VERDICT_TEXT: Record<Verdict, string> = { early: 'Too early', ontime: 'On time', late: 'Late', left: 'Prizes left over' };

export default function TimerApp() {
  const [day, setDay] = useState<number | 'custom'>(7);
  const [missions, setMissions] = useState<SimMission[]>(simMissionsForDay(7));
  const [players, setPlayers] = useState(playersForDay(7));
  const [prizes, setPrizes] = useState(50);
  const [target, setTarget] = useState('23:00');
  const [tol, setTol] = useState(30);
  const [bets, setBets] = useState<1 | 2>(2);
  const [clock, setClock] = useState<AviatorClock>(DEFAULT_CLOCK);
  const [result, setResult] = useState<TimerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null | 'none'>(null);
  const [backtest, setBacktest] = useState<{ day: number; reported: number; r: TimerResult }[]>([]);

  const startMin = toMin(START);
  const targetMin = toMin(target) - startMin;
  const settings: TimerSettings = useMemo(
    () => ({ players, prizes, windowMin: WINDOW_MIN, betsPerRound: bets, clock, speed: FITTED_SPEED, spread: 0.5, runs: 300, seed: 7 }),
    [players, prizes, bets, clock],
  );

  useEffect(() => {
    setBusy(true);
    setSuggestion(null);
    const t = setTimeout(() => {
      setResult(missions.length ? simulateDay(missions, GAMES, settings) : null);
      setBusy(false);
    }, 60);
    return () => clearTimeout(t);
  }, [missions, settings]);

  useEffect(() => {
    const t = setTimeout(() => {
      setBacktest(
        FIT_DAYS.map((d) => ({
          day: d.day,
          reported: d.reportedMin,
          r: simulateDay(d.missions, GAMES, { ...settings, players: d.players, prizes: 50, runs: 200, seed: 21 }),
        })),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [settings]);

  const pickDay = (d: number) => {
    setDay(d);
    setMissions(simMissionsForDay(d));
    setPlayers(playersForDay(d));
    setPrizes(50);
  };
  const edit = (i: number, patch: Partial<SimMission>) => {
    setDay('custom');
    setMissions(missions.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  };

  let verdict: Verdict | null = null;
  if (result) {
    if (result.pAllGone < 0.5) verdict = 'left';
    else if (result.median < targetMin - tol) verdict = 'early';
    else if (result.median > targetMin + tol) verdict = 'late';
    else verdict = 'ontime';
  }
  const inBand = result ? result.runs.filter((r) => r.lastPrize != null && Math.abs(r.lastPrize - targetMin) <= tol).length / result.runs.length : 0;
  const avgWinners = result ? result.runs.reduce((a, r) => a + r.winners, 0) / result.runs.length : 0;
  const slow = result ? missions[result.slowest] : null;

  const findFix = () => {
    if (!result) return;
    setBusy(true);
    setTimeout(() => {
      setSuggestion(suggestTarget(missions, GAMES, settings, targetMin, result.slowest) ?? 'none');
      setBusy(false);
    }, 30);
  };

  const { slow: slowClock, fast: fastClock } = clockBounds(clock);
  const aviatorDays = DAY_RESULTS.filter((r) => r.winners > 0).map((r) => {
    const m = simMissionsForDay(r.day).find((x) => x.game === 'aviator')!;
    return {
      day: r.day,
      text: describe(m),
      reported: r.durationMin,
      one: chanceAtLeastHits(m.target, m.threshold ?? 1, r.durationMin, clock),
      two: chanceAtLeastHits(Math.ceil(m.target / 2), m.threshold ?? 1, r.durationMin, clock),
    };
  });

  return (
    <>
      <header className="t-top">
        <div className="t-wrap t-top-row">
          <span className="t-brand">
            Last Prize <b>Timer</b>
          </span>
          <nav className="t-nav" aria-label="Sections">
            <a href="#day">The day</a>
            <a href="#aviator">Aviator clock</a>
            <a href="#check">Check vs real days</a>
            <a href="#games">Other games</a>
          </nav>
        </div>
      </header>

      <main className="t-wrap t-main">
        <section className="t-hero">
          <p className="t-eyebrow">Daily window 19:00–23:59 UTC · {prizes} prizes</p>
          <h1>Will the last prize go at the right time?</h1>
          <div className={`t-verdict ${verdict ?? ''}`} aria-live="polite">
            <div className="t-verdict-main">
              <span className="t-chip">{busy && !result ? 'Working…' : verdict ? VERDICT_TEXT[verdict] : '—'}</span>
              <p className="t-big">
                {!result ? '—' : verdict === 'left' ? `${Math.round(avgWinners)} of ${prizes} won` : clockAt(startMin, result.median)}
                <small>{verdict === 'left' ? 'by 23:59 on a typical day' : 'last prize, typical day (UTC)'}</small>
              </p>
              <p className="t-sub">
                {result && verdict !== 'left' && (
                  <>
                    8 days in 10 between <b>{clockAt(startMin, result.p10)}</b> and <b>{Number.isFinite(result.p90) ? clockAt(startMin, result.p90) : 'the close with prizes left'}</b>. Your target is{' '}
                    <b>
                      {target} ± {tol} min
                    </b>
                    {verdict === 'early' && `: about ${dur(targetMin - result.median)} too early.`}
                    {verdict === 'late' && `: about ${dur(result.median - targetMin)} late.`}
                    {verdict === 'ontime' && '.'}
                  </>
                )}
                {result && verdict === 'left' && <>A task is too hard to finish in the window. Look at the slowest task below.</>}
              </p>
            </div>
            <dl className="t-facts">
              <div>
                <dt>Lands in your target window</dt>
                <dd>{result ? `${Math.round(inBand * 100)}%` : '—'}</dd>
              </div>
              <div>
                <dt>All {prizes} prizes go by 23:59</dt>
                <dd>{result ? `${Math.round(result.pAllGone * 100)}%` : '—'}</dd>
              </div>
              <div>
                <dt>Decided by</dt>
                <dd className="sm">{slow ? describe(slow) : '—'}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="day" className="t-section">
          <div className="t-head">
            <h2>The day</h2>
            <p className="t-muted">Start from a day of the 5–11 Oct campaign or change the tasks. Every player plays all tasks at once and wins when all are done.</p>
          </div>
          <div className="t-days" role="group" aria-label="Start from a day">
            {DAY_RESULTS.map((r) => (
              <button key={r.day} id={`day-${r.day}`} aria-pressed={day === r.day} onClick={() => pickDay(r.day)}>
                Day {r.day}
                <small>{r.winners === 0 ? '0 winners' : `real: ${clockAt(startMin, r.durationMin)}`}</small>
              </button>
            ))}
            <button aria-pressed={day === 'custom'} onClick={() => setDay('custom')}>
              My own
              <small>edit below</small>
            </button>
          </div>

          <div className="t-setup">
            <div className="t-card">
              <div className="t-row-between">
                <h3>Tasks</h3>
                <button id="add-task" className="t-btn" onClick={() => (setDay('custom'), setMissions([...missions, { game: 'mines', kind: 'bets', target: 100 }]))}>
                  + Add task
                </button>
              </div>
              <div className="t-tasks">
                {missions.map((m, i) => {
                  const g = GAMES[m.game];
                  const p = m.kind === 'catch' ? missionChance(m, g) : null;
                  return (
                    <div className="t-task" key={i}>
                      <select id={`game-${i}`} aria-label="Game" value={m.game} onChange={(e) => edit(i, { game: e.target.value as GameId })}>
                        {SIM_GAMES.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <select
                        id={`kind-${i}`}
                        aria-label="Task type"
                        value={m.kind}
                        onChange={(e) => edit(i, { kind: e.target.value as SimMission['kind'], threshold: e.target.value === 'catch' ? m.threshold ?? 20 : undefined })}
                      >
                        <option value="catch">Catch X× or more</option>
                        <option value="collect">Collect X× in total</option>
                        <option value="bets">Place bets</option>
                      </select>
                      {m.kind === 'catch' && (
                        <label className="t-inline">
                          <input id={`x-${i}`} type="number" min={1} value={m.threshold ?? ''} onChange={(e) => edit(i, { threshold: Number(e.target.value) || 1 })} />×
                        </label>
                      )}
                      <label className="t-inline">
                        {m.kind === 'catch' ? 'times' : m.kind === 'collect' ? 'total ×' : 'bets'}
                        <input id={`n-${i}`} type="number" min={1} value={m.target} onChange={(e) => edit(i, { target: Math.max(1, Number(e.target.value) || 1) })} />
                      </label>
                      {p != null && <span className={`t-odds ${p >= 0.03 ? 'ok' : p >= 0.005 ? 'mid' : 'bad'}`}>{p > 0 ? `${oneIn(p)} bets` : 'impossible'}</span>}
                      <button className="t-x" aria-label={`Remove ${describe(m)}`} onClick={() => (setDay('custom'), setMissions(missions.filter((_, j) => j !== i)))}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="t-card t-settings">
              <h3>Settings</h3>
              <label>
                <span>I want the last prize at (UTC)</span>
                <span className="t-pair">
                  <input id="target" type="time" value={target} min="19:00" max="23:59" onChange={(e) => setTarget(e.target.value || '23:00')} />
                  <span className="t-muted">±</span>
                  <input id="tol" type="number" min={5} max={120} step={5} value={tol} onChange={(e) => setTol(Math.max(5, Number(e.target.value) || 30))} />
                  <span className="t-muted">min</span>
                </span>
              </label>
              <label>
                <span>Players going for every task</span>
                <input id="players" type="number" min={1} value={players} onChange={(e) => setPlayers(Math.max(1, Number(e.target.value) || 1))} />
                <small className="t-muted">Real days: about 90–115 (players who started × 60%).</small>
              </label>
              <label>
                <span>Prizes</span>
                <input id="prizes" type="number" min={1} value={prizes} onChange={(e) => setPrizes(Math.max(1, Number(e.target.value) || 1))} />
              </label>
              <fieldset>
                <legend>Aviator bets per round</legend>
                <div className="t-seg">
                  {([1, 2] as const).map((b) => (
                    <button key={b} id={`bets-${b}`} aria-pressed={bets === b} onClick={() => setBets(b)}>
                      {b === 1 ? '1 bet' : '2 bets (real days)'}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          {result && (
            <div className="t-card">
              <div className="t-row-between">
                <h3>Chance the last prize has gone, by time</h3>
                <span className="t-muted t-small">{busy ? 'Updating…' : '300 simulated days'}</span>
              </div>
              <GoneChart result={result} startMin={startMin} targetMin={targetMin} tol={tol} />
              <h3>When the {prizes}th player finishes each task</h3>
              <TaskBars missions={missions} result={result} startMin={startMin} targetMin={targetMin} />
              <div className="t-fix">
                <p>
                  {slow && (
                    <>
                      <b>{describe(slow)}</b> decides the time on most simulated days.
                    </>
                  )}{' '}
                  {GAMES[slow?.game ?? 'aviator'].shared && slow
                    ? 'Aviator rounds are shared, so everyone who bets every round finishes this task at the same moment: the time depends on when the 30× rounds come, not on how many people play.'
                    : ''}
                </p>
                {suggestion === null && (
                  <button id="find-fix" className="t-btn primary" onClick={findFix} disabled={busy}>
                    Find the number that lands on {target}
                  </button>
                )}
                {suggestion === 'none' && <p className="t-muted">The current number is already the closest to {target}.</p>}
                {suggestion && suggestion !== 'none' && (
                  <div className="t-suggest">
                    <p>
                      Change <b>{describe(missions[suggestion.mission])}</b> to <b>{suggestion.to}</b> (from {suggestion.from}): last prize about{' '}
                      <b>{clockAt(startMin, suggestion.result.median)}</b>, 8 in 10 days {clockAt(startMin, suggestion.result.p10)}–{clockAt(startMin, suggestion.result.p90)}.
                    </p>
                    <button id="apply-fix" className="t-btn primary" onClick={() => edit(suggestion.mission, { target: suggestion.to })}>
                      Use {suggestion.to}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section id="aviator" className="t-section">
          <div className="t-head">
            <h2>The Aviator clock</h2>
            <p className="t-muted">
              Spribe does not publish round timing, so we built it from public measurements. A round is a betting countdown, a flight that grows the multiplier
              exponentially, and a short pause. With a 97% RTP the average flight works out to exactly 0.97 ÷ growth rate.
            </p>
          </div>
          <div className="t-tiles">
            <div className="t-tile">
              <span>Average round</span>
              <b>{meanRoundSec(clock).toFixed(1)} s</b>
              <small>
                range {meanRoundSec(fastClock).toFixed(0)}–{meanRoundSec(slowClock).toFixed(0)} s
              </small>
            </div>
            <div className="t-tile">
              <span>Rounds an hour</span>
              <b>{Math.round(roundsPerHour(clock))}</b>
              <small>
                range {Math.round(roundsPerHour(slowClock))}–{Math.round(roundsPerHour(fastClock))}
              </small>
            </div>
            <div className="t-tile">
              <span>30× is reached after</span>
              <b>{Math.round(flightSec(30, clock))} s</b>
              <small>of flight</small>
            </div>
            <div className="t-tile">
              <span>Rounds reaching 30× an hour</span>
              <b>{hitsPerHour(30, clock).toFixed(1)}</b>
              <small>1 in {Math.round(30 / clock.rtp)} rounds</small>
            </div>
          </div>
          <div className="t-split">
            <div className="t-card">
              <h3>Players used both bet slots</h3>
              <p className="t-muted t-small">
                Chance the Aviator task was done by the time the last prize went. With one bet per round, Days 2, 5 and 7 are close to impossible; with two bets
                (each counting) all days fit. The model uses two.
              </p>
              <div className="t-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Aviator task</th>
                      <th>Last prize</th>
                      <th>1 bet</th>
                      <th>2 bets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aviatorDays.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td>{d.text.replace('Aviator: ', '')}</td>
                        <td>{dur(d.reported)}</td>
                        <td className={d.one < 0.05 ? 'bad' : ''}>{pctText(d.one)}</td>
                        <td className={d.two < 0.05 ? 'bad' : ''}>{pctText(d.two)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="t-card t-settings">
              <h3>Clock settings</h3>
              <label>
                <span>Betting countdown (s)</span>
                <input id="bet-sec" type="number" min={1} step={0.5} value={clock.betSec} onChange={(e) => setClock({ ...clock, betSec: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label>
                <span>Multiplier doubles every (s)</span>
                <input
                  id="double-sec"
                  type="number"
                  min={3}
                  step={0.5}
                  value={+(Math.LN2 / clock.k).toFixed(1)}
                  onChange={(e) => setClock({ ...clock, k: Math.LN2 / Math.max(1, Number(e.target.value) || 10.7) })}
                />
              </label>
              <label>
                <span>Pause after the crash (s)</span>
                <input id="pause-sec" type="number" min={0} step={0.5} value={clock.pauseSec} onChange={(e) => setClock({ ...clock, pauseSec: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <button id="reset-clock" className="t-btn" onClick={() => setClock(DEFAULT_CLOCK)}>
                Reset to research values
              </button>
              <p className="t-muted t-small">
                Best data: our own round log for football.com (crash point and timestamp per round). With it the clock is exact instead of modelled.
              </p>
            </div>
          </div>
          <ul className="t-sources">
            {AVIATOR_SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
            <li>Other guides quote anywhere from 60 to 360 rounds an hour; the figures above are the ones that state their method.</li>
          </ul>
        </section>

        <section id="check" className="t-section">
          <div className="t-head">
            <h2>Check against the real days</h2>
            <p className="t-muted">
              The pace of the other games is the one setting we fit: one number for all days ({FITTED_SPEED}× our starting guess). Everything else comes from the clock
              and the paytables.
            </p>
          </div>
          <div className="t-card">
            {!backtest.length ? (
              <p className="t-muted">Simulating the six days…</p>
            ) : (
              <div className="t-bt">
                {backtest.map((b) => {
                  const inside = b.reported >= b.r.p10 && b.reported <= b.r.p90;
                  return (
                    <div className="t-bt-row" key={b.day}>
                      <span className="t-bt-day">Day {b.day}</span>
                      <div className="t-track" aria-label={`Day ${b.day}: real ${clockAt(startMin, b.reported)}, model ${clockAt(startMin, b.r.p10)} to ${clockAt(startMin, b.r.p90)}`}>
                        <i className="range" style={{ left: `${pos(b.r.p10)}%`, width: `${Math.max(0.8, pos(b.r.p90) - pos(b.r.p10))}%` }} />
                        <i className="med" style={{ left: `${pos(b.r.median)}%` }} />
                        <i className="real" style={{ left: `${pos(b.reported)}%` }} />
                      </div>
                      <span className={`t-bt-txt ${inside ? '' : 'off'}`}>
                        real {clockAt(startMin, b.reported)} · model {clockAt(startMin, b.r.median)}
                      </span>
                    </div>
                  );
                })}
                <div className="t-axis" aria-hidden="true">
                  {[0, 60, 120, 180, 240, 299].map((m) => (
                    <span key={m} style={{ left: `${pos(m)}%` }}>
                      {clockAt(startMin, m)}
                    </span>
                  ))}
                </div>
                <p className="t-legend t-small">
                  <span className="lg range" /> model, 8 days in 10 <span className="lg med" /> model typical <span className="lg real" /> real last prize
                </p>
              </div>
            )}
          </div>
        </section>

        <section id="games" className="t-section">
          <div className="t-head">
            <h2>Other games: what a task costs</h2>
            <p className="t-muted">Chance per bet of a result at or above each multiplier, from Spribe’s published paytables and rules, using the best setting for the player.</p>
          </div>
          <div className="t-card t-scroll">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>RTP</th>
                  <th>Max</th>
                  {THRESHOLDS.map((x) => (
                    <th key={x}>{x}×+</th>
                  ))}
                  <th>Pace used</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {SIM_GAMES.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <b>{g.name}</b>
                    </td>
                    <td>{Math.round(g.rtp * 100)}%</td>
                    <td>{fmtX(g.maxMultiplier)}</td>
                    {THRESHOLDS.map((x) => {
                      const c = chanceAtLeast(g, x);
                      return (
                        <td key={x} className={c.p === 0 ? 'bad' : ''} title={c.setup}>
                          {c.p === 0 ? 'never' : oneIn(c.p)}
                        </td>
                      );
                    })}
                    <td>{g.shared ? `${Math.round(roundsPerHour(clock) / 60 * 10) / 10} rounds/min` : `${g.betsPerMin * FITTED_SPEED} bets/min`}</td>
                    <td>
                      {g.sources.slice(0, 1).map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                          {s.label.split(':')[0]}
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-muted t-small">
            Keno and Plinko: exact from the paytable. Mines and Goal: exact from the grid rules (Goal tops out at 9.03×). Trader and Pilot Chicken: crash maths (97% ÷ X),
            an estimate. Keno 80: no full paytable found, so its numbers are a best case. Hover a cell for the setting.
          </p>
        </section>
      </main>
    </>
  );
}

const pos = (m: number) => Math.min(100, Math.max(0, ((Number.isFinite(m) ? m : WINDOW_MIN) / WINDOW_MIN) * 100));

function pctText(p: number): string {
  if (p < 0.001) return '<0.1%';
  if (p > 0.995) return '>99%';
  return `${p < 0.1 ? (p * 100).toFixed(1) : Math.round(p * 100)}%`;
}

function GoneChart({ result, startMin, targetMin, tol }: { result: TimerResult; startMin: number; targetMin: number; tol: number }) {
  const W = 720;
  const H = 230;
  const m = { l: 44, r: 14, t: 12, b: 30 };
  const x = (t: number) => m.l + (Math.min(Math.max(t, 0), WINDOW_MIN) / WINDOW_MIN) * (W - m.l - m.r);
  const y = (p: number) => m.t + (1 - p) * (H - m.t - m.b);
  const pts = goneByCurve(result, WINDOW_MIN, 3);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join('');
  const area = `${line}L${x(WINDOW_MIN)},${y(0)}L${x(0)},${y(0)}Z`;
  return (
    <div className="t-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance the last prize has gone over the window. Typical: ${clockAt(startMin, result.median)}.`}>
        <rect x={x(targetMin - tol)} y={m.t} width={Math.max(0, x(targetMin + tol) - x(targetMin - tol))} height={H - m.t - m.b} className="band" />
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className="grid" />
            <text x={m.l - 6} y={y(p) + 4} textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        {[0, 60, 120, 180, 240, 299].map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === 299 ? 'end' : 'middle'}>
            {clockAt(startMin, t)}
          </text>
        ))}
        <path d={area} className="area" />
        <path d={line} className="line" />
        {Number.isFinite(result.median) && (
          <g>
            <circle cx={x(result.median)} cy={y(0.5)} r={5} className="dot" />
            <text x={x(result.median) + (result.median > WINDOW_MIN * 0.8 ? -8 : 8)} y={y(0.5) - 8} textAnchor={result.median > WINDOW_MIN * 0.8 ? 'end' : 'start'} className="lbl">
              typical {clockAt(startMin, result.median)}
            </text>
          </g>
        )}
        <text x={x(targetMin)} y={m.t + 14} textAnchor="middle" className="band-lbl">
          target
        </text>
      </svg>
    </div>
  );
}

function TaskBars({ missions, result, startMin, targetMin }: { missions: SimMission[]; result: TimerResult; startMin: number; targetMin: number }) {
  return (
    <div className="t-bars">
      {missions.map((m, i) => {
        const t = result.missionNthMedian[i];
        return (
          <div className={`t-bar-row ${i === result.slowest ? 'slow' : ''}`} key={i}>
            <span className="t-bar-name">{describe(m)}</span>
            <div className="t-track">
              <i className={`fill ${Number.isFinite(t) ? '' : 'never'}`} style={{ width: `${pos(t)}%` }} />
              <i className="tgt" style={{ left: `${pos(targetMin)}%` }} />
            </div>
            <span className="t-bar-time">{Number.isFinite(t) ? clockAt(startMin, t) : 'not in time'}</span>
          </div>
        );
      })}
    </div>
  );
}
