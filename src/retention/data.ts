// Players per game in three snapshots from football.com Nigeria ("footballcom-ng"),
// shared by the team as overlap tables. game_b_players is used as each game's players.
// Order assumed from the numbers (promo games peak in the middle snapshot):
// before = table with 38,000 Aviator players, during = 61,207, after = 65,300.
// Period lengths were not given.

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

export const AVIATOR: Record<Period, number> = { before: 38000, during: 61207, after: 65300 };

const g = (key: string, name: string, promo: boolean, p: [number, number, number], o: [number, number, number]): GameCounts => ({
  key,
  name,
  promo,
  players: { before: p[0], during: p[1], after: p[2] },
  withAviator: { before: o[0], during: o[1], after: o[2] },
});

export const GAMES: GameCounts[] = [
  g('pilot-chicken', 'Pilot Chicken', true, [188, 2224, 1091], [137, 1349, 565]),
  g('mines', 'Mines', true, [1088, 2061, 1644], [341, 966, 573]),
  g('plinko', 'Plinko', true, [1003, 2260, 1372], [314, 1128, 513]),
  g('goal', 'Goal', true, [403, 1233, 561], [186, 765, 241]),
  g('trader', 'Trader', true, [277, 1137, 439], [160, 783, 252]),
  g('keno', 'Keno', true, [126, 803, 224], [34, 526, 81]),
  g('hi-lo', 'Hi-Lo', false, [363, 541, 540], [111, 201, 206]),
  g('balloon', 'Balloon', false, [171, 147, 180], [83, 89, 98]),
  g('dice', 'Dice', false, [71, 93, 97], [27, 38, 44]),
  g('gates-of-egypt', 'Gates of Egypt', false, [60, 79, 92], [25, 24, 43]),
  g('mini-roulette', 'Mini Roulette', false, [71, 71, 72], [27, 36, 39]),
  g('crystal-fall', 'Crystal Fall', false, [46, 46, 40], [19, 18, 11]),
  g('neo-vegas', 'Neo Vegas', false, [29, 22, 34], [15, 12, 13]),
  g('hotline', 'Hotline', false, [15, 28, 32], [11, 14, 19]),
];

export const growth = (from: number, to: number) => to / from - 1;

export function total(games: GameCounts[], p: Period): number {
  return games.reduce((a, x) => a + x.players[p], 0);
}

/** Game players per 100 Aviator players: removes the operator's overall growth. */
export const perHundredAviator = (n: number, p: Period) => (n / AVIATOR[p]) * 100;
