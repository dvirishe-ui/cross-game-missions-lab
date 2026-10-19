import { GAMES, PERIODS, growth, total, type GameCounts } from './data';

const n = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
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
            <td className="num up">{pct(growth(totals.before, totals.after))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Retention() {
  const max = Math.max(...promo.flatMap((g) => PERIODS.map((p) => g.players[p])));
  const pc = promo.find((g) => g.key === 'pilot-chicken')!;
  return (
    <div className="r-page">
      <header className="r-head">
        <span className="kicker">football.com Nigeria · Promo games</span>
        <h1>Did players stay after the promo?</h1>
        <p className="lede">
          Players of the six non-Aviator promo games before, during and after the cross-game promotion. All six still had more players after the promo ended than before it
          started.
        </p>
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
          <span className="k">After the promo vs before</span>
          <span className="v num">{pct(growth(promoT.before, promoT.after))}</span>
          <span className="s">Games not in the promo: {pct(growth(otherT.before, otherT.after))}</span>
        </div>
        <div className="hstat">
          <span className="k">Biggest lasting gain</span>
          <span className="v num">Pilot Chicken {times(pc.players.before, pc.players.after)}</span>
          <span className="s">
            {n(pc.players.before)} → {n(pc.players.during)} → {n(pc.players.after)} players
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
        <h2>Games that were not in the promo</h2>
        <p className="small muted">For comparison: these games had no missions.</p>
        <Table games={others} totals={otherT} />
      </section>

    </div>
  );
}
