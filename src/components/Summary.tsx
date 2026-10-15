import { useEffect, useMemo } from 'react';
import { GAME_BY_ID } from '../data/games';
import { DAY_RESULTS } from '../data/previousCampaign';
import { evaluateScenario } from '../math/campaign';
import { fmtDuration, fmtNumber, fmtPercent } from '../math/format';
import { useApp } from '../state/AppContext';
import { describeTask } from '../state/scenarios';
import { SHARED_ROUND_LIMITATION } from '../sections/builder/Results';

/** Clean, print-friendly research summary of the current scenario. */
export function Summary({ onClose }: { onClose: () => void }) {
  const { current: s, observations } = useApp();
  const r = useMemo(() => evaluateScenario(s), [s]);
  useEffect(() => {
    document.body.classList.add('print-summary');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('print-summary');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="summary-overlay" role="dialog" aria-modal="true" aria-label="Research summary">
      <div className="summary-bar">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <button onClick={onClose}>Close summary</button>
      </div>
      <div className="print-sheet">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555' }}>
          SPRIBE internal · Cross-Game Missions Lab · {new Date().toISOString().slice(0, 10)}
        </p>
        <h1>{s.name}</h1>
        <p>
          <strong>Status:</strong> Proposed design. Model output, not actual SPRIBE performance. Origin: {s.origin}.
        </p>

        <h2>Campaign settings</h2>
        <table>
          <tbody>
            <tr><td>Scheduled event duration</td><td>{fmtDuration(s.deadline)}</td></tr>
            <tr><td>Progression</td><td>{s.progression}{s.progression === 'staged' ? ` (${s.stageEntry} entry, ${s.stageCarryover === 'reset' ? 'progress starts at release' : 'progress carries over'})` : ''}</td></tr>
            <tr><td>Completion rule</td><td>{s.progression === 'sequential' || s.completion === 'all' ? 'All missions' : `Any ${s.anyK ?? 'MISSING'} of ${s.tasks.length}`}</td></tr>
            <tr><td>Entrants / prize places</td><td>{s.entrants ?? 'MISSING'} / {s.prizePlaces ?? 'MISSING'}</td></tr>
            <tr><td>Prize amount per place</td><td>{s.prizeAmount == null ? 'Not entered' : `${fmtNumber(s.prizeAmount, 2)} ${s.currency}`}</td></tr>
            <tr><td>Concurrent speed kept</td><td>{s.concurrencyFactor}% ({s.concurrencySource})</td></tr>
            <tr><td>Active-play fraction</td><td>{s.activeFraction}% ({s.activeFractionSource})</td></tr>
            <tr><td>Start spread</td><td>{s.startSpread} min ({s.startSpreadSource})</td></tr>
          </tbody>
        </table>

        <h2>Missions</h2>
        <table>
          <thead>
            <tr><th>Game</th><th>Mission</th><th>Rate /min</th><th>p</th><th>μ</th></tr>
          </thead>
          <tbody>
            {s.tasks.map((t) => (
              <tr key={t.id}>
                <td>{GAME_BY_ID[t.game].name}{s.progression === 'staged' ? ` · ${s.stages[t.stage]?.name}` : ''}{t.route ? ` · route ${t.route}` : ''}</td>
                <td>{t.label || describeTask(t)}</td>
                <td>{t.rate == null ? 'MISSING' : `${t.rate} (${t.rateSource})`}</td>
                <td>{t.type === 'multiplier' ? (t.p == null ? 'MISSING' : `${fmtPercent(t.p, 4)} (${t.pSource})`) : '—'}</td>
                <td>{t.type === 'accumulate' ? (t.mu == null ? 'MISSING' : `${t.mu} (${t.muSource})`) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Results</h2>
        {!r.ok ? (
          <p>
            Not computed. {r.missing.length ? `Missing data: ${r.missing.map((m) => `${m.label} (${m.items.join(', ')})`).join('; ')}.` : ''} {r.errors.join(' ')}
          </p>
        ) : (
          <table>
            <thead>
              <tr><th>Unit</th><th>P(individual finish by deadline)</th><th>Individual median</th><th>P(all places filled)</th><th>Median final-prize time</th></tr>
            </thead>
            <tbody>
              {r.units.map((u) => (
                <tr key={u.name}>
                  <td>{u.name}</td>
                  <td>{fmtPercent(u.pByDeadline)}</td>
                  <td>{fmtDuration(u.median)}</td>
                  <td>{u.first ? fmtPercent(u.first.pAllClaimed) : `MISSING: ${u.firstMissing.join(', ')}`}</td>
                  <td>{u.first ? fmtDuration(u.first.finalPrize.median) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>Method: {r.method === 'exact' ? 'exact under independence' : r.method === 'monte-carlo' ? `Monte Carlo, ${s.samples} players, seed ${s.seed}` : 'not run'}.{r.illustrative ? ' Uses illustrative inputs.' : ''}</p>
        <h2>Assumptions and limitations</h2>
        <ul>
          {r.assumptions.map((a) => <li key={a}>{a}</li>)}
          <li>{SHARED_ROUND_LIMITATION}</li>
        </ul>

        <h2>Previous campaign (internal observations)</h2>
        <table>
          <thead>
            <tr><th>Day</th><th>Registered</th><th>Started</th><th>Duration</th><th>Winners</th><th>Least completed</th><th>First finisher</th></tr>
          </thead>
          <tbody>
            {DAY_RESULTS.map((r) => (
              <tr key={r.day}>
                <td>{r.day}</td>
                <td>{r.registered}</td>
                <td>{r.started}</td>
                <td>{fmtDuration(r.durationMin)}</td>
                <td>{r.winners}</td>
                <td>{r.least.reported} ({r.least.completed})</td>
                <td>{observations[r.day]?.firstFinisher || 'Missing'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.notes && (
          <>
            <h2>Notes</h2>
            <p>{s.notes}</p>
          </>
        )}
      </div>
    </div>
  );
}
