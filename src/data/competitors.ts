// Competitor research dataset. Every entry links to its published source.
// Only published facts are recorded; no probabilities, timings or results.

export type Progression = 'simultaneous' | 'sequential' | 'alternative-routes' | 'product-description';
export type PayoutStructure = 'leaderboard' | 'fixed-rewards' | 'first-come' | 'ranking-by-count' | 'coins';
export type CrossGameClass =
  | 'multi-game-eligible'
  | 'cross-game-task-collection'
  | 'game-diversity-task'
  | 'provider-selection'
  | 'product-reference';
export type CompetitorTaskType = 'turnover' | 'multiplier' | 'rounds' | 'win-amount' | 'bonus' | 'diversity' | 'accumulated';

export type AdaptTemplate = 'alt-routes' | 'all-simultaneous' | 'sequential' | 'any-k' | 'diversity' | 'daily-three';

export interface CompetitorTask {
  text: string;
  reward?: string;
  type: CompetitorTaskType;
}

export interface Competitor {
  id: string;
  provider: string;
  channel: string;
  title: string;
  sourceUrl: string;
  /** Published start and end dates (ISO). Product pages have none. */
  start?: string;
  end?: string;
  dateText: string;
  facts: string[];
  tasks: CompetitorTask[];
  progression: Progression;
  payout: PayoutStructure;
  crossGame: CrossGameClass;
  classification: string;
  takeaway: string;
  caveats: string[];
  /** Values derived arithmetically from published figures. */
  calculated?: string[];
  adapt: AdaptTemplate;
}

export const PROGRESSION_LABEL: Record<Progression, string> = {
  simultaneous: 'Simultaneous missions',
  sequential: 'Sequential missions',
  'alternative-routes': 'Alternative routes',
  'product-description': 'Product description',
};

export const PAYOUT_LABEL: Record<PayoutStructure, string> = {
  leaderboard: 'Leaderboard prize pool',
  'fixed-rewards': 'Fixed per-mission rewards',
  'first-come': 'First come, first served',
  'ranking-by-count': 'Ranking by tasks completed',
  coins: 'Coins exchangeable for prizes',
};

export const CROSS_GAME_LABEL: Record<CrossGameClass, string> = {
  'multi-game-eligible': 'Multi-game eligible',
  'cross-game-task-collection': 'Cross-game task collection',
  'game-diversity-task': 'Explicit game-diversity task',
  'provider-selection': 'Provider game selection',
  'product-reference': 'Product reference',
};

export const TASK_TYPE_LABEL: Record<CompetitorTaskType, string> = {
  turnover: 'Turnover',
  multiplier: 'Multiplier threshold',
  rounds: 'Round count',
  'win-amount': 'Win amount',
  bonus: 'Bonus round / Bonus Buy',
  diversity: 'Game / provider diversity',
  accumulated: 'Cumulative multiplier sum',
};

export const COMPETITORS: Competitor[] = [
  {
    id: 'smartsoft-summer',
    provider: 'SmartSoft',
    channel: 'BetConstruct client zone',
    title: 'Summer Hot Days',
    sourceUrl: 'https://clientzone.betconstruct.com/t/h7h9s43/40000-summer-hot-days-tournament-smartsoft',
    start: '2023-08-02',
    end: '2023-08-25',
    dateText: 'August 2–25, 2023',
    facts: [
      'Two stages.',
      '€40,000 total; €20,000 per stage.',
      'Top 500 leaderboard places.',
      'Eligible games included JetX, Balloon, PlinkoX, FootballX, CricketX and several slots.',
      'Turnover missions offered a progression route.',
      'A 200× or higher multiplier earned one leaderboard-wheel spin.',
      'A 450× multiplier earned two.',
      'Maximum ten wheel spins daily across both routes.',
      'Progress reset daily.',
    ],
    tasks: [
      { text: 'Turnover missions (progression route)', type: 'turnover' },
      { text: '200× or higher multiplier', reward: '1 leaderboard-wheel spin', type: 'multiplier' },
      { text: '450× multiplier', reward: '2 leaderboard-wheel spins', type: 'multiplier' },
    ],
    progression: 'alternative-routes',
    payout: 'leaderboard',
    crossGame: 'multi-game-eligible',
    classification:
      'Multi-game eligible campaign with alternative mission routes, not proof that every player had to play multiple games.',
    takeaway: 'A rare result was one route to points, not a mandatory obstacle for all participants.',
    caveats: ['Daily cap of ten wheel spins applied across both routes.'],
    adapt: 'alt-routes',
  },
  {
    id: 'smartsoft-turkish',
    provider: 'SmartSoft',
    channel: 'BetConstruct client zone',
    title: 'Turkish Promotion',
    sourceUrl: 'https://clientzone.betconstruct.com/t/p8yl8ap/2000000-try-smartsofts-turkish-promotion',
    start: '2025-01-01',
    end: '2025-01-23',
    dateText: 'January 1–23, 2025',
    facts: [
      'Advertised pool: TRY 2,000,000.',
      'Top 100 leaderboard places.',
      'Games: JetX, HelicopterX, Balloon, Multihot5, GeniesBonanza.',
      'Minimum qualifying bet: TRY 50.',
      'Published cumulative turnover milestones begin at TRY 500, TRY 3,000 and TRY 8,000.',
      'A 400× or higher winning multiplier earns one wheel spin.',
      'An 840× winning multiplier earns two.',
      'Maximum ten wheel spins per day across the routes.',
    ],
    tasks: [
      { text: 'Cumulative turnover milestones beginning at TRY 500, TRY 3,000 and TRY 8,000', type: 'turnover' },
      { text: '400× or higher winning multiplier', reward: '1 wheel spin', type: 'multiplier' },
      { text: '840× winning multiplier', reward: '2 wheel spins', type: 'multiplier' },
    ],
    progression: 'alternative-routes',
    payout: 'leaderboard',
    crossGame: 'multi-game-eligible',
    classification: 'Multi-game eligible campaign with alternative progression routes.',
    takeaway: 'Alternative progression routes and daily caps can structure participation.',
    caveats: ['Only the first published turnover milestones are recorded here.'],
    adapt: 'alt-routes',
  },
  {
    id: 'pragmatic-wildz',
    provider: 'Pragmatic Play',
    channel: 'Wildz',
    title: 'Missions',
    sourceUrl: 'https://www.wildz.com/nz/news/pragmatic-play-missions/',
    start: '2026-08-10',
    end: '2026-08-26',
    dateText: 'August 10–26, 2026',
    facts: [
      'Eligible selection of Pragmatic Play games.',
      'All missions could be attempted immediately.',
      'Each mission could be completed once during the campaign.',
      'Free spins in these examples have a stated value of $0.10 each.',
      'Separate wagering, win-amount and bonus-round missions.',
      'One separate mission: win $500 in bonus rounds → $50 bonus, limited to ten players.',
      'Total campaign prize pool not disclosed in the reviewed page.',
    ],
    tasks: [
      { text: 'Play 15 rounds', reward: '5 free spins', type: 'rounds' },
      { text: 'Play 25 rounds', reward: '10 free spins', type: 'rounds' },
      { text: 'Play 35 rounds', reward: '15 free spins', type: 'rounds' },
      { text: 'Play 45 rounds', reward: '20 free spins', type: 'rounds' },
      { text: 'Play 50 rounds', reward: '30 free spins', type: 'rounds' },
      { text: 'Achieve 5× five times', reward: '50 free spins', type: 'multiplier' },
      { text: 'Achieve 10× three times', reward: '75 free spins', type: 'multiplier' },
      { text: 'Achieve 20× once', reward: '100 free spins', type: 'multiplier' },
      { text: 'Win $500 in bonus rounds (limited to ten players)', reward: '$50 bonus', type: 'bonus' },
    ],
    progression: 'simultaneous',
    payout: 'fixed-rewards',
    crossGame: 'provider-selection',
    classification: 'Simultaneous missions across an eligible selection of one provider’s games.',
    takeaway: 'Higher multiplier thresholds were paired with fewer repetitions.',
    caveats: ['Free-spin denomination is not guaranteed cash winnings.', 'Total campaign prize pool not disclosed.'],
    adapt: 'all-simultaneous',
  },
  {
    id: 'pragmatic-supabets',
    provider: 'Pragmatic Play',
    channel: 'Supabets',
    title: 'Missions Tournament',
    sourceUrl: 'https://betwith.supabets.co.za/missions-tournament/',
    start: '2026-08-21T18:00',
    end: '2026-08-23T23:00',
    dateText: 'August 21, 2026 18:00 – August 23, 2026 23:00',
    facts: [
      'Three sequential missions.',
      'Only one mission active at a time.',
      'Gameplay counts only toward the active mission.',
      'Progress does not carry into the next mission.',
      'Published third mission: 300 qualifying rounds.',
      'Minimum qualifying stake: R2.',
      'Third mission awards five R500 prizes.',
      'First come, first served.',
      'Full campaign prize pool not verified.',
    ],
    tasks: [
      { text: 'Mission 1 (details on source page)', type: 'rounds' },
      { text: 'Mission 2 (details on source page)', type: 'rounds' },
      { text: 'Mission 3: 300 qualifying rounds, minimum stake R2', reward: 'Five R500 prizes', type: 'rounds' },
    ],
    progression: 'sequential',
    payout: 'first-come',
    crossGame: 'provider-selection',
    classification: 'Sequential first-finisher missions.',
    takeaway: 'A published first-finisher promotion that controls progression using sequential missions.',
    caveats: ['Full campaign prize pool not verified.', 'Missions 1 and 2 are not recorded here in detail.'],
    calculated: [
      'Duration: 53 hours, calculated from the published timestamps.',
      'Third-mission allocation: R2,500, calculated as 5 × R500.',
    ],
    adapt: 'sequential',
  },
  {
    id: 'stake-originals',
    provider: 'Stake',
    channel: 'Stake Community',
    title: 'Ultimate Originals Challenge',
    sourceUrl:
      'https://stakecommunity.com/topic/169468-8000-the-ultimate-originals-challenge-%E2%80%8B%F0%9F%94%A5%E2%80%8B/',
    start: '2026-03-24',
    end: '2026-03-31',
    dateText: 'March 24–31, 2026 (seven days)',
    facts: [
      '$8,000 prize pool.',
      'Minimum qualifying bet: $0.50.',
      'At least three completed challenges required for eligibility.',
      'Ranking based on the number of completed challenges.',
      'VIP and verification requirements applied.',
      'Other game-specific challenges also available.',
    ],
    tasks: [
      { text: 'Mines: win by opening at least five green diamonds with eight mines selected', type: 'multiplier' },
      { text: 'Plinko: hit 1,000× or higher once', type: 'multiplier' },
      { text: 'Chicken: hit 200× or higher once', type: 'multiplier' },
      { text: 'Keno: hit exactly 100× on medium risk once', type: 'multiplier' },
    ],
    progression: 'simultaneous',
    payout: 'ranking-by-count',
    crossGame: 'cross-game-task-collection',
    classification: 'A genuine cross-game task collection with partial-completion eligibility.',
    takeaway: 'A difficult game did not prevent qualification through other tasks.',
    caveats: ['Stake’s game probabilities are not equivalent to SPRIBE’s. Do not transfer them.'],
    adapt: 'any-k',
  },
  {
    id: 'casumo-trophy',
    provider: 'Casumo',
    channel: 'Casumo',
    title: 'The Trophy Run',
    sourceUrl: 'https://www.casumo.com/en-gb/promotions/umoquests-june-26/',
    start: '2026-06-01',
    end: '2026-07-05',
    dateText: 'June 1 – July 5, 2026',
    facts: ['Daily mission resets.', 'Listed free-spin denomination: £0.10.', 'Fixed total campaign cash pool not stated.'],
    tasks: [
      { text: 'Spin 20 times in each featured game', reward: '10 free spins', type: 'diversity' },
      { text: 'Spin 100 times across the month’s three selected games', reward: '10 free spins', type: 'rounds' },
      { text: 'Bet £5 on three different providers', reward: '30 free spins', type: 'diversity' },
      { text: 'Complete 100 quests', reward: '1,000 free spins', type: 'rounds' },
    ],
    progression: 'simultaneous',
    payout: 'fixed-rewards',
    crossGame: 'game-diversity-task',
    classification: 'Explicit game-diversity and provider-diversity tasks.',
    takeaway: 'Explicit game-diversity and provider-diversity tasks.',
    caveats: ['Task wording is preserved as published; ambiguities are not resolved here.'],
    adapt: 'diversity',
  },
  {
    id: 'bgaming-quests',
    provider: 'BGaming',
    channel: 'BGaming news',
    title: 'Quests',
    sourceUrl: 'https://bgaming.com/news/bgaming-launches-exclusive-quests-retention-tool',
    dateText: 'Product description (no campaign dates)',
    facts: [
      'Three daily missions.',
      'Task categories include spins/bets, Bonus Buy, multiplier thresholds and cumulative multiplier sums.',
      'Milestones award Coins exchangeable for cash prizes.',
      'Individual progression rather than leaderboard competition.',
      'Provider-managed and funded.',
      'Numeric task thresholds and a universal campaign pool not disclosed.',
    ],
    tasks: [
      { text: 'Spins / bets', type: 'rounds' },
      { text: 'Bonus Buy', type: 'bonus' },
      { text: 'Multiplier thresholds', type: 'multiplier' },
      { text: 'Cumulative multiplier sums', type: 'accumulated' },
    ],
    progression: 'product-description',
    payout: 'coins',
    crossGame: 'product-reference',
    classification: 'Product description of an individual-progression mission tool.',
    takeaway: 'A reference for task variety and individual progression, not a five-hour timing benchmark.',
    caveats: ['Numeric thresholds not disclosed.'],
    adapt: 'daily-three',
  },
];

export interface SupportingSource {
  title: string;
  url: string;
  points: string[];
}

export const SUPPORTING_SOURCES: SupportingSource[] = [
  {
    title: 'SmartSoft engagement tools',
    url: 'https://www.smartsoftgaming.com/engagement-tools',
    points: ['Describes missions across multiple titles and mission-based leaderboard points.'],
  },
  {
    title: 'Pragmatic Play Missions announcement',
    url: 'https://www.pragmaticplay.com/en/news/pragmatic-play-adds-prize-packed-missions-to-slots/',
    points: ['Up to 50 missions.', 'Individual or simultaneous configurations.', 'Optional daily resets for up to 14 days.'],
  },
];

export const SPRIBE_GAME_SOURCES = [
  { title: 'SPRIBE Keno', url: 'https://spribe.co/games/keno' },
  { title: 'SPRIBE Keno 80 (multikeno page)', url: 'https://spribe.co/games/multikeno' },
  { title: 'SPRIBE Aviator', url: 'https://spribe.co/games/aviator' },
  { title: 'SPRIBE Plinko', url: 'https://spribe.co/games/plinko' },
  { title: 'SPRIBE Pilot Chicken', url: 'https://spribe.co/games/pilot-chicken' },
];

/** Hours between two published timestamps (local time on the same page). */
export function hoursBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 3_600_000;
}

/** Historical promotions are never shown as active. */
export function campaignStatus(c: Competitor, today: Date): 'historical' | 'scheduled' | 'running' | 'undated' {
  if (!c.start || !c.end) return 'undated';
  const end = Date.parse(c.end.length === 10 ? `${c.end}T23:59` : c.end);
  const start = Date.parse(c.start);
  if (end < today.getTime()) return 'historical';
  if (start > today.getTime()) return 'scheduled';
  return 'running';
}
