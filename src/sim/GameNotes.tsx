import { KIND_TEXT, type SimGame } from './games';
import { KENO_PAYTABLE, PLINKO_MAX_ONLY, PLINKO_TABLES, rtpOfKeno, rtpOfPlinko } from './paytables';

/** Where each game's numbers come from, with the paytables and their RTP check. */
export function GameNotes({ games }: { games: SimGame[] }) {
  return (
    <details className="card flat">
      <summary>Where the numbers come from (rules, paytables, sources)</summary>
      <div className="game-notes">
        {games.map((g) => (
          <div key={g.id} className="game-note">
            <div className="row-between">
              <strong>{g.name}</strong>
              <span className={`kind ${g.kind}`}>{KIND_TEXT[g.kind]}</span>
            </div>
            <p className="small">{g.how}</p>
            <p className="tiny muted">RTP: {g.rtpNote}</p>
            <div className="row tiny">
              {g.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label} ↗
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h4 style={{ marginTop: 16 }}>Keno paytable (36 numbers, 10 drawn)</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Picks</th>
              {Array.from({ length: 8 }, (_, h) => (
                <th key={h} className="num">
                  {h} hits
                </th>
              ))}
              <th className="num">Adds up to</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(KENO_PAYTABLE).map(([picks, row]) => (
              <tr key={picks}>
                <td>{picks}</td>
                {Array.from({ length: 8 }, (_, h) => (
                  <td key={h} className="num small">
                    {h < row.length ? (row[h] ? `${row[h]}×` : '0') : ''}
                  </td>
                ))}
                <td className="num small ok-text">{(rtpOfKeno(Number(picks)) * 100).toFixed(1)}% ✓</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">
        8–10 picks were only partly published (8 picks: 8 hits pays 70×; 10 picks: 6 hits 10.2×, 7 hits 25×, 10 hits 100×), so they are left out. They never give a better chance of 30×+
        than the rows above. “Adds up to” is the RTP each row gives with Keno’s real odds: every row lands on 97%, which is how we know the table is right.
      </p>

      <h4 style={{ marginTop: 16 }}>Plinko tables (edge slot → centre slot)</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Setup</th>
              <th>Slot multipliers</th>
              <th className="num">Adds up to</th>
            </tr>
          </thead>
          <tbody>
            {PLINKO_TABLES.map((t) => (
              <tr key={`${t.rows}${t.colour}`}>
                <td>
                  {t.rows} rows, {t.colour}
                </td>
                <td className="small mono">{t.half.map((v) => `${v}×`).join(' · ')}</td>
                <td className="num small ok-text">{(rtpOfPlinko(t) * 100).toFixed(1)}% ✓</td>
              </tr>
            ))}
            {PLINKO_MAX_ONLY.map((t) => (
              <tr key={`${t.rows}${t.colour}`}>
                <td>
                  {t.rows} rows, {t.colour}
                </td>
                <td className="small muted">Only the maximum ({t.max}×) was published; not used.</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">The ball lands in slot k with chance C(rows, k) ÷ 2^rows. Each full table reproduces exactly 97% RTP.</p>
    </details>
  );
}
