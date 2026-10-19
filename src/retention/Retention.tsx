import { AVIATOR, GAMES, PERIODS, growth, perHundredAviator, total, type GameCounts } from './data';

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
            <th className="num" title="Game players per 100 Aviator players, before → after">Per 100 Aviator players</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const a = growth(g.players.before, g.players.after);
            const sb = perHundredAviator(g.players.before, 'before');
            const sa = perHundredAviator(g.players.after, 'after');
            return (
              <tr key={g.key}>
                <td>{g.name}</td>
                <td className="num">{n(g.players.before)}</td>
                <td className="num">{n(g.players.during)}</td>
                <td className="num">{n(g.players.after)}</td>
                <td className="num">{times(g.players.before, g.players.during)}</td>
                <td className={`num ${a >= 0 ? 'up' : 'down'}`}>{pct(a)}</td>
                <td className={`num ${sa >= sb ? 'up' : 'down'}`}>
                  {sb.toFixed(2)} → {sa.toFixed(2)}
                </td>
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
            <td className="num">
              {perHundredAviator(totals.before, 'before').toFixed(2)} → {perHundredAviator(totals.after, 'after').toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Retention() {
  const max = Math.max(...promo.flatMap((g) => PERIODS.map((p) => g.players[p])));
  const pc = promo.find((g) => g.key === 'pilot-chicken')!;
  const aviatorGrowth = growth(AVIATOR.before, AVIATOR.after);
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
        <h2>A fair comparison</h2>
        <p>
          Aviator also grew over the same time, from {n(AVIATOR.before)} to {n(AVIATOR.after)} players ({pct(aviatorGrowth)}), so part of the rise is the operator’s overall
          growth. The last column above removes it by counting each game’s players per 100 Aviator players.
        </p>
        <ul className="clean">
          <li>
            <strong>Pilot Chicken kept a real gain:</strong> {perHundredAviator(pc.players.before, 'before').toFixed(2)} → {perHundredAviator(pc.players.after, 'after').toFixed(2)} players
            per 100 Aviator players, about {(perHundredAviator(pc.players.after, 'after') / perHundredAviator(pc.players.before, 'before')).toFixed(1)}× its old level.
          </li>
          <li>
            <strong>Keno held its level</strong> (0.33 → 0.34). Mines, Plinko, Goal and Trader grew in players but slightly less than Aviator.
          </li>
          <li>
            <strong>Promo games together grew {pct(growth(promoT.before, promoT.after))}</strong>, in line with Aviator ({pct(aviatorGrowth)}) and well ahead of the games that were not in the
            promo ({pct(growth(otherT.before, otherT.after))}).
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Games that were not in the promo</h2>
        <p className="small muted">For comparison: these games had no missions.</p>
        <Table games={others} totals={otherT} />
      </section>

      <footer className="foot">
        Source: player-overlap tables for football.com Nigeria shared by the team. Order of the three snapshots inferred from the numbers: before = {n(AVIATOR.before)} Aviator players,
        during = {n(AVIATOR.during)}, after = {n(AVIATOR.after)}. The length of each period was not given; if they differ, counts are not directly comparable.
      </footer>
    </div>
  );
}
