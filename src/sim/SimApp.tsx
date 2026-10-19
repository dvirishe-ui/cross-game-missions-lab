import { useEffect, useMemo, useState } from 'react';
import { DAY_RESULTS, resultForDay } from '../data/previousCampaign';
import type { GameId } from '../data/games';
import { fmtDuration } from '../math/format';
import { SWEEP_COUNTS, calibrate, describeMission, gameMap, missionChance, playersToEmptyPrizes, simulate, sweepPoint, type CalibrationResult, type SimMission, type SimSettings, type SimSummary, type SweepPoint } from './engine';
import { KIND_TEXT, SIM_GAMES, chanceAtLeast, fmtX, oneIn, type SimGame } from './games';
import { CALIBRATION_DAYS, ENGAGED_SHARE_FROM_DATA, simMissionsForDay } from './days';
import { GameNotes } from './GameNotes';
import { RaceChart, Bars, SweepChart } from './charts';
import { Details } from './Details';
import { OverlapSection, missionOverlap } from './Overlap';

const SPREADS = [
  { label: 'Similar players', value: 0.25 },
  { label: 'Mixed', value: 0.5 },
  { label: 'Very mixed', value: 0.8 },
];
const THRESHOLDS = [2, 5, 10, 15, 20, 30, 50, 100];

type DayChoice = number | 'custom';

function chanceClass(p: number): string {
  if (p >= 0.1) return 'easy';
  if (p >= 0.03) return 'mid';
  if (p >= 0.01) return 'hard';
  return 'rare';
}

function sweepSentence(points: SweepPoint[], prizes: number, hours: number): string {
  const cross = playersToEmptyPrizes(points);
  if (cross == null) return `Even with 1,000 players, the ${prizes} prizes are usually not all won within ${hours} hours: one of the missions is too hard to finish in time.`;
  const done = [...points].filter((p) => p.pAllClaimed >= 0.5 && Number.isFinite(p.median)).sort((a, b) => a.players - b.players);
  const last = done[done.length - 1];
  const first = done[0];
  // First turnout from which the time stays within 15% of the highest-turnout time.
  const plateau = done.find((_, i) => done.slice(i).every((q) => Math.abs(q.median - last.median) <= Math.max(10, last.median * 0.15)));
  const start = `All ${prizes} prizes usually go within ${hours} hours once about ${Math.max(cross, prizes)} players take part (${fmtDuration(first.median)} at ${first.players} players).`;
  if (plateau && plateau.players < last.players)
    return `${start} From about ${plateau.players} players it barely changes: the last prize goes at around ${fmtDuration(last.median)} whatever the turnout, because the slowest mission is limited by shared Aviator rounds or rare results, not by how many people play.`;
  return `${start} More players keep bringing it forward, down to ${fmtDuration(last.median)} at ${last.players} players.`;
}

export default function SimApp() {
  const [day, setDay] = useState<DayChoice>(7);
  const [missions, setMissions] = useState<SimMission[]>(simMissionsForDay(7));
  const [players, setPlayers] = useState(100);
  const [prizes, setPrizes] = useState(50);
  const [hours, setHours] = useState(5);
  const [sweep, setSweep] = useState<SweepPoint[]>([]);
  const [spread, setSpread] = useState(0.5);
  const [games, setGames] = useState<SimGame[]>(SIM_GAMES);
  const [seed, setSeed] = useState(1);
  const [cal, setCal] = useState<CalibrationResult | null>(null);
  const [calStale, setCalStale] = useState(false);
  const [result, setResult] = useState<SimSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const gmap = useMemo(() => gameMap(games), [games]);
  const speed = cal?.speed ?? 1;
  const settings: SimSettings = { starters: players, engagedShare: 1, prizes, eventMinutes: hours * 60, spread, speed, runs: 300, seed };
  const reported = typeof day === 'number' ? resultForDay(day) : undefined;

  const runCalibration = () => {
    setBusy(true);
    setTimeout(() => {
      // Fitting to the real days needs a turnout guess: reported starters × the share who completed the most-completed task.
      setCal(calibrate(CALIBRATION_DAYS, gmap, { engagedShare: ENGAGED_SHARE_FROM_DATA, prizes: 50, eventMinutes: 300, spread, runs: 200, seed: 11 }));
      setCalStale(false);
      setBusy(false);
    }, 20);
  };

  useEffect(runCalibration, []); // fit once on load

  useEffect(() => {
    if (!cal) return;
    setBusy(true);
    const t = setTimeout(() => {
      setResult(missions.length ? simulate(missions, gmap, settings) : null);
      setBusy(false);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, gmap, players, prizes, hours, spread, seed, cal]);

  // Sweep over possible turnouts, one player count at a time so the page stays responsive.
  useEffect(() => {
    if (!cal || !missions.length) {
      setSweep([]);
      return;
    }
    let cancelled = false;
    const points: SweepPoint[] = [];
    setSweep([]);
    const next = (i: number) => {
      if (cancelled || i >= SWEEP_COUNTS.length) return;
      points.push(sweepPoint(missions, gmap, { ...settings, runs: 60, seed: 5 }, SWEEP_COUNTS[i]));
      setSweep([...points]);
      setTimeout(() => next(i + 1), 0);
    };
    const t = setTimeout(() => next(0), 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, gmap, prizes, hours, spread, cal]);

  const pickDay = (d: DayChoice) => {
    setDay(d);
    if (d !== 'custom') {
      setMissions(simMissionsForDay(d));
      setPrizes(50);
      setHours(5);
    }
  };
  const editMission = (i: number, patch: Partial<SimMission>) => {
    setDay('custom');
    setMissions(missions.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  };
  const setGame = (id: GameId, patch: Partial<SimGame>) => {
    setGames(games.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    setCalStale(true);
  };

  const fp = result?.finalPrize;
  const slowest = result ? result.bottleneckShare.indexOf(Math.max(...result.bottleneckShare)) : -1;
  const keno = gmap['keno'];
  const keno30 = chanceAtLeast(keno, 30);
  const kenoBets = 20 / keno30.p;
  const kenoHours = kenoBets / (keno.betsPerMin * speed) / 60;

  return (
    <>
      <header className="sim-top">
        <div className="sim-wrap row-between">
          <div className="brand">
            <span className="brand-mark">
              Missions <span>Simulator</span>
            </span>
            <span className="brand-sub">SPRIBE · cross-game promotions</span>
          </div>
          <nav className="sim-nav" aria-label="Sections">
            <a href="#setup">Set up</a>
            <a href="#results">Results</a>
            <a href="#turnout">Turnout</a>
            <a href="#overlap">Who plays what</a>
            <a href="#chances">Game chances</a>
            <a href="#real-days">Real days</a>
            <a href="#info">All info</a>
          </nav>
        </div>
      </header>

      <main className="sim-wrap sim-main">
        <section className="sim-hero">
          <h1>
            When does the <em>last prize</em> go?
          </h1>
          <p className="lede">
            Pick a day from the last campaign or build your own missions. We simulate a few hundred versions of the day, with every player doing all the missions at
            the same time, using each game’s real paytable or rules, and show when the 50th winner usually finishes.
          </p>
          <div className="hero-stats">
            <div className="hstat">
              <span className="k">Last prize goes at · {players} players</span>
              <span className="v">{!result ? '—' : fp && Number.isFinite(fp.median) ? fmtDuration(fp.median) : 'Not in time'}</span>
              <span className="s">
                {!result
                  ? 'typical simulated day'
                  : fp && Number.isFinite(fp.median)
                    ? `usually ${fmtDuration(fp.p10)} – ${Number.isFinite(fp.p90) ? fmtDuration(fp.p90) : 'after the end'}`
                    : `about ${Math.round(result.avgWinners)} of ${prizes} prizes won by the end`}
              </span>
            </div>
            <div className="hstat">
              <span className="k">Chance all {prizes} prizes go</span>
              <span className="v">{result ? `${Math.round(result.pAllClaimed * 100)}%` : '—'}</span>
              <span className="s">within {hours} h</span>
            </div>
            <div className="hstat">
              <span className="k">Slowest mission</span>
              <span className="v sm">{result && slowest >= 0 ? describeMission(missions[slowest], gmap[missions[slowest].game].name) : '—'}</span>
              <span className="s">{result && slowest >= 0 ? `last one done for ${Math.round(result.bottleneckShare[slowest] * 100)}% of winners` : ''}</span>
            </div>
          </div>
        </section>

        <section id="setup" className="sim-section">
          <h2>1 · Set up the day</h2>
          <div className="chips" role="group" aria-label="Choose a day">
            {DAY_RESULTS.map((r) => (
              <button key={r.day} aria-pressed={day === r.day} onClick={() => pickDay(r.day)} className={`daychip ${r.winners === 0 ? 'bad' : ''}`}>
                Day {r.day}
                <small>{r.winners === 0 ? '0 winners' : fmtDuration(r.durationMin)}</small>
              </button>
            ))}
            <button aria-pressed={day === 'custom'} className="daychip" onClick={() => setDay('custom')}>
              My own
              <small>edit freely</small>
            </button>
          </div>

          <div className="setup-grid">
            <div className="card">
              <div className="row-between">
                <h3>Missions</h3>
                <button
                  className="small"
                  onClick={() => {
                    setDay('custom');
                    setMissions([...missions, { game: 'mines', kind: 'bets', target: 100 }]);
                  }}
                >
                  + Add mission
                </button>
              </div>
              <p className="small muted">Everyone plays all missions at once. A player wins when every mission is done.</p>
              <div className="missions">
                {missions.map((m, i) => {
                  const g = gmap[m.game];
                  const c = m.kind === 'catch' ? chanceAtLeast(g, m.threshold ?? 1) : null;
                  const p = m.kind === 'catch' ? missionChance(m, g) : null;
                  return (
                    <div key={i} className="mission">
                      <select aria-label="Game" value={m.game} onChange={(e) => editMission(i, { game: e.target.value as GameId })}>
                        {games.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <select aria-label="Mission type" value={m.kind} onChange={(e) => editMission(i, { kind: e.target.value as SimMission['kind'], threshold: e.target.value === 'catch' ? m.threshold ?? 20 : undefined })}>
                        <option value="catch">Catch X× or more</option>
                        <option value="collect">Collect X× in total</option>
                        <option value="bets">Place bets</option>
                      </select>
                      {m.kind === 'catch' && (
                        <label className="inline">
                          <input aria-label="Multiplier" type="number" min={1} value={m.threshold ?? ''} onChange={(e) => editMission(i, { threshold: Number(e.target.value) || 1 })} />×
                        </label>
                      )}
                      <label className="inline">
                        <input aria-label="Target" type="number" min={1} value={m.target} onChange={(e) => editMission(i, { target: Math.max(1, Number(e.target.value) || 1) })} />
                        {m.kind === 'catch' ? 'times' : m.kind === 'collect' ? '× total' : 'bets'}
                      </label>
                      {p != null && (
                        <span className={`odds ${chanceClass(p)}`} title={m.chanceOverride != null ? 'Your own chance' : c?.setup}>
                          {p === 0 ? 'impossible' : oneIn(p)}
                        </span>
                      )}
                      <button className="ghost small" aria-label="Remove mission" onClick={() => { setDay('custom'); setMissions(missions.filter((_, j) => j !== i)); }}>
                        ✕
                      </button>
                      {m.kind === 'catch' && (
                        <div className="mission-note">
                          <span>{m.chanceOverride != null ? 'Using your own chance' : c && c.p > 0 ? `Best way: ${c.setup} (pays about ${fmtX(c.pays)})` : c?.setup}</span>
                          <label className="inline">
                            Own chance
                            <input
                              aria-label="Your own chance per bet in percent"
                              type="number"
                              min={0}
                              max={100}
                              step="any"
                              placeholder="—"
                              value={m.chanceOverride != null ? +(m.chanceOverride * 100).toPrecision(6) : ''}
                              onChange={(e) => editMission(i, { chanceOverride: e.target.value === '' ? null : Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                            />
                            %
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
                {missions.length === 0 && <div className="empty">No missions. Add one or pick a day.</div>}
              </div>
            </div>

            <div className="card">
              <h3>Players and prizes</h3>
              <label className="field" htmlFor="s-players">
                <span className="lbl">
                  <span>Players going for the prizes</span>
                  <strong className="num" style={{ color: 'var(--fg)', fontSize: '1rem' }}>
                    {players}
                  </strong>
                </span>
                <input id="s-players" type="range" min={10} max={1000} step={5} value={players} onChange={(e) => setPlayers(Number(e.target.value))} />
              </label>
              <p className="tiny muted">
                Nobody knows the turnout in advance, so section 3 runs the day for 25 to 1,000 players. This slider picks one turnout for the detailed view. For reference, the last
                campaign had 150–191 players a day starting at least one task, and not all of them went for the full set.
              </p>
              <div className="form-grid">
                <label className="field" htmlFor="s-prizes">
                  <span className="lbl">Prizes</span>
                  <input id="s-prizes" type="number" min={1} value={prizes} onChange={(e) => setPrizes(Math.max(1, Number(e.target.value) || 1))} />
                </label>
                <label className="field" htmlFor="s-hours">
                  <span className="lbl">Event length (hours)</span>
                  <input id="s-hours" type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || 5))} />
                </label>
              </div>
              <div className="stack-sm">
                <span className="small muted">How different are players’ speeds?</span>
                <div className="seg" role="group" aria-label="Player speed differences">
                  {SPREADS.map((s) => (
                    <button key={s.value} aria-pressed={spread === s.value} onClick={() => setSpread(s.value)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="results" className="sim-section">
          <div className="row-between">
            <h2>2 · What happens</h2>
            <div className="row">
              {busy && <span className="small muted">Simulating…</span>}
              <button className="sim" onClick={() => setSeed(seed + 1)}>
                Run again with new luck
              </button>
            </div>
          </div>
          {!result ? (
            <div className="empty">Add at least one mission to run the simulation.</div>
          ) : (
            <>
              <p className="headline">
                {fp && Number.isFinite(fp.median) ? (
                  <>
                    With {players} players, the {prizes}th winner usually finishes after <strong>{fmtDuration(fp.median)}</strong>.{' '}
                    {fp.median < hours * 60 * 0.6 ? 'That is well before the end of the event: prizes run out early.' : fp.median < hours * 60 ? 'That is fairly close to the end of the event.' : ''}
                  </>
                ) : (
                  <>
                    In most simulated days <strong>not all {prizes} prizes are won</strong> within {hours} hours. On average {Math.round(result.avgWinners)} players finish in time.
                  </>
                )}
                {reported && (
                  <>
                    {' '}
                    Real Day {reported.day}: {reported.winners === 0 ? <strong>0 winners</strong> : <strong>last prize at {fmtDuration(reported.durationMin)}</strong>}.
                  </>
                )}
              </p>
              <div className="results-grid">
                <div className="card">
                  <h3>One typical day, minute by minute</h3>
                  <RaceChart run={result.typical} prizes={prizes} eventMinutes={hours * 60} reportedMinutes={reported && reported.winners > 0 ? reported.durationMin : undefined} />
                  {missions.some((m) => m.game === 'aviator') && (
                    <p className="tiny muted">
                      Big jumps happen when a shared Aviator round flies past the target: everyone playing that round catches it at the same moment, so many players finish together.
                    </p>
                  )}
                </div>
                <div className="card">
                  <h3>Which mission held winners back</h3>
                  <p className="small muted">The mission each winner finished last.</p>
                  <Bars
                    items={missions.map((m, i) => ({ label: describeMission(m, gmap[m.game].name), value: result.bottleneckShare[i], text: `${Math.round(result.bottleneckShare[i] * 100)}%` }))}
                    max={1}
                  />
                  <h3 style={{ marginTop: 10 }}>Players who completed each mission</h3>
                  <p className="small muted">Median, counted until the last prize went{reported ? '. Real day in brackets where reported.' : '.'}</p>
                  <Bars
                    items={missions.map((m, i) => {
                      const real = reported && (reported.least.game === m.game ? reported.least.completed : reported.most.game === m.game ? reported.most.completed : null);
                      return { label: describeMission(m, gmap[m.game].name), value: result.missionDoneMedian[i], text: `${result.missionDoneMedian[i]}${real != null ? ` (real ${real})` : ''}` };
                    })}
                    max={Math.max(1, ...result.missionDoneMedian)}
                    color="var(--sim)"
                  />
                </div>
              </div>
              <p className="tiny muted">
                {result.runs.length} simulated days · speed factor ×{speed.toFixed(2)} fitted to real days · this is a model, not real SPRIBE data.
              </p>
            </>
          )}
        </section>

        <section id="turnout" className="sim-section">
          <h2>3 · What if more or fewer players join?</h2>
          <p className="lede small">The same day simulated for 25 to 1,000 players going for the prizes. Click a point to see that turnout in detail.</p>
          <div className="card">
            <SweepChart points={sweep} eventMinutes={hours * 60} selected={players} onPick={setPlayers} alreadyAll={missionOverlap(missions).max?.limit} />
            {sweep.length < SWEEP_COUNTS.length && (
              <p className="tiny muted">
                Simulating turnout {sweep.length + 1} of {SWEEP_COUNTS.length}…
              </p>
            )}
            {sweep.length === SWEEP_COUNTS.length && <p className="headline small">{sweepSentence(sweep, prizes, hours)}</p>}
            {sweep.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="num">Players</th>
                      <th className="num">Last prize (usual)</th>
                      <th className="num">Range</th>
                      <th className="num">Chance all {prizes} prizes go</th>
                      <th className="num">Avg. winners</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweep.map((p) => (
                      <tr key={p.players} className={Math.abs(p.players - players) < 1 ? 'hl' : undefined}>
                        <td className="num">
                          <button className="ghost small" onClick={() => setPlayers(p.players)}>
                            {p.players}
                          </button>
                        </td>
                        <td className="num">{Number.isFinite(p.median) ? fmtDuration(p.median) : 'Prizes left'}</td>
                        <td className="num small muted">
                          {Number.isFinite(p.p10) ? `${fmtDuration(p.p10)} – ${Number.isFinite(p.p90) ? fmtDuration(p.p90) : 'after end'}` : '—'}
                        </td>
                        <td className="num">{Math.round(p.pAllClaimed * 100)}%</td>
                        <td className="num">{p.avgWinners.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <OverlapSection missions={missions} />

        <section id="chances" className="sim-section">
          <h2>5 · How likely is each multiplier?</h2>
          <p className="lede small">
            Chance that one bet reaches at least that multiplier, using the setup that makes it most likely (hover a cell to see it). Keno, Plinko, Mines and Goal come from
            their published paytables and rules; Aviator, Pilot Chicken and Trader use crash maths; Keno 80’s paytable was not found.
          </p>
          <div className="table-wrap">
            <table className="odds-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>How we know</th>
                  {THRESHOLDS.map((x) => (
                    <th key={x} className="num">
                      {x}×
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.name}</strong>
                    </td>
                    <td className="small">
                      <span className={`kind ${g.kind}`}>{KIND_TEXT[g.kind]}</span>
                    </td>
                    {THRESHOLDS.map((x) => {
                      const c = chanceAtLeast(g, x);
                      return (
                        <td key={x} className={`num small odds-cell ${c.p === 0 ? 'none' : chanceClass(c.p)}`} title={c.setup}>
                          {c.p === 0 ? '✕' : oneIn(c.p)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend-row small">
            <span className="odds easy">1 in 10 or better</span>
            <span className="odds mid">1 in 10–33</span>
            <span className="odds hard">1 in 33–100</span>
            <span className="odds rare">rarer than 1 in 100</span>
            <span className="odds none">✕ not possible</span>
          </div>
          <GameNotes games={games} />
          <details className="card flat">
            <summary>Adjust game speed and RTP</summary>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>RTP %</th>
                    <th>Bets / min</th>
                    <th>RTP source</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td style={{ width: 100 }}>
                        <input aria-label={`${g.name} RTP`} type="number" step={0.1} value={+(g.rtp * 100).toFixed(2)} onChange={(e) => setGame(g.id, { rtp: Math.min(1, Math.max(0.5, Number(e.target.value) / 100 || 0.97)) })} />
                      </td>
                      <td style={{ width: 100 }}>
                        <input aria-label={`${g.name} bets per minute`} type="number" step={0.5} min={0.1} value={g.betsPerMin} onChange={(e) => setGame(g.id, { betsPerMin: Math.max(0.1, Number(e.target.value) || 1) })} />
                      </td>
                      <td className="small muted">{g.rtpNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">
              RTP changes the crash and grid games (Keno and Plinko use their fixed paytables). Bets per minute are starting guesses (Aviator: rounds per minute); the fitted
              speed factor ×{speed.toFixed(2)} scales them all to match the real days.{calStale && ' You changed settings, so re-fit to keep the match.'}
            </p>
            <button onClick={runCalibration} className={calStale ? 'primary' : undefined}>
              Re-fit to real days
            </button>
          </details>
        </section>

        <section id="real-days" className="sim-section">
          <h2>6 · Does it match the real campaign?</h2>
          <p className="lede small">
            We used one number, a speed factor, to line the simulator up with the real days. Everything else comes from the game rules above.
          </p>
          <div className="results-grid">
            <div className="card">
              <h3>Last prize: real vs simulated</h3>
              {cal ? (
                <Bars
                  pairs
                  items={DAY_RESULTS.map((r) => {
                    const c = cal.perDay.find((x) => x.day === r.day);
                    return {
                      label: `Day ${r.day}`,
                      value: r.winners === 0 ? 300 : r.durationMin,
                      value2: c?.simulated,
                      text: r.winners === 0 ? 'real: 0 winners' : `real ${fmtDuration(r.durationMin)} · sim ${c ? fmtDuration(c.simulated) : '—'}`,
                    };
                  })}
                  max={330}
                />
              ) : (
                <p className="muted">Fitting…</p>
              )}
              <p className="tiny muted">Grey = real reported duration, cyan = simulated median. Day 6 is left out of the fit because nobody won.</p>
            </div>
            <div className="card">
              <h3>Day 6: why did nobody finish Keno?</h3>
              <p className="small">
                Keno’s paytable tops out at 100×. The best way to get 30× or more is <strong>{keno30.setup}</strong>, which happens about <strong>{oneIn(keno30.p)}</strong> bets.
              </p>
              <p className="small">
                Catching it 20 times takes about <strong>{Math.round(kenoBets).toLocaleString('en-US')} bets</strong> on average, roughly <strong>{Math.round(kenoHours)} hours</strong> of
                non-stop Keno at the fitted speed. Within a 5-hour day that is practically impossible, which matches the real result: 0 completions out of 191 players.
              </p>
              <p className="small muted">
                For comparison, 30× in Aviator happens about 1 round in 31. The same “30× twenty times” target is roughly {Math.round(chanceAtLeast(gmap['aviator'], 30).p / keno30.p)}× harder in
                Keno.
              </p>
              <button className="small" onClick={() => pickDay(6)}>
                Replay Day 6
              </button>
            </div>
          </div>
        </section>

        <Details />

        <footer className="foot">
          Missions Simulator · SPRIBE internal planning tool. Keno, Plinko, Mines and Goal chances come from paytables and rules published on review sites (checked against 97% RTP);
          Aviator, Pilot Chicken, Trader and Keno 80 are estimates. Results are simulations, not real SPRIBE data.
        </footer>
      </main>
    </>
  );
}
