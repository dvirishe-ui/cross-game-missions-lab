import { DAY_OBSERVATIONS, DAY_RESULTS } from '../data/previousCampaign';
import { fmtDuration } from '../math/format';
import { Badge } from '../components/ui';
import { scrollToId } from '../state/AppContext';

function ConcurrencyFig() {
  const tasks = [40, 25, 30, 20, 45, 35];
  return (
    <svg className="chart fig" viewBox="0 0 300 92" role="img" aria-label="Six tasks run in parallel finish at the slowest task, 45 minutes, instead of 195 minutes in sequence">
      {tasks.map((m, i) => (
        <rect key={i} x={10} y={6 + i * 11} width={m * 2.2} height={8} rx={2} fill="var(--sim)" opacity={m === 45 ? 1 : 0.45} />
      ))}
      <line x1={10 + 45 * 2.2} x2={10 + 45 * 2.2} y1={2} y2={74} className="deadline" />
      <text x={10 + 45 * 2.2 + 6} y={14}>45 min parallel</text>
      <text x={10 + 45 * 2.2 + 6} y={30} style={{ fill: 'var(--muted)' }}>vs 195 min in sequence</text>
      <text x={10} y={88}>illustrative task times</text>
    </svg>
  );
}

function BottleneckFig() {
  const vals = [0.98, 0.96, 0.99, 0.0, 0.97, 0.95];
  return (
    <svg className="chart fig" viewBox="0 0 300 92" role="img" aria-label="Five tasks are easy but one has zero completion, so the campaign completion is zero">
      {vals.map((v, i) => (
        <g key={i}>
          <rect x={10 + i * 34} y={8} width={26} height={60} rx={3} fill="var(--surface-3)" />
          <rect x={10 + i * 34} y={8 + 60 * (1 - v)} width={26} height={Math.max(1, 60 * v)} rx={3} fill={v === 0 ? 'var(--block)' : 'var(--ok)'} opacity={v === 0 ? 1 : 0.65} />
        </g>
      ))}
      <text x={220} y={32} style={{ fill: 'var(--block)' }}>all tasks</text>
      <text x={220} y={46} style={{ fill: 'var(--block)' }}>required → 0%</text>
      <text x={10} y={86}>per-task completion (illustrative)</text>
    </svg>
  );
}

function FirstFinisherFig() {
  return (
    <svg className="chart fig" viewBox="0 0 300 92" role="img" aria-label="Final prize is claimed when 5 percent of entrants finish, well before the median player">
      <path d="M10,70 C70,69 100,60 140,40 S220,8 290,6" fill="none" stroke="var(--sim)" strokeWidth={2} />
      <line x1={10} x2={290} y1={70} y2={70} className="axis" />
      <line x1={64} x2={64} y1={6} y2={70} stroke="var(--aviator)" strokeDasharray="3 3" />
      <text x={68} y={18} style={{ fill: 'var(--aviator)' }}>last prize (5% done)</text>
      <line x1={152} x2={152} y1={30} y2={70} stroke="var(--muted)" strokeDasharray="2 3" />
      <text x={158} y={56}>median player</text>
      <text x={10} y={86}>share of entrants finished over time</text>
    </svg>
  );
}

export function Overview() {
  return (
    <section className="section" id="overview" aria-labelledby="overview-title" style={{ paddingTop: 8 }}>
      <div className="hero">
        <div className="stack">
          <span className="eyebrow">
            <b>01</b> / Overview · SPRIBE internal research
          </span>
          <h1 id="overview-title">
            Will the <em>last prize</em> go at the right time?
          </h1>
          <p className="lede" style={{ maxWidth: '62ch' }}>
            A planning tool for cross-game promotions across Aviator, Pilot Chicken, Plinko, Mines, Goal, Keno and Trader. Compare competitor missions, review the
            previous campaign, design new missions and estimate whether enough players can finish inside a five-hour event.
          </p>
          <div className="row">
            <button className="primary" onClick={() => scrollToId('builder')}>
              Open campaign builder
            </button>
            <button className="sim" onClick={() => scrollToId('calculator')}>
              Mission calculator
            </button>
            <button onClick={() => scrollToId('data')}>Data we still need</button>
          </div>
        </div>
        <div className="card">
          <div className="stats">
            <div className="stat">
              <span className="k">Target event window</span>
              <span className="v">5 hours</span>
              <span className="s">Scheduled duration, not a completion time</span>
            </div>
            <div className="stat">
              <span className="k">Prize mechanism</span>
              <span className="v sm">First finishers</span>
            </div>
            <div className="stat">
              <span className="k">Concurrency</span>
              <span className="v sm">Simultaneous play allowed</span>
            </div>
            <div className="stat">
              <span className="k">Calibration status</span>
              <span className="v sm" style={{ color: 'var(--warn)' }}>
                Partial
              </span>
              <span className="s">Day-level results reported. Bet-level telemetry, probabilities and throughput still needed</span>
            </div>
          </div>
          <hr className="divider" />
          <div className="stack-sm">
            <div className="row-between">
              <span className="eyebrow">Previous campaign · time of last prize</span>
              <Badge kind="internal" />
            </div>
            <div className="timeline" aria-label="Previous campaign outcomes by day">
              {DAY_OBSERVATIONS.map((o) => (
                <a key={o.day} href="#previous" className={`d ${o.tone}`} style={{ textDecoration: 'none', color: 'inherit' }} title={o.detail}>
                  <b>D{o.day}</b>
                  <i>{o.tone === 'blocked' ? '0 winners' : fmtDuration(DAY_RESULTS.find((r) => r.day === o.day)!.durationMin).replace(' min', 'm').replace(' h ', 'h ')}</i>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="three-times">
        <div className="t">
          <b>1 · Scheduled event duration</b>
          <span>The window the promotion is open: our target is about five hours.</span>
        </div>
        <div className="t">
          <b>2 · Individual completion time</b>
          <span>How long one player takes to finish every required mission. Varies player to player.</span>
        </div>
        <div className="t">
          <b>3 · Final-prize time</b>
          <span>When the K-th valid finisher claims the last prize place. This is the key business metric.</span>
        </div>
      </div>

      <div className="grid g3">
        <article className="card finding">
          <div className="row-between">
            <h3>Concurrency</h3>
            <Badge kind="calculated" />
          </div>
          <ConcurrencyFig />
          <p className="small">
            Several parallel missions can finish in approximately the time required by the slowest mission, rather than their summed durations. This assumes
            concurrent play does not slow each game down.
          </p>
          <a href="#calculator" className="small">
            See the parallel-duration example →
          </a>
        </article>
        <article className="card finding">
          <div className="row-between">
            <h3>Bottleneck</h3>
            <Badge kind="calculated" />
          </div>
          <BottleneckFig />
          <p className="small">One difficult mandatory task can prevent completion of the entire campaign, however easy the other tasks are.</p>
          <a href="#previous" className="small">
            Day 6 Keno report →
          </a>
        </article>
        <article className="card finding">
          <div className="row-between">
            <h3>First-finisher effect</h3>
            <Badge kind="calculated" />
          </div>
          <FirstFinisherFig />
          <p className="small">
            A limited prize pool can run out long before a typical player finishes. In the previous campaign, 50 prizes were gone once about one active player in three
            finished. The median player’s time is not the prize-pool duration.
          </p>
          <a href="#builder-first" className="small">
            First-finisher analysis →
          </a>
        </article>
      </div>
    </section>
  );
}
