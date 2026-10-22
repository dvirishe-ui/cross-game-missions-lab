// Players per game in three snapshots from football.com Nigeria ("footballcom-ng"),
// shared by the team as overlap tables. game_b_players is used as each game's players.
// before = 28 Sep – 4 Oct 2026 (corrected table from Maksim, 61,233 Aviator players),
// during = table with 61,207 Aviator players, after = table with 65,300.

export type Period = 'before' | 'during' | 'after';
export const PERIODS: Period[] = ['before', 'during', 'after'];

export interface GameCounts {
  key: string;
  name: string;
  promo: boolean;
  players: Record<Period, number>;
  /** Players who also played Aviator in that snapshot. */
  withAviator: Record<Period, number>;
}

export const AVIATOR: Record<Period, number> = { before: 61233, during: 61207, after: 65300 };

export const PERIOD_DATES: Partial<Record<Period, string>> = { before: '28 Sep – 4 Oct 2026' };

const g = (key: string, name: string, promo: boolean, p: [number, number, number], o: [number, number, number]): GameCounts => ({
  key,
  name,
  promo,
  players: { before: p[0], during: p[1], after: p[2] },
  withAviator: { before: o[0], during: o[1], after: o[2] },
});

export const GAMES: GameCounts[] = [
  g('pilot-chicken', 'Pilot Chicken', true, [1019, 2224, 1091], [576, 1349, 565]),
  g('mines', 'Mines', true, [1641, 2061, 1644], [634, 966, 573]),
  g('plinko', 'Plinko', true, [1725, 2260, 1372], [689, 1128, 513]),
  g('goal', 'Goal', true, [565, 1233, 561], [249, 765, 241]),
  g('trader', 'Trader', true, [425, 1137, 439], [256, 783, 252]),
  g('keno', 'Keno', true, [257, 803, 224], [103, 526, 81]),
  g('hi-lo', 'Hi-Lo', false, [529, 541, 540], [185, 201, 206]),
  g('balloon', 'Balloon', false, [160, 147, 180], [93, 89, 98]),
  g('dice', 'Dice', false, [89, 93, 97], [33, 38, 44]),
  g('gates-of-egypt', 'Gates of Egypt', false, [97, 79, 92], [48, 24, 43]),
  g('mini-roulette', 'Mini Roulette', false, [80, 71, 72], [40, 36, 39]),
  g('crystal-fall', 'Crystal Fall', false, [59, 46, 40], [24, 18, 11]),
  g('neo-vegas', 'Neo Vegas', false, [34, 22, 34], [22, 12, 13]),
  g('hotline', 'Hotline', false, [32, 28, 32], [17, 14, 19]),
];

export const growth = (from: number, to: number) => to / from - 1;

export function total(games: GameCounts[], p: Period): number {
  return games.reduce((a, x) => a + x.players[p], 0);
}

