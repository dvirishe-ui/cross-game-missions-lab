// Formatting and unit conversion. Probabilities are stored as decimals and
// shown as percentages; times are stored in minutes.

export const MINUTES_PER_HOUR = 60;

export const minutesToHours = (m: number) => m / MINUTES_PER_HOUR;
export const hoursToMinutes = (h: number) => h * MINUTES_PER_HOUR;

/** "0.5%" → 0.005, "0.5" (percent field) → 0.005. Returns null for blank, NaN for junk. */
export function percentToDecimal(input: string): number | null {
  const s = input.trim().replace(/%$/, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : NaN;
}

export function decimalToPercent(p: number | null): string {
  if (p == null) return '';
  return String(+(p * 100).toPrecision(10));
}

export function fmtPercent(p: number | null | undefined, digits = 2): string {
  if (p == null || Number.isNaN(p)) return '—';
  if (p === 0) return '0%';
  if (p === 1) return '100%';
  if (p < 1e-6) {
    const [m, e] = p.toExponential(2).split('e');
    return `${m} × 10^${Number(e)}`;
  }
  const pct = p * 100;
  if (pct < 0.01) return `${pct.toPrecision(3)}%`;
  if (pct > 99.99) return `${pct.toFixed(4)}%`;
  return `${pct.toFixed(digits)}%`;
}

/** Minutes → "4 h 05 min", "45 min", "33.3 h". */
export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  if (!Number.isFinite(minutes)) return 'Never';
  if (minutes < 0) return '—';
  if (minutes < 1) return `${(minutes * 60).toFixed(0)} s`;
  if (minutes < 60) return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`;
  if (minutes >= 48 * 60) return `${(minutes / 60).toFixed(1)} h`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (m === 60) return `${h + 1} h 00 min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function fmtHours(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'Never';
  return `${minutesToHours(minutes).toFixed(2)} h`;
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return '∞';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Event clock label for a minute offset, e.g. 90 → "T+1:30". */
export function fmtClock(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `T+${h}:${String(m).padStart(2, '0')}`;
}
