import { useEffect, useMemo, useRef, useState } from 'react';
import { DAY_RESULTS } from '../data/previousCampaign';
import type { GameId } from '../data/games';
import { gameMap, missionChance, type SimMission } from '../sim/engine';
import { SIM_GAMES, chanceAtLeast, oneIn } from '../sim/games';
import { simMissionsForDay } from '../sim/days';
import { DEFAULT_CLOCK, chanceAtLeastHits, meanRoundSec, roundsPerHour } from './clock';
import { verifyAviatorRound } from './provablyFair';
import { AUTO_PLAYERS, FITTED_SPEED, FIT_DAYS } from './days';
import { randomSet, suggestedSet } from './generate';
import { goneByCurve, ROUND_GAMES, simulateDay, suggestTarget, type Suggestion, type TimerResult, type TimerSettings } from './model';
import type { CalcState } from '../toolkit/model/project';

/** Connects the calculator to the Promo Toolkit's current project. Without it the calculator works on its own. */
export interface CalcBridge {
  initial: CalcState | null;
  onChange: (s: CalcState) => void;
  onResult: (s: CalcState, r: TimerResult) => void;
  days: { id: string; label: string }[];
  onSaveToDay: (dayId: string, missions: SimMission[]) => void;
}


const GAMES = gameMap(SIM_GAMES);
/** The 5–11 Oct challenge ran 5 hours a day; the "before" panel is drawn on that scale. */
const REAL_WINDOW = 300;
const LENGTHS = [45, 60, 120, 300, 720, 1440];
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);

/** Axis ticks for a window of any length. */
function ticks(w: number): number[] {
  const step = w <= 60 ? 15 : w <= 180 ? 30 : w <= 600 ? 60 : w <= 1440 ? 240 : 480;
  const out: number[] = [];
  for (let t = 0; t < w; t += step) out.push(t);
  if (w - out[out.length - 1] < step * 0.4) out.pop();
  out.push(w);
  return out;
}
const tickLabel = (t: number) => (t % 60 === 0 ? `${t / 60}h` : t < 60 ? `${t}m` : `${Math.floor(t / 60)}h${t % 60}`);

function dur(m: number): string {
  if (!Number.isFinite(m)) return 'not in time';
  const r = Math.round(m);
  return r < 60 ? `${r}m` : `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, '0')}m`;
}
/** Empty input → NaN, so a cleared field stays empty instead of jumping back to 1. */
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const show = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : '');
const filled = (v: number | undefined) => v != null && Number.isFinite(v) && v >= 1;
const q = (v: number | undefined) => (filled(v) ? v : '?');

const DEFAULT_WINNERS = 50;
/** Share of simulated days on which every prize went within the challenge. */
const shareWithin = (r: TimerResult, w: number) => r.runs.filter((x) => x.lastPrize != null && x.lastPrize <= w).length / r.runs.length;

function describe(m: SimMission): string {
  const n = GAMES[m.game].name;
  if (m.kind === 'catch') return `${n}: catch ${q(m.threshold)}× or more ${q(m.target)} times`;
  if (m.kind === 'collect') return `${n}: collect ${q(m.target)}× in total`;
  return `${n}: place ${q(m.target)} bets`;
}

const taskReady = (m: SimMission) => filled(m.target) && (m.kind !== 'catch' || filled(m.threshold));

type Verdict = 'early' | 'ontime' | 'late' | 'left';
const VERDICT_TEXT: Record<Verdict, string> = { early: 'Too early', ontime: 'On time', late: 'Late', left: 'Longer than the challenge' };

export default function TimerApp({ bridge }: { bridge?: CalcBridge } = {}) {
  const init = bridge?.initial ?? null;
  const [windowMin, setWindowMin] = useState(init?.windowMin ?? 300);
  const [targetH, setTargetH] = useState(Math.floor((init?.targetMin ?? 240) / 60));
  const [targetM, setTargetM] = useState((init?.targetMin ?? 240) % 60);
  const [tol, setTol] = useState(init?.tol ?? 30);
  const [prizes, setPrizes] = useState(init?.prizes ?? 50);
  const [bets, setBets] = useState<1 | 2>(init?.bets ?? 2);
  const [dayId, setDayId] = useState<string | null>(init?.dayId ?? null);
  const [saveTo, setSaveTo] = useState<string>(init?.dayId ?? 'new');
  const [savedNote, setSavedNote] = useState('');
  const clock = DEFAULT_CLOCK;
  const targetMin = (Number.isFinite(targetH) ? targetH : 0) * 60 + (Number.isFinite(targetM) ? targetM : 0);
  const target = dur(targetMin);

  const [missions, setMissions] = useState<SimMission[]>(() => init?.missions ?? suggestedSet(240, GAMES, FITTED_SPEED, DEFAULT_CLOCK, 2));
  const [source, setSource] = useState(init?.source ?? 'Suggested: last prize after 4h 00m of 5h 00m');
  const [result, setResult] = useState<TimerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null | 'none'>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [backtest, setBacktest] = useState<{ day: number; reported: number; r: TimerResult }[]>([]);
  const beforeRef = useRef<HTMLElement>(null);

  /** Winners are optional: a blank box means the usual 50. */
  const winners = filled(prizes) ? Math.floor(prizes) : DEFAULT_WINNERS;
  const ready = missions.length > 0 && missions.every(taskReady) && Number.isFinite(tol) && targetMin > 0;
  const settings: TimerSettings = useMemo(
    () => ({ players: Math.max(AUTO_PLAYERS, winners), prizes: winners, windowMin, betsPerRound: bets, clock, speed: FITTED_SPEED, spread: 0, runs: 300, seed: 7 }),
    [winners, bets, clock, windowMin],
  );
  // Simulate past the end of the challenge so there is always a time to show.
  const horizon = Math.min(4320, Math.max(windowMin * 3, 600));

  const calcState: CalcState = { missions, windowMin, targetMin, tol, prizes: winners, bets, source, dayId };
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  useEffect(() => {
    bridgeRef.current?.onChange(calcState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, windowMin, targetMin, tol, winners, bets, source, dayId]);

  useEffect(() => {
    setBusy(true);
    setSuggestion(null);
    const t = setTimeout(() => {
      const r = ready ? simulateDay(missions, GAMES, settings, horizon) : null;
      setResult(r);
      setBusy(false);
      if (r) bridgeRef.current?.onResult(calcState, { ...r, pAllGone: shareWithin(r, windowMin) });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, settings, ready, horizon]);

  useEffect(() => {
    if (!showBefore) return;
    const t = setTimeout(() => {
      setBacktest(FIT_DAYS.map((d) => ({ day: d.day, reported: d.reportedMin, r: simulateDay(d.missions, GAMES, { ...settings, windowMin: REAL_WINDOW, players: d.players, prizes: 50, runs: 200, seed: 21 }) })));
    }, 50);
    return () => clearTimeout(t);
  }, [settings, showBefore]);

  const setTasks = (ms: SimMission[], label: string) => {
    setMissions(ms);
    setSource(label);
  };
  const edit = (i: number, patch: Partial<SimMission>) => setTasks(missions.map((m, j) => (j === i ? { ...m, ...patch } : m)), 'Your tasks');

  const suggestFor = (goal: number, w: number) => {
    setBusy(true);
    setTimeout(() => {
      // Size the set, then fine-tune the Aviator count so the typical day lands on the target.
      const base = suggestedSet(goal, GAMES, FITTED_SPEED, clock, bets);
      const tuned = suggestTarget(base, GAMES, { ...settings, windowMin: w }, goal, 0);
      setTasks(tuned ? base.map((m, i) => (i === 0 ? { ...m, target: tuned.to } : m)) : base, `Suggested: last prize after ${dur(goal)} of ${dur(w)}`);
    }, 30);
  };
  const suggest = () => suggestFor(targetMin, windowMin);
  /** Picking a length aims the last prize at about 80% of it and suggests tasks straight away. */
  const pickLength = (w: number) => {
    if (!Number.isFinite(w) || w < 10) return;
    const goal = round5(w * 0.8);
    setWindowMin(w);
    setTargetH(Math.floor(goal / 60));
    setTargetM(goal % 60);
    setTol(round5(w * 0.1));
    suggestFor(goal, w);
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
  const pInWindow = result ? shareWithin(result, windowMin) : 0;
  if (ready && result) {
    if (!(result.median <= windowMin)) verdict = 'left';
    else if (result.median < targetMin - tol) verdict = 'early';
    else if (result.median > targetMin + tol) verdict = 'late';
    else verdict = 'ontime';
  }
  const inBand = result ? result.runs.filter((r) => r.lastPrize != null && Math.abs(r.lastPrize - targetMin) <= tol).length / result.runs.length : 0;
  const slow = result ? missions[result.slowest] : null;

  const findFix = () => {
    if (!result) return;
    setBusy(true);
    setTimeout(() => {
      setSuggestion(suggestTarget(missions, GAMES, settings, targetMin, result.slowest) ?? 'none');
      setBusy(false);
    }, 30);
  };

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
      <main className="t-wrap t-main">
        <section id="calc" className="t-calc">
          <div className="t-calc-head">
            <h1>Will the last prize go at the right time?</h1>
            <p className="t-muted">Set the tasks and how long you want it to take until the last prize goes. Everyone plays every game at once on auto.</p>
          </div>

          <div className="t-length" role="group" aria-label="How long the challenge runs">
            <span className="t-length-label">How long does the challenge run?</span>
            <div className="t-length-chips">
              {LENGTHS.map((w) => (
                <button key={w} id={`len-${w}`} aria-pressed={windowMin === w} onClick={() => pickLength(w)}>
                  {tickLabel(w)}
                </button>
              ))}
              <span className="t-pair t-length-custom">
                <span className="t-muted">or</span>
                <input
                  id="len-custom"
                  aria-label="Custom length in hours"
                  type="number"
                  min={0.25}
                  step={0.25}
                  placeholder="hours"
                  key={windowMin}
                  defaultValue={LENGTHS.includes(windowMin) ? '' : +(windowMin / 60).toFixed(2)}
                  onKeyDown={(e) => e.key === 'Enter' && pickLength(Math.round(num((e.target as HTMLInputElement).value) * 60))}
                  onBlur={(e) => e.target.value && pickLength(Math.round(num(e.target.value) * 60))}
                />
                <span className="t-muted">h</span>
              </span>
            </div>
            <span className="t-muted t-small">Picks a target near the end and suggests tasks for it.</span>
          </div>

          <div className="t-toolbar" role="toolbar" aria-label="Task sets">
            <button id="suggest" className="t-btn primary" onClick={suggest} disabled={busy}>
              Suggest for {target}
            </button>
            <button id="random" className="t-btn" onClick={random} disabled={busy}>
              Random
            </button>
            <button id="add-task" className="t-btn" onClick={() => setTasks([...missions, { game: 'mines', kind: 'bets', target: 100 }], 'Your tasks')}>
              + Add task
            </button>
            <button id="clear" className="t-btn ghost" onClick={() => setTasks([], 'Empty')}>
              Delete all
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
              {bridge && (
                <div className="t-saveday">
                  <label htmlFor="save-to-day">Save these tasks to</label>
                  <select id="save-to-day" value={saveTo} onChange={(e) => setSaveTo(e.target.value)}>
                    {bridge.days.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                    <option value="new">A new day</option>
                  </select>
                  <button
                    id="save-day"
                    className="t-btn"
                    disabled={!missions.length}
                    onClick={() => {
                      bridge.onSaveToDay(saveTo, missions);
                      if (saveTo !== 'new') setDayId(saveTo);
                      setSavedNote(saveTo === 'new' ? 'Added as a new day in the campaign.' : `Saved to ${bridge.days.find((d) => d.id === saveTo)?.label ?? 'the day'}.`);
                      setTimeout(() => setSavedNote(''), 4000);
                    }}
                  >
                    Save to campaign
                  </button>
                  {savedNote && <span className="t-ok-note">{savedNote}</span>}
                </div>
              )}
              {missions.length === 0 && <p className="t-muted">No tasks yet. Press Suggested, Random or + Add task.</p>}
              <div className="t-tasks">
                {missions.map((m, i) => {
                  const g = GAMES[m.game];
                  const p = m.kind === 'catch' && filled(m.threshold) ? missionChance(m, g) : null;
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
                          <input id={`x-${i}`} type="number" min={1} value={show(m.threshold)} onChange={(e) => edit(i, { threshold: num(e.target.value) })} />×
                        </label>
                      )}
                      <label className="t-inline">
                        {m.kind === 'catch' ? 'times' : m.kind === 'collect' ? 'total ×' : 'bets'}
                        <input id={`n-${i}`} type="number" min={1} value={show(m.target)} onChange={(e) => edit(i, { target: num(e.target.value) })} />
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
                  <span>Last prize should go after</span>
                  <span className="t-pair">
                    <input id="target-h" aria-label="Hours" type="number" min={0} max={Math.ceil(windowMin / 60)} value={show(targetH)} onChange={(e) => setTargetH(num(e.target.value))} />
                    <span className="t-muted">h</span>
                    <input id="target-m" aria-label="Minutes" type="number" min={0} max={59} step={5} value={show(targetM)} onChange={(e) => setTargetM(num(e.target.value))} />
                    <span className="t-muted">m</span>
                    <span className="t-muted">±</span>
                    <input id="tol" type="number" min={5} max={120} step={5} value={show(tol)} onChange={(e) => setTol(num(e.target.value))} />
                    <span className="t-muted">min</span>
                  </span>
                </label>
                <label>
                  <span>Winners (optional)</span>
                  <span className="t-pair">
                    <input id="prizes" type="number" min={1} placeholder={String(DEFAULT_WINNERS)} value={show(prizes)} onChange={(e) => setPrizes(num(e.target.value))} />
                    {[10, 50, 100, 500].map((n) => (
                      <button key={n} type="button" className={`t-mini ${winners === n ? 'on' : ''}`} onClick={() => setPrizes(n)}>
                        {n}
                      </button>
                    ))}
                  </span>
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
              <span className="t-chip">{!ready ? 'Waiting for numbers' : busy ? 'Calculating…' : verdict ? VERDICT_TEXT[verdict] : '—'}</span>
              <p className="t-big">{!ready || !result ? '?' : Number.isFinite(result.median) ? dur(result.median) : `> ${dur(horizon)}`}</p>
              <p className="t-big-cap">
                {!ready
                  ? missions.length
                    ? 'Fill in every number to see when the last prize goes.'
                    : 'Add a task, or press Suggested or Random.'
                  : `until the last of ${winners} winners finishes, typical day`}
              </p>
              <p className="t-sub">
                {ready && result && verdict !== 'left' && (
                  <>
                    {verdict === 'early' && `About ${dur(targetMin - result.median)} shorter than ${target}.`}
                    {verdict === 'late' && `About ${dur(result.median - targetMin)} longer than ${target}.`}
                    {verdict === 'ontime' && `Within ${dur(tol)} of ${target}.`}
                  </>
                )}
                {ready && result && verdict === 'left' && (Number.isFinite(result.median) ? `${dur(result.median - windowMin)} longer than the ${dur(windowMin)} challenge, so prizes are left over on most days.` : `Far longer than the ${dur(windowMin)} challenge: a task is too hard.`)}
              </p>
              <dl className="t-facts">
                <div>
                  <dt>Lands within ±{dur(tol)}</dt>
                  <dd>{ready && result ? `${Math.round(inBand * 100)}%` : '?'}</dd>
                </div>
                <div>
                  <dt>All {winners} prizes go within {dur(windowMin)}</dt>
                  <dd>{ready && result ? `${Math.round(pInWindow * 100)}%` : '?'}</dd>
                </div>
                <div className="wide">
                  <dt>Decided by</dt>
                  <dd className="sm">{ready && slow ? describe(slow) : '?'}</dd>
                </div>
              </dl>
            </aside>
          </div>

          {ready && result && (
            <div className="t-card">
              <div className="t-row-between">
                <h3>Chance the last prize has gone, by time</h3>
                <span className="t-muted t-small">300 simulated days</span>
              </div>
              <GoneChart result={result} targetMin={targetMin} tol={tol} windowMin={windowMin} />
              <h3>Each mission: when winner #{winners} finishes it</h3>
              <TaskBars missions={missions} result={result} targetMin={targetMin} windowMin={windowMin} />
              <div className="t-fix">
                <p>
                  {slow && (
                    <>
                      <b>{describe(slow)}</b> decides the time on most simulated days.{' '}
                    </>
                  )}
                  {slow && ROUND_GAMES[slow.game]
                    ? `${GAMES[slow.game].name} rounds are shared, so everyone on auto finishes this task at the same moment: the time depends on when the big rounds come.`
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
                      <b>{dur(suggestion.result.median)}</b>.
                    </p>
                    <button id="apply-fix" className="t-btn primary" onClick={() => edit(suggestion.mission, { target: suggestion.to })}>
                      Use {suggestion.to}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <OneTask
            settings={settings}
            onAdd={(m) => {
              setTasks([...missions, m], 'Your tasks');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
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
                    <span className="t-mono">{r.winners === 0 ? '0 winners' : `last prize after ${dur(r.durationMin)}`}</span>
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
                        <div className="t-track" aria-label={`Day ${b.day}: real ${dur(b.reported)}, model ${dur(b.r.p10)} to ${dur(b.r.p90)}`}>
                          <i className="range" style={{ left: `${pos(b.r.p10, REAL_WINDOW)}%`, width: `${Math.max(0.8, pos(b.r.p90, REAL_WINDOW) - pos(b.r.p10, REAL_WINDOW))}%` }} />
                          <i className="med" style={{ left: `${pos(b.r.median, REAL_WINDOW)}%` }} />
                          <i className="real" style={{ left: `${pos(b.reported, REAL_WINDOW)}%` }} />
                        </div>
                        <span className={`t-bt-txt ${inside ? '' : 'off'}`}>
                          real {dur(b.reported)} · calc {dur(b.r.median)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="t-axis" aria-hidden="true">
                    {ticks(REAL_WINDOW).map((m) => (
                      <span key={m} style={{ left: `${pos(m, REAL_WINDOW)}%` }}>
                        {tickLabel(m)}
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

        <details id="how" className="t-how">
          <summary>How the time is worked out</summary>
          <ul>
            <li>
              <b>Aviator and Trader</b> are played round by round, and every player sees the same rounds. Each round’s result uses Aviator’s provably-fair formula:
              SHA-512 of the server seed and three client seeds, first 13 hex characters as h, crash = ⌊97 · 2⁵² ÷ (2⁵² − h)⌋ ÷ 100. Trader’s own formula is not public, so it
              uses the same 97% curve, capped at 1,000×.
            </li>
            <li>
              Rounds take about {meanRoundSec(DEFAULT_CLOCK).toFixed(0)} s ({Math.round(roundsPerHour(DEFAULT_CLOCK))} an hour). Players use both bet slots, so each good round
              counts twice.
            </li>
            <li>The other games use their published paytables, played on auto at a pace fitted to the 5–11 Oct days.</li>
          </ul>
          <RoundChecker />
        </details>
      </main>
    </>
  );
}

const pos = (m: number, w: number) => Math.min(100, Math.max(0, ((Number.isFinite(m) ? m : w) / w) * 100));

function pctText(p: number): string {
  if (p < 0.001) return '<0.1%';
  if (p > 0.995) return '>99%';
  return `${p < 0.1 ? (p * 100).toFixed(1) : Math.round(p * 100)}%`;
}

function GoneChart({ result, targetMin, tol, windowMin: WINDOW_MIN }: { result: TimerResult; targetMin: number; tol: number; windowMin: number }) {
  const W = 720;
  const H = 220;
  const m = { l: 44, r: 14, t: 12, b: 30 };
  const x = (t: number) => m.l + (Math.min(Math.max(t, 0), WINDOW_MIN) / WINDOW_MIN) * (W - m.l - m.r);
  const y = (p: number) => m.t + (1 - p) * (H - m.t - m.b);
  const pts = goneByCurve(result, WINDOW_MIN, Math.max(1, WINDOW_MIN / 100));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join('');
  const area = `${line}L${x(WINDOW_MIN)},${y(0)}L${x(0)},${y(0)}Z`;
  return (
    <div className="t-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance the last prize has gone over the window. Typical: ${dur(result.median)}.`}>
        <rect x={x(targetMin - tol)} y={m.t} width={Math.max(0, x(targetMin + tol) - x(targetMin - tol))} height={H - m.t - m.b} className="band" />
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className="grid" />
            <text x={m.l - 6} y={y(p) + 4} textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        {ticks(WINDOW_MIN).map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === WINDOW_MIN ? 'end' : 'middle'}>
            {tickLabel(t)}
          </text>
        ))}
        <path d={area} className="area" />
        <path d={line} className="line" />
        {Number.isFinite(result.median) && (
          <g>
            <circle cx={x(result.median)} cy={y(0.5)} r={5} className="dot" />
            <text x={x(result.median) + (result.median > WINDOW_MIN * 0.8 ? -8 : 8)} y={y(0.5) - 8} textAnchor={result.median > WINDOW_MIN * 0.8 ? 'end' : 'start'} className="lbl">
              typical {dur(result.median)}
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

function TaskBars({ missions, result, targetMin, windowMin }: { missions: SimMission[]; result: TimerResult; targetMin: number; windowMin: number }) {
  return (
    <div className="t-bars">
      {missions.map((m, i) => {
        const t = result.missionNthMedian[i];
        return (
          <div className={`t-bar-row ${i === result.slowest ? 'slow' : ''}`} key={i}>
            <span className="t-bar-name">
              <b>Mission {i + 1}</b> · {describe(m)}
            </span>
            <div className="t-track">
              <i className={`fill ${Number.isFinite(t) ? '' : 'never'}`} style={{ width: `${pos(t, windowMin)}%` }} />
              <i className="tgt" style={{ left: `${pos(targetMin, windowMin)}%` }} />
            </div>
            <span className="t-bar-time">{dur(t)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** How long a single task takes for one player on auto, outside the 5-hour limit. */
const ONE_TASK_HORIZON = 48 * 60;

function OneTask({ settings, onAdd }: { settings: TimerSettings; onAdd: (m: SimMission) => void }) {
  const [m, setM] = useState<SimMission>({ game: 'plinko', kind: 'catch', threshold: 15, target: 20 });
  const [time, setTime] = useState<number | null>(null);
  const [oneWinners, setOneWinners] = useState(NaN);
  const n = filled(oneWinners) ? Math.floor(oneWinners) : 1;
  const ok = taskReady(m);
  const g = GAMES[m.game];

  useEffect(() => {
    if (!ok) return setTime(null);
    const t = setTimeout(() => {
      const players = n === 1 ? 1 : Math.max(AUTO_PLAYERS, n);
      const r = simulateDay([m], GAMES, { ...settings, players, prizes: n, runs: 200, windowMin: ONE_TASK_HORIZON }, ONE_TASK_HORIZON);
      setTime(r.median);
    }, 60);
    return () => clearTimeout(t);
  }, [m, settings, ok, n]);

  const set = (patch: Partial<SimMission>) => setM({ ...m, ...patch });
  const p = m.kind === 'catch' && filled(m.threshold) ? missionChance(m, g) : null;
  let work = '';
  if (ok) {
    const shared = !!ROUND_GAMES[m.game];
    const per = shared ? 'rounds' : 'bets';
    const perBet = shared ? settings.betsPerRound : 1;
    let need = m.kind === 'bets' ? m.target / perBet : NaN;
    if (m.kind === 'catch' && p) need = Math.ceil(m.target / perBet) / p;
    if (m.kind === 'collect') {
      const c = chanceAtLeast(g, 2);
      need = c.p > 0 ? Math.ceil(m.target / c.pays / perBet) / c.p : NaN;
    }
    if (Number.isFinite(need)) work = `about ${Math.round(need).toLocaleString('en-US')} ${per} each`;
  }

  return (
    <div className="t-card t-one">
      <div className="t-head">
        <h3>Check one task</h3>
        <p className="t-muted t-small">How long a single task takes on auto, on its own. Add a number of winners to see when the last of them finishes.</p>
      </div>
      <div className="t-one-grid">
        <div className="t-task">
          <select id="one-game" aria-label="Game" value={m.game} onChange={(e) => set({ game: e.target.value as GameId })}>
            {SIM_GAMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            id="one-kind"
            aria-label="Task type"
            value={m.kind}
            onChange={(e) => set({ kind: e.target.value as SimMission['kind'], threshold: e.target.value === 'catch' ? m.threshold ?? 20 : undefined })}
          >
            <option value="catch">Catch X× or more</option>
            <option value="collect">Collect X× in total</option>
            <option value="bets">Place bets</option>
          </select>
          {m.kind === 'catch' && (
            <label className="t-inline">
              <input id="one-x" type="number" min={1} value={show(m.threshold)} onChange={(e) => set({ threshold: num(e.target.value) })} />×
            </label>
          )}
          <label className="t-inline">
            {m.kind === 'catch' ? 'times' : m.kind === 'collect' ? 'total ×' : 'bets'}
            <input id="one-n" type="number" min={1} value={show(m.target)} onChange={(e) => set({ target: num(e.target.value) })} />
          </label>
          <label className="t-inline">
            winners
            <input id="one-winners" type="number" min={1} placeholder="1" value={show(oneWinners)} onChange={(e) => setOneWinners(num(e.target.value))} />
          </label>
        </div>
        <div className="t-one-result" aria-live="polite">
          <b>{!ok ? '?' : time == null ? '…' : Number.isFinite(time) ? dur(time) : 'over 48h'}</b>
          <span>{n === 1 ? 'for one player' : `until the last of ${n} winners finishes`}</span>
          <span>
            {!ok
              ? 'Fill in the numbers.'
              : [p != null ? (p > 0 ? `${oneIn(p)} ${ROUND_GAMES[m.game] ? 'rounds' : 'bets'}` : 'impossible in this game') : '', work].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button id="one-add" className="t-btn" disabled={!ok} onClick={() => onAdd(m)}>
          Add to the day
        </button>
      </div>
    </div>
  );
}


/** Recomputes a finished Aviator round from the seeds in its fairness panel. */
function RoundChecker() {
  const [server, setServer] = useState('');
  const [seeds, setSeeds] = useState(['', '', '']);
  const [out, setOut] = useState<{ first13: string; crash: number } | null>(null);
  const ready = server.trim() && seeds.every((x) => x.trim());
  return (
    <div className="t-check-round">
      <b>Check a real Aviator round</b>
      <p className="t-muted t-small">Paste the seeds from a finished round’s fairness panel. If the result matches the round, the formula above is confirmed.</p>
      <div className="t-check-grid">
        <input id="rc-server" aria-label="Server seed" placeholder="Server seed" value={server} onChange={(e) => setServer(e.target.value)} />
        {seeds.map((v, i) => (
          <input key={i} id={`rc-client-${i + 1}`} aria-label={`Client seed ${i + 1}`} placeholder={`Client seed ${i + 1}`} value={v} onChange={(e) => setSeeds(seeds.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
      </div>
      <div className="t-row-between">
        <button
          id="rc-run"
          className="t-btn"
          disabled={!ready}
          onClick={async () => {
            try {
              setOut(await verifyAviatorRound(server, seeds));
            } catch {
              setOut(null);
            }
          }}
        >
          Calculate result
        </button>
        <button
          className="k-link"
          onClick={() => {
            setServer('DtpP8vUjdiMfn4dVbJt8bZhsdKT1qAz7iZCwXvZ0');
            setSeeds(['txcgzPAhctu2f4GzBUID', 'ZPISstqQiNNshsfrm12F', 'HLfMXKrqj4TOGYla5wcL']);
          }}
        >
          Fill an example
        </button>
        {out && (
          <span className="t-mono-out">
            {out.first13} → <b>{out.crash.toFixed(2)}×</b>
          </span>
        )}
      </div>
    </div>
  );
}
