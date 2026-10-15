import { COMPETITORS, SUPPORTING_SOURCES } from '../data/competitors';
import { GAME_BY_ID } from '../data/games';
import { DAYS, DAY_RESULTS, missionsForDay } from '../data/previousCampaign';
import { fmtDuration } from '../math/format';

const TAKEAWAYS = [
  {
    title: 'Prizes ran out early',
    text: 'On every day with winners, all 50 prizes were gone before the 5-hour mark: 49m to 2h 08m on Days 1–5, and 3h 39m on Day 7.',
  },
  {
    title: 'One hard task can block everyone',
    text: 'Day 6 had 191 active players and 0 winners, because nobody completed Keno “30× or more 20 times”. The cause is not yet known.',
  },
  {
    title: 'The rarest task decides the pace',
    text: 'Aviator “30× or more” was the least-completed task on Days 3, 5 and 7. Winners can never outnumber completions of the hardest task.',
  },
  {
    title: 'Few players, many winners',
    text: 'Only about 11–13% of registered players started a task, and about one in three of them won. A small active group empties 50 prizes quickly.',
  },
  {
    title: 'Competitors avoid single blockers',
    text: 'Rivals use alternative routes (SmartSoft), “complete any 3” rules (Stake), daily caps, or one mission at a time (Pragmatic / Supabets).',
  },
];

export default function Brief() {
  return (
    <div className="brief">
      <header className="brief-head">
        <span className="kicker">SPRIBE · Cross-game promotions · Research brief</span>
        <h1>Cross-game missions: what we learned</h1>
        <p className="lede">
          A short summary of our last 7-day campaign and what other providers do with missions. All competitor facts link to their published source; our own results
          are internal team reports.
        </p>
      </header>

      <section>
        <h2>Five takeaways</h2>
        <ol className="takeaways">
          {TAKEAWAYS.map((t) => (
            <li key={t.title}>
              <strong>{t.title}.</strong> {t.text}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Our last campaign</h2>
        <p className="small muted">Target: about 5 hours per day, first 50 finishers win, all games playable at the same time.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Missions</th>
                <th className="num">Started</th>
                <th className="num">Last prize</th>
                <th>Hardest task (completions)</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => {
                const r = DAY_RESULTS.find((x) => x.day === d)!;
                return (
                  <tr key={d} className={r.winners === 0 ? 'removed' : undefined}>
                    <td>
                      <strong>D{d}</strong>
                    </td>
                    <td className="small">
                      {missionsForDay(d).map((m) => (
                        <div key={m.game}>
                          <span className="muted">{GAME_BY_ID[m.game].name}:</span> {m.text}
                        </div>
                      ))}
                    </td>
                    <td className="num">{r.started}</td>
                    <td className="num">{r.winners === 0 ? '0 winners' : fmtDuration(r.durationMin)}</td>
                    <td className="small">
                      {r.least.reported} ({r.least.completed})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">
          “Last prize” is the reported duration, read as the time the 50th prize was claimed (Day 6: the event ran to the end). Day 2’s report names “Trader – Place 100
          bets” although the mission list has Trader “Collect 100×”; this needs checking.
        </p>
      </section>

      <section>
        <h2>What competitors do</h2>
        <div className="comp-grid">
          {COMPETITORS.map((c) => (
            <article key={c.id} className="comp">
              <span className="kicker">
                {c.provider} · {c.channel}
              </span>
              <h3>{c.title}</h3>
              <span className="tiny muted">{c.dateText}</span>
              <ul className="clean small">
                {c.facts.slice(0, 4).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {c.tasks.length > 0 && (
                <p className="small">
                  <span className="muted">Example tasks:</span> {c.tasks.slice(0, 3).map((t) => t.text + (t.reward ? ` → ${t.reward}` : '')).join('; ')}
                </p>
              )}
              <p className="take">{c.takeaway}</p>
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="small">
                Source ↗
              </a>
            </article>
          ))}
        </div>
        <p className="tiny muted">
          A promotion that lists several eligible games is not proof that players had to play every game. Historical campaigns are shown with their published dates.
        </p>
      </section>

      <section>
        <h2>Provider tools</h2>
        <ul className="clean small">
          {SUPPORTING_SOURCES.map((s) => (
            <li key={s.url}>
              <strong>{s.title}:</strong> {s.points.join(' ')}{' '}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                Source ↗
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">SPRIBE internal research. Competitor details are as published on the linked pages; no competitor results or ROI are known.</footer>
    </div>
  );
}
