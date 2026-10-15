import { useState } from 'react';
import { CAMPAIGNS, FINDINGS, NETWORK_CAMPAIGNS, TASK_TYPES, type TaskType } from './data';

function DurationChart() {
  const dated = CAMPAIGNS.filter((c) => c.hours).sort((a, b) => a.hours! - b.hours!);
  const max = Math.log10(40 * 24);
  const min = Math.log10(12);
  const W = 640;
  const left = 190;
  const rowH = 26;
  const x = (h: number) => left + ((Math.log10(h) - min) / (max - min)) * (W - left - 70);
  const ticks = [
    { h: 24, l: '1 day' },
    { h: 72, l: '3 days' },
    { h: 168, l: '1 week' },
    { h: 504, l: '3 weeks' },
  ];
  const H = dated.length * rowH + 30;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Campaign length, log scale">
      {ticks.map((t) => (
        <g key={t.h}>
          <line className="grid-line" x1={x(t.h)} x2={x(t.h)} y1={0} y2={H - 22} />
          <text x={x(t.h)} y={H - 6} textAnchor="middle">
            {t.l}
          </text>
        </g>
      ))}
      {dated.map((c, i) => (
        <g key={c.id}>
          <text x={left - 8} y={i * rowH + 15} textAnchor="end" style={{ fill: 'var(--fg-2)' }}>
            {c.company}: {c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name}
          </text>
          <rect x={left} y={i * rowH + 4} width={x(c.hours!) - left} height={rowH - 10} rx={3} fill="var(--violet)" opacity={0.8} />
          <text x={x(c.hours!) + 6} y={i * rowH + 15}>
            {c.duration.split(',')[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Brief() {
  const [type, setType] = useState<TaskType | 'all'>('all');
  const shown = CAMPAIGNS.filter((c) => type === 'all' || c.taskTypes.includes(type));
  return (
    <div className="brief">
      <header className="brief-head">
        <span className="kicker">Competitor research · Missions</span>
        <h1>How other companies run missions</h1>
        <p className="lede">
          {CAMPAIGNS.length} mission campaigns and tools from Pragmatic Play, Playtech, SmartSoft, Stake, BC.Game, Casumo and BGaming: what tasks they set, how long they run,
          and how they pay. Every fact links to its published source.
        </p>
      </header>

      <section>
        <h2>What they have in common</h2>
        <ol className="takeaways">
          {FINDINGS.map((f) => (
            <li key={f.title}>
              <strong>{f.title}.</strong> {f.text}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>At a glance</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Campaign</th>
                <th>Length</th>
                <th>How missions run</th>
                <th>Prize model</th>
                <th>Prize pool</th>
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.company}</strong>
                    <div className="tiny muted">{c.kind}</div>
                  </td>
                  <td className="small">
                    <a href={`#${c.id}`}>{c.name}</a>
                    <div className="tiny muted">{c.where}</div>
                  </td>
                  <td className="small">{c.duration}</td>
                  <td className="small">{c.structure}</td>
                  <td className="small">{c.prizeModel}</td>
                  <td className="small">{c.prizePool}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>What kind of tasks they choose</h2>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Campaign</th>
                {TASK_TYPES.map((t) => (
                  <th key={t.id} className="num" title={t.label}>
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.map((c) => (
                <tr key={c.id}>
                  <td className="small">
                    {c.company}: {c.name}
                  </td>
                  {TASK_TYPES.map((t) => (
                    <td key={t.id} className="num">
                      {c.taskTypes.includes(t.id) ? <span className="dot" aria-label="yes">●</span> : ''}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total">
                <td className="small">
                  <strong>Used by</strong>
                </td>
                {TASK_TYPES.map((t) => (
                  <td key={t.id} className="num small">
                    <strong>{CAMPAIGNS.filter((c) => c.taskTypes.includes(t.id)).length}</strong>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="split-2">
          <div className="card">
            <h3>Multiplier targets we found</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Target × repetitions</th>
                    <th>Required?</th>
                  </tr>
                </thead>
                <tbody>
                  {CAMPAIGNS.filter((c) => c.targets).map((c) => (
                    <tr key={c.id}>
                      <td className="small">
                        {c.company}: {c.name}
                      </td>
                      <td className="small mono">{c.targets}</td>
                      <td className="small">
                        {c.id.startsWith('smartsoft') ? 'No: one of two routes' : c.id === 'stake-originals' ? 'No: any 3 of the list' : c.id === 'stake-challenges' ? 'Race, one winner' : 'Optional mission'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">The harder the target, the fewer repetitions, and none of them is required for every player.</p>
          </div>
          <div className="card">
            <h3>How long campaigns run</h3>
            <DurationChart />
            <p className="tiny muted">Log scale. Most multi-week campaigns still reset daily, so a player’s real “mission day” is 24 hours.</p>
          </div>
        </div>
      </section>

      <section>
        <div className="row-between">
          <h2>Campaign details</h2>
          <label className="field" htmlFor="type-filter" style={{ minWidth: 220 }}>
            <span className="lbl">Show campaigns using</span>
            <select id="type-filter" value={type} onChange={(e) => setType(e.target.value as TaskType | 'all')}>
              <option value="all">Any task type</option>
              {TASK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="comp-grid">
          {shown.map((c) => (
            <article key={c.id} id={c.id} className="comp">
              <span className="kicker">
                {c.company} · {c.kind}
              </span>
              <h3>{c.name}</h3>
              <dl className="kv small">
                <dt>Where</dt>
                <dd>{c.where}</dd>
                <dt>When</dt>
                <dd>{c.dates}</dd>
                <dt>Length</dt>
                <dd>{c.duration}</dd>
                <dt>Games</dt>
                <dd>{c.games}</dd>
                <dt>Prizes</dt>
                <dd>
                  {c.prizeModel}. {c.prizePool}
                </dd>
              </dl>
              <p className="small">{c.structure}</p>
              <div className="stack-sm">
                <span className="tiny muted">Tasks</span>
                <ul className="clean small">
                  {c.tasks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              {c.rules.length > 0 && <p className="tiny muted">Rules: {c.rules.join(' · ')}</p>}
              <p className="take">{c.lesson}</p>
              <div className="row tiny">
                {c.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label} ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Bigger network promotions (not missions)</h2>
        <p className="small muted">For scale: what providers spend on leaderboards and drops.</p>
        <ul className="clean small">
          {NETWORK_CAMPAIGNS.map((n) => (
            <li key={n.name}>
              <strong>
                {n.company}, {n.name}:
              </strong>{' '}
              {n.detail}{' '}
              {n.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label} ↗{' '}
                </a>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">
        Facts as published on the linked pages, many from operator promo pages and trade press; no competitor results or ROI are public. Past campaigns are shown with their published
        dates.
      </footer>
    </div>
  );
}
