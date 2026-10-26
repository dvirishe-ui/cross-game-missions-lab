// The master T&C template, built from the SPRIBE Adventure reference T&C.
//
// Three kinds of clause:
//   fixed        approved wording that never changes with the campaign
//   conditional  approved wording that appears or not, depending on settings
//   generated    wording whose {{placeholders}} are filled from campaign data
//
// The generator only ever substitutes placeholders; it never rewrites the
// wording. Wording changes only when someone edits and saves the master
// template. "Slots" hold approved alternatives (e.g. leaderboard wording)
// that the reference did not include: they start empty, and an empty slot is
// reported as missing rather than invented.

export type ClauseCategory = 'fixed' | 'conditional' | 'generated';

export interface ClauseDef {
  id: string;
  title: string;
  category: ClauseCategory;
  /** What decides whether it appears (shown to the user). */
  rule: string;
}

export const CLAUSES: ClauseDef[] = [
  { id: 'availability', title: 'Availability', category: 'generated', rule: 'Always; games come from the campaign' },
  { id: 'join', title: 'Participation', category: 'conditional', rule: 'Join required = Yes' },
  { id: 'independence', title: 'Daily Mission independence', category: 'conditional', rule: 'Progress resets daily = Yes' },
  { id: 'reset', title: 'Progress reset', category: 'conditional', rule: 'Progress resets daily = Yes and carries over = No' },
  { id: 'deadline', title: 'Completion deadline', category: 'conditional', rule: 'Completion deadline clause on' },
  { id: 'progressUpdate', title: 'Progress tracking', category: 'conditional', rule: 'Progress updated after every round = Yes' },
  { id: 'refresh', title: 'Mission window refresh', category: 'conditional', rule: 'Refresh note on' },
  { id: 'rewardMethod', title: 'Reward method', category: 'conditional', rule: 'Wording for the chosen reward method' },
  { id: 'totalPool', title: 'Total prize pool', category: 'generated', rule: 'Always' },
  { id: 'winnerEligibility', title: 'Winner eligibility', category: 'generated', rule: 'First come, first served' },
  { id: 'dailyBreakdown', title: 'Daily prize breakdown', category: 'generated', rule: 'One line per day, from the daily prizes' },
  { id: 'rewardCap', title: 'Reward cap', category: 'generated', rule: 'First come, first served' },
  { id: 'frequency', title: 'Reward frequency', category: 'generated', rule: 'Always' },
  { id: 'variableTasks', title: 'Variable tasks', category: 'conditional', rule: 'Variable tasks clause on' },
  { id: 'futureEligibility', title: 'Future daily eligibility', category: 'conditional', rule: 'Future eligibility clause on' },
  { id: 'payout', title: 'Payout time', category: 'generated', rule: 'Wording for the chosen payout method' },
  { id: 'verification', title: 'Player verification', category: 'conditional', rule: 'Verified players only = Yes' },
  { id: 'payoutCurrency', title: 'Payout currency', category: 'conditional', rule: 'Payout currency clause on' },
  { id: 'otherOffers', title: 'Other offers', category: 'conditional', rule: 'Can be combined with other offers = No' },
  { id: 'cheating', title: 'Errors, cheating and collusion', category: 'fixed', rule: 'Always' },
  { id: 'changes', title: 'Promotion changes and termination', category: 'fixed', rule: 'Always' },
];

/** Reference wording, verbatim, with placeholders only where the value is campaign data. */
export const REFERENCE_WORDING: Record<string, string> = {
  availability: 'This promotion is available exclusively for {{games}} in the game window.',
  join: 'Players must click ‘Join’ before participating.',
  independence: 'Each Daily Mission is independent.',
  reset: 'Progress resets at the end of each Daily Mission and does not carry over to the next day.',
  deadline: 'Players must complete all tasks before the Daily Mission ends.',
  progressUpdate: 'Mission progress is updated after every completed round.',
  refresh: 'The Mission window refreshes only when reopened or manually refreshed.',
  rewardMethod: 'Rewards are granted on a first come, first served basis.',
  totalPool: 'Winners will share a {{totalPool}} total prize pool.',
  winnerEligibility: 'The first {{winnersPerDay}} eligible players to {{qualification}} will receive a {{rewardTypeLower}} prize.',
  dailyBreakdown: 'Day {{day}}: {{dayWinners}} winners will share a {{dayPool}} prize pool ({{dayReward}} per winner).',
  rewardCap: 'Once all {{winnersPerDay}} daily rewards have been claimed, no additional prizes will be awarded for that Daily Mission.',
  frequency: 'A player can receive {{maxRewards}} per Daily Mission.',
  variableTasks:
    'Tasks and required values may vary from one Daily Mission to another and will be displayed in the Mission window within the game before the start of each Daily Mission.',
  futureEligibility: 'Players remain eligible to participate in and win subsequent Daily Missions.',
  payout: '{{rewardTypeCap}} prizes will be awarded automatically within {{payoutHours}} hours after each Daily Mission ends.',
  verification: 'Only verified Casino Players are eligible to win the prizes.',
  payoutCurrency: 'Cash prizes will be paid out in the currency the winning bet was placed with, according to currency conversion.',
  otherOffers: 'This offer cannot be used in conjunction with any other offers.',
  cheating:
    'The company reserves the right not to pay out a cash prize where the win results from any obvious error, mistake or technical fault and where, in its opinion, the win results from cheating or collusion with other players.',
  changes: 'SPRIBE may change or terminate this promotion if required for legal, technical or regulatory reasons.',
};

/** Approved alternatives the reference did not contain. Empty = not approved yet. */
export const SLOTS: { id: string; label: string }[] = [
  { id: 'reward.leaderboard', label: 'Reward method: leaderboard' },
  { id: 'reward.random-draw', label: 'Reward method: random draw' },
  { id: 'reward.custom', label: 'Reward method: custom' },
  { id: 'payout.manual', label: 'Payout: manual' },
  { id: 'payout.custom', label: 'Payout: custom' },
  { id: 'progress.carryOver', label: 'Progress carries over between days' },
  { id: 'join.notRequired', label: 'Participation without a Join button' },
];

export interface MasterTemplate {
  version: 1;
  savedAt: number | null;
  wording: Record<string, string>;
  slots: Record<string, string>;
}

export function referenceTemplate(): MasterTemplate {
  return { version: 1, savedAt: null, wording: { ...REFERENCE_WORDING }, slots: Object.fromEntries(SLOTS.map((s) => [s.id, ''])) };
}

const KEY = 'promo-toolkit/master-template';

export function loadMaster(): MasterTemplate {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return referenceTemplate();
    const t = JSON.parse(raw) as MasterTemplate;
    const ref = referenceTemplate();
    return { version: 1, savedAt: t.savedAt ?? null, wording: { ...ref.wording, ...t.wording }, slots: { ...ref.slots, ...t.slots } };
  } catch {
    return referenceTemplate();
  }
}

export function saveMaster(t: MasterTemplate): MasterTemplate {
  const saved = { ...t, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: kept for this visit only */
  }
  return saved;
}
