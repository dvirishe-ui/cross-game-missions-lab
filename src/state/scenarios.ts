import type { AdaptTemplate, Competitor } from '../data/competitors';
import { GAME_BY_ID, type GameId } from '../data/games';
import { PRIZE_PLACES_REPORTED, missionsForDay, resultForDay } from '../data/previousCampaign';
import type { BuilderTask, MissionType, Scenario, Stage } from '../math/campaign';
import { toCsv } from '../math/csv';

let counter = 0;
export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newTask(partial: Partial<BuilderTask> = {}): BuilderTask {
  return {
    id: uid('task'),
    game: 'aviator',
    type: 'count',
    label: '',
    target: null,
    unit: 'rounds',
    betsPerRound: null,
    threshold: null,
    condition: 'gte',
    rate: null,
    rateSource: 'measured',
    concurrentRate: null,
    p: null,
    pSource: 'measured',
    mu: null,
    muSource: 'measured',
    canProduce: 'unknown',
    route: '',
    stage: 0,
    note: '',
    ...partial,
  };
}

export function defaultScenario(): Scenario {
  return {
    id: uid('scn'),
    name: 'New five-hour campaign',
    origin: 'Proposed design',
    deadline: 300,
    progression: 'simultaneous',
    completion: 'all',
    anyK: null,
    stageEntry: 'independent',
    stageCarryover: 'reset',
    stages: [{ id: uid('stage'), name: 'Stage 1', release: 0, deadline: null, prizeShare: null }],
    tasks: [],
    entrants: null,
    prizePlaces: null,
    prizeAmount: null,
    currency: 'EUR',
    startSpread: 0,
    startSpreadSource: 'illustrative',
    concurrencyFactor: 100,
    concurrencySource: 'illustrative',
    activeFraction: 100,
    activeFractionSource: 'illustrative',
    samples: 20000,
    seed: 20260,
    notes: '',
  };
}

/** Mission wording for a builder task. */
export function describeTask(t: Pick<BuilderTask, 'type' | 'target' | 'threshold' | 'condition' | 'unit'>): string {
  const n = t.target == null ? '?' : t.target.toLocaleString('en-US');
  if (t.type === 'count') return `Place ${n} individual ${t.unit === 'bets' ? 'bets' : 'qualifying rounds'}`;
  if (t.type === 'accumulate') return `Collect ${n}× in total`;
  const th = t.threshold == null ? '?' : t.threshold;
  return t.condition === 'eq' ? `Catch exactly ${th}× ${n} times` : `Catch multiplier ${th}× or more ${n} times`;
}

/** Clone a previous-campaign day. Targets are copied; game parameters stay missing. */
export function cloneDay(day: number): Scenario {
  const s = defaultScenario();
  const reported = resultForDay(day);
  s.name = `Clone of Day ${day}`;
  s.origin = `Previous SPRIBE campaign, Day ${day} (targets and reported audience)`;
  s.baselineDay = day;
  if (reported) {
    s.entrants = reported.started;
    s.prizePlaces = PRIZE_PLACES_REPORTED;
    s.notes = `Entrants = ${reported.started} players who started at least one task on Day ${day}; prize places = ${PRIZE_PLACES_REPORTED} (internal report). Game rates and probabilities are still missing.`;
  }
  s.tasks = missionsForDay(day).map((m) =>
    newTask({
      game: m.game,
      type: m.kind as MissionType,
      label: m.text,
      target: m.target,
      unit: 'bets',
      threshold: m.threshold ?? null,
      note:
        m.game === 'keno'
          ? 'Previous data does not say whether ordinary Keno or Keno 80 was used. Confirm the version.'
          : m.kind === 'count'
            ? 'Original wording counts individual bets. Enter bets per round.'
            : '',
    }),
  );
  return s;
}

export function experimentA(): Scenario {
  const s = cloneDay(6);
  s.name = 'Experiment A: Day 6 with a Keno round-count task';
  s.baselineDay = undefined;
  s.origin = 'Proposed design (Experiment A)';
  s.tasks = s.tasks.map((t) =>
    t.game === 'keno'
      ? newTask({ game: 'keno', type: 'count', unit: 'bets', label: 'Place N individual Keno bets (target to calibrate)', target: null, note: 'Replaces the mandatory 30× twenty times Keno task. Calibrate N from telemetry.' })
      : t,
  );
  return s;
}

export function experimentB(): Scenario {
  const s = defaultScenario();
  s.name = 'Experiment B: five hourly prize allocations';
  s.origin = 'Proposed design (Experiment B)';
  s.progression = 'staged';
  s.stageEntry = 'independent';
  s.stageCarryover = 'reset';
  const sets: GameId[][] = [
    ['aviator', 'mines', 'plinko'],
    ['aviator', 'goal', 'keno'],
    ['aviator', 'pilot-chicken', 'trader'],
    ['aviator', 'mines', 'goal'],
    ['aviator', 'plinko', 'trader'],
  ];
  s.stages = sets.map((_, i): Stage => ({ id: uid('stage'), name: `Hour ${i + 1}`, release: i * 60, deadline: (i + 1) * 60, prizeShare: 20 }));
  s.tasks = sets.flatMap((games, i) =>
    games.map((g) =>
      newTask({
        game: g,
        stage: i,
        type: 'count',
        unit: 'bets',
        label: `${GAME_BY_ID[g].name} task (type and target to calibrate)`,
        note: i === 4 && g !== 'aviator' ? 'Hour 5 uses Aviator plus two rotating games; this pair is a placeholder.' : '',
      }),
    ),
  );
  s.notes = 'Equal 20% allocation per hour is an illustrative proposal. Unclaimed-prize handling must be configured and published.';
  return s;
}

export function experimentC(): Scenario {
  const s = cloneDay(6);
  s.name = 'Experiment C: alternative Keno route and any K of G';
  s.baselineDay = undefined;
  s.origin = 'Proposed design (Experiment C)';
  s.completion = 'anyK';
  s.anyK = 5;
  s.tasks = s.tasks.flatMap((t) =>
    t.game === 'keno'
      ? [
          { ...t, route: 'Keno route', label: 'Catch multiplier 30× or more 20 times (route 1)' },
          newTask({ game: 'keno', type: 'count', unit: 'bets', route: 'Keno route', label: 'Place N individual Keno bets (route 2, target to calibrate)' }),
        ]
      : [t],
  );
  return s;
}

/** Illustrative demo scenario using the Keno-style example numbers. Not SPRIBE data. */
export function illustrativeScenario(): Scenario {
  const s = defaultScenario();
  s.name = 'Illustrative demo (not SPRIBE data)';
  s.origin = 'Illustrative assumption';
  s.entrants = 1000;
  s.prizePlaces = 50;
  s.tasks = [
    newTask({ game: 'generic', type: 'multiplier', label: 'Catch multiplier X× or more 20 times', target: 20, threshold: 30, p: 0.01, pSource: 'illustrative', rate: 10, rateSource: 'illustrative', canProduce: 'yes' }),
    newTask({ game: 'generic', type: 'count', unit: 'rounds', label: 'Place 300 qualifying rounds', target: 300, rate: 5, rateSource: 'illustrative' }),
    newTask({ game: 'generic', type: 'multiplier', label: 'Catch multiplier Y× or more 10 times', target: 10, threshold: 15, p: 0.02, pSource: 'illustrative', rate: 4, rateSource: 'illustrative', canProduce: 'yes' }),
  ];
  s.notes = 'Every parameter here is an illustrative assumption entered only to demonstrate the calculations.';
  return s;
}

const ADAPT_NOTE = 'Structure adapted from a competitor as a proposal. Their probabilities and timings are not copied; calibrate for SPRIBE games.';

export function adaptCompetitor(c: Competitor): Scenario {
  const s = defaultScenario();
  s.name = `Proposal adapted from ${c.provider} – ${c.title}`;
  s.origin = `Proposed design adapted from ${c.provider} / ${c.channel} (${c.dateText})`;
  s.notes = ADAPT_NOTE;
  const t = (g: GameId, partial: Partial<BuilderTask>) => newTask({ game: g, unit: 'bets', ...partial });
  const byTemplate: Record<AdaptTemplate, () => void> = {
    'alt-routes': () => {
      s.tasks = [
        t('aviator', { type: 'count', route: 'Route', label: 'Turnover / round-count route (target to calibrate)' }),
        t('aviator', { type: 'multiplier', route: 'Route', label: 'Rare multiplier route (threshold to calibrate)' }),
      ];
    },
    'all-simultaneous': () => {
      s.completion = 'anyK';
      s.anyK = 1;
      s.tasks = [
        t('aviator', { type: 'count', target: 50, label: 'Play 50 rounds', note: 'Competitor mission count; recalibrate.' }),
        t('plinko', { type: 'multiplier', target: 5, threshold: 5, label: 'Achieve 5× five times', note: 'Competitor structure: lower threshold, more repetitions.' }),
        t('mines', { type: 'multiplier', target: 1, threshold: 20, label: 'Achieve 20× once', note: 'Competitor structure: higher threshold, fewer repetitions.' }),
      ];
    },
    sequential: () => {
      s.progression = 'sequential';
      s.tasks = [
        t('aviator', { type: 'count', label: 'Mission 1 (target to calibrate)' }),
        t('plinko', { type: 'count', label: 'Mission 2 (target to calibrate)' }),
        t('mines', { type: 'count', unit: 'rounds', target: 300, label: 'Mission 3: 300 qualifying rounds', note: 'Competitor’s published third mission used 300 rounds; recalibrate.' }),
      ];
    },
    'any-k': () => {
      s.completion = 'anyK';
      s.anyK = 3;
      s.tasks = (['mines', 'plinko', 'pilot-chicken', 'keno', 'aviator'] as GameId[]).map((g) =>
        t(g, { type: 'multiplier', target: 1, label: `${GAME_BY_ID[g].name}: rare-result challenge (threshold to calibrate)` }),
      );
    },
    diversity: () => {
      s.tasks = (['aviator', 'plinko', 'mines'] as GameId[]).map((g) => t(g, { type: 'count', target: 20, label: `Place 20 bets in ${GAME_BY_ID[g].name}`, note: 'Game-diversity task.' }));
    },
    'daily-three': () => {
      s.tasks = [
        t('aviator', { type: 'count', label: 'Spins / bets mission' }),
        t('plinko', { type: 'multiplier', label: 'Multiplier-threshold mission' }),
        t('mines', { type: 'accumulate', label: 'Cumulative multiplier-sum mission' }),
      ];
    },
  };
  byTemplate[c.adapt]();
  s.tasks.forEach((task) => {
    if (!task.note) task.note = ADAPT_NOTE;
  });
  return s;
}

// ---------------------------------------------------------------------------
// JSON import / export and mission CSV
// ---------------------------------------------------------------------------

export function scenarioToJson(s: Scenario): string {
  return JSON.stringify({ format: 'cross-game-missions-lab/scenario', version: 1, scenario: s }, null, 2);
}

export function scenarioFromJson(text: string): { scenario?: Scenario; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'The file is not valid JSON.' };
  }
  const obj = data as { scenario?: Partial<Scenario> };
  const raw = obj && typeof obj === 'object' && 'scenario' in obj ? obj.scenario : (data as Partial<Scenario>);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return { error: 'No scenario with a "tasks" list was found in the file.' };
  const base = defaultScenario();
  const scenario: Scenario = { ...base, ...raw, id: uid('scn'), tasks: raw.tasks.map((t) => newTask({ ...t, id: uid('task') })) } as Scenario;
  if (!['simultaneous', 'sequential', 'staged'].includes(scenario.progression)) return { error: `Unknown progression "${scenario.progression}".` };
  if (typeof scenario.deadline !== 'number' || scenario.deadline <= 0) return { error: 'Deadline must be a positive number of minutes.' };
  for (const t of scenario.tasks) {
    if (!GAME_BY_ID[t.game]) return { error: `Unknown game "${t.game}".` };
    if (!['count', 'multiplier', 'accumulate'].includes(t.type)) return { error: `Unknown mission type "${t.type}".` };
  }
  return { scenario };
}

export function missionsCsv(s: Scenario): string {
  const header = ['scenario', 'stage', 'route', 'game', 'mission', 'type', 'target', 'unit', 'bets_per_round', 'threshold', 'condition', 'rate_per_min', 'rate_source', 'concurrent_rate', 'p_decimal', 'p_source', 'mu', 'mu_source', 'note'];
  const rows = s.tasks.map((t) => [
    s.name,
    s.progression === 'staged' ? s.stages[t.stage]?.name ?? '' : '',
    t.route,
    GAME_BY_ID[t.game].name,
    t.label || describeTask(t),
    t.type,
    t.target,
    t.type === 'count' ? t.unit : '',
    t.betsPerRound,
    t.threshold,
    t.type === 'multiplier' ? t.condition : '',
    t.rate,
    t.rate == null ? 'missing' : t.rateSource,
    t.concurrentRate,
    t.p,
    t.type !== 'multiplier' ? '' : t.p == null ? 'missing' : t.pSource,
    t.mu,
    t.type !== 'accumulate' ? '' : t.mu == null ? 'missing' : t.muSource,
    t.note,
  ]);
  return toCsv([header, ...rows]);
}

// ---------------------------------------------------------------------------
// Local persistence (per browser; always wrapped in try/catch)
// ---------------------------------------------------------------------------

const KEY = 'cross-game-missions-lab:v1';

export interface StoredState {
  current: Scenario;
  saved: Scenario[];
  observations: Record<number, { firstFinisher: string; finalPrize: string; entrants: string; prizes: string }>;
  checks: Record<string, boolean>;
}

export function loadState(): Partial<StoredState> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredState>) : null;
  } catch {
    return null;
  }
}

export function saveState(state: StoredState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the app still works for this session */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
