// Business economics: user-entered expectations only.

export interface GameEconomics {
  game: string;
  turnover: number | null;
  rtp: number | null; // decimal, e.g. 0.97
  rtpSource: string;
}

export interface EconomicsInput {
  games: GameEconomics[];
  rewards: number | null;
  otherCosts: number | null;
}

export interface EconomicsResult {
  ok: boolean;
  missing: string[];
  errors: string[];
  perGame: { game: string; margin: number }[];
  expectedMargin?: number;
  contribution?: number;
}

/** Expected gaming margin = Σ turnover × (1 − RTP); contribution = margin − rewards − costs. */
export function calcEconomics(input: EconomicsInput): EconomicsResult {
  const missing: string[] = [];
  const errors: string[] = [];
  input.games.forEach((g) => {
    if (g.turnover == null) missing.push(`${g.game}: turnover`);
    if (g.rtp == null) missing.push(`${g.game}: RTP`);
    if (g.rtp != null && !(g.rtp >= 0 && g.rtp <= 1.5)) errors.push(`${g.game}: RTP must be between 0% and 150%.`);
    if (g.turnover != null && g.turnover < 0) errors.push(`${g.game}: turnover cannot be negative.`);
    if (g.rtp != null && !g.rtpSource.trim()) missing.push(`${g.game}: RTP source`);
  });
  if (input.rewards == null) missing.push('Promotional rewards');
  if (input.otherCosts == null) missing.push('Other relevant costs');
  if (input.games.length === 0) missing.push('At least one game');
  if (missing.length || errors.length) return { ok: false, missing, errors, perGame: [] };
  const perGame = input.games.map((g) => ({ game: g.game, margin: g.turnover! * (1 - g.rtp!) }));
  const expectedMargin = perGame.reduce((a, b) => a + b.margin, 0);
  return { ok: true, missing, errors, perGame, expectedMargin, contribution: expectedMargin - input.rewards! - input.otherCosts! };
}
