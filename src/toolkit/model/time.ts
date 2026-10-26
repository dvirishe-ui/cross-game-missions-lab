// Dates are stored as entered: 'YYYY-MM-DD' and 'HH:MM' plus a time zone
// string. These helpers turn them into instants and back into the
// DD/MM/YYYY format the campaign documents use.

export type ZoneInfo =
  | { kind: 'utc'; label: string }
  | { kind: 'offset'; offsetMin: number; label: string }
  | { kind: 'iana'; iana: string; label: string };

/** Abbreviations that mean different zones in different places. */
export const AMBIGUOUS_ZONES = ['EST', 'EDT', 'CST', 'CDT', 'MST', 'PST', 'IST', 'BST', 'AST', 'SST', 'ET', 'PT', 'CT', 'MT', 'CET', 'CEST', 'EET', 'WAT', 'GST'];

/** Reads 'UTC', 'GMT', 'UTC+3', 'GMT-05:30' or an IANA name like 'Africa/Lagos'. null = not recognised. */
export function parseZone(tz: string): ZoneInfo | null {
  const t = tz.trim();
  if (!t) return null;
  if (/^(utc|gmt|z)$/i.test(t)) return { kind: 'utc', label: 'UTC' };
  const m = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(t);
  if (m) {
    const off = (Number(m[2]) * 60 + Number(m[3] ?? 0)) * (m[1] === '-' ? -1 : 1);
    if (Math.abs(off) > 14 * 60) return null;
    return off === 0 ? { kind: 'utc', label: 'UTC' } : { kind: 'offset', offsetMin: off, label: t.toUpperCase().replace(/\s+/g, '') };
  }
  if (t.includes('/')) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: t });
      return { kind: 'iana', iana: t, label: t };
    } catch {
      return null;
    }
  }
  return null;
}

export const isAmbiguousZone = (tz: string) => AMBIGUOUS_ZONES.includes(tz.trim().toUpperCase());

/** Offset of an IANA zone from UTC at a given instant, in minutes. */
function ianaOffsetMin(ms: number, iana: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - ms) / 60000);
}

export const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
export const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** The instant a local date and time in a zone refers to, or null if anything is missing. */
export function toInstant(date: string, time: string, tz: string): number | null {
  if (!validDate(date) || !validTime(time)) return null;
  const zone = parseZone(tz);
  if (!zone) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (zone.kind === 'utc') return wall;
  if (zone.kind === 'offset') return wall - zone.offsetMin * 60000;
  let guess = wall - ianaOffsetMin(wall, zone.iana) * 60000;
  guess = wall - ianaOffsetMin(guess, zone.iana) * 60000;
  return guess;
}

/** '2026-10-05' → '05/10/2026'. */
export function fmtDate(d: string): string {
  if (!validDate(d)) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** '2026-10-05' → 'Mon 5 Oct'. */
export function fmtShort(d: string): string {
  if (!validDate(d)) return '';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function addDays(d: string, n: number): string {
  if (!validDate(d)) return '';
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** Today in the viewer's own browser time zone. */
export function todayLocal(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const toMinutes = (t: string) => (validTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

/** Minutes → '6d 4h 59m', '3h 05m', '45m'. */
export function fmtSpan(min: number): string {
  if (!Number.isFinite(min)) return '—';
  const m = Math.round(Math.abs(min));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const r = m % 60;
  if (d) return `${d}d ${h}h ${String(r).padStart(2, '0')}m`;
  if (h) return `${h}h ${String(r).padStart(2, '0')}m`;
  return `${r}m`;
}
