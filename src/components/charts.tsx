import { useMemo, useRef, useState } from 'react';
import { fmtDuration, fmtPercent } from '../math/format';

export interface Series {
  name: string;
  color: string;
  points: { t: number; y: number }[];
  dashed?: boolean;
}

const W = 640;
const H = 260;
const M = { l: 48, r: 18, t: 16, b: 40 };

function niceHourTicks(maxMin: number): number[] {
  const hours = maxMin / 60;
  const steps = [0.25, 0.5, 1, 2, 4, 6, 12, 24, 48];
  const step = steps.find((s) => hours / s <= 8) ?? 96;
  const ticks: number[] = [];
  for (let h = 0; h <= hours + 1e-9; h += step) ticks.push(h * 60);
  return ticks;
}

/**
 * Probability-vs-time line chart. X axis in hours (minutes internally),
 * Y axis 0–100 %. Hover shows the value of each series at that time.
 */
export function ProbabilityChart({
  series,
  horizon,
  deadline,
  yLabel = 'Probability',
  xLabel = 'Time since event start (hours)',
  markers = [],
}: {
  series: Series[];
  horizon: number;
  deadline?: number;
  yLabel?: string;
  xLabel?: string;
  markers?: { t: number; label: string; color: string }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const x = (t: number) => M.l + (Math.min(t, horizon) / horizon) * (W - M.l - M.r);
  const y = (p: number) => M.t + (1 - p) * (H - M.t - M.b);
  const ticks = useMemo(() => niceHourTicks(horizon), [horizon]);
  const paths = series.map((s) => s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(''));
  const valueAt = (s: Series, t: number) => {
    let best = s.points[0];
    for (const p of s.points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    return best;
  };
  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = ((px - M.l) / (W - M.l - M.r)) * horizon;
    setHover(t < 0 || t > horizon ? null : t);
  };
  const tipLeft = hover == null ? 0 : (x(hover) / W) * 100;
  return (
    <div className="chart-wrap">
      <svg
        ref={ref}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${yLabel} by ${xLabel}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line className="grid-line" x1={M.l} x2={W - M.r} y1={y(p)} y2={y(p)} />
            <text x={M.l - 8} y={y(p) + 3.5} textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line className="axis" x1={x(t)} x2={x(t)} y1={H - M.b} y2={H - M.b + 4} />
            <text x={x(t)} y={H - M.b + 16} textAnchor="middle">
              {+(t / 60).toFixed(2)}h
            </text>
          </g>
        ))}
        <line className="axis" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
        <line className="axis" x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} />
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle">
          {xLabel}
        </text>
        <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>
          {yLabel}
        </text>
        {deadline != null && deadline <= horizon && (
          <g>
            <line className="deadline" x1={x(deadline)} x2={x(deadline)} y1={M.t} y2={H - M.b} />
            <text className="deadline-label" x={x(deadline) - 4} y={M.t + 10} textAnchor="end">
              deadline
            </text>
          </g>
        )}
        {markers
          .filter((m) => Number.isFinite(m.t) && m.t <= horizon)
          .map((m) => (
            <g key={m.label}>
              <line x1={x(m.t)} x2={x(m.t)} y1={M.t} y2={H - M.b} stroke={m.color} strokeDasharray="1 3" />
            </g>
          ))}
        {series.map((s, i) => (
          <path key={s.name} d={paths[i]} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
        ))}
        {hover != null && (
          <g>
            <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} />
            {series.map((s) => {
              const p = valueAt(s, hover);
              return <circle key={s.name} cx={x(p.t)} cy={y(p.y)} r={3.5} fill={s.color} />;
            })}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${Math.min(70, Math.max(2, tipLeft))}%`, top: 8 }}>
          <div>{fmtDuration(hover)} after start</div>
          {series.map((s) => (
            <div key={s.name} style={{ color: s.color }}>
              {s.name}: {fmtPercent(valueAt(s, hover).y)}
            </div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ ['--c' as string]: s.color }} />
            {s.name}
          </span>
        ))}
        {markers.map((m) => (
          <span key={m.label}>
            <i style={{ ['--c' as string]: m.color }} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal duration bars: parallel (max) vs sequential (sum). */
export function DurationBars({ items, mode }: { items: { label: string; minutes: number; color: string }[]; mode: 'parallel' | 'sequential' }) {
  const total = items.reduce((a, b) => a + b.minutes, 0);
  const max = Math.max(...items.map((i) => i.minutes));
  const scale = mode === 'sequential' ? total : total; // same scale for both views so they compare
  const w = 600;
  const rowH = 20;
  const h = items.length * (rowH + 6) + 34;
  let offset = 0;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${mode} completion of ${items.length} tasks`}>
      {items.map((it, i) => {
        const start = mode === 'sequential' ? offset : 0;
        offset += it.minutes;
        const x0 = 90 + (start / scale) * (w - 110);
        const bw = (it.minutes / scale) * (w - 110);
        return (
          <g key={i}>
            <text x={84} y={i * (rowH + 6) + 14} textAnchor="end">
              {it.label}
            </text>
            <rect x={x0} y={i * (rowH + 6)} width={Math.max(1, bw)} height={rowH} rx={3} fill={it.color} opacity={0.85} />
          </g>
        );
      })}
      {(() => {
        const end = mode === 'sequential' ? total : max;
        const xe = 90 + (end / scale) * (w - 110);
        const yb = items.length * (rowH + 6) + 4;
        return (
          <g>
            <line x1={xe} x2={xe} y1={0} y2={yb} className="deadline" />
            <text x={Math.min(xe, w - 60)} y={yb + 18} textAnchor="middle" className="deadline-label">
              done at {end} min
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
