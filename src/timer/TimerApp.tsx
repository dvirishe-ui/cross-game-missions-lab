import { useEffect, useMemo, useRef, useState } from 'react';
import { DAY_RESULTS } from '../data/previousCampaign';
import type { GameId } from '../data/games';
import { gameMap, missionChance, type SimMission } from '../sim/engine';
import { SIM_GAMES, chanceAtLeast, fmtX, oneIn } from '../sim/games';
import { simMissionsForDay } from '../sim/days';
import { AVIATOR_SOURCES, DEFAULT_CLOCK, chanceAtLeastHits, clockBounds, flightSec, hitsPerHour, meanRoundSec, roundsPerHour, type AviatorClock } from './clock';
import { AUTO_PLAYERS, FIT_DAYS } from './days';
import { randomSet, suggestedSet } from './generate';
import { goneByCurve, simulateDay, suggestTarget, type Suggestion, type TimerResult, type TimerSettings } from './model';

/** Auto pace of the non-Aviator games, fitted to Days 1–5 and 7 with everyone on auto and two Aviator bets a round (see model.test.ts). */
export const FITTED_SPEED = 1.4;

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
  const [target, setTarget] = useState('23:00');
  const [tol, setTol] = useState(30);
  const [prizes, setPrizes] = useState(50);
  const [bets, setBets] = useState<1 | 2>(2);
  const [clock, setClock] = useState<AviatorClock>(DEFAULT_CLOCK);
  const startMin = toMin(START);
  const targetMin = toMin(target) - startMin;

  const [missions, setMissions] = useState<SimMission[]>(() => suggestedSet(toMin('23:00') - toMin(START), GAMES, FITTED_SPEED, DEFAULT_CLOCK, 2));
  const [source, setSource] = useState('Suggested for 23:00');
  const [result, setResult] = useState<TimerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null | 'none'>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [backtest, setBacktest] = useState<{ day: number; reported: number; r: TimerResult }[]>([]);
  const beforeRef = useRef<HTMLElement>(null);

  const settings: TimerSettings = useMemo(
    () => ({ players: Math.max(AUTO_PLAYERS, prizes), prizes, windowMin: WINDOW_MIN, betsPerRound: bets, clock, speed: FITTED_SPEED, spread: 0, runs: 300, seed: 7 }),
    [prizes, bets, clock],
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
    if (!showBefore) return;
    const t = setTimeout(() => {
      setBacktest(FIT_DAYS.map((d) => ({ day: d.day, reported: d.reportedMin, r: simulateDay(d.missions, GAMES, { ...settings, players: d.players, prizes: 50, runs: 200, seed: 21 }) })));
    }, 50);
    return () => clearTimeout(t);
  }, [settings, showBefore]);

  const setTasks = (ms: SimMission[], label: string) => {
    setMissions(ms);
    setSource(label);
  };
  const edit = (i: number, patch: Partial<SimMission>) => setTasks(missions.map((m, j) => (j === i ? { ...m, ...patch } : m)), 'Your tasks');

  const suggest = () => {
    setBusy(true);
    setTimeout(() => {
      // Size the set, then fine-tune the Aviator count so the typical day lands on the target.
      const base = suggestedSet(targetMin, GAMES, FITTED_SPEED, clock, bets);
      const tuned = suggestTarget(base, GAMES, settings, targetMin, 0);
      setTasks(tuned ? base.map((m, i) => (i === 0 ? { ...m, target: tuned.to } : m)) : base, `Suggested for ${target}`);
    }, 30);
  };
  const random = () => {
    const seed = Math.floor(Math.random() * 1e9);
    setTasks(randomSet(seed, GAMES), 'Random set');
  };
  const openBefore = () => {
    setShowBefore(true);
    setTimeout(() => beforeRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const loadDay = (d: number) => {
    setTasks(simMissionsForDay(d), `Day ${d} of the 5–11 Oct challenge`);
    setPrizes(50);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
            <a href="#calc">Calculator</a>
            <a href="#how">How it works</a>
            <a href="#before" onClick={openBefore}>
              What was before
            </a>
          </nav>
        </div>
      </header>

      <main className="t-wrap t-main">
        <section id="calc" className="t-calc">
          <div className="t-calc-head">
            <h1>Will the last prize go at the right time?</h1>
            <p className="t-muted">Set the tasks and the time you want the last prize to go. Window 19:00–23:59 UTC, everyone playing every game at once on auto.</p>
          </div>

          <div className="t-toolbar" role="toolbar" aria-label="Task sets">
            <button id="suggest" className="t-btn primary" onClick={suggest} disabled={busy}>
              Suggested for {target}
            </button>
            <button id="random" className="t-btn" onClick={random} disabled={busy}>
              Random
            </button>
            <button id="add-task" className="t-btn" onClick={() => setTasks([...missions, { game: 'mines', kind: 'bets', target: 100 }], 'Your tasks')}>
              + Add task
            </button>
            <button id="clear" className="t-btn ghost" onClick={() => setTasks([], 'Empty')}>
              Clear
            </button>
            <button id="see-before" className="t-btn ghost t-push" aria-expanded={showBefore} onClick={() => (showBefore ? setShowBefore(false) : openBefore())}>
              {showBefore ? 'Hide what was before' : 'See what was before'}
            </button>
          </div>

          <div className="t-calc-grid">
            <div className="t-card">
              <div className="t-row-between">
                <h3>Tasks</h3>
                <span className="t-source">{source}</span>
              </div>
              {missions.length === 0 && <p className="t-muted">No tasks yet. Press Suggested, Random or + Add task.</p>}
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
                      <button className="t-x" aria-label={`Remove ${describe(m)}`} onClick={() => setTasks(missions.filter((_, j) => j !== i), 'Your tasks')}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="t-settings-row">
                <label>
                  <span>Last prize wanted at (UTC)</span>
                  <span className="t-pair">
                    <input id="target" type="time" value={target} min="19:00" max="23:59" onChange={(e) => setTarget(e.target.value || '23:00')} />
                    <span className="t-muted">±</span>
                    <input id="tol" type="number" min={5} max={120} step={5} value={tol} onChange={(e) => setTol(Math.max(5, Number(e.target.value) || 30))} />
                    <span className="t-muted">min</span>
                  </span>
                </label>
                <label>
                  <span>Prizes</span>
                  <input id="prizes" type="number" min={1} value={prizes} onChange={(e) => setPrizes(Math.max(1, Number(e.target.value) || 1))} />
                </label>
                <fieldset>
                  <legend>Aviator bets a round</legend>
                  <div className="t-seg">
                    {([1, 2] as const).map((b) => (
                      <button key={b} id={`bets-${b}`} aria-pressed={bets === b} onClick={() => setBets(b)}>
                        {b}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>

            <aside className={`t-verdict ${verdict ?? ''}`} aria-live="polite">
              <span className="t-chip">{busy ? 'Calculating…' : verdict ? VERDICT_TEXT[verdict] : 'Add tasks'}</span>
              <p className="t-big">{!result ? '—' : verdict === 'left' ? `${Math.round(avgWinners)}/${prizes}` : clockAt(startMin, result.median)}</p>
              <p className="t-big-cap">{verdict === 'left' ? 'prizes won by 23:59, typical day' : 'last prize goes, typical day (UTC)'}</p>
              <p className="t-sub">
                {result && verdict !== 'left' && (
                  <>
                    8 days in 10: <b>{clockAt(startMin, result.p10)}</b> – <b>{Number.isFinite(result.p90) ? clockAt(startMin, result.p90) : 'after close'}</b>.{' '}
                    {verdict === 'early' && `About ${dur(targetMin - result.median)} before ${target}.`}
                    {verdict === 'late' && `About ${dur(result.median - targetMin)} after ${target}.`}
                    {verdict === 'ontime' && `Within ${tol} min of ${target}.`}
                  </>
                )}
                {result && verdict === 'left' && 'A task is too hard to finish in the window.'}
              </p>
              <dl className="t-facts">
                <div>
                  <dt>Lands within ±{tol} min</dt>
                  <dd>{result ? `${Math.round(inBand * 100)}%` : '—'}</dd>
                </div>
                <div>
                  <dt>All prizes go by 23:59</dt>
                  <dd>{result ? `${Math.round(result.pAllGone * 100)}%` : '—'}</dd>
                </div>
                <div className="wide">
                  <dt>Decided by</dt>
                  <dd className="sm">{slow ? describe(slow) : '—'}</dd>
                </div>
              </dl>
            </aside>
          </div>

          {result && (
            <div className="t-card">
              <div className="t-row-between">
                <h3>Chance the last prize has gone, by time</h3>
                <span className="t-muted t-small">300 simulated days</span>
              </div>
              <GoneChart result={result} startMin={startMin} targetMin={targetMin} tol={tol} />
              <h3>When the {prizes}th player finishes each task</h3>
              <TaskBars missions={missions} result={result} startMin={startMin} targetMin={targetMin} />
              <div className="t-fix">
                <p>
                  {slow && (
                    <>
                      <b>{describe(slow)}</b> decides the time on most simulated days.{' '}
                    </>
                  )}
                  {slow && GAMES[slow.game].shared
                    ? 'Aviator rounds are shared, so everyone on auto finishes this task at the same moment: the time depends on when the big rounds come.'
                    : slow
                      ? 'This is a luck task in a game where each player gets their own results, so it swings more from day to day than an Aviator task.'
                      : ''}
                </p>
                {suggestion === null && verdict !== 'ontime' && (
                  <button id="find-fix" className="t-btn primary" onClick={findFix} disabled={busy}>
                    Fix it: find the number that lands on {target}
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

        {showBefore && (
          <section id="before" ref={beforeRef} className="t-section t-before">
            <div className="t-row-between">
              <div className="t-head">
                <p className="t-eyebrow">For perspective</p>
                <h2>What was before: the 5–11 Oct challenge</h2>
                <p className="t-muted">SportyBet daily missions, 50 prizes a day. Load any day into the calculator, and see how the calculator does against what really happened.</p>
              </div>
              <button id="close-before" className="t-btn ghost" onClick={() => setShowBefore(false)}>
                Close
              </button>
            </div>
            <div className="t-daycards">
              {DAY_RESULTS.map((r) => (
                <div className={`t-daycard ${r.winners === 0 ? 'bad' : ''}`} key={r.day}>
                  <div className="t-row-between">
                    <b>Day {r.day}</b>
                    <span className="t-mono">{r.winners === 0 ? '0 winners' : `last prize ${clockAt(startMin, r.durationMin)}`}</span>
                  </div>
                  <ul>
                    {simMissionsForDay(r.day).map((m, i) => (
                      <li key={i}>{describe(m)}</li>
                    ))}
                  </ul>
                  <button id={`load-day-${r.day}`} className="t-btn" onClick={() => loadDay(r.day)}>
                    Load into calculator
                  </button>
                </div>
              ))}
            </div>

            <div className="t-card">
              <h3>Calculator vs real last-prize times</h3>
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
                          real {clockAt(startMin, b.reported)} · calc {clockAt(startMin, b.r.median)}
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
                    <span className="lg range" /> calculator, 8 days in 10 <span className="lg med" /> calculator typical <span className="lg real" /> real last prize
                  </p>
                </div>
              )}
            </div>

            <div className="t-card">
              <h3>What the challenge taught the calculator</h3>
              <ul className="t-learn">
                <li>
                  <b>Prizes went too early on 5 of 7 days</b> (49 min to 2h 08m into a 5-hour window). Day 7 (22:39) was the only one near the end.
                </li>
                <li>
                  <b>Day 6 had no winners:</b> Keno pays 30× or more about once in 1,496 bets, so 20 of them needs about 30,000 bets.
                </li>
                <li>
                  <b>Players used both Aviator bet slots.</b> With one bet a round, Days 2, 5 and 7 are close to impossible:
                </li>
              </ul>
              <div className="t-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Aviator task</th>
                      <th>Last prize after</th>
                      <th>Chance with 1 bet</th>
                      <th>With 2 bets</th>
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
              <p className="t-muted t-small">
                The one number fitted to these days is the auto pace of the non-Aviator games ({FITTED_SPEED}× our starting guess). Everything else comes from the Aviator clock
                and Spribe’s paytables.
              </p>
            </div>
          </section>
        )}

        <section id="how" className="t-section">
          <div className="t-head">
            <p className="t-eyebrow">How it works</p>
            <h2>The Aviator clock</h2>
            <p className="t-muted">
              Spribe does not publish round timing, so we built it from public measurements: a betting countdown, a flight where the multiplier grows exponentially, and a
              short pause. With a 97% RTP the average flight is exactly 0.97 ÷ growth rate.
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
              <h3>Sources</h3>
              <ul className="t-sources">
                {AVIATOR_SOURCES.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
                <li>Other guides quote anywhere from 60 to 360 rounds an hour; these are the ones that state their method.</li>
              </ul>
              <p className="t-muted t-small">Best data: our own round log for football.com (crash point and time per round). With it the clock is exact instead of modelled.</p>
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
            </div>
          </div>

          <div className="t-head">
            <h2>The other games</h2>
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
                  <th>Auto pace</th>
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
                    <td>{g.shared ? `${+(roundsPerHour(clock) / 60).toFixed(1)} rounds/min` : `${+(g.betsPerMin * FITTED_SPEED).toFixed(1)} bets/min`}</td>
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
            Keno and Plinko: exact from the paytable. Mines and Goal: exact from the grid rules (Goal tops out at 9.03×). Trader and Pilot Chicken: crash maths (97% ÷ X), an
            estimate. Keno 80: no full paytable found, so its numbers are a best case. Auto paces are not published; ask product for the real seconds per auto round.
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
  const H = 220;
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
        <text x={x(targetMin)} y={H - m.b - 6} textAnchor="middle" className="band-lbl">
          your target
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
