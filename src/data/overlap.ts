// Cross-game player overlap shared by the SPRIBE team (19 Oct 2026, two screenshots).
// One operator ("footballcom…", name cut off in the screenshot); the time period was not stated.
// overlap[a][b] = players who played both a and b.

export const OVERLAP_SOURCE = {
  operator: 'footballcom… (name cut off in the screenshot)',
  shared: '19 Oct 2026',
  period: 'Not stated',
};

export interface OverlapGame {
  key: string;
  name: string;
  players: number;
}

export const OVERLAP_GAMES: OverlapGame[] = [
  { key: 'aviator', name: 'Aviator', players: 65300 },
  { key: 'mines', name: 'Mines', players: 1644 },
  { key: 'plinko', name: 'Plinko', players: 1372 },
  { key: 'pilot-chicken', name: 'Pilot Chicken', players: 1091 },
  { key: 'goal', name: 'Goal', players: 561 },
  { key: 'hi-lo', name: 'Hi-Lo', players: 540 },
  { key: 'trader', name: 'Trader', players: 439 },
  { key: 'keno', name: 'Keno', players: 224 },
  { key: 'balloon', name: 'Balloon', players: 180 },
  { key: 'dice', name: 'Dice', players: 97 },
  { key: 'gates-of-e', name: 'Gates of E… (name cut off)', players: 92 },
  { key: 'mini-roulette', name: 'Mini Roulette', players: 72 },
  { key: 'crystal-fall', name: 'Crystal Fall', players: 40 },
  { key: 'neo-vegas', name: 'Neo Vegas', players: 34 },
  { key: 'hotline', name: 'Hotline', players: 32 },
];

// Each row as listed for game_a (both directions appear in the screenshots and agree).
const ROWS: Record<string, Record<string, number>> = {
  aviator: { mines: 573, 'pilot-chicken': 565, plinko: 513, trader: 252, goal: 241, 'hi-lo': 206, balloon: 98, keno: 81, dice: 44, 'gates-of-e': 43, 'mini-roulette': 39, hotline: 19, 'neo-vegas': 13, 'crystal-fall': 11 },
  balloon: { aviator: 98, 'pilot-chicken': 45, trader: 23, goal: 22, mines: 21, plinko: 14, 'mini-roulette': 9, 'hi-lo': 9, keno: 8, dice: 8, hotline: 5, 'gates-of-e': 4, 'neo-vegas': 3, 'crystal-fall': 2 },
  'crystal-fall': { aviator: 11, 'gates-of-e': 6, 'pilot-chicken': 5, goal: 4, plinko: 3, trader: 3, mines: 3, 'neo-vegas': 3, balloon: 2, 'mini-roulette': 2, hotline: 1, keno: 1, dice: 1, 'hi-lo': 0 },
  dice: { aviator: 44, goal: 18, mines: 17, 'pilot-chicken': 16, trader: 13, plinko: 11, keno: 10, balloon: 8, hotline: 7, 'hi-lo': 6, 'mini-roulette': 4, 'neo-vegas': 3, 'gates-of-e': 3, 'crystal-fall': 1 },
  'gates-of-e': { aviator: 43, 'pilot-chicken': 13, goal: 11, plinko: 10, trader: 9, mines: 7, 'neo-vegas': 6, 'crystal-fall': 6, balloon: 4, keno: 4, dice: 3, hotline: 2, 'mini-roulette': 2, 'hi-lo': 1 },
  goal: { aviator: 241, 'pilot-chicken': 105, mines: 104, trader: 64, plinko: 52, keno: 38, balloon: 22, dice: 18, 'mini-roulette': 17, 'hi-lo': 15, 'gates-of-e': 11, hotline: 10, 'neo-vegas': 8, 'crystal-fall': 4 },
  'hi-lo': { aviator: 206, plinko: 67, mines: 22, 'pilot-chicken': 19, goal: 15, trader: 11, balloon: 9, keno: 9, hotline: 6, dice: 6, 'mini-roulette': 4, 'neo-vegas': 1, 'gates-of-e': 1, 'crystal-fall': 0 },
  hotline: { aviator: 19, 'pilot-chicken': 11, goal: 10, plinko: 10, trader: 8, dice: 7, mines: 6, 'hi-lo': 6, balloon: 5, keno: 5, 'mini-roulette': 3, 'gates-of-e': 2, 'neo-vegas': 1, 'crystal-fall': 1 },
  keno: { aviator: 81, 'pilot-chicken': 48, goal: 38, plinko: 36, mines: 34, trader: 30, dice: 10, 'hi-lo': 9, balloon: 8, 'mini-roulette': 8, hotline: 5, 'neo-vegas': 5, 'gates-of-e': 4, 'crystal-fall': 1 },
  mines: { aviator: 573, goal: 104, 'pilot-chicken': 87, plinko: 79, trader: 49, keno: 34, 'mini-roulette': 32, 'hi-lo': 22, balloon: 21, dice: 17, 'neo-vegas': 9, 'gates-of-e': 7, hotline: 6, 'crystal-fall': 3 },
  'mini-roulette': { aviator: 39, mines: 32, 'pilot-chicken': 18, goal: 17, plinko: 11, balloon: 9, keno: 8, trader: 7, dice: 4, 'hi-lo': 4, hotline: 3, 'crystal-fall': 2, 'gates-of-e': 2, 'neo-vegas': 1 },
  'neo-vegas': { aviator: 13, mines: 9, goal: 8, plinko: 6, 'pilot-chicken': 6, trader: 6, 'gates-of-e': 6, keno: 5, balloon: 3, dice: 3, 'crystal-fall': 3, hotline: 1, 'mini-roulette': 1, 'hi-lo': 1 },
  'pilot-chicken': { aviator: 565, trader: 126, goal: 105, mines: 87, plinko: 85, keno: 48, balloon: 45, 'hi-lo': 19, 'mini-roulette': 18, dice: 16, 'gates-of-e': 13, hotline: 11, 'neo-vegas': 6, 'crystal-fall': 5 },
  plinko: { aviator: 513, 'pilot-chicken': 85, mines: 79, 'hi-lo': 67, goal: 52, trader: 49, keno: 36, balloon: 14, dice: 11, 'mini-roulette': 11, hotline: 10, 'gates-of-e': 10, 'neo-vegas': 6, 'crystal-fall': 3 },
  trader: { aviator: 252, 'pilot-chicken': 126, goal: 64, plinko: 49, mines: 49, keno: 30, balloon: 23, dice: 13, 'hi-lo': 11, 'gates-of-e': 9, hotline: 8, 'mini-roulette': 7, 'neo-vegas': 6, 'crystal-fall': 3 },
};

export const OVERLAP_ROWS = ROWS;

export function playersOf(key: string): number | undefined {
  return OVERLAP_GAMES.find((g) => g.key === key)?.players;
}

/** Players who played both games (undefined when a game is not in the data). */
export function overlap(a: string, b: string): number | undefined {
  if (a === b) return playersOf(a);
  return ROWS[a]?.[b];
}

/** Share of game A's players who also played game B. */
export function shareAlsoIn(a: string, b: string): number | undefined {
  const o = overlap(a, b);
  const n = playersOf(a);
  return o == null || !n ? undefined : o / n;
}

/**
 * Upper limit on players who already play EVERY game in the set: nobody can be in
 * all of them without being in each pair, so it is at most the smallest pairwise
 * overlap. Returns the limit and the pair that sets it, or null if a game is missing.
 */
export function maxPlayingAll(keys: string[]): { limit: number; pair: [string, string] } | null {
  const uniq = [...new Set(keys)];
  if (uniq.some((k) => playersOf(k) == null)) return null;
  if (uniq.length === 1) return { limit: playersOf(uniq[0])!, pair: [uniq[0], uniq[0]] };
  let best: { limit: number; pair: [string, string] } | null = null;
  for (let i = 0; i < uniq.length; i++)
    for (let j = i + 1; j < uniq.length; j++) {
      const o = overlap(uniq[i], uniq[j])!;
      if (!best || o < best.limit) best = { limit: o, pair: [uniq[i], uniq[j]] };
    }
  return best;
}
