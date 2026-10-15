import { COMPETITORS, SPRIBE_GAME_SOURCES, SUPPORTING_SOURCES } from '../data/competitors';
import { EVIDENCE, EVIDENCE_ORDER } from '../data/evidence';
import { Badge, SectionHead, SourceLink } from '../components/ui';

const FORMULAS: [string, string, string][] = [
  ['Round count', 'T = delay + N / (r × bets per round × active fraction)', 'Deterministic under a constant supplied rate.'],
  ['Repeated multiplier: expectation', 'E[attempts] = k / p ;  E[time] = k / (r × p)', 'Mean only. Not a completion guarantee.'],
  ['Repeated multiplier: deadline', 'n = ⌊r × t⌋ ;  P(finish by t) = P(Binomial(n, p) ≥ k)', 'Tail summed in log space from the mode outward; no factorials.'],
  ['Quantiles', 'N = failures before k-th success + k ;  P(N ≤ n) = P(Binomial(n, p) ≥ k)', 'Smallest n with P(N ≤ n) ≥ q, found by bisection; time = n / r.'],
  ['Accumulated (mean only)', 'T ≈ S / (r × μ)', 'Rough planning value; no percentiles.'],
  ['Accumulated (distribution)', 'Simulate rounds until Σ counted ≥ S', 'Seeded mulberry32; reports sample size and Wilson / standard-error intervals.'],
  ['All tasks in parallel', 'T = max(T₁ … T_g)', 'Exact CDF: Π Fᵢ(t) under independence.'],
  ['Sequential tasks', 'T = T₁ + … + T_g', 'Monte Carlo with a fixed seed.'],
  ['Any K of G', 'T = K-th smallest Tᵢ', 'Exact CDF: Poisson-binomial P(≥ K of G done by t).'],
  ['Alternative routes', 'T_slot = min(route times)', 'F_slot = 1 − Π(1 − F_route).'],
  ['Scheduled stages', 'done = max(release, start or previous stage) + τ', 'Carryover variant: max(release, previous, start + τ).'],
  ['First finishers', 'P(all K claimed by t) = P(Binomial(M, F(t)) ≥ K)', 'Independent identical players. Illustrative only.'],
  ['Economics', 'Σ turnover × (1 − RTP) − rewards − costs', 'An expectation using per-game RTPs.'],
];

const NEVER = [
  'Invent game hit probabilities or round speeds.',
  'Infer multiplier probability from RTP.',
  'Assume a 30× payout happens once every 30 bets.',
  'Treat theoretical averages as guaranteed completion times.',
  'Present simulated results as actual SPRIBE performance.',
  'Invent competitor campaign results or ROI.',
  'Turn a promotion across several eligible games into a claim that players had to play every game.',
];

export function Sources() {
  return (
    <section className="section" id="sources">
      <SectionHead id="sources" n={8} title="Sources and methodology">
        Every factual research card links to its source. This page lists the sources, the evidence labels, the formulas and the limits of the model.
      </SectionHead>
      <div className="grid g2">
        <article className="card">
          <h3>Evidence labels</h3>
          <div className="stack-sm">
            {EVIDENCE_ORDER.map((k) => (
              <div key={k} className="row" style={{ alignItems: 'flex-start' }}>
                <span style={{ width: 170, flex: 'none' }}>
                  <Badge kind={k} />
                </span>
                <span className="small">{EVIDENCE[k].description}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h3>Rules this tool follows</h3>
          <p className="small muted">The tool never does any of the following:</p>
          <ul className="clean small">
            {NEVER.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="small muted">Historical promotions show their dates and are never labelled as currently active.</p>
        </article>
      </div>

      <article className="card">
        <h3>Source list</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider / page</th>
                <th>Dates</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {COMPETITORS.map((c) => (
                <tr key={c.id}>
                  <td className="small">
                    {c.provider} · {c.channel}: {c.title}
                  </td>
                  <td className="small num">{c.dateText}</td>
                  <td className="small" style={{ overflowWrap: 'anywhere', minWidth: 200 }}>
                    <SourceLink href={c.sourceUrl} />
                  </td>
                </tr>
              ))}
              {SUPPORTING_SOURCES.map((s) => (
                <tr key={s.url}>
                  <td className="small">{s.title}</td>
                  <td className="small muted">Product page</td>
                  <td className="small" style={{ overflowWrap: 'anywhere' }}>
                    <SourceLink href={s.url} />
                  </td>
                </tr>
              ))}
              {SPRIBE_GAME_SOURCES.map((s) => (
                <tr key={s.url}>
                  <td className="small">{s.title}</td>
                  <td className="small muted">Game reference</td>
                  <td className="small" style={{ overflowWrap: 'anywhere' }}>
                    <SourceLink href={s.url} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">Ordinary Keno and Keno 80 are modelled as separate game versions. Previous-campaign outcomes come from our team’s reports (internal observations).</p>
      </article>

      <article className="card">
        <h3>Formulas</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quantity</th>
                <th>Formula</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {FORMULAS.map(([q, f, n]) => (
                <tr key={q}>
                  <td className="small">{q}</td>
                  <td className="mono small" style={{ minWidth: 260 }}>
                    {f}
                  </td>
                  <td className="small muted">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid g2">
        <article className="card">
          <h3>Model limitations</h3>
          <ul className="clean small">
            <li>Players and missions are modelled as independent. Shared Aviator rounds make players’ outcomes correlated, and several bets in one shared round are not independent crash outcomes.</li>
            <li>The first-finisher model assumes identical players. Real audiences mix fast and slow players, which usually brings the final-prize time earlier.</li>
            <li>Constant play rates are assumed. Pauses, session stops and switching between games are only captured by the active-play fraction and concurrency factor.</li>
            <li>Accumulated-multiplier missions use a rough mean-based time inside the builder.</li>
            <li>No result here is actual SPRIBE performance until calibrated with telemetry.</li>
          </ul>
        </article>
        <article className="card">
          <h3>Unit conventions</h3>
          <dl className="kv">
            <dt>Time</dt>
            <dd>Stored in minutes from the scheduled event start; displayed as h/min.</dd>
            <dt>Probability</dt>
            <dd>Entered as a percentage (0.5 = 0.5%), stored as a decimal (0.005).</dd>
            <dt>Rates</dt>
            <dd>Qualifying rounds (attempts) per minute; bet missions multiply by bets per round.</dd>
            <dt>Multipliers</dt>
            <dd>Settled payout ÷ stake unless the counted definition says otherwise.</dd>
          </dl>
        </article>
      </div>
    </section>
  );
}
