import type { GameId } from '../data/games';
import { binomTailGE } from './binomial';
import { modelCdf, sampleModel, type ProbabilitySource, type TimeModel } from './calculators';
import { mulberry32, type Rng } from './rng';

// ---------------------------------------------------------------------------
// Scenario model for the campaign builder. All times are minutes from the
// scheduled event start. `null` always means "not supplied" (missing data).
// ---------------------------------------------------------------------------

export type MissionType = 'count' | 'multiplier' | 'accumulate';
export type Progression = 'simultaneous' | 'sequential' | 'staged';
export type InputSource = ProbabilitySource;

export interface BuilderTask {
  id: string;
  game: GameId;
  type: MissionType;
  /** Mission wording as players would read it. */
  label: string;
  /** N bets/rounds, k successes, or S (× sum) depending on type. */
  target: number | null;
  unit: 'rounds' | 'bets';
  betsPerRound: number | null;
  threshold: number | null;
  condition: 'gte' | 'eq';
  /** Qualifying rounds (attempts) per minute when this game is played alone. */
  rate: number | null;
  rateSource: InputSource;
  /** Optional measured rate while other missions are being played at the same time. */
  concurrentRate: number | null;
  p: number | null; // decimal
  pSource: InputSource;
  mu: number | null;
  muSource: InputSource;
  canProduce: 'yes' | 'no' | 'unknown';
  /** Tasks with the same non-empty route label are alternatives (complete any one). */
  route: string;
  /** Stage index (scheduled-stage progression only). */
  stage: number;
  note: string;
}

export interface Stage {
  id: string;
  name: string;
  release: number; // minutes
  deadline: number | null; // minutes; null = event deadline
  prizeShare: number | null; // % of prize places reserved for this stage
}

export interface Scenario {
  id: string;
  name: string;
  origin: string;
  deadline: number; // minutes
  progression: Progression;
  completion: 'all' | 'anyK';
  anyK: number | null;
  stageEntry: 'independent' | 'gated';
  stageCarryover: 'reset' | 'carry';
  stages: Stage[];
  tasks: BuilderTask[];
  entrants: number | null;
  prizePlaces: number | null;
  prizeAmount: number | null;
  currency: string;
  /** Players start uniformly within the first X minutes. */
  startSpread: number;
  startSpreadSource: InputSource;
  /** % of solo speed kept while playing several missions at once. */
  concurrencyFactor: number;
  concurrencySource: InputSource;
  /** % of the event a player is actively playing. */
  activeFraction: number;
  activeFractionSource: InputSource;
  samples: number;
  seed: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Per-task models
// ---------------------------------------------------------------------------

export interface TaskEvaluation {
  task: BuilderTask;
  missing: string[];
  errors: string[];
  status: 'ok' | 'missing' | 'invalid' | 'impossible' | 'approximate';
  model?: TimeModel;
  effectiveRate?: number;
  sources: InputSource[];
}

export function taskMissing(task: BuilderTask): string[] {
  const m: string[] = [];
  const label = task.type === 'count' ? 'target count' : task.type === 'multiplier' ? 'required successes k' : 'target sum S';
  if (task.target == null) m.push(label);
  if (task.rate == null) m.push('qualifying rounds per minute');
  if (task.type === 'count' && task.unit === 'bets' && task.betsPerRound == null) m.push('bets per round');
  if (task.type === 'multiplier') {
    if (task.threshold == null) m.push('threshold multiplier');
    if (task.p == null) m.push('qualifying probability p');
  }
  if (task.type === 'accumulate' && task.mu == null) m.push('average counted contribution μ');
  return m;
}

export function evaluateTask(task: BuilderTask, concurrent: boolean, scenario: Pick<Scenario, 'concurrencyFactor' | 'activeFraction'>): TaskEvaluation {
  const missing = taskMissing(task);
  const sources: InputSource[] = [];
  if (task.rate != null) sources.push(task.rateSource);
  if (task.type === 'multiplier' && task.p != null) sources.push(task.pSource);
  if (task.type === 'accumulate' && task.mu != null) sources.push(task.muSource);
  if (missing.length) return { task, missing, errors: [], status: 'missing', sources };
  const errors: string[] = [];
  const target = task.target!;
  if (target < 0) errors.push('Target cannot be negative.');
  if (task.rate! < 0) errors.push('Rate cannot be negative.');
  if (task.concurrentRate != null && task.concurrentRate < 0) errors.push('Concurrent rate cannot be negative.');
  if (task.type === 'multiplier' && !(task.p! >= 0 && task.p! <= 1)) errors.push('Probability must be between 0% and 100%.');
  if (task.type === 'multiplier' && !Number.isInteger(target)) errors.push('Required successes must be a whole number.');
  if (task.type === 'accumulate' && task.mu! < 0) errors.push('μ cannot be negative.');
  if (task.type === 'count' && task.unit === 'bets' && !(task.betsPerRound! > 0)) errors.push('Bets per round must be above 0.');
  if (!(scenario.concurrencyFactor > 0 && scenario.concurrencyFactor <= 100)) errors.push('Concurrency speed factor must be above 0% and at most 100%.');
  if (!(scenario.activeFraction > 0 && scenario.activeFraction <= 100)) errors.push('Active-play fraction must be above 0% and at most 100%.');
  if (errors.length) return { task, missing, errors, status: 'invalid', sources };

  const baseRate = concurrent ? task.concurrentRate ?? (task.rate! * scenario.concurrencyFactor) / 100 : task.rate!;
  const rate = (baseRate * scenario.activeFraction) / 100;
  if (target === 0) return { task, missing, errors, status: 'ok', model: { kind: 'deterministic', minutes: 0 }, effectiveRate: rate, sources };
  if (rate === 0) return { task, missing, errors: ['Rate is 0: no progress.'], status: 'impossible', model: { kind: 'never' }, effectiveRate: 0, sources };

  switch (task.type) {
    case 'count': {
      const perMinute = task.unit === 'bets' ? rate * task.betsPerRound! : rate;
      return { task, missing, errors, status: 'ok', model: { kind: 'deterministic', minutes: target / perMinute }, effectiveRate: perMinute, sources };
    }
    case 'multiplier': {
      if (task.canProduce === 'no' || task.p === 0)
        return { task, missing, errors: ['This configuration cannot produce the threshold: impossible.'], status: 'impossible', model: { kind: 'never' }, effectiveRate: rate, sources };
      const model: TimeModel = task.p === 1 ? { kind: 'deterministic', minutes: target / rate } : { kind: 'negbin', k: target, p: task.p!, rate };
      return { task, missing, errors, status: 'ok', model, effectiveRate: rate, sources };
    }
    case 'accumulate': {
      if (task.mu === 0) return { task, missing, errors: ['μ = 0: the sum never grows.'], status: 'impossible', model: { kind: 'never' }, effectiveRate: rate, sources };
      return {
        task,
        missing,
        errors,
        status: 'approximate',
        model: { kind: 'deterministic', minutes: target / (rate * task.mu!), approximate: true },
        effectiveRate: rate,
        sources,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Combining tasks
// ---------------------------------------------------------------------------

/** Groups tasks into requirement slots; tasks sharing a route label are alternatives. */
export function buildSlots<T extends { task: BuilderTask }>(items: T[]): T[][] {
  const slots: T[][] = [];
  const byRoute = new Map<string, T[]>();
  for (const item of items) {
    const key = item.task.route.trim();
    if (!key) {
      slots.push([item]);
      continue;
    }
    if (!byRoute.has(key)) {
      const slot: T[] = [];
      byRoute.set(key, slot);
      slots.push(slot);
    }
    byRoute.get(key)!.push(item);
  }
  return slots;
}

/** k-th smallest value (1-based). Infinity when fewer than k finite values. */
export function kthSmallest(values: number[], k: number): number {
  if (k <= 0) return 0;
  if (k > values.length) return Infinity;
  return [...values].sort((a, b) => a - b)[k - 1];
}

export const combineParallel = (times: number[]) => (times.length ? Math.max(...times) : 0);
export const combineSequential = (times: number[]) => times.reduce((a, b) => a + b, 0);

/** P(at least k of the independent events occur), probabilities q_i. */
export function atLeastK(qs: number[], k: number): number {
  if (k <= 0) return 1;
  if (k > qs.length) return 0;
  let dist = [1];
  for (const q of qs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let j = 0; j < dist.length; j++) {
      next[j] += dist[j] * (1 - q);
      next[j + 1] += dist[j] * q;
    }
    dist = next;
  }
  let s = 0;
  for (let j = k; j < dist.length; j++) s += dist[j];
  return Math.min(1, s);
}

function slotCdf(slot: TaskEvaluation[], t: number): number {
  let none = 1;
  for (const e of slot) none *= 1 - modelCdf(e.model!, t);
  return 1 - none;
}

function groupCdf(slots: TaskEvaluation[][], need: number, t: number): number {
  const qs = slots.map((s) => slotCdf(s, t));
  if (need >= slots.length) return qs.reduce((a, b) => a * b, 1);
  return atLeastK(qs, need);
}

function sampleGroup(slots: TaskEvaluation[][], need: number, mode: 'parallel' | 'sequential', rng: Rng): number {
  const slotTimes = slots.map((slot) => Math.min(...slot.map((e) => sampleModel(e.model!, rng))));
  if (mode === 'sequential') return combineSequential(slotTimes);
  return need >= slotTimes.length ? combineParallel(slotTimes) : kthSmallest(slotTimes, need);
}

// ---------------------------------------------------------------------------
// Distribution summaries
// ---------------------------------------------------------------------------

export interface Distribution {
  method: 'exact' | 'monte-carlo';
  cdf: (t: number) => number;
  /** Probability of eventually finishing (≤ 1 when some players never can). */
  limit: number;
  samples?: number;
  seed?: number;
  sorted?: number[];
}

export function distQuantile(d: Distribution, q: number): number {
  if (d.sorted && d.samples) {
    const idx = Math.ceil(q * d.samples) - 1;
    return idx < d.sorted.length ? d.sorted[Math.max(0, idx)] : Infinity;
  }
  if (d.limit < q) return Infinity;
  let hi = 1;
  while (d.cdf(hi) < q) {
    hi *= 2;
    if (hi > 1e8) return Infinity;
  }
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (d.cdf(mid) >= q) hi = mid;
    else lo = mid;
  }
  return hi;
}

function empirical(times: number[], samples: number, seed: number): Distribution {
  const sorted = times.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const cdf = (t: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo / samples;
  };
  return { method: 'monte-carlo', cdf, limit: sorted.length / samples, samples, seed, sorted };
}

// ---------------------------------------------------------------------------
// Scenario evaluation
// ---------------------------------------------------------------------------

export interface UnitResult {
  /** "Whole campaign" or a stage name. */
  name: string;
  window: [number, number]; // [opens, deadline] minutes
  dist: Distribution;
  pByDeadline: number;
  median: number;
  p90: number;
  prizePlaces: number | null;
  first?: FirstFinisherResult;
  firstMissing: string[];
}

export interface ScenarioResult {
  ok: boolean;
  missing: { taskId: string; label: string; items: string[] }[];
  errors: string[];
  tasks: TaskEvaluation[];
  units: UnitResult[];
  method: 'exact' | 'monte-carlo' | 'none';
  assumptions: string[];
  illustrative: boolean;
  approximate: boolean;
  impossible: boolean;
}

export function concurrentFor(s: Scenario, task: BuilderTask): boolean {
  if (s.progression === 'sequential') return false;
  if (s.progression === 'simultaneous') return s.tasks.length > 1;
  return s.tasks.filter((t) => t.stage === task.stage).length > 1;
}

export function evaluateScenario(s: Scenario, opts: { forceMonteCarlo?: boolean } = {}): ScenarioResult {
  const tasks = s.tasks.map((t) => evaluateTask(t, concurrentFor(s, t), s));
  const missing = tasks
    .filter((e) => e.missing.length)
    .map((e) => ({ taskId: e.task.id, label: e.task.label || 'Untitled task', items: e.missing }));
  const errors = tasks.filter((e) => e.status === 'invalid').flatMap((e) => e.errors.map((x) => `${e.task.label}: ${x}`));
  if (!(s.deadline > 0)) errors.push('Event deadline must be greater than zero.');
  if (s.tasks.length === 0) errors.push('Add at least one mission.');
  if (s.startSpread < 0) errors.push('Start spread cannot be negative.');
  if (s.completion === 'anyK' && s.progression !== 'sequential') {
    if (s.anyK == null) missing.push({ taskId: 'scenario', label: 'Completion rule', items: ['K for "any K of G"'] });
    else if (s.anyK < 1) errors.push('K must be at least 1.');
  }
  if (s.progression === 'staged') {
    if (s.stages.length === 0) errors.push('Add at least one stage.');
    s.stages.forEach((st, i) => {
      if (st.release < 0) errors.push(`${st.name}: release time cannot be negative.`);
      if (st.deadline != null && st.deadline <= st.release) errors.push(`${st.name}: deadline must be after release.`);
      if (!s.tasks.some((t) => t.stage === i)) errors.push(`${st.name}: no missions assigned.`);
    });
    const shares = s.stages.reduce((a, st) => a + (st.prizeShare ?? 0), 0);
    if (shares > 100.0001) errors.push(`Stage prize shares add up to ${shares}%, above 100%.`);
  }

  const assumptions = scenarioAssumptions(s);
  const illustrative = tasks.some((e) => e.sources.includes('illustrative')) || [s.concurrencySource, s.activeFractionSource, s.startSpreadSource].includes('illustrative');
  const approximate = tasks.some((e) => e.status === 'approximate');
  const impossible = tasks.some((e) => e.status === 'impossible');
  const base: ScenarioResult = { ok: false, missing, errors, tasks, units: [], method: 'none', assumptions, illustrative, approximate, impossible };
  if (missing.length || errors.length) return base;

  const need = (n: number) => (s.completion === 'anyK' && s.progression !== 'sequential' ? Math.min(s.anyK!, n) : n);
  const units: UnitResult[] = [];

  if (s.progression === 'simultaneous' && !opts.forceMonteCarlo) {
    const slots = buildSlots(tasks);
    const k = need(slots.length);
    const spread = s.startSpread;
    const nodes = spread > 0 ? 40 : 1;
    const cdf = (t: number) => {
      let acc = 0;
      for (let i = 0; i < nodes; i++) {
        const start = spread > 0 ? ((i + 0.5) / nodes) * spread : 0;
        acc += t - start < 0 ? 0 : groupCdf(slots, k, t - start);
      }
      return acc / nodes;
    };
    const limit = groupCdf(slots, k, 1e12);
    const dist: Distribution = { method: 'exact', cdf, limit };
    units.push(makeUnit('Whole campaign', [0, s.deadline], dist, s.prizePlaces, s));
    return { ...base, ok: true, units, method: 'exact' };
  }

  const rng = mulberry32(s.seed);
  const N = Math.max(200, Math.min(100_000, Math.floor(s.samples)));

  if (s.progression === 'simultaneous' || s.progression === 'sequential') {
    const slots = buildSlots(tasks);
    const k = need(slots.length);
    const times: number[] = [];
    for (let i = 0; i < N; i++) {
      const start = rng() * s.startSpread;
      times.push(start + sampleGroup(slots, k, s.progression === 'sequential' ? 'sequential' : 'parallel', rng));
    }
    units.push(makeUnit('Whole campaign', [0, s.deadline], empirical(times, N, s.seed), s.prizePlaces, s));
    return { ...base, ok: true, units, method: 'monte-carlo' };
  }

  // Scheduled stages.
  const stageSlots = s.stages.map((_, i) => buildSlots(tasks.filter((e) => e.task.stage === i)));
  const perStage: number[][] = s.stages.map(() => []);
  const overall: number[] = [];
  for (let i = 0; i < N; i++) {
    const start = rng() * s.startSpread;
    let prevDone = start;
    s.stages.forEach((st, si) => {
      const slots = stageSlots[si];
      const tau = sampleGroup(slots, need(slots.length), 'parallel', rng);
      let done: number;
      if (s.stageEntry === 'independent') {
        done = s.stageCarryover === 'reset' ? Math.max(st.release, start) + tau : Math.max(st.release, start + tau);
      } else {
        done = s.stageCarryover === 'reset' ? Math.max(st.release, prevDone) + tau : Math.max(st.release, prevDone, start + tau);
      }
      const stDeadline = st.deadline ?? s.deadline;
      if (done > stDeadline && s.stageEntry === 'gated') done = Infinity;
      perStage[si].push(done);
      prevDone = done;
    });
    overall.push(prevDone);
  }
  if (s.stageEntry === 'independent') {
    s.stages.forEach((st, si) => {
      const places = s.prizePlaces != null && st.prizeShare != null ? Math.floor((s.prizePlaces * st.prizeShare) / 100) : null;
      units.push(makeUnit(st.name, [st.release, st.deadline ?? s.deadline], empirical(perStage[si], N, s.seed), places, s, st.prizeShare == null));
    });
  } else {
    units.push(makeUnit('Whole campaign (all stages)', [0, s.deadline], empirical(overall, N, s.seed), s.prizePlaces, s));
  }
  return { ...base, ok: true, units, method: 'monte-carlo' };
}

function makeUnit(name: string, window: [number, number], dist: Distribution, places: number | null, s: Scenario, shareMissing = false): UnitResult {
  const firstMissing: string[] = [];
  if (s.entrants == null) firstMissing.push('number of entrants M');
  if (s.prizePlaces == null) firstMissing.push('number of prize places K');
  if (shareMissing) firstMissing.push('this stage’s prize share');
  const unit: UnitResult = {
    name,
    window,
    dist,
    pByDeadline: dist.cdf(window[1]),
    median: distQuantile(dist, 0.5),
    p90: distQuantile(dist, 0.9),
    prizePlaces: places,
    firstMissing,
  };
  if (!firstMissing.length && places != null) unit.first = firstFinisher(dist.cdf, s.entrants!, places, window[1]);
  return unit;
}

export function scenarioAssumptions(s: Scenario): string[] {
  const a = ['Players and tasks are modelled as independent; shared-round games (e.g. Aviator) violate this.'];
  if (s.progression !== 'sequential' && s.tasks.length > 1)
    a.push(`Concurrent play keeps ${s.concurrencyFactor}% of solo speed unless a per-task concurrent rate is entered (${sourceText(s.concurrencySource)}).`);
  a.push(`Players are active ${s.activeFraction}% of the time (${sourceText(s.activeFractionSource)}).`);
  a.push(
    s.startSpread > 0
      ? `Players start uniformly within the first ${s.startSpread} minutes (${sourceText(s.startSpreadSource)}).`
      : `All players start at the event start (${sourceText(s.startSpreadSource)}).`,
  );
  if (s.tasks.some((t) => t.type === 'accumulate')) a.push('Accumulated-multiplier tasks use the rough S / (r × μ) planning time, not a distribution.');
  return a;
}

function sourceText(src: InputSource): string {
  return src === 'illustrative' ? 'illustrative assumption' : src === 'measured' ? 'measured' : 'documented';
}

// ---------------------------------------------------------------------------
// First-finisher analysis (independent identical players, ILLUSTRATIVE)
// ---------------------------------------------------------------------------

export interface FirstFinisherResult {
  entrants: number;
  places: number;
  shareNeeded: number;
  expectedFinishers: number;
  pAllClaimed: number;
  pUnclaimed: number;
  finalPrize: { p10: number; median: number; p90: number };
  finalPrizeCdf: (t: number) => number;
  note?: string;
}

/** P(all K prizes claimed by t) = P(Binomial(M, F(t)) >= K). */
export function firstFinisher(F: (t: number) => number, M: number, K: number, deadline: number): FirstFinisherResult {
  const finalPrizeCdf = (t: number) => binomTailGE(K, M, Math.min(1, Math.max(0, F(t))));
  const fD = F(deadline);
  const pAll = finalPrizeCdf(deadline);
  const q = (p: number) => {
    if (finalPrizeCdf(deadline * 64) < p) return Infinity;
    let lo = 0;
    let hi = deadline * 64;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (finalPrizeCdf(mid) >= p) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  return {
    entrants: M,
    places: K,
    shareNeeded: M > 0 ? K / M : Infinity,
    expectedFinishers: M * fD,
    pAllClaimed: pAll,
    pUnclaimed: 1 - pAll,
    finalPrize: { p10: q(0.1), median: q(0.5), p90: q(0.9) },
    finalPrizeCdf,
    note: K > M ? 'More prize places than entrants: some prizes always remain unclaimed.' : K === 0 ? 'No prize places entered.' : undefined,
  };
}
