// Competitor mission research. Only published facts, each with its source.

export type TaskType = 'rounds' | 'turnover' | 'multiplier' | 'exact' | 'win' | 'bonus' | 'diversity' | 'sum';

export const TASK_TYPES: { id: TaskType; label: string }[] = [
  { id: 'rounds', label: 'Play N rounds / spins' },
  { id: 'turnover', label: 'Wager / turnover' },
  { id: 'multiplier', label: 'Hit X× or more' },
  { id: 'exact', label: 'Hit exactly X×' },
  { id: 'win', label: 'Win amount' },
  { id: 'bonus', label: 'Bonus round / buy' },
  { id: 'diversity', label: 'Play several games / providers' },
  { id: 'sum', label: 'Sum of multipliers' },
];

export type Kind = 'Operator campaign' | 'Provider campaign' | 'Provider tool' | 'Ongoing feature';

export interface Campaign {
  id: string;
  company: string;
  name: string;
  kind: Kind;
  where: string;
  dates: string;
  /** Plain-language length. */
  duration: string;
  /** Length in hours for the chart, when dated. */
  hours?: number;
  structure: string;
  games: string;
  tasks: string[];
  taskTypes: TaskType[];
  /** Multiplier targets seen, with how many times. */
  targets?: string;
  prizeModel: string;
  prizePool: string;
  rules: string[];
  lesson: string;
  sources: { label: string; url: string }[];
}

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'pragmatic-supabets',
    company: 'Pragmatic Play',
    name: 'Missions Tournament',
    kind: 'Operator campaign',
    where: 'Supabets (South Africa)',
    dates: '21 Aug 2026 18:00 – 23 Aug 2026 23:00',
    duration: '53 hours',
    hours: 53,
    structure: 'Three missions in a fixed order. Only one is active at a time; progress does not carry over.',
    games: 'Selected Pragmatic Play games',
    tasks: ['Mission 1 and 2: see source', 'Mission 3: play 300 qualifying rounds (min. stake R2)'],
    taskTypes: ['rounds'],
    prizeModel: 'First come, first served',
    prizePool: 'Mission 3: 5 × R500 = R2,500 (full pool not stated)',
    rules: ['Minimum qualifying stake R2', 'Only gameplay on the active mission counts'],
    lesson: 'Closest match to a first-finisher format. It controls pace with sequential missions and a simple round count, not rare multipliers.',
    sources: [{ label: 'Supabets: Missions Tournament', url: 'https://betwith.supabets.co.za/missions-tournament/' }],
  },
  {
    id: 'pragmatic-wildz',
    company: 'Pragmatic Play',
    name: 'Missions',
    kind: 'Operator campaign',
    where: 'Wildz',
    dates: '10–26 Aug 2026',
    duration: '17 days',
    hours: 17 * 24,
    structure: 'All missions open at once; each can be completed once.',
    games: 'Selected Pragmatic Play games',
    tasks: [
      'Play 15 / 25 / 35 / 45 / 50 rounds → 5 / 10 / 15 / 20 / 30 free spins',
      'Hit 5× five times → 50 free spins',
      'Hit 10× three times → 75 free spins',
      'Hit 20× once → 100 free spins',
      'Separate wagering, win-amount and bonus-round missions',
      'Win $500 in bonus rounds → $50 bonus (first 10 players)',
    ],
    taskTypes: ['rounds', 'multiplier', 'turnover', 'win', 'bonus'],
    targets: '5× ×5, 10× ×3, 20× ×1',
    prizeModel: 'Fixed reward per mission (free spins at $0.10)',
    prizePool: 'Not disclosed',
    rules: ['Each mission once per campaign', 'One mission capped at the first 10 players'],
    lesson: 'Higher multiplier targets come with fewer repetitions (5× five times, 20× once). Round counts stay small: 15–50.',
    sources: [{ label: 'Wildz: Pragmatic Play Missions', url: 'https://www.wildz.com/nz/news/pragmatic-play-missions/' }],
  },
  {
    id: 'pragmatic-tool',
    company: 'Pragmatic Play',
    name: 'Missions (Enhance tool)',
    kind: 'Provider tool',
    where: 'Any Pragmatic Play operator',
    dates: 'Announced 22 Apr 2026',
    duration: 'Up to 14 days with daily resets',
    structure: 'Up to 50 missions per campaign, run one by one or all at once. Optional daily reset for up to 14 days.',
    games: 'Pragmatic Play slots',
    tasks: ['In-game goals set by the operator; instant prizes on completion'],
    taskTypes: ['rounds', 'multiplier', 'turnover'],
    prizeModel: 'Instant prize per mission',
    prizePool: 'Set by operator',
    rules: ['Sequential or simultaneous', 'Daily reset option'],
    lesson: 'The market leader now sells missions as a standard tool, with daily resets as the default rhythm.',
    sources: [
      { label: 'European Gaming: Pragmatic adds Missions', url: 'https://europeangaming.eu/portal/press-releases/2026/04/22/202331/pragmatic-play-adds-missions-feature-to-enhance-gamification-suite/' },
      { label: 'Pragmatic Play: Missions announcement', url: 'https://www.pragmaticplay.com/en/news/pragmatic-play-adds-prize-packed-missions-to-slots/' },
    ],
  },
  {
    id: 'playtech-sweeps',
    company: 'Playtech',
    name: 'Playtech Missions',
    kind: 'Operator campaign',
    where: 'McLuck, HelloMillions, PlayFame, SpinBlitz',
    dates: 'Apr 2026 (Fri–Sat: 3–4, 10–11, 17–18, 24–25); repeated monthly',
    duration: '24-hour windows',
    hours: 24,
    structure: 'Opt in through the game; several missions per day, each on a named slot. Bonus for clearing all of them.',
    games: 'Designated Playtech slots (e.g. Panther Pays)',
    tasks: ['Play 50 spins at minimum stake on the named slot → 10 free SC spins', 'Clear every mission → 25-spin boost (max 55 spins)', 'October: three missions of 50 spins each on Fri and Sat'],
    taskTypes: ['rounds', 'diversity'],
    prizeModel: 'Fixed reward per mission + completion boost',
    prizePool: 'Per player: up to 55 free spins (SC 0.20 each per a September report)',
    rules: ['Minimum stake spins only', 'Free spins expire after 4 days (September report)'],
    lesson: 'Short, easy, repeatable missions with a bonus for finishing the whole set, run on fixed 24-hour windows.',
    sources: [
      { label: 'PlayUSA: April Playtech Missions', url: 'https://www.playusa.com/news/april-sweepstakes-casino-promos-playtech-missions/' },
      { label: 'Bonus.com: October promos', url: 'https://www.bonus.com/news/sweepstakes-casino-promos-october-2026-mcluck-playfame-hello-millions-spinblitz/' },
      { label: 'RG.org: Playtech Missions', url: 'https://rg.org/news/gambling-industry/playtech-missions-free-sc-spins-mcluck-hello-millions-playfame' },
    ],
  },
  {
    id: 'smartsoft-summer',
    company: 'SmartSoft',
    name: 'Summer Hot Days',
    kind: 'Provider campaign',
    where: 'BetConstruct operators',
    dates: '2–25 Aug 2023',
    duration: '24 days, two stages, daily reset',
    hours: 24 * 24,
    structure: 'Two routes run side by side: turnover missions and multiplier missions. Each earns leaderboard-wheel spins.',
    games: 'JetX, Balloon, PlinkoX, FootballX, CricketX and slots',
    tasks: ['Turnover missions (progression route)', 'Hit 200× or more → 1 wheel spin', 'Hit 450× → 2 wheel spins'],
    taskTypes: ['turnover', 'multiplier'],
    targets: '200× ×1, 450× ×1',
    prizeModel: 'Leaderboard (points from wheel spins)',
    prizePool: '€40,000 (€20,000 per stage), top 500',
    rules: ['Max 10 wheel spins per day across both routes', 'Progress resets daily'],
    lesson: 'A rare multiplier is one way to earn points, never a requirement. Daily caps stop fast players running away.',
    sources: [{ label: 'BetConstruct: Summer Hot Days', url: 'https://clientzone.betconstruct.com/t/h7h9s43/40000-summer-hot-days-tournament-smartsoft' }],
  },
  {
    id: 'smartsoft-turkish',
    company: 'SmartSoft',
    name: 'Turkish Promotion',
    kind: 'Provider campaign',
    where: 'BetConstruct operators',
    dates: '1–23 Jan 2025',
    duration: '23 days',
    hours: 23 * 24,
    structure: 'Same two-route design: turnover milestones or a big multiplier, each giving wheel spins.',
    games: 'JetX, HelicopterX, Balloon, Multihot5, GeniesBonanza',
    tasks: ['Turnover milestones from TRY 500, TRY 3,000, TRY 8,000', 'Win 400× or more → 1 wheel spin', 'Win 840× → 2 wheel spins'],
    taskTypes: ['turnover', 'multiplier'],
    targets: '400× ×1, 840× ×1',
    prizeModel: 'Leaderboard (points from wheel spins)',
    prizePool: 'TRY 2,000,000, top 100',
    rules: ['Minimum bet TRY 50', 'Max 10 wheel spins per day'],
    lesson: 'Repeated the 2023 design with higher multiplier targets: the format worked well enough to reuse.',
    sources: [{ label: 'BetConstruct: Turkish Promotion', url: 'https://clientzone.betconstruct.com/t/p8yl8ap/2000000-try-smartsofts-turkish-promotion' }],
  },
  {
    id: 'smartsoft-jetx',
    company: 'SmartSoft',
    name: 'JetX mission tournaments',
    kind: 'Operator campaign',
    where: 'betPawa (2026), Bspin (2023) and others',
    dates: 'betPawa: weekly in 2026; Bspin: 2023 series',
    duration: 'Weekly rounds, daily caps',
    hours: 7 * 24,
    structure: 'Complete turnover and multiplier missions in JetX to earn up to 10 wheel spins a day; spins become leaderboard points.',
    games: 'JetX',
    tasks: ['Turnover missions', 'Multiplier missions', 'Any mix, max 10 wheel spins per day'],
    taskTypes: ['turnover', 'multiplier'],
    prizeModel: 'Leaderboard (points from wheel spins)',
    prizePool: 'betPawa Lesotho: 500 prizes, 399,500 LSL, weekly 1st prize 25,000 LSL · Bspin: €50,000, top 500, 1st €7,000',
    rules: ['Turnover requirement resets each level', 'Wheel spins automatically after 30 s'],
    lesson: 'Single-game version of the same mission → wheel → leaderboard loop, run weekly.',
    sources: [
      { label: 'betPawa: JetX tournament', url: 'https://ls.betpawa.com/jetx-tournament-500-prizes' },
      { label: 'InfoCasinoBonus: Bspin JetX series', url: 'https://www.infocasinobonus.com/bspin-casino-jetx-smartsoft-tournament-series/' },
    ],
  },
  {
    id: 'stake-originals',
    company: 'Stake',
    name: 'Ultimate Originals Challenge',
    kind: 'Operator campaign',
    where: 'Stake.com',
    dates: '24–31 Mar 2026',
    duration: '7 days',
    hours: 7 * 24,
    structure: 'A list of one-off challenges across different Originals games. Complete at least 3 to qualify; rank by how many you complete.',
    games: 'Stake Originals (Mines, Plinko, Chicken, Keno and others)',
    tasks: ['Mines: win with 5+ diamonds opened on 8 mines', 'Plinko: hit 1,000× or more once', 'Chicken: hit 200× or more once', 'Keno: hit exactly 100× on medium risk once'],
    taskTypes: ['multiplier', 'exact', 'diversity'],
    targets: '1,000× ×1, 200× ×1, exactly 100× ×1',
    prizeModel: 'Ranking by number of challenges completed',
    prizePool: '$8,000',
    rules: ['Minimum bet $0.50', 'At least 3 challenges to qualify', 'VIP and verification required'],
    lesson: 'Real cross-game set, but partial completion counts: one hard game cannot block a player.',
    sources: [{ label: 'Stake Community: Ultimate Originals Challenge', url: 'https://stakecommunity.com/topic/169468-8000-the-ultimate-originals-challenge-%E2%80%8B%F0%9F%94%A5%E2%80%8B/' }],
  },
  {
    id: 'stake-challenges',
    company: 'Stake',
    name: 'Challenges (first to hit)',
    kind: 'Ongoing feature',
    where: 'Stake.com and Stake.us',
    dates: 'Ongoing',
    duration: 'Open until claimed',
    structure: 'Race: the first player to hit a target multiplier on a named game with a minimum bet wins. Some challenges split a pot among all qualifiers.',
    games: 'Slots and Originals',
    tasks: ['Plinko: first to hit 10,000× (min 10) → 327.68 SC', 'Keno X: first to hit 2,000× (min $1) → 100 USDC', 'Cases: hit 105× or more → share of $5K'],
    taskTypes: ['multiplier'],
    targets: '10,000× ×1, 2,000× ×1, 105× ×1',
    prizeModel: 'First to hit wins; or split pot',
    prizePool: 'Per challenge (≈ $100–$5,000)',
    rules: ['Minimum bet per challenge', 'Listings change constantly'],
    lesson: 'Very rare targets are used as single-hit races with one winner, not as repeated requirements.',
    sources: [
      { label: 'Stake.us: Challenges', url: 'https://stake.us/casino/challenges' },
      { label: 'Deadspin: Stake.us Originals challenges', url: 'https://deadspin.com/sweepstakes-casinos/news/stake-us-introduces-challenges-on-stake-originals-heres-how-you-can-compete/' },
      { label: 'Dimers: 105× Cases challenge', url: 'https://www.dimers.com/sweepstakes-casinos/loot/stakeus-originals-challenge-hit-105x-on-cases-for-dollar5k' },
    ],
  },
  {
    id: 'bcgame-quests',
    company: 'BC.Game',
    name: 'Quest Hub and Challenges',
    kind: 'Ongoing feature',
    where: 'BC.Game',
    dates: 'Ongoing',
    duration: 'Daily and weekly resets',
    structure: 'Daily tasks reset every day; weekly tasks reset every 7 days and are harder with bigger rewards. Separate time-limited Challenges.',
    games: 'Specific games per task',
    tasks: ['Daily: play a specific game, log in at a set time', 'Weekly: harder versions, bigger rewards', 'Challenge: reach a multiplier on a named game with a valid bet; limited winners'],
    taskTypes: ['rounds', 'multiplier', 'turnover'],
    prizeModel: 'Fixed reward per task (BCD); challenges share a pool',
    prizePool: 'Per task / per challenge',
    rules: ['Challenges only for Diamond (VIP70) and above', 'Bets below the minimum do not count'],
    lesson: 'Two rhythms: easy daily habits plus harder weekly goals.',
    sources: [{ label: 'BC.Game help: Quest Hub rewards', url: 'https://intercom.help/87-f40cbd/en/articles/7831224-quest-hub-rewards' }],
  },
  {
    id: 'casumo-trophy',
    company: 'Casumo',
    name: 'The Trophy Run',
    kind: 'Operator campaign',
    where: 'Casumo (UK)',
    dates: '1 Jun – 5 Jul 2026',
    duration: '35 days, daily reset',
    hours: 35 * 24,
    structure: 'Daily missions that reset every day, including game- and provider-diversity tasks.',
    games: 'Featured games of the month, several providers',
    tasks: ['Spin 20 times in each featured game → 10 free spins', 'Spin 100 times across the month’s 3 selected games → 10 free spins', 'Bet £5 on 3 different providers → 30 free spins', 'Complete 100 quests → 1,000 free spins'],
    taskTypes: ['rounds', 'diversity', 'turnover'],
    prizeModel: 'Fixed reward per mission (free spins at £0.10)',
    prizePool: 'Not stated',
    rules: ['Daily resets'],
    lesson: 'Cross-game play is asked for directly with small spin counts per game, not through rare results.',
    sources: [{ label: 'Casumo: The Trophy Run', url: 'https://www.casumo.com/en-gb/promotions/umoquests-june-26/' }],
  },
  {
    id: 'bgaming-quests',
    company: 'BGaming',
    name: 'Quests',
    kind: 'Provider tool',
    where: 'BGaming operators',
    dates: 'Launched 27 May 2026',
    duration: 'Daily, ongoing',
    structure: 'Three daily missions; milestones earn Coins that are exchanged for cash prizes. Individual progress, no leaderboard.',
    games: 'BGaming titles',
    tasks: ['Spins / bet counts', 'Bonus Buy', 'Multiplier targets', 'Cumulative multiplier sums'],
    taskTypes: ['rounds', 'bonus', 'multiplier', 'sum'],
    prizeModel: 'Coins → cash prizes',
    prizePool: 'Funded by BGaming (amounts not disclosed)',
    rules: ['Tasks refresh daily', 'Provider runs settings, payouts and seasonal updates'],
    lesson: 'Provider-funded, always-on missions: three a day, individual progress, no race.',
    sources: [
      { label: 'BGaming: Quests launch', url: 'https://bgaming.com/news/bgaming-launches-exclusive-quests-retention-tool' },
      { label: 'iGB: BGaming Quests', url: 'https://igamingbusiness.com/company-news/bgaming-launches-exclusive-quests-retention-tool/' },
    ],
  },
];

/** Large provider campaigns that are leaderboards or drops rather than missions, for scale. */
export const NETWORK_CAMPAIGNS = [
  {
    company: 'Aviatrix (crash game)',
    name: 'Summer Tournament',
    detail: '1 Jun – 31 Aug, €4,000,000 network pool; daily pools (~€17,000) split by plane XP. One operator ran an “Ultimate Flying Mission” where the biggest losing-bet total won TSH 50,000.',
    sources: [
      { label: 'Wolfy Jackpot: Aviatrix review', url: 'https://wolfy-jackpot.com/aviatrix/' },
      { label: 'GSB: Ultimate Flying Mission', url: 'https://help.gsb.co.tz/en/promotion/ultimate-flying-mission/' },
    ],
  },
  {
    company: 'Evoplay',
    name: 'Big Adventures / Season of Legends',
    detail: 'Big Adventures: 9 months (Jun 2025 – Feb 2026), €2.5M with monthly pools of €200k–€500k. Season of Legends 2026: four 3-month seasons, €2M a year, spring €512,000 on a shared leaderboard.',
    sources: [
      { label: 'Yogonet: Big Adventures', url: 'https://www.yogonet.com/international/news/2025/07/21/112046-evoplay-launches-25-million-39big-adventures-39-network-tournament' },
      { label: 'eeGaming: Season of Legends', url: 'https://eegaming.org/latest-news/2026/04/14/137351/evoplay-rolls-out-season-of-legends-campaign-with-e512000-spring-prize-pool/' },
    ],
  },
  {
    company: 'Pragmatic Play',
    name: 'Drops & Wins 2026',
    detail: 'Over €25M across 5M+ prizes through daily tournaments and weekly wheel drops. Provider-funded.',
    sources: [{ label: 'Pragmatic Play: Drops & Wins', url: 'https://www.pragmaticplay.com/en/drops-and-wins/' }],
  },
];

export const FINDINGS = [
  {
    title: 'Round counts are the backbone',
    text: 'Most campaigns use “play N rounds/spins” tasks with small numbers: 15–50 rounds (Wildz), 50 spins (Playtech), 20 spins per game (Casumo). The longest we found is 300 rounds for a final first-come prize (Supabets).',
  },
  {
    title: 'Rare multipliers are optional or one-off',
    text: 'Big targets (200×, 450×, 840×, 1,000×, 10,000×) only earn bonus points or win a single race. When a multiplier must be repeated, the target drops: 5× five times, 10× three times, 20× once.',
  },
  {
    title: 'Cross-game play is partial',
    text: 'Where several games are involved, players need only some of them (Stake: any 3 challenges) or small spin counts per game (Casumo, Playtech). None of the campaigns we found makes every player finish a rare result in every game.',
  },
  {
    title: 'Daily resets and caps set the rhythm',
    text: 'Campaigns run 1–5 weeks but reset daily (SmartSoft, Casumo, BC.Game, BGaming) or open in 24-hour windows (Playtech). SmartSoft caps rewards at 10 wheel spins a day so fast players cannot run away.',
  },
  {
    title: 'Prize models vary',
    text: 'Fixed free spins per mission, leaderboards fed by mission spins, first-come prizes, ranking by tasks completed, single-winner races and coins-for-cash all appear. Only Supabets uses a pure first-finisher payout.',
  },
];
