import { useEffect, useState } from 'react';
import { DEFAULT_GAMES, change, emptyRow, parseCsv, perDay, summarize, templateCsv, validate, type GameRow, type Periods } from './model';

const KEY = 'stay-after-missions:v1';

function load(): { rows: GameRow[]; periods: Periods } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const fmt = (n: number | null, d = 0) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d }));
const pct = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`);
const share = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

const COLS: { key: keyof Omit<GameRow, 'game'>; label: string; hint: string }[] = [
  { key: 'before', label: 'Before', hint: 'Players of this game before the campaign' },
  { key: 'during', label: 'During', hint: 'Players of this game during the campaign' },
  { key: 'after', label: 'After', hint: 'Players of this game after the campaign' },
  { key: 'newDuring', label: 'New in campaign', hint: 'Played it during the campaign but not before' },
  { key: 'newStillAfter', label: 'New, still playing after', hint: 'Of the new players, how many still played it after' },
];

function Bars({ rows, periods }: { rows: GameRow[]; periods: Periods }) {
  const vals = rows.map((r) => ({
    game: r.game,
    b: perDay(r.before, periods.before),
    d: perDay(r.during, periods.during),
    a: perDay(r.after, periods.after),
  }));
  const max = Math.max(1, ...vals.flatMap((v) => [v.b ?? 0, v.d ?? 0, v.a ?? 0]));
  const unit = periods.before && periods.during && periods.after ? ' / day' : '';
  return (
    <div className="r-bars">
      {vals.map((v) => (
        <div key={v.game} className="r-game">
          <span className="r-name">{v.game}</span>
          {(
            [
              ['Before', v.b, 'var(--line-2)'],
              ['During', v.d, 'var(--violet)'],
              ['After', v.a, 'var(--sim)'],
            ] as const
          ).map(([label, val, color]) => (
            <div key={label} className="r-bar">
              <span className="r-lbl">{label}</span>
              <span className="r-track">{val != null && <i style={{ width: `${(val / max) * 100}%`, background: color }} />}</span>
              <span className="r-val num">{val == null ? 'no data' : `${fmt(val, unit ? 1 : 0)}${unit}`}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Retention() {
  const saved = load();
  const [rows, setRows] = useState<GameRow[]>(saved?.rows ?? DEFAULT_GAMES.map(emptyRow));
  const [periods, setPeriods] = useState<Periods>(saved?.periods ?? { before: null, during: null, after: null });
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ rows, periods }));
    } catch {
      /* storage unavailable: the page still works */
    }
  }, [rows, periods]);

  const filled = rows.filter((r) => r.before != null || r.during != null || r.after != null);
  const s = summarize(filled);
  const setCell = (i: number, k: keyof Omit<GameRow, 'game'>, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v.trim() === '' ? null : Math.max(0, Number(v.replace(/,/g, '')) || 0) } : r)));
  const sameLength = periods.before && periods.during && periods.after;
  const unequal = !sameLength && filled.length > 0;

  const importText = () => {
    const { rows: parsed, errors } = parseCsv(paste);
    if (errors.length) return setMsg(errors.join(' '));
    if (!parsed.length) return setMsg('No game rows found under the header.');
    setRows(parsed);
    setMsg(`Loaded ${parsed.length} games.`);
    setPaste('');
  };

  const copyTemplate = async () => {
    const t = templateCsv(rows.map((r) => r.game));
    try {
      await navigator.clipboard.writeText(t);
      setMsg('Template copied. Paste it into a spreadsheet, fill it in, then paste it back here.');
    } catch {
      setPaste(t);
      setMsg('Copy the template from the box below.');
    }
  };

  return (
    <div className="r-page">
      <header className="r-head">
        <span className="kicker">SPRIBE · Cross-game missions</span>
        <h1>Do players stay after the missions?</h1>
        <p className="lede">
          Players of the non-Aviator mission games before, during and after the campaign, and whether the people who tried a game because of the missions are still playing it.
        </p>
      </header>

      {filled.length === 0 ? (
        <div className="empty r-empty">
          <strong>No numbers yet.</strong>
          <span>Fill in the table below or paste your data. Nothing on this page is made up; it only shows what you enter.</span>
          <a href="#data">Go to the table ↓</a>
        </div>
      ) : (
        <>
          <section className="r-cards">
            <div className="hstat">
              <span className="k">Players, all listed games</span>
              <span className="v num">
                {fmt(s.before)} → {fmt(s.during)} → {fmt(s.after)}
              </span>
              <span className="s">before → during → after{s.before == null || s.during == null || s.after == null ? ' (some games missing a value)' : ''}</span>
            </div>
            <div className="hstat">
              <span className="k">After vs before</span>
              <span className="v num">{pct(change(perDay(s.before, periods.before), perDay(s.after, periods.after)))}</span>
              <span className="s">{change(perDay(s.before, periods.before), perDay(s.after, periods.after)) == null ? 'needs before and after for every game' : 'more or fewer players than before the campaign'}</span>
            </div>
            <div className="hstat">
              <span className="k">New players still playing after</span>
              <span className="v num">{share(s.keptNew)}</span>
              <span className="s">{s.keptNew == null ? 'needs the two “new” columns' : `${fmt(s.newStillAfter)} of ${fmt(s.newDuring)} who started during the campaign`}</span>
            </div>
          </section>

          {unequal && <div className="notice warn small">Before, during and after cover different numbers of days unless you say otherwise. Add the period lengths below to compare players per day.</div>}

          <section className="card">
            <h2>By game</h2>
            <Bars rows={filled} periods={periods} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th className="num">During vs before</th>
                    <th className="num">After vs before</th>
                    <th className="num">New in campaign</th>
                    <th className="num">New, still playing</th>
                  </tr>
                </thead>
                <tbody>
                  {filled.map((r) => {
                    const after = change(perDay(r.before, periods.before), perDay(r.after, periods.after));
                    return (
                      <tr key={r.game}>
                        <td>{r.game}</td>
                        <td className="num">{pct(change(perDay(r.before, periods.before), perDay(r.during, periods.during)))}</td>
                        <td className={`num ${after == null ? '' : after >= 0 ? 'up' : 'down'}`}>{pct(after)}</td>
                        <td className="num">{fmt(r.newDuring)}</td>
                        <td className="num">
                          {r.newDuring && r.newStillAfter != null ? `${fmt(r.newStillAfter)} (${share(r.newStillAfter / r.newDuring)})` : fmt(r.newStillAfter)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section id="data" className="card">
        <div className="row-between">
          <h2>Your numbers</h2>
          <div className="row">
            <button className="small" onClick={() => setRows([...rows, emptyRow(`Game ${rows.length + 1}`)])}>
              + Add game
            </button>
            {confirmClear ? (
              <>
                <span className="small">Clear all numbers?</span>
                <button
                  className="danger small"
                  onClick={() => {
                    setRows(DEFAULT_GAMES.map(emptyRow));
                    setPeriods({ before: null, during: null, after: null });
                    setConfirmClear(false);
                  }}
                >
                  Yes, clear
                </button>
                <button className="small" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="ghost small" onClick={() => setConfirmClear(true)}>
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="small muted">Unique players of each game in each period. Leave a cell blank if you don’t have it. Numbers are kept in this browser only.</p>
        <div className="table-wrap">
          <table className="r-input">
            <thead>
              <tr>
                <th>Game</th>
                {COLS.map((c) => (
                  <th key={c.key} title={c.hint}>
                    {c.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const errs = validate(r);
                return (
                  <tr key={i}>
                    <td>
                      <input aria-label="Game name" value={r.game} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, game: e.target.value } : x)))} />
                      {errs.length > 0 && <div className="tiny" style={{ color: 'var(--block)' }}>Check: {errs.join('; ')}</div>}
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key}>
                        <input
                          aria-label={`${r.game} ${c.label}`}
                          className="num-input"
                          inputMode="numeric"
                          placeholder="—"
                          value={r[c.key] ?? ''}
                          onChange={(e) => setCell(i, c.key, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="ghost small" aria-label={`Remove ${r.game}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="r-periods">
          <span className="small muted">Period lengths in days (optional, to compare per day):</span>
          {(['before', 'during', 'after'] as const).map((k) => (
            <label key={k} className="inline small">
              {k}
              <input
                aria-label={`${k} period in days`}
                className="num-input"
                inputMode="numeric"
                placeholder="days"
                value={periods[k] ?? ''}
                onChange={(e) => setPeriods({ ...periods, [k]: e.target.value.trim() === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          ))}
        </div>
        <details>
          <summary>Paste from a spreadsheet or CSV</summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <textarea aria-label="Paste data" rows={6} value={paste} placeholder={templateCsv()} onChange={(e) => setPaste(e.target.value)} />
            <div className="row">
              <button className="primary small" disabled={!paste.trim()} onClick={importText}>
                Load pasted data
              </button>
              <button className="small" onClick={copyTemplate}>
                Copy template
              </button>
            </div>
            <p className="tiny muted">Columns: game, before_players, during_players, after_players, new_in_campaign, new_still_playing_after. Commas or tabs both work.</p>
          </div>
        </details>
        {msg && <p className="small" role="status">{msg}</p>}
      </section>

      <footer className="foot">SPRIBE internal. Shows only the numbers entered on this page.</footer>
    </div>
  );
}
