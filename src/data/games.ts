// SPRIBE games used in cross-game promotions. Ordinary Keno and Keno 80 are
// separate game versions: never merge their parameters.
export type GameId =
  | 'aviator'
  | 'pilot-chicken'
  | 'plinko'
  | 'mines'
  | 'goal'
  | 'keno'
  | 'keno-80'
  | 'trader'
  | 'generic';

export interface GameInfo {
  id: GameId;
  name: string;
  /** Short code used in compact tables and chips. */
  code: string;
  /** Official SPRIBE page, when one was supplied in the brief. */
  sourceUrl?: string;
  /** Whether outcomes are shared by everyone in the same round (crash-style). */
  sharedRound: 'yes' | 'no' | 'unknown';
  note?: string;
}

export const GAMES: GameInfo[] = [
  {
    id: 'aviator',
    name: 'Aviator',
    code: 'AVI',
    sourceUrl: 'https://spribe.co/games/aviator',
    sharedRound: 'yes',
    note: 'Players in the same round share one crash outcome, so their mission progress is correlated.',
  },
  {
    id: 'pilot-chicken',
    name: 'Pilot Chicken',
    code: 'PCH',
    sourceUrl: 'https://spribe.co/games/pilot-chicken',
    sharedRound: 'unknown',
  },
  { id: 'plinko', name: 'Plinko', code: 'PLK', sourceUrl: 'https://spribe.co/games/plinko', sharedRound: 'unknown' },
  { id: 'mines', name: 'Mines', code: 'MIN', sharedRound: 'unknown' },
  { id: 'goal', name: 'Goal', code: 'GOL', sharedRound: 'unknown' },
  {
    id: 'keno',
    name: 'Keno',
    code: 'KEN',
    sourceUrl: 'https://spribe.co/games/keno',
    sharedRound: 'unknown',
    note: 'Ordinary Keno. Model separately from Keno 80.',
  },
  {
    id: 'keno-80',
    name: 'Keno 80',
    code: 'K80',
    sourceUrl: 'https://spribe.co/games/multikeno',
    sharedRound: 'unknown',
    note: 'Separate game version from ordinary Keno. The previous campaign data does not say which version was used.',
  },
  { id: 'trader', name: 'Trader', code: 'TRD', sharedRound: 'unknown' },
  {
    id: 'generic',
    name: 'Generic (illustrative)',
    code: 'GEN',
    sharedRound: 'unknown',
    note: 'Placeholder game for illustrative scenarios. Not a SPRIBE title.',
  },
];

export const GAME_BY_ID: Record<GameId, GameInfo> = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<
  GameId,
  GameInfo
>;

/** Games featured in the cross-game promotion (excludes the illustrative placeholder). */
export const CAMPAIGN_GAMES: GameId[] = ['aviator', 'pilot-chicken', 'plinko', 'mines', 'goal', 'keno', 'keno-80', 'trader'];
