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
          <li>Plinko yellow tables, Keno 8–10 pick rows and the Keno 80 paytable (only partly published).</li>
          <li>Which setups players actually used (Keno picks, Plinko rows and colour, Mines count).</li>
          <li>Bets per minute per game, and how much slower people play when they run several games at once.</li>
          <li>Each player’s opt-in time and mission completion times (not just day totals).</li>
          <li>Whether missions stayed open after the 50 prizes were gone.</li>
          <li>The Day 6 Keno setup: number picks, “exactly” vs “at least” 30×, and progress logs.</li>
        </ul>
      </details>

      <details className="card flat">
        <summary>How the simulator works</summary>
        <ul className="clean small" style={{ marginTop: 10 }}>
          <li>Each simulated day creates the chosen number of players going for the prizes and gives each one a personal speed. Turnout is unknown, so the page also runs the day for 25 to 1,000 players.</li>
          <li>Only the fit to the real days uses a turnout guess: the reported starters × the share who completed the most-completed task (about 60%).</li>
          <li>Everyone plays all missions at once. A player wins when their slowest mission is done; the first 50 winners take the prizes.</li>
          <li>
            <strong>Keno and Plinko</strong>: exact chances from the published paytables (every table adds up to 97% RTP). Players are assumed to use the setup that best reaches the
            target.
          </li>
          <li>
            <strong>Mines and Goal</strong>: exact chances from the grid rules. Goal can never pay more than 9.03×.
          </li>
          <li>
            <strong>Aviator</strong> rounds are shared: when a round flies past 30×, everyone in that round catches it. Reaching X× happens in about 97% ÷ X of rounds. A slower player just
            skips some rounds.
          </li>
          <li>
            <strong>Pilot Chicken and Trader</strong>: best estimate from crash maths, cashing out at X× works about 97% ÷ X of the time. <strong>Keno 80</strong> uses the same formula as a
            best case because its paytable was not found.
          </li>
          <li>“Collect X× in total” assumes players take the easiest win of 2× or more each time.</li>
          <li>One speed factor is fitted so simulated last-prize times match Days 1–5 and 7 as closely as possible.</li>
          <li>All SPRIBE games are listed at 97% RTP; Keno 80 has one listing at 93.6%.</li>
        </ul>
      </details>
    </section>
  );
}
