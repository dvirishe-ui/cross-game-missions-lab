import { Badge, GameChip, SectionHead } from '../components/ui';
import type { GameId } from '../data/games';
import { useApp } from '../state/AppContext';
import { cloneDay, experimentA, experimentB, experimentC } from '../state/scenarios';

const HOURS: { h: string; games: GameId[]; note?: string }[] = [
  { h: 'Hour 1', games: ['aviator', 'mines', 'plinko'] },
  { h: 'Hour 2', games: ['aviator', 'goal', 'keno'] },
  { h: 'Hour 3', games: ['aviator', 'pilot-chicken', 'trader'] },
  { h: 'Hour 4', games: ['aviator', 'mines', 'goal'] },
  { h: 'Hour 5', games: ['aviator'], note: '+ two rotating games' },
];

export function Experiments() {
  const { openInBuilder } = useApp();
  return (
    <section className="section" id="experiments">
      <SectionHead id="experiments" n={6} title="Recommended experiments">
        Proposals to test, not verified optimal settings. None of them is promised to improve revenue or retention without measured results.
      </SectionHead>
      <div className="grid g3">
        <article className="card">
          <div className="row-between">
            <span className="eyebrow">Experiment A</span>
            <Badge kind="proposed" />
          </div>
          <h3>Keep the current daily format</h3>
          <ul className="clean small">
            <li>Clone Day 7 and use its actual telemetry as the baseline when supplied.</li>
            <li>Change one task at a time.</li>
            <li>Test a round-count Keno task instead of the mandatory 30× twenty times.</li>
            <li>Measure final-prize timing.</li>
            <li>Keep concurrent play in the model.</li>
          </ul>
          <div className="row" style={{ marginTop: 'auto' }}>
            <button onClick={() => openInBuilder(cloneDay(7), 'Day 7 cloned as the Experiment A baseline.')}>Clone Day 7 baseline</button>
            <button className="primary" onClick={() => openInBuilder(experimentA(), 'Experiment A loaded: Day 6 with a Keno round-count task.')}>
              Open variant
            </button>
          </div>
        </article>

        <article className="card">
          <div className="row-between">
            <span className="eyebrow">Experiment B</span>
            <Badge kind="proposed" />
          </div>
          <h3>Five hourly prize allocations</h3>
          <p className="small">Reserve a separate share of prizes for each hour. Tasks run simultaneously within an hour; first finishers take that hour’s prizes.</p>
          <div className="stack-sm">
            {HOURS.map((h) => (
              <div key={h.h} className="row small">
                <span className="num muted" style={{ width: 52 }}>
                  {h.h}
                </span>
                {h.games.map((g) => (
                  <GameChip key={g} game={g} />
                ))}
                {h.note && <span className="muted">{h.note}</span>}
              </div>
            ))}
          </div>
          <ul className="clean small">
            <li>Later allocations stay reserved until their release.</li>
            <li>Entry into each hour is independent; missing an hour does not block later ones.</li>
            <li>Unclaimed-prize handling must be configured and published.</li>
            <li>
              Equal 20% per hour is an <span style={{ color: 'var(--warn)' }}>illustrative proposal</span>.
            </li>
          </ul>
          <p className="small muted">This preserves later prize opportunities but does not guarantee each allocation lasts the whole hour.</p>
          <button className="primary" style={{ marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => openInBuilder(experimentB(), 'Experiment B loaded with five hourly stages.')}>
            Open in builder
          </button>
        </article>

        <article className="card">
          <div className="row-between">
            <span className="eyebrow">Experiment C</span>
            <Badge kind="proposed" />
          </div>
          <h3>Alternative task routes</h3>
          <ul className="clean small">
            <li>Complete a calibrated round-count task OR a calibrated multiplier task.</li>
            <li>Complete any K of G game missions.</li>
          </ul>
          <p className="small">
            Alternative routes reduce the chance that one difficult game blocks everyone, but they also change duration and game exposure. Recalculate both.
          </p>
          <p className="small muted">Competitor precedent: SmartSoft’s alternative routes and Stake’s partial-completion eligibility (see <a href="#competitors">Competitor research</a>).</p>
          <button className="primary" style={{ marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => openInBuilder(experimentC(), 'Experiment C loaded: Keno route alternatives and any 5 of 6.')}>
            Open in builder
          </button>
        </article>
      </div>
    </section>
  );
}
