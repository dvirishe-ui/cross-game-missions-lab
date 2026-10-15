import { useMemo, useRef, useState } from 'react';
import { TELEMETRY_FIELDS, telemetryTemplateCsv, validateTelemetry, type ValidationResult } from '../math/csv';
import { availability, concurrencyShare, finalPrize, finishers, multiplierFrequency, roundsVsBets, throughput } from '../math/telemetry';
import { fmtNumber, fmtPercent } from '../math/format';
import { Badge, NumberField, Notice, SectionHead, Segmented } from '../components/ui';
import { useApp } from '../state/AppContext';

const CHECKLIST = [
  'Campaign ID and day',
  'Anonymous player ID',
  'Opt-in / start timestamp',
  'Game and version',
  'Configuration identifier',
  'Shared round ID',
  'Bet ID',
  'Bet and settlement timestamps',
  'Stake and payout',
  'Settled multiplier',
  'Mission ID',
  'Progress increment',
  'Mission completion timestamp',
  'Session stops',
  'Concurrent-game activity',
  'Prize eligibility and claim timestamp',
  'Prize amount',
  'Number of available prize places',
];

const KENO_CHECKS = [
  'Exactly 30× versus at least 30×: which condition did the mission engine apply?',
  'Ordinary Keno versus Keno 80: which game version counted?',
  'Number selections and other relevant configuration in use.',
  'Whether qualifying outcomes exist in every allowed configuration.',
  'Correct payout / stake calculation for the multiplier.',
  'Settled events versus placed bets: which triggered progress?',
  'Duplicate or missed progress events.',
  'Progress distribution among participants (how close did players get?).',
  'Player drop-off before completion.',
];

const ts = (t?: number) => (t == null ? '—' : new Date(t).toISOString().replace('T', ' ').replace('.000Z', 'Z'));

function Analyses({ v }: { v: ValidationResult }) {
  const [threshold, setThreshold] = useState<number | null>(30);
  const [cond, setCond] = useState<'gte' | 'eq'>('gte');
  const avail = availability(v.columns, v.rows);
  const on = (id: string) => avail.find((a) => a.id === id)?.available;
  const fin = useMemo(() => (on('finishers') ? finishers(v.rows) : []), [v]);
  const fp = useMemo(() => (on('final-prize') ? finalPrize(v.rows) : []), [v]);
  const thr = useMemo(() => (on('throughput') ? throughput(v.rows) : []), [v]);
  const rvb = useMemo(() => (on('rounds-vs-bets') ? roundsVsBets(v.rows) : []), [v]);
  const conc = on('concurrency') ? concurrencyShare(v.rows) : null;
  const freq = on('frequency') && threshold != null ? multiplierFrequency(v.rows, threshold, cond) : [];
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Analysis</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {avail.map((a) => (
              <tr key={a.id}>
                <td className="small">{a.title}</td>
                <td className="small">{a.available ? <Badge kind="calculated">Supported</Badge> : <span className="muted">Not supported: needs {a.missingColumns.join(', ')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fin.length > 0 && (
        <div className="stack-sm">
          <h4>Mission finishers</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign · day</th>
                  <th>Mission</th>
                  <th className="num">Finishers</th>
                  <th>First completion</th>
                  <th>Last completion</th>
                </tr>
              </thead>
              <tbody>
                {fin.map((f) => (
                  <tr key={f.group + f.mission}>
                    <td className="small">{f.group}</td>
                    <td className="small">{f.mission}</td>
                    <td className="num">{f.finishers}</td>
                    <td className="small num">{ts(f.first)}</td>
                    <td className="small num">{ts(f.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {fp.length > 0 && (
        <div className="stack-sm">
          <h4>Final prize-winning finisher</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign · day</th>
                  <th className="num">Places</th>
                  <th className="num">Claims</th>
                  <th>First claim</th>
                  <th>Final-prize claim (K-th)</th>
                </tr>
              </thead>
              <tbody>
                {fp.map((f) => (
                  <tr key={f.group}>
                    <td className="small">{f.group}</td>
                    <td className="num">{f.places}</td>
                    <td className="num">{f.claims}</td>
                    <td className="small num">{ts(f.firstClaim)}</td>
                    <td className="small num">{f.finalPrizeClaim ? ts(f.finalPrizeClaim) : `${f.unclaimed} unclaimed`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {on('frequency') && (
        <div className="stack-sm">
          <div className="row-between">
            <h4>Observed settled-multiplier frequency</h4>
            <div className="row">
              <Segmented label="Condition" value={cond} onChange={setCond} options={[{ value: 'gte', label: '≥' }, { value: 'eq', label: '=' }]} />
              <div style={{ width: 120 }}>
                <NumberField id="tel-th" label="Threshold" value={threshold} onChange={setThreshold} suffix="×" />
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Version</th>
                  <th>Config</th>
                  <th className="num">Settled bets</th>
                  <th className="num">Hits</th>
                  <th className="num">Rate (95% CI)</th>
                </tr>
              </thead>
              <tbody>
                {freq.map((f) => (
                  <tr key={f.game + f.version + f.config}>
                    <td className="small">{f.game}</td>
                    <td className="small">{f.version}</td>
                    <td className="small">{f.config}</td>
                    <td className="num">{fmtNumber(f.settled)}</td>
                    <td className="num">{fmtNumber(f.hits)}</td>
                    <td className="num small">
                      {fmtPercent(f.rate, 3)} ({fmtPercent(f.ci[0], 3)}–{fmtPercent(f.ci[1], 3)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">
            Frequency of recorded settled multipliers among these players’ bets. For cash-out games it reflects players’ own cash-out choices; it does not reveal unobserved
            game outcomes or a counterfactual cash-out strategy.
          </p>
        </div>
      )}
      {thr.length > 0 && (
        <div className="stack-sm">
          <h4>Settled bets per active minute</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th className="num">Players</th>
                  <th className="num">Bets</th>
                  <th className="num">Median bets / min</th>
                </tr>
              </thead>
              <tbody>
                {thr.map((t) => (
                  <tr key={t.game}>
                    <td className="small">{t.game}</td>
                    <td className="num">{t.players}</td>
                    <td className="num">{t.bets}</td>
                    <td className="num">{fmtNumber(t.medianBetsPerMinute, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">Per player: (bets − 1) ÷ minutes between first and last settled bet. Includes pauses inside that span.</p>
        </div>
      )}
      {rvb.length > 0 && (
        <p className="small">
          Rounds vs bets: {rvb.map((r) => `${r.game}: ${fmtNumber(r.bets)} bets in ${fmtNumber(r.rounds)} distinct rounds`).join(' · ')}
        </p>
      )}
      {conc && <p className="small">Concurrent activity: {fmtPercent(conc.bets ? conc.concurrent / conc.bets : null, 1)} of bets were placed with more than one game open.</p>}
    </div>
  );
}

export function DataNeeded() {
  const { checks, setCheck, exportFile } = useApp();
  const [v, setV] = useState<ValidationResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const done = CHECKLIST.filter((c) => checks[`data:${c}`]).length;
  const kenoDone = KENO_CHECKS.filter((c) => checks[`keno:${c}`]).length;

  return (
    <section className="section" id="data">
      <SectionHead id="data" n={7} title="Data needed">
        What we need from internal telemetry before approving final targets. Use anonymised identifiers only; names, emails and payment information are not
        required and are rejected on import.
      </SectionHead>
      <Notice tone="info">
        <strong>Received so far:</strong> day-level totals for Days 1–7 (registered, started a task, duration, winners, least- and most-completed task). See{' '}
        <a href="#reported-results">reported results</a>. These cannot give completion-time distributions, qualifying probabilities or play rates; the bet-level fields
        below are still needed.
      </Notice>
      <div className="grid g2">
        <article className="card">
          <div className="row-between">
            <h3>Telemetry checklist</h3>
            <span className="num small muted">
              {done} / {CHECKLIST.length} confirmed
            </span>
          </div>
          <div className="progress" aria-hidden="true">
            <i style={{ width: `${(done / CHECKLIST.length) * 100}%` }} />
          </div>
          <div className="checklist">
            {CHECKLIST.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" checked={!!checks[`data:${c}`]} onChange={(e) => setCheck(`data:${c}`, e.target.checked)} />
                {c}
              </label>
            ))}
          </div>
          <button onClick={() => exportFile('cross-game-missions-telemetry-template.csv', telemetryTemplateCsv(), 'text/csv')}>Download CSV template</button>
        </article>
        <article className="card" id="keno-check">
          <div className="row-between">
            <h3>Keno investigation checklist (Day 6)</h3>
            <span className="num small muted">
              {kenoDone} / {KENO_CHECKS.length}
            </span>
          </div>
          <Notice tone="warn">Zero finishers does not by itself prove a particular probability or identify the technical cause.</Notice>
          <div className="checklist">
            {KENO_CHECKS.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" checked={!!checks[`keno:${c}`]} onChange={(e) => setCheck(`keno:${c}`, e.target.checked)} />
                {c}
              </label>
            ))}
          </div>
        </article>
      </div>

      <article className="card">
        <h3>Field specification</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {TELEMETRY_FIELDS.map((f) => (
                <tr key={f.name}>
                  <td className="mono small">{f.name}</td>
                  <td className="small muted">{f.type}</td>
                  <td className="small">{f.required ? 'Yes' : 'Optional'}</td>
                  <td className="small">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <div className="row-between">
          <h3>Import telemetry CSV</h3>
          {v && (v.errors.length ? <Badge kind="missing">{v.errors.length} errors</Badge> : <Badge kind="internal">Validated · {v.rows.length} rows</Badge>)}
        </div>
        <p className="small muted">The file is read in your browser only. Only analyses supported by the uploaded columns are shown.</p>
        <div className="row">
          <button className="primary" onClick={() => fileRef.current?.click()}>
            Choose CSV file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              setV(validateTelemetry(await f.text()));
              e.target.value = '';
            }}
          />
          {fileName && <span className="small mono">{fileName}</span>}
          {v && (
            <button className="ghost small" onClick={() => { setV(null); setFileName(''); }}>
              Clear
            </button>
          )}
        </div>
        <details>
          <summary>Or paste CSV text</summary>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <textarea aria-label="CSV text" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={telemetryTemplateCsv()} />
            <button
              className="small"
              disabled={!paste.trim()}
              onClick={() => {
                setFileName('Pasted text');
                setV(validateTelemetry(paste));
              }}
            >
              Validate pasted CSV
            </button>
          </div>
        </details>
        {!v && <div className="empty">No telemetry loaded. Start from the CSV template above; no analysis is shown without data.</div>}
        {v && v.errors.length > 0 && (
          <Notice tone="block">
            <strong>Fix these before analysis:</strong>
            <ul className="clean small">
              {v.errors.slice(0, 15).map((e, i) => (
                <li key={i}>
                  {e.row === 0 ? 'Header' : `Row ${e.row}`}
                  {e.field ? ` · ${e.field}` : ''}: {e.message}
                </li>
              ))}
              {v.errors.length > 15 && <li>…and {v.errors.length - 15} more.</li>}
            </ul>
          </Notice>
        )}
        {v && v.warnings.length > 0 && (
          <details>
            <summary>{v.warnings.length} warnings</summary>
            <ul className="clean small muted" style={{ marginTop: 6 }}>
              {v.warnings.slice(0, 30).map((w, i) => (
                <li key={i}>
                  {w.row === 0 ? 'Header' : `Row ${w.row}`} · {w.field}: {w.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        {v && v.errors.length === 0 && <Analyses v={v} />}
      </article>
    </section>
  );
}
