import { useEffect, useMemo, useState } from 'react';
import { DAY_RESULTS, resultForDay } from '../data/previousCampaign';
import type { GameId } from '../data/games';
import { fmtDuration } from '../math/format';
import { calibrate, describeMission, gameMap, simulate, type CalibrationResult, type SimMission, type SimSettings, type SimSummary } from './engine';
import { SIM_GAMES, chanceAtLeast, oneIn, type SimGame } from './games';
import { CALIBRATION_DAYS, ENGAGED_SHARE_FROM_DATA, simMissionsForDay } from './days';
import { zeroFinisherCeiling } from './kenoCheck';
import { RaceChart, Bars } from './charts';
import { Details } from './Details';

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

export default function SimApp() {
  const [day, setDay] = useState<DayChoice>(7);
  const [missions, setMissions] = useState<SimMission[]>(simMissionsForDay(7));
  const [starters, setStarters] = useState(171);
  const [prizes, setPrizes] = useState(50);
  const [hours, setHours] = useState(5);
  const [engagedPct, setEngagedPct] = useState(Math.round(ENGAGED_SHARE_FROM_DATA * 100));
  const [spread, setSpread] = useState(0.5);
  const [games, setGames] = useState<SimGame[]>(SIM_GAMES);
  const [seed, setSeed] = useState(1);
  const [cal, setCal] = useState<CalibrationResult | null>(null);
  const [calStale, setCalStale] = useState(false);
  const [result, setResult] = useState<SimSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const gmap = useMemo(() => gameMap(games), [games]);
  const speed = cal?.speed ?? 1;
  const settings: SimSettings = { starters, engagedShare: engagedPct / 100, prizes, eventMinutes: hours * 60, spread, speed, runs: 300, seed };
  const reported = typeof day === 'number' ? resultForDay(day) : undefined;

  const runCalibration = () => {
    setBusy(true);
    setTimeout(() => {
      setCal(calibrate(CALIBRATION_DAYS, gmap, { engagedShare: engagedPct / 100, prizes: 50, eventMinutes: 300, spread, runs: 200, seed: 11 }));
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
  }, [missions, gmap, starters, prizes, hours, engagedPct, spread, seed, cal]);

  const pickDay = (d: DayChoice) => {
    setDay(d);
    if (d !== 'custom') {
      setMissions(simMissionsForDay(d));
      setStarters(resultForDay(d)!.started);
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
  const kenoCeiling = useMemo(
    () => zeroFinisherCeiling({ k: 20, betsPerMin: keno.betsPerMin * speed, minutes: 299, engaged: Math.round(191 * (engagedPct / 100)), spread }),
    [keno.betsPerMin, speed, engagedPct, spread],
  );

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
            the same time, and show when the 50th winner usually finishes.
          </p>
          <div className="hero-stats">
            <div className="hstat">
              <span className="k">Last prize goes at</span>
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
                  const p = m.kind === 'catch' ? chanceAtLeast(g, m.threshold ?? 1) : null;
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
                      {p != null && <span className={`odds ${chanceClass(p)}`} title="Chance per bet (estimate)">{oneIn(p)}</span>}
                      <button className="ghost small" aria-label="Remove mission" onClick={() => { setDay('custom'); setMissions(missions.filter((_, j) => j !== i)); }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
                {missions.length === 0 && <div className="empty">No missions. Add one or pick a day.</div>}
              </div>
            </div>

            <div className="card">
              <h3>Players and prizes</h3>
              <div className="form-grid">
                <label className="field" htmlFor="s-starters">
                  <span className="lbl">Players who start</span>
                  <input id="s-starters" type="number" min={1} value={starters} onChange={(e) => setStarters(Math.max(1, Number(e.target.value) || 1))} />
                </label>
                <label className="field" htmlFor="s-prizes">
                  <span className="lbl">Prizes</span>
                  <input id="s-prizes" type="number" min={1} value={prizes} onChange={(e) => setPrizes(Math.max(1, Number(e.target.value) || 1))} />
                </label>
                <label className="field" htmlFor="s-hours">
                  <span className="lbl">Event length (hours)</span>
                  <input id="s-hours" type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || 5))} />
                </label>
                <label className="field" htmlFor="s-engaged">
                  <span className="lbl">Go for the full set</span>
                  <span className="input-suffix">
                    <input id="s-engaged" type="number" min={1} max={100} value={engagedPct} onChange={(e) => setEngagedPct(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
                    <span>%</span>
                  </span>
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
              <p className="tiny muted">
                “Go for the full set” defaults to {Math.round(ENGAGED_SHARE_FROM_DATA * 100)}%: on average that share of starters completed the most-completed task in the real
                campaign.
              </p>
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
                    In a typical simulated day the {prizes}th winner finishes after <strong>{fmtDuration(fp.median)}</strong>.{' '}
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

        <section id="chances" className="sim-section">
          <h2>3 · How likely is each multiplier?</h2>
          <p className="lede small">
            Chance that one bet reaches at least that multiplier. Where players pick their own cash-out point, aiming for X× wins about RTP ÷ X of the time. For Keno and
            Plinko the paytable decides, so RTP ÷ X is only the best possible case.
          </p>
          <div className="table-wrap">
            <table className="odds-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>How it works</th>
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
                    <td className="small muted">{g.kind === 'shared-crash' ? 'Shared rounds' : g.kind === 'aim' ? 'Pick your cash-out' : 'Paytable: best case'}</td>
                    {THRESHOLDS.map((x) => {
                      const p = chanceAtLeast(g, x);
                      return (
                        <td key={x} className={`num small odds-cell ${chanceClass(p)}`}>
                          {oneIn(p)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">
            The rows look alike because every game uses the same 97% RTP for now. What makes games differ in the simulator is speed (bets per minute), shared Aviator rounds,
            and how far Keno and Plinko fall short of the best case. Enter SPRIBE’s real paytables and RTPs to sharpen this.
          </p>
          <div className="legend-row small">
            <span className="odds easy">1 in 10 or better</span>
            <span className="odds mid">1 in 10–33</span>
            <span className="odds hard">1 in 33–100</span>
            <span className="odds rare">rarer than 1 in 100</span>
          </div>
          <details className="card flat">
            <summary>Adjust game settings (RTP, speed, paytable)</summary>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>RTP %</th>
                    <th>Bets / min</th>
                    <th>Paytable vs best case</th>
                    <th>Where the RTP comes from</th>
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
                      <td style={{ width: 150 }}>
                        {g.kind === 'paytable' ? (
                          <span className="input-suffix">
                            <input aria-label={`${g.name} share of best case`} type="number" min={0} max={100} value={Math.round(g.paytableShare * 1000) / 10} onChange={(e) => setGame(g.id, { paytableShare: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })} />
                            <span>%</span>
                          </span>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                      <td className="small muted">{g.rtpNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">
              Bets per minute are starting guesses (Aviator: rounds per minute). The fitted speed factor ×{speed.toFixed(2)} scales them all to match the real days.
              {calStale && ' You changed game settings, so re-fit to keep the match.'}
            </p>
            <button onClick={runCalibration} className={calStale ? 'primary' : undefined}>
              Re-fit to real days
            </button>
          </details>
        </section>

        <section id="real-days" className="sim-section">
          <h2>4 · Does it match the real campaign?</h2>
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
                Mission: catch 30× or more 20 times in Keno. If Keno’s paytable gave the best possible chance of 30× (<strong>{oneIn(chanceAtLeast({ ...keno, paytableShare: 1 }, 30))}</strong> bets), the
                simulator says most players would have finished it.
              </p>
              <p className="small">
                The real result was <strong>0 out of 191</strong>. For that to be a normal outcome, the real chance of 30× in Keno must have been about{' '}
                <strong>{oneIn(kenoCeiling)}</strong> bets or rarer, roughly {Math.round(chanceAtLeast({ ...keno, paytableShare: 1 }, 30) / Math.max(kenoCeiling, 1e-12))}× harder than
                the best case.
              </p>
              <p className="small muted">
                Possible reasons: the paytable rarely pays 30×, some setups (number of picks) can’t pay 30× at all, the mission counted “exactly 30×”, or progress wasn’t
                tracked. Only the game’s paytable and bet data can tell which.
              </p>
              <button
                className="small"
                onClick={() => {
                  setGame('keno', { paytableShare: Math.max(0.001, kenoCeiling / chanceAtLeast({ ...keno, paytableShare: 1 }, 30)) });
                  pickDay(6);
                }}
              >
                Use that Keno chance and replay Day 6
              </button>
            </div>
          </div>
        </section>

        <Details />

        <footer className="foot">
          Missions Simulator · SPRIBE internal planning tool. Game chances are estimates from game mechanics and reported RTPs, not official paytables. Results are simulations, not
          real SPRIBE data.
        </footer>
      </main>
    </>
  );
}
