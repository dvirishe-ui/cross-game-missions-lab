import { useState } from 'react';
import { fmtDuration } from '../math/format';
import type { RunResult } from './engine';

/** Cumulative finishers over the event for one simulated day. */
export function RaceChart({ run, prizes, eventMinutes, reportedMinutes }: { run: RunResult; prizes: number; eventMinutes: number; reportedMinutes?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 620;
  const H = 260;
  const m = { l: 44, r: 16, t: 14, b: 38 };
  const yMax = Math.max(prizes * 1.25, run.finishTimes.length, 10);
  const x = (t: number) => m.l + (t / eventMinutes) * (W - m.l - m.r);
  const y = (n: number) => m.t + (1 - n / yMax) * (H - m.t - m.b);
  let d = `M${x(0)},${y(0)}`;
  run.finishTimes.forEach((t, i) => {
    d += `L${x(t).toFixed(1)},${y(i).toFixed(1)}L${x(t).toFixed(1)},${y(i + 1).toFixed(1)}`;
  });
  d += `L${x(eventMinutes)},${y(run.finishTimes.length)}`;
  const hourStep = eventMinutes > 360 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= eventMinutes + 0.1; t += hourStep) ticks.push(t);
  const countAt = (t: number) => run.finishTimes.filter((f) => f <= t).length;
  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Finishers over time. Last prize at ${run.finalPrize != null ? fmtDuration(run.finalPrize) : 'not reached'}.`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const t = (((e.clientX - r.left) / r.width) * W - m.l) / (W - m.l - m.r) * eventMinutes;
          setHover(t >= 0 && t <= eventMinutes ? t : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => {
          const n = Math.round(yMax * f);
          return (
            <g key={f}>
              <line className="grid-line" x1={m.l} x2={W - m.r} y1={y(n)} y2={y(n)} />
              <text x={m.l - 6} y={y(n) + 3.5} textAnchor="end">
                {n}
              </text>
            </g>
          );
        })}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - m.b + 16} textAnchor="middle">
            {t / 60}h
          </text>
        ))}
        <line className="axis" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle">
          Time since the event started
        </text>
        <text x={12} y={(H - m.b + m.t) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - m.b + m.t) / 2})`}>
          Players finished
        </text>
        <line x1={m.l} x2={W - m.r} y1={y(prizes)} y2={y(prizes)} stroke="var(--warn)" strokeDasharray="5 4" />
        <text x={W - m.r} y={y(prizes) - 5} textAnchor="end" style={{ fill: 'var(--warn)' }}>
          {prizes} prizes
        </text>
        <path d={d} fill="none" stroke="var(--sim)" strokeWidth={2.2} />
        {run.finalPrize != null && (
          <g>
            <line x1={x(run.finalPrize)} x2={x(run.finalPrize)} y1={m.t} y2={H - m.b} stroke="var(--aviator)" strokeDasharray="3 3" />
            <circle cx={x(run.finalPrize)} cy={y(prizes)} r={5} fill="var(--aviator)" />
            <text x={Math.min(x(run.finalPrize) + 6, W - 120)} y={m.t + 12} style={{ fill: 'var(--aviator)' }}>
              last prize {fmtDuration(run.finalPrize)}
            </text>
          </g>
        )}
        {reportedMinutes != null && reportedMinutes <= eventMinutes && (
          <g>
            <line x1={x(reportedMinutes)} x2={x(reportedMinutes)} y1={m.t + 18} y2={H - m.b} stroke="var(--ok)" strokeDasharray="2 3" />
            <text x={Math.min(x(reportedMinutes) + 6, W - 120)} y={m.t + 30} style={{ fill: 'var(--ok)' }}>
              real {fmtDuration(reportedMinutes)}
            </text>
          </g>
        )}
        {hover != null && <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} />}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${Math.min(68, Math.max(2, (x(hover) / W) * 100))}%`, top: 40 }}>
          {fmtDuration(hover)}: {countAt(hover)} finished
        </div>
      )}
    </div>
  );
}

export function Bars({
  items,
  max,
  color = 'var(--aviator)',
  pairs = false,
}: {
  items: { label: string; value: number; value2?: number; text: string }[];
  max: number;
  color?: string;
  pairs?: boolean;
}) {
  return (
    <div className="bars">
      {items.map((it) => (
        <div key={it.label} className="bar-row">
          <span className="bar-label">{it.label}</span>
          <span className="bar-track">
            <i style={{ width: `${Math.min(100, (it.value / max) * 100)}%`, background: pairs ? 'var(--line-2)' : color }} />
            {pairs && it.value2 != null && Number.isFinite(it.value2) && <b style={{ width: `${Math.min(100, (it.value2 / max) * 100)}%` }} />}
          </span>
          <span className="bar-text num">{it.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Last-prize time across possible turnouts (log scale), with the usual 10–90% range. */
export function SweepChart({
  points,
  eventMinutes,
  selected,
  onPick,
  alreadyAll,
}: {
  points: { players: number; p10: number; median: number; p90: number; pAllClaimed: number }[];
  eventMinutes: number;
  selected: number;
  onPick: (players: number) => void;
  /** Most players who already play every mission game (from overlap data). */
  alreadyAll?: number;
}) {
  const W = 640;
  const H = 280;
  const m = { l: 52, r: 18, t: 18, b: 42 };
  const minP = 25;
  const maxP = 1000;
  const x = (n: number) => m.l + ((Math.log(n) - Math.log(minP)) / (Math.log(maxP) - Math.log(minP))) * (W - m.l - m.r);
  const top = eventMinutes * 1.08;
  const y = (t: number) => m.t + (1 - Math.min(t, top) / top) * (H - m.t - m.b);
  const cap = (t: number) => (Number.isFinite(t) ? Math.min(t, top) : top);
  const sorted = [...points].sort((a, b) => a.players - b.players);
  const band =
    sorted.length > 1
      ? `M${sorted.map((p) => `${x(p.players)},${y(cap(p.p90))}`).join('L')}L${[...sorted]
          .reverse()
          .map((p) => `${x(p.players)},${y(cap(p.p10))}`)
          .join('L')}Z`
      : '';
  const line = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.players)},${y(cap(p.median))}`).join('');
  const hourStep = eventMinutes > 360 ? 120 : 60;
  const yTicks: number[] = [];
  for (let t = 0; t <= eventMinutes + 0.1; t += hourStep) yTicks.push(t);
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Time the last prize goes, by number of players">
        {yTicks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 8} y={y(t) + 3.5} textAnchor="end">
              {t / 60}h
            </text>
          </g>
        ))}
        {[25, 50, 100, 200, 500, 1000].map((n) => (
          <text key={n} x={x(n)} y={H - m.b + 16} textAnchor="middle">
            {n}
          </text>
        ))}
        <line className="axis" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
          Players going for the prizes (log scale)
        </text>
        <text x={12} y={(H - m.b + m.t) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - m.b + m.t) / 2})`}>
          Last prize goes at
        </text>
        <line x1={m.l} x2={W - m.r} y1={y(eventMinutes)} y2={y(eventMinutes)} stroke="var(--aviator)" strokeDasharray="5 4" />
        <text x={W - m.r} y={y(eventMinutes) - 5} textAnchor="end" style={{ fill: 'var(--aviator)' }}>
          event ends
        </text>
        {band && <path d={band} fill="var(--sim)" opacity={0.15} />}
        {line && <path d={line} fill="none" stroke="var(--sim)" strokeWidth={2.2} />}
        {alreadyAll != null && alreadyAll >= minP && alreadyAll <= maxP && (
          <g>
            <rect x={m.l} y={m.t} width={x(alreadyAll) - m.l} height={H - m.t - m.b} fill="var(--violet)" opacity={0.08} />
            <line x1={x(alreadyAll)} x2={x(alreadyAll)} y1={m.t} y2={H - m.b} stroke="var(--violet)" strokeDasharray="4 3" />
            <text x={x(alreadyAll) + 5} y={H - m.b - 8} style={{ fill: 'var(--violet)' }}>
              ≤ {alreadyAll} already play every game
            </text>
          </g>
        )}
        {selected >= minP && selected <= maxP && <line x1={x(selected)} x2={x(selected)} y1={m.t} y2={H - m.b} stroke="var(--warn)" strokeDasharray="2 3" />}
        {sorted.map((p) => {
          const left = !Number.isFinite(p.median);
          return (
            <g key={p.players} style={{ cursor: 'pointer' }} onClick={() => onPick(p.players)}>
              <circle cx={x(p.players)} cy={y(cap(p.median))} r={left ? 6 : 5} fill={left ? 'var(--block)' : 'var(--sim)'} stroke="var(--bg)" strokeWidth={1.5}>
                <title>
                  {p.players} players: {left ? 'prizes usually left at the end' : `last prize ~${fmtDuration(p.median)}`} · all prizes go in {Math.round(p.pAllClaimed * 100)}% of days
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="legend small">
        <span>
          <i style={{ ['--c' as string]: 'var(--sim)' }} />
          usual time (shaded: 8 in 10 days)
        </span>
        <span>
          <i style={{ ['--c' as string]: 'var(--block)' }} />
          prizes left at the end
        </span>
        <span>
          <i style={{ ['--c' as string]: 'var(--warn)' }} />
          your slider
        </span>
        {alreadyAll != null && (
          <span>
            <i style={{ ['--c' as string]: 'var(--violet)' }} />
            players who already play all mission games (one operator)
          </span>
        )}
      </div>
    </div>
  );
}
