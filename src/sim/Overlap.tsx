import { useState } from 'react';
import { OVERLAP_GAMES, OVERLAP_SOURCE, maxPlayingAll, overlap, shareAlsoIn } from '../data/overlap';
import type { SimMission } from './engine';

const nameOf = (k: string) => OVERLAP_GAMES.find((g) => g.key === k)?.name ?? k;

/** Players already in every mission game: at most the smallest pairwise overlap. */
export function missionOverlap(missions: SimMission[]) {
  const keys = [...new Set(missions.map((m) => m.game))];
  const missing = keys.filter((k) => !OVERLAP_GAMES.some((g) => g.key === k));
  return { keys, missing, max: missing.length ? null : maxPlayingAll(keys) };
}

function cellColor(share: number): string {
  const pct = Math.min(100, Math.round(Math.sqrt(share) * 100));
  return `color-mix(in srgb, var(--sim) ${pct}%, transparent)`;
}

export function OverlapSection({ missions }: { missions: SimMission[] }) {
  const [mode, setMode] = useState<'share' | 'players'>('share');
  const mo = missionOverlap(missions);
  const aviator = OVERLAP_GAMES[0];
  const others = OVERLAP_GAMES.slice(1);
  const smallTotal = others.reduce((a, g) => a + g.players, 0);
  return (
    <section id="overlap" className="sim-section">
      <h2>4 · Who already plays which games?</h2>
      <p className="lede small">
        Real player data from one operator ({OVERLAP_SOURCE.operator}; period {OVERLAP_SOURCE.period.toLowerCase()}): how many players of each game also played each other
        game.
      </p>

      <div className="hero-stats">
        <div className="hstat">
          <span className="k">Aviator players</span>
          <span className="v">{aviator.players.toLocaleString('en-US')}</span>
          <span className="s">All 14 other games together: {smallTotal.toLocaleString('en-US')}</span>
        </div>
        <div className="hstat">
          <span className="k">Aviator players who also play Mines</span>
          <span className="v">{((shareAlsoIn('aviator', 'mines') ?? 0) * 100).toFixed(2)}%</span>
          <span className="s">Pilot Chicken 0.87%, Plinko 0.79%; every other game under 0.4%</span>
        </div>
        <div className="hstat">
          <span className="k">Players already in all of these missions’ games</span>
          <span className="v">{mo.max ? `≤ ${mo.max.limit}` : '—'}</span>
          <span className="s">
            {mo.max
              ? mo.keys.length > 1
                ? `Limited by ${nameOf(mo.max.pair[0])} + ${nameOf(mo.max.pair[1])}`
                : 'Only one game in the missions'
              : `${mo.missing.map(nameOf).join(', ')} not in the data`}
          </span>
        </div>
      </div>

      <ul className="clean small">
        <li>
          <strong>Aviator dwarfs everything.</strong> Mines, the next biggest, has 1,644 players, about 40× fewer.
        </li>
        <li>
          <strong>Aviator players rarely try other games.</strong> Under 1% of them played any single other game.
        </li>
        <li>
          <strong>The reverse is common.</strong> 28–59% of each smaller game’s players also play Aviator (e.g. Hotline 59%, Trader 57%, Pilot Chicken 52%, Mines 35%).
        </li>
        <li>
          <strong>Few people already play the full set.</strong> On every day of the last campaign, at most 30–79 of this operator’s players already played all of that day’s mission
          games, around or below the 50 prizes. A cross-game mission mostly has to bring players into games they don’t play yet. Nobody can be in all the games without being in
          each pair, so the smallest pair overlap is a ceiling; the real number is lower.
        </li>
      </ul>

      <div className="card">
        <div className="row-between">
          <h3>Overlap between games</h3>
          <div className="seg" role="group" aria-label="Show as">
            <button aria-pressed={mode === 'share'} onClick={() => setMode('share')}>
              % of row game’s players
            </button>
            <button aria-pressed={mode === 'players'} onClick={() => setMode('players')}>
              Number of players
            </button>
          </div>
        </div>
        <p className="tiny muted">
          {mode === 'share' ? 'Read across: of the players of the row game, the share who also played the column game.' : 'Players who played both games. The diagonal is each game’s own total.'}{' '}
          Games in the current missions are highlighted.
        </p>
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th>Row game (players)</th>
                {OVERLAP_GAMES.map((g) => (
                  <th key={g.key} className={mo.keys.includes(g.key as never) ? 'hl-col' : undefined} title={g.name}>
                    {g.name.replace(' (name cut off)', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OVERLAP_GAMES.map((a) => (
                <tr key={a.key} className={mo.keys.includes(a.key as never) ? 'hl-row' : undefined}>
                  <td className="small">
                    <strong>{a.name.replace(' (name cut off)', '')}</strong> <span className="muted num">{a.players.toLocaleString('en-US')}</span>
                  </td>
                  {OVERLAP_GAMES.map((b) => {
                    if (a.key === b.key) return <td key={b.key} className="num tiny diag">{mode === 'players' ? a.players.toLocaleString('en-US') : '—'}</td>;
                    const share = shareAlsoIn(a.key, b.key) ?? 0;
                    const n = overlap(a.key, b.key) ?? 0;
                    return (
                      <td key={b.key} className="num tiny" style={{ background: cellColor(share) }} title={`${n} of ${a.players.toLocaleString('en-US')} ${a.name} players also played ${b.name} (${(share * 100).toFixed(2)}%)`}>
                        {mode === 'share' ? `${share * 100 < 1 ? (share * 100).toFixed(1) : Math.round(share * 100)}%` : n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">
          Internal data shared by the team on {OVERLAP_SOURCE.shared}. One operator only and no time period given, so treat it as a pattern rather than a turnout forecast. Keno 80 is not
          in the data.
        </p>
      </div>
    </section>
  );
}
