import { AVIATOR, GAMES, OPERATOR_DIFF, OPERATOR_TOTAL, PERIODS, PERIOD_DATES, growth, total, type GameCounts } from './data';

const n = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
const opct = (v: number) => (Math.abs(v) < 0.05 ? '0.0%' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const times = (a: number, b: number) => `×${(b / a).toFixed(1)}`;
const LABEL = { before: 'Before', during: 'During', after: 'After' } as const;
const COLOR = { before: 'var(--line-2)', during: 'var(--violet)', after: 'var(--sim)' } as const;

const promo = GAMES.filter((g) => g.promo);
const others = GAMES.filter((g) => !g.promo);
const promoT = { before: total(promo, 'before'), during: total(promo, 'during'), after: total(promo, 'after') };
const otherT = { before: total(others, 'before'), during: total(others, 'during'), after: total(others, 'after') };

function GameBars({ g, max }: { g: GameCounts; max: number }) {
  const after = growth(g.players.before, g.players.after);
  return (
    <div className="r-game">
      <div className="row-between">
        <span className="r-name">{g.name}</span>
        <span className={`r-chip ${after >= 0 ? 'up' : 'down'}`}>{pct(after)} after vs before</span>
      </div>
      {PERIODS.map((p) => (
        <div key={p} className="r-bar">
          <span className="r-lbl">{LABEL[p]}</span>
          <span className="r-track">
            <i style={{ width: `${(g.players[p] / max) * 100}%`, background: COLOR[p] }} />
          </span>
          <span className="r-val num">{n(g.players[p])}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ games, totals }: { games: GameCounts[]; totals: Record<'before' | 'during' | 'after', number> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Game</th>
            <th className="num">Before</th>
            <th className="num">During</th>
            <th className="num">After</th>
            <th className="num">During vs before</th>
            <th className="num">After vs before</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const a = growth(g.players.before, g.players.after);
            return (
              <tr key={g.key}>
                <td>{g.name}</td>
                <td className="num">{n(g.players.before)}</td>
                <td className="num">{n(g.players.during)}</td>
                <td className="num">{n(g.players.after)}</td>
                <td className="num">{times(g.players.before, g.players.during)}</td>
                <td className={`num ${a >= 0 ? 'up' : 'down'}`}>{pct(a)}</td>
              </tr>
            );
          })}
          <tr className="r-total">
            <td>
              <strong>All of these</strong>
            </td>
            <td className="num">{n(totals.before)}</td>
            <td className="num">{n(totals.during)}</td>
            <td className="num">{n(totals.after)}</td>
            <td className="num">{times(totals.before, totals.during)}</td>
            <td className={`num ${growth(totals.before, totals.after) >= 0 ? 'up' : 'down'}`}>{pct(growth(totals.before, totals.after))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Retention() {
  const max = Math.max(...promo.flatMap((g) => PERIODS.map((p) => g.players[p])));
  const afterAll = growth(promoT.before, promoT.after);
  const duringAll = growth(promoT.before, promoT.during);
  const ranked = [...promo].sort((a, b) => growth(b.players.before, b.players.after) - growth(a.players.before, a.players.after));
  const best = ranked[0];
  const holding = promo.filter((g) => growth(g.players.before, g.players.after) >= -0.02);
  const lower = promo.filter((g) => growth(g.players.before, g.players.after) < -0.02);
  const names = (gs: GameCounts[]) => gs.map((g) => g.name).join(', ');
  return (
    <div className="r-page">
      <header className="r-head">
        <span className="kicker">football.com Nigeria · Promo games</span>
        <h1>Did players stay after the promo?</h1>
        <p className="lede">
          Players of the six non-Aviator promo games before, during and after the cross-game promotion. During the promo they had {Math.round(duringAll * 100)}% more players; after it, they were
          {afterAll >= 0 ? ` still ${pct(afterAll)} above` : ` back near`} their level before the promo ({pct(afterAll)}).
          {holding.length > 0 && ` ${names(holding)} held ${holding.length === 1 ? 'its' : 'their'} players${lower.length ? `; ${names(lower)} dropped below.` : '.'}`}
        </p>
        {PERIOD_DATES.before && <p className="small muted">Before: {PERIOD_DATES.before}</p>}
      </header>

      <section className="r-cards">
        <div className="hstat">
          <span className="k">Promo games, all six</span>
          <span className="v num">
            {n(promoT.before)} → {n(promoT.during)} → {n(promoT.after)}
          </span>
          <span className="s">players before → during → after</span>
        </div>
        <div className="hstat hi">
          <span className="k">During the promo vs before</span>
          <span className="v num">{pct(duringAll)}</span>
          <span className="s">
            After the promo vs before: {pct(afterAll)} · games not in the promo: {pct(growth(otherT.before, otherT.after))}
          </span>
        </div>
        <div className="hstat">
          <span className="k">Best after the promo</span>
          <span className="v num">
            {best.name} {pct(growth(best.players.before, best.players.after))}
          </span>
          <span className="s">
            {n(best.players.before)} → {n(best.players.during)} → {n(best.players.after)} players
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Each promo game</h2>
        <div className="legend small">
          {PERIODS.map((p) => (
            <span key={p}>
              <i style={{ ['--c' as string]: COLOR[p] }} />
              {LABEL[p]}
            </span>
          ))}
        </div>
        <div className="r-bars">
          {promo.map((g) => (
            <GameBars key={g.key} g={g} max={max} />
          ))}
        </div>
        <Table games={promo} totals={promoT} />
      </section>

      <section className="card">
        <h2>What the operator reported: promo week vs previous week</h2>
        <p className="small muted">Change in each figure in the promo week compared with the previous week, as sent by the operator.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th className="num">Users</th>
                <th className="num">Bets</th>
                <th className="num">Stakes</th>
                <th className="num">Users P&amp;L</th>
                <th className="num">Users (our count)</th>
              </tr>
            </thead>
            <tbody>
              {OPERATOR_DIFF.map((d) => {
                const g = GAMES.find((x) => x.key === d.key);
                const ours = d.key === 'aviator' ? growth(AVIATOR.before, AVIATOR.during) : g ? growth(g.players.before, g.players.during) : null;
                return (
                  <tr key={d.key}>
                    <td>{d.name}</td>
                    {[d.users, d.bets, d.stakes, d.usersPnl].map((v, i) => (
                      <td key={i} className={`num ${v >= 0 ? 'up' : 'down'}`}>
                        {opct(v)}
                      </td>
                    ))}
                    <td className="num muted">{ours == null ? '—' : opct(ours * 100)}</td>
                  </tr>
                );
              })}
              <tr className="r-total">
                <td>
                  <strong>Grand total</strong>
                </td>
                {[OPERATOR_TOTAL.users, OPERATOR_TOTAL.bets, OPERATOR_TOTAL.stakes, OPERATOR_TOTAL.usersPnl].map((v, i) => (
                  <td key={i} className={`num ${v >= 0 ? 'up' : 'down'}`}>
                    {opct(v)}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="clean small">
          <li>
            <strong>The operator’s user numbers match ours</strong> (last column), so both sources agree on the jump during the promo.
          </li>
          <li>
            <strong>Bets grew much faster than users</strong> in the promo games: Pilot Chicken +479%, Keno +481%, Trader +430%. Each player bet many more times, as the missions asked.
          </li>
          <li>
            <strong>Stakes grew less than bets,</strong> so the average bet got smaller: Goal stakes fell 75% while bets rose 159%, and Mines stakes rose only 4%. Players chased mission
            targets with small bets.
          </li>
          <li>
            <strong>Aviator stayed flat</strong> (users −0.1%, stakes −3.4%), and total stakes across these games were −3.1%.
          </li>
          <li>
            <strong>Users P&amp;L rose 249.5% overall,</strong> as reported. Confirm with the operator whether this is players’ winnings or players’ net result before reading more into it.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Games that were not in the promo</h2>
        <p className="small muted">For comparison: these games had no missions.</p>
        <Table games={others} totals={otherT} />
      </section>

    </div>
  );
}
