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
