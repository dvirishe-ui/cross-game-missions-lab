// Aviator's round result, reverse-engineered from its provably-fair data.
//
// For a finished round the fairness panel shows the server seed and the
// client seeds of the first three players. The result is:
//   hash = SHA-512(serverSeed + clientSeed1 + clientSeed2 + clientSeed3)   (no separators)
//   h    = first 13 hex characters of hash, as an integer (52 bits)
//   crash = max(1.00, floor(97 · 2^52 / (2^52 − h)) / 100)
// Checked against published rounds (ee03fc5491ff4 → 13.80×, f0fbffc79944c → 16.53×)
// and a full seed set (see provablyFair.test.ts). Spribe does not publish the
// source; this is the community reconstruction that reproduces real rounds.
//
// The simulator uses the same formula. Because SHA-512 output is uniform, h is
// drawn from a seeded generator instead of hashing random seeds (same
// distribution, thousands of times faster).

import type { Rng } from '../math/rng';

export const E52 = 2 ** 52;
const E52n = 2n ** 52n;

/** Exact crash point from a hash (or its first 13 hex characters). */
export function crashFromHash(hex: string, rtpPercent = 97): number {
  const h = BigInt('0x' + hex.trim().slice(0, 13));
  const cents = (BigInt(rtpPercent) * E52n) / (E52n - h);
  return Math.max(100, Number(cents)) / 100;
}

/** Same formula on a 52-bit integer, in floating point (for simulation). */
export function crashFromH(h: number, rtpPercent = 97): number {
  return Math.max(1, Math.floor((rtpPercent * E52) / (E52 - h)) / 100);
}

/** A uniform 52-bit integer, standing in for the first 13 hex characters of SHA-512. */
export function random52(rng: Rng): number {
  return Math.floor(rng() * 2 ** 26) * 2 ** 26 + Math.floor(rng() * 2 ** 26);
}

export async function sha512Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Recomputes a finished Aviator round from its seeds. */
export async function verifyAviatorRound(serverSeed: string, clientSeeds: string[]): Promise<{ hash: string; first13: string; crash: number }> {
  const hash = await sha512Hex(serverSeed.trim() + clientSeeds.map((s) => s.trim()).join(''));
  return { hash, first13: hash.slice(0, 13), crash: crashFromHash(hash) };
}
