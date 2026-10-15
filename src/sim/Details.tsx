import { COMPETITORS } from '../data/competitors';
import { GAME_BY_ID } from '../data/games';
import { DAYS, DAY_RESULTS, missionsForDay } from '../data/previousCampaign';
import { fmtDuration } from '../math/format';

/** Everything else, folded away so the simulator stays simple. */
export function Details() {
  return (
    <section id="info" className="sim-section">
      <h2>5 · All the info</h2>
      <p className="lede small">Open any part you need.</p>

      <details className="card flat">
        <summary>Last campaign: missions for each day</summary>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Missions (original wording)</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td>Day {d}</td>
                  <td className="small">
                    {missionsForDay(d)
                      .map((m) => `${GAME_BY_ID[m.game].name}: ${m.text}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="card flat">
        <summary>Last campaign: reported results</summary>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Registered</th>
                <th className="num">Started</th>
                <th className="num">Duration</th>
                <th className="num">Winners</th>
                <th>Least completed</th>
                <th>Most completed</th>
              </tr>
            </thead>
            <tbody>
              {DAY_RESULTS.map((r) => (
                <tr key={r.day} className={r.winners === 0 ? 'removed' : undefined}>
                  <td>D{r.day}</td>
                  <td className="num">{r.registered.toLocaleString('en-US')}</td>
                  <td className="num">{r.started}</td>
                  <td className="num">{fmtDuration(r.durationMin)}</td>
                  <td className="num">{r.winners}</td>
                  <td className="small">
                    {r.least.reported} ({r.least.completed})
                  </td>
                  <td className="small">
                    {r.most.reported} ({r.most.completed})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="clean small" style={{ marginTop: 10 }}>
          <li>Only 10.5–12.9% of registered players started a task. About a third of those who started won.</li>
          <li>Every day with winners ran out of prizes before the 5-hour mark; Day 7 came closest at 3h 39m.</li>
          <li>Day 2 check: the report says “Trader – Place 100 bets”, but the mission list has Trader “Collect 100×”.</li>
        </ul>
      </details>

      <details className="card flat">
        <summary>What competitors do</summary>
        <div className="comp-list">
          {COMPETITORS.map((c) => (
            <div key={c.id} className="comp-item">
              <div className="row-between">
                <strong>
                  {c.provider} · {c.title}
                </strong>
                <span className="tiny muted">{c.dateText}</span>
              </div>
              <p className="small">{c.takeaway}</p>
              <a className="small" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source ↗
              </a>
            </div>
          ))}
        </div>
      </details>

      <details className="card flat">
        <summary>Ideas to test next</summary>
        <ul className="clean small" style={{ marginTop: 10 }}>
          <li>
            <strong>Make the slowest mission easier first.</strong> In the simulator, Aviator “30× or more” is usually the last mission done. Fewer catches, or a lower multiplier,
            moves the last prize earlier; more catches move it later.
          </li>
          <li>
            <strong>Hourly prizes.</strong> Split the 50 prizes into five hourly batches so there is still something to win late in the event.
          </li>
          <li>
            <strong>Either-or routes.</strong> Let players finish a hard task OR an easier alternative, so one rare result can’t block everyone (Day 6).
          </li>
          <li>Change one mission at a time and compare against Day 7, the day closest to the target.</li>
        </ul>
      </details>

      <details className="card flat">
        <summary>Data that would make this more accurate</summary>
        <ul className="clean small" style={{ marginTop: 10 }}>
          <li>Real Keno and Plinko paytables (chance of each multiplier per setup).</li>
          <li>Bets per minute per game, and how much slower people play when they run several games at once.</li>
          <li>Each player’s opt-in time and mission completion times (not just day totals).</li>
          <li>Whether missions stayed open after the 50 prizes were gone.</li>
          <li>The Day 6 Keno setup: number picks, “exactly” vs “at least” 30×, and progress logs.</li>
        </ul>
      </details>

      <details className="card flat">
        <summary>How the simulator works</summary>
        <ul className="clean small" style={{ marginTop: 10 }}>
          <li>Each simulated day creates the players who start, keeps the share who go for the full set, and gives each player a personal speed.</li>
          <li>Everyone plays all missions at once. A player wins when their slowest mission is done; the first 50 winners take the prizes.</li>
          <li>
            <strong>Aviator</strong> rounds are shared: when a round flies past 30×, everyone in that round catches it. A slower player just skips some rounds. Crash chance:
            reaching X× happens in RTP ÷ X of rounds.
          </li>
          <li>
            <strong>Pilot Chicken, Mines, Goal, Trader</strong>: the player picks when to cash out, so aiming for X× works about RTP ÷ X of the time.
          </li>
          <li>
            <strong>Keno, Plinko</strong>: the paytable decides. RTP ÷ X is the best case; the real chance can be much lower. Adjust it under “Adjust game settings”.
          </li>
          <li>“Collect X× in total” assumes players cash out around 2× each time.</li>
          <li>One speed factor is fitted so simulated last-prize times match Days 1–5 and 7 as closely as possible.</li>
          <li>RTPs: 97% is reported for Aviator and Pilot Chicken; for the other games 97% is an assumption until SPRIBE’s own figures are entered.</li>
        </ul>
      </details>
    </section>
  );
}
