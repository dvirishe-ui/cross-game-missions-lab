import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../math/rng';
import { crashFromH, crashFromHash, random52, verifyAviatorRound } from './provablyFair';

describe('Aviator provably-fair formula', () => {
  it('reproduces published rounds', () => {
    expect(crashFromHash('ee03fc5491ff4')).toBe(13.8);
    expect(crashFromHash('f0fbffc79944c')).toBe(16.53);
    expect(crashFromHash('0000000000000')).toBe(1);
  });
  it('reproduces a full seed set: SHA-512 of server seed + three client seeds', async () => {
    const r = await verifyAviatorRound('DtpP8vUjdiMfn4dVbJt8bZhsdKT1qAz7iZCwXvZ0', ['txcgzPAhctu2f4GzBUID', 'ZPISstqQiNNshsfrm12F', 'HLfMXKrqj4TOGYla5wcL']);
    expect(r.first13).toBe('ee02c761243b4');
    expect(r.crash).toBe(13.8);
  });
  it('gives the 97% curve: P(crash ≥ x) ≈ 0.97 / x, about 4% at 1.00x', () => {
    const rng = mulberry32(5);
    const n = 200000;
    let ge2 = 0;
    let ge10 = 0;
    let one = 0;
    for (let i = 0; i < n; i++) {
      const c = crashFromH(random52(rng));
      if (c >= 2) ge2++;
      if (c >= 10) ge10++;
      if (c === 1) one++;
    }
    expect(ge2 / n).toBeCloseTo(0.485, 2);
    expect(ge10 / n).toBeCloseTo(0.097, 2);
    expect(one / n).toBeCloseTo(0.04, 2); // crash below 1.01 when 97 / (1 − x) < 101
  });
});
