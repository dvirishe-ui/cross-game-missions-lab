import { DAY_RESULTS, PRIZE_PLACES_REPORTED, participation, shareOfStartersNeeded } from '../data/previousCampaign';
import { fmtDuration, fmtNumber, fmtPercent } from '../math/format';
import { Badge } from '../components/ui';

const TARGET = 300;

function DurationChart() {
  const W = 640;
  const rowH = 26;
  const left = 46;
  const right = 20;
  const max = 330;
  const x = (m: number) => left + (m / max) * (W - left - right);
  const H = DAY_RESULTS.length * rowH + 40;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reported duration per day against the five-hour target">
      {[0, 60, 120, 180, 240, 300].map((m) => (
        <g key={m}>
          <line className="grid-line" x1={x(m)} x2={x(m)} y1={4} y2={H - 30} />
          <text x={x(m)} y={H - 14} textAnchor="middle">
            {m / 60}h
          </text>
        </g>
      ))}
      {DAY_RESULTS.map((r, i) => {
        const y = 6 + i * rowH;
        const blocked = r.winners === 0;
        const fill = blocked ? 'var(--block)' : r.day === 7 ? 'var(--ok)' : 'var(--warn)';
        return (
          <g key={r.day}>
            <text x={left - 8} y={y + 13} textAnchor="end">
              D{r.day}
            </text>
            <rect x={left} y={y} width={x(r.durationMin) - left} height={rowH - 10} rx={3} fill={fill} opacity={blocked ? 0.35 : 0.85} />
            <text x={Math.min(x(r.durationMin) + 6, W - 150)} y={y + 13} style={{ fill: 'var(--fg-2)' }}>
              {fmtDuration(r.durationMin)} · {blocked ? '0 winners' : `${r.winners} winners`}
            </text>
          </g>
        );
      })}
      <line className="deadline" x1={x(TARGET)} x2={x(TARGET)} y1={0} y2={H - 30} />
      <text className="deadline-label" x={x(TARGET) - 4} y={H - 34} textAnchor="end">
        5h target
      </text>
      <text x={(left + W - right) / 2} y={H - 1} textAnchor="middle">
        Reported duration (hours since event start)
      </text>
    </svg>
  );
}

export function ReportedResults() {
  const fast = DAY_RESULTS.filter((r) => r.day <= 5);
  const minFast = Math.min(...fast.map((r) => r.durationMin));
  const maxFast = Math.max(...fast.map((r) => r.durationMin));
  const d7 = DAY_RESULTS.find((r) => r.day === 7)!;
  const d6 = DAY_RESULTS.find((r) => r.day === 6)!;
  const d5 = DAY_RESULTS.find((r) => r.day === 5)!;
  const shares = DAY_RESULTS.filter((r) => r.winners > 0).map((r) => shareOfStartersNeeded(r));
  const parts = DAY_RESULTS.map(participation);
  const starters = DAY_RESULTS.map((r) => r.started);
  return (
    <article className="card" id="reported-results">
      <div className="card-head">
        <div className="stack-sm">
          <h3>Reported results, all days</h3>
          <span className="small muted">Day-level figures reported by our team. Calculated rows are derived only from these figures.</span>
        </div>
        <div className="row">
          <Badge kind="internal" />
          <Badge kind="calculated" />
        </div>
      </div>

      <div className="split">
        <div className="stack-sm">
          <DurationChart />
          <p className="tiny muted">
            “Duration” as reported. On days with {PRIZE_PLACES_REPORTED} winners we read it as the time the last prize was claimed (final-prize time). Day 6’s 4h 59m
            appears to be the full event window. Please confirm this definition.
          </p>
        </div>
        <div className="stack-sm">
          <span className="eyebrow">What the reported numbers show</span>
          <ul className="clean small">
            <li>
              <strong>All prizes went before the five-hour window ended.</strong> Days 1–5: final prize at {fmtDuration(minFast)}–{fmtDuration(maxFast)}. Day 7:{' '}
              {fmtDuration(d7.durationMin)}, still {fmtDuration(TARGET - d7.durationMin)} before the 5h mark.
            </li>
            <li>
              <strong>The active audience is small.</strong> Only {fmtPercent(Math.min(...parts), 1)}–{fmtPercent(Math.max(...parts), 1)} of registered players started a
              task ({Math.min(...starters)}–{Math.max(...starters)} players a day). Model entrants as players who started, not registrations.
            </li>
            <li>
              <strong>About a third of active players won.</strong> Filling {PRIZE_PLACES_REPORTED} places took {fmtPercent(Math.min(...shares), 1)}–{fmtPercent(Math.max(...shares), 1)} of
              starters finishing every task. The pool runs out when roughly one active player in three finishes, not a small fraction.
            </li>
            <li>
              <strong>The hardest task caps the winners.</strong> Nobody can finish all tasks without the least-completed one. Aviator “30× or more” was least completed
              on Days 3, 5 and 7. On Day 4 the least-completed task (Plinko 15× ×10) had exactly 50 completions, equal to the winners.
            </li>
            <li>
              <strong>Day 6 had one blocker.</strong> {d6.started} players started, Keno 30× ×20 had 0 completions, while Plinko Collect 300× had {d6.most.completed}.
              Zero completions does not by itself identify the cause (see the <a href="#keno-check">Keno checklist</a>).
            </li>
          </ul>
          <div className="callout">
            <span className="badge calculated plain">Note</span>
            <p className="small">
              <strong>Days 5 and 7 had the same Aviator and Plinko requirements</strong>, and Aviator 30× ×30 was the least-completed task on both ({d5.least.completed} vs{' '}
              {d7.least.completed}). Yet the final prize went at {fmtDuration(d5.durationMin)} on Day 5 and {fmtDuration(d7.durationMin)} on Day 7. Those target counts alone
              cannot explain the difference.
            </p>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">Registered</th>
              <th className="num">Started ≥1 task</th>
              <th className="num">Participation</th>
              <th className="num">Duration</th>
              <th className="num">Winners</th>
              <th className="num">Starters needed to finish*</th>
              <th>Least completed task</th>
              <th>Most completed task</th>
            </tr>
          </thead>
          <tbody>
            {DAY_RESULTS.map((r) => (
              <tr key={r.day} className={r.winners === 0 ? 'removed' : undefined}>
                <td>D{r.day}</td>
                <td className="num">{fmtNumber(r.registered)}</td>
                <td className="num">{fmtNumber(r.started)}</td>
                <td className="num">{r.participationPct.toFixed(1)}%</td>
                <td className="num">{fmtDuration(r.durationMin)}</td>
                <td className="num">{r.winners}</td>
                <td className="num">{fmtPercent(shareOfStartersNeeded(r), 1)}</td>
                <td className="small">
                  {r.least.reported} <span className="num muted">({r.least.completed})</span>
                  {r.discrepancy && (
                    <span className="badge assumption plain" style={{ marginLeft: 6 }} title={r.discrepancy}>
                      Check
                    </span>
                  )}
                </td>
                <td className="small">
                  {r.most.reported} <span className="num muted">({r.most.completed})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">
        * {PRIZE_PLACES_REPORTED} prize places ÷ players who started a task (calculated). Prize places are taken as {PRIZE_PLACES_REPORTED} from the winner counts; Day 6 is assumed
        to have had the same number. Task labels are kept exactly as reported.
      </p>

      <details>
        <summary>Open questions about these figures</summary>
        <ul className="clean small" style={{ marginTop: 8 }}>
          <li>Is “Duration” the time the 50th prize was claimed, measured from the scheduled start?</li>
          <li>
            Did missions stay open after prizes ran out? Several task counts exceed 50 (e.g. Day 2 Aviator: 101), but Day 4’s least-completed count equals the winner count
            exactly.
          </li>
          <li>Are “completed” counts unique players?</li>
          <li>Day 2: the report names “Trader – Place 100 bets”, but the mission list has Trader “Collect 100× in total”. Which task had 58 completions?</li>
          <li>How many prize places were available on Day 6?</li>
        </ul>
      </details>
    </article>
  );
}
