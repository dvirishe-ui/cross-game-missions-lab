import { useState } from 'react';
import { CAMPAIGN_GAMES, GAME_BY_ID } from '../../data/games';
import { calcEconomics, type GameEconomics } from '../../math/economics';
import { fmtNumber } from '../../math/format';
import { Badge, NumberField, Notice, PercentField, Stat } from '../../components/ui';

export function Economics() {
  const [open, setOpen] = useState(false);
  const [games, setGames] = useState<GameEconomics[]>(CAMPAIGN_GAMES.filter((g) => g !== 'keno-80').map((g) => ({ game: GAME_BY_ID[g].name, turnover: null, rtp: null, rtpSource: '' })));
  const [rewards, setRewards] = useState<number | null>(null);
  const [costs, setCosts] = useState<number | null>(null);
  const res = calcEconomics({ games, rewards, otherCosts: costs });
  const setGame = (i: number, patch: Partial<GameEconomics>) => setGames(games.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <article className="card" id="economics">
      <div className="card-head">
        <div className="stack-sm">
          <h3>Business economics (optional)</h3>
          <span className="small muted">Expected gaming margin = Σ turnover × (1 − RTP). Estimated contribution = margin − promotional rewards − relevant costs.</span>
        </div>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide panel' : 'Open panel'}
        </button>
      </div>
      {open && (
        <>
          <Notice tone="warn">
            This is an <strong>expectation</strong>, not a forecast of results. Event duration does not establish profitability; a reward is not guaranteed net player
            profit; incremental impact needs comparison with activity that would have happened without the campaign. Use each game’s actual RTP and its source. Do
            not assume one RTP across the portfolio.
          </Notice>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Turnover</th>
                  <th>RTP</th>
                  <th>RTP source</th>
                  <th className="num">Expected margin</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g, i) => (
                  <tr key={g.game}>
                    <td>
                      <input aria-label="Game" value={g.game} onChange={(e) => setGame(i, { game: e.target.value })} />
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <NumberField id={`eco-t-${i}`} label="" value={g.turnover} onChange={(v) => setGame(i, { turnover: v })} required />
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <PercentField id={`eco-r-${i}`} label="" value={g.rtp} onChange={(v) => setGame(i, { rtp: v })} required />
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <input aria-label={`${g.game} RTP source`} className={g.rtpSource ? '' : 'is-missing'} placeholder="Link or document" value={g.rtpSource} onChange={(e) => setGame(i, { rtpSource: e.target.value })} />
                    </td>
                    <td className="num">{g.turnover != null && g.rtp != null ? fmtNumber(g.turnover * (1 - g.rtp), 2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="small" onClick={() => setGames([...games, { game: 'Other game', turnover: null, rtp: null, rtpSource: '' }])}>
              Add game
            </button>
            {games.length > 1 && (
              <button className="ghost small" onClick={() => setGames(games.slice(0, -1))}>
                Remove last
              </button>
            )}
          </div>
          <div className="form-grid">
            <NumberField id="eco-rewards" label="Promotional rewards" value={rewards} onChange={setRewards} required />
            <NumberField id="eco-costs" label="Other relevant costs" value={costs} onChange={setCosts} required />
          </div>
          {res.ok ? (
            <div className="stack-sm">
              <div className="row">
                <Badge kind="calculated" />
                <Badge kind="assumption">Expectation</Badge>
              </div>
              <div className="stats">
                <Stat k="Expected gaming margin" v={fmtNumber(res.expectedMargin, 2)} />
                <Stat k="Estimated campaign contribution" v={fmtNumber(res.contribution, 2)} s="Before any incrementality adjustment" />
              </div>
            </div>
          ) : (
            <Notice tone={res.errors.length ? 'block' : 'info'}>
              {res.errors.length ? res.errors.join(' ') : `Enter ${res.missing.length} remaining inputs to compute: ${res.missing.slice(0, 4).join(', ')}${res.missing.length > 4 ? '…' : ''}.`}
            </Notice>
          )}
        </>
      )}
    </article>
  );
}
