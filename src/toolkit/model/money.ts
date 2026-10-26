// Money formatting: always "$15,000" style (en-US grouping), never "$15.000".

export const validCurrency = (c: string) => {
  if (!/^[A-Za-z]{3}$/.test(c.trim())) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: c.trim().toUpperCase() });
    return true;
  } catch {
    return false;
  }
};

export function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const cents = Math.abs(n % 1) > 1e-9;
  const opts = { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 };
  if (validCurrency(currency)) return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.trim().toUpperCase(), ...opts }).format(n);
  const num = new Intl.NumberFormat('en-US', opts).format(n);
  return currency.trim() ? `${num} ${currency.trim()}` : num;
}

export const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);

/** Rounds to cents so sums of money compare exactly. */
export const cents = (n: number) => Math.round(n * 100) / 100;
