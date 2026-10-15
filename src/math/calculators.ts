import { binomTailGE, negBinomQuantileAttempts, wilsonInterval } from './binomial';
import { mulberry32, sampleNegBinomAttempts, type Rng } from './rng';

// ---------------------------------------------------------------------------
// Completion-time models shared by the calculator and the campaign builder.
// Times are always in MINUTES.
// ---------------------------------------------------------------------------

export type TimeModel =
  | { kind: 'deterministic'; minutes: number; approximate?: boolean }
  | { kind: 'negbin'; k: number; p: number; rate: number }
  | { kind: 'empirical'; sorted: number[]; samples: number }
  | { kind: 'never' };

/** P(T <= t) for a single task's completion time. */
export function modelCdf(model: TimeModel, t: number): number {
  switch (model.kind) {
    case 'deterministic':
      return t >= model.minutes ? 1 : 0;
    case 'never':
      return 0;
    case 'negbin': {
      if (t < 0) return 0;
      const n = Math.floor(model.rate * t + 1e-9);
      return binomTailGE(model.k, n, model.p);
    }
    case 'empirical': {
      if (model.samples === 0) return 0;
      // Count of sorted finite samples <= t (Infinity = never finished).
      let lo = 0;
      let hi = model.sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (model.sorted[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      return lo / model.samples;
    }
  }
}

export function sampleModel(model: TimeModel, rng: Rng): number {
  switch (model.kind) {
    case 'deterministic':
      return model.minutes;
    case 'never':
      return Infinity;
    case 'negbin':
      return sampleNegBinomAttempts(model.k, model.p, rng) / model.rate;
    case 'empirical': {
      const i = Math.floor(rng() * model.samples);
      return i < model.sorted.length ? model.sorted[i] : Infinity;
    }
  }
}

export function modelQuantile(model: TimeModel, q: number): number {
  switch (model.kind) {
    case 'deterministic':
      return model.minutes;
    case 'never':
      return Infinity;
    case 'negbin':
      return negBinomQuantileAttempts(q, model.k, model.p) / model.rate;
    case 'empirical': {
      const idx = Math.ceil(q * model.samples) - 1;
      return idx < model.sorted.length ? model.sorted[Math.max(0, idx)] : Infinity;
    }
  }
}

// ---------------------------------------------------------------------------
// A. Qualifying-round (or bet) count
// ---------------------------------------------------------------------------

export interface CountInput {
  target: number | null; // N rounds or bets
  rate: number | null; // qualifying ROUNDS per minute
  unit: 'rounds' | 'bets';
  betsPerRound: number | null; // only when unit = bets
  startDelay: number | null; // minutes
  activeFraction: number | null; // 0 < f <= 1, optional
}

export type CalcStatus = 'ok' | 'missing' | 'invalid' | 'impossible' | 'no-progress' | 'complete' | 'deterministic';

export interface CountResult {
  status: CalcStatus;
  messages: string[];
  minutes?: number;
  effectiveRate?: number; // counted units per minute
}

export function calcCount(input: CountInput): CountResult {
  const missing: string[] = [];
  if (input.target == null) missing.push('Target count N');
  if (input.rate == null) missing.push('Qualifying rounds per minute r');
  if (input.unit === 'bets' && input.betsPerRound == null) missing.push('Bets per round');
  if (missing.length) return { status: 'missing', messages: missing.map((m) => `Missing: ${m}`) };
  const N = input.target!;
  const r = input.rate!;
  const b = input.unit === 'bets' ? input.betsPerRound! : 1;
  const delay = input.startDelay ?? 0;
  const f = input.activeFraction ?? 1;
  const errors: string[] = [];
  if (N < 0 || !Number.isFinite(N)) errors.push('Target must be zero or a positive number.');
  if (r < 0 || !Number.isFinite(r)) errors.push('Rate cannot be negative.');
  if (b <= 0 || !Number.isFinite(b)) errors.push('Bets per round must be greater than zero.');
  if (delay < 0) errors.push('Start delay cannot be negative.');
  if (!(f > 0 && f <= 1)) errors.push('Active-play fraction must be above 0% and at most 100%.');
  if (errors.length) return { status: 'invalid', messages: errors };
  if (N === 0) return { status: 'complete', messages: ['Target is 0: already complete.'], minutes: delay };
  const effectiveRate = r * b * f;
  if (effectiveRate === 0) return { status: 'no-progress', messages: ['Rate is 0: no progress is made.'] };
  return { status: 'ok', messages: [], minutes: delay + N / effectiveRate, effectiveRate };
}

// ---------------------------------------------------------------------------
// B. Repeated qualifying multiplier
// ---------------------------------------------------------------------------

export type ProbabilitySource = 'measured' | 'documented' | 'illustrative';

export interface MultiplierInput {
  threshold: number | null;
  condition: 'gte' | 'eq';
  k: number | null; // required successes
  p: number | null; // DECIMAL probability per independent attempt
  rate: number | null; // attempts per minute
  deadline: number | null; // minutes
  /** Can the selected game configuration produce the threshold at all? */
  canProduce: 'yes' | 'no' | 'unknown';
}

export interface MultiplierResult {
  status: CalcStatus;
  messages: string[];
  model?: TimeModel;
  attemptsByDeadline?: number;
  meanAttempts?: number;
  meanMinutes?: number;
  medianMinutes?: number;
  p90Minutes?: number;
  pByDeadline?: number;
}

export function calcMultiplier(input: MultiplierInput): MultiplierResult {
  const missing: string[] = [];
  if (input.k == null) missing.push('Required successes k');
  if (input.p == null) missing.push('Qualifying probability per attempt p');
  if (input.rate == null) missing.push('Attempts per minute r');
  if (input.deadline == null) missing.push('Time limit t');
  if (missing.length) return { status: 'missing', messages: missing.map((m) => `Missing: ${m}`) };
  const k = input.k!;
  const p = input.p!;
  const r = input.rate!;
  const t = input.deadline!;
  const errors: string[] = [];
  if (!Number.isInteger(k) || k < 0) errors.push('Required successes must be a whole number of 0 or more.');
  if (!(p >= 0 && p <= 1)) errors.push('Probability must be between 0 and 1 as a decimal (0% to 100%).');
  if (r < 0 || !Number.isFinite(r)) errors.push('Attempts per minute cannot be negative.');
  if (t < 0 || !Number.isFinite(t)) errors.push('Time limit cannot be negative.');
  if (input.threshold != null && input.threshold < 0) errors.push('Threshold multiplier cannot be negative.');
  if (errors.length) return { status: 'invalid', messages: errors };

  if (k === 0) {
    return {
      status: 'complete',
      messages: ['k = 0: the mission is already complete.'],
      model: { kind: 'deterministic', minutes: 0 },
      pByDeadline: 1,
      meanMinutes: 0,
      medianMinutes: 0,
      p90Minutes: 0,
      meanAttempts: 0,
    };
  }
  if (input.canProduce === 'no') {
    return {
      status: 'impossible',
      messages: ['The selected game configuration cannot produce this threshold, so the mission cannot be completed.'],
      model: { kind: 'never' },
      pByDeadline: 0,
    };
  }
  if (p === 0) {
    return {
      status: 'impossible',
      messages: ['p = 0 with k > 0: the mission is impossible.'],
      model: { kind: 'never' },
      pByDeadline: 0,
    };
  }
  if (r === 0) {
    return { status: 'no-progress', messages: ['r = 0: no attempts are made, so no progress.'], model: { kind: 'never' }, pByDeadline: 0 };
  }
  const n = Math.floor(r * t + 1e-9);
  const model: TimeModel = { kind: 'negbin', k, p, rate: r };
  const res: MultiplierResult = {
    status: p === 1 ? 'deterministic' : 'ok',
    messages: p === 1 ? ['p = 1: every attempt qualifies, so completion is deterministic at k / r.'] : [],
    model,
    attemptsByDeadline: n,
    meanAttempts: k / p,
    meanMinutes: k / (r * p),
    medianMinutes: negBinomQuantileAttempts(0.5, k, p) / r,
    p90Minutes: negBinomQuantileAttempts(0.9, k, p) / r,
    pByDeadline: binomTailGE(k, n, p),
  };
  return res;
}

// ---------------------------------------------------------------------------
// C. Accumulated multipliers
// ---------------------------------------------------------------------------

export interface Outcome {
  value: number; // settled multiplier (payout / stake)
  prob: number; // decimal
}

export interface AccumulateDefinition {
  includesStake: boolean; // payout includes returned stake
  countBelowOne: boolean; // returns below 1× count toward the sum
  losingZero: boolean; // losing bets contribute zero
  betsSeparate: boolean; // multiple bets in one round count separately
  excludeVoid: boolean; // void/refunded bets excluded
}

export const DEFAULT_DEFINITION: AccumulateDefinition = {
  includesStake: true,
  countBelowOne: true,
  losingZero: true,
  betsSeparate: true,
  excludeVoid: true,
};

export interface AccumulateInput {
  target: number | null; // S
  rate: number | null; // qualifying rounds per minute
  mode: 'mean' | 'distribution';
  mu: number | null; // average counted contribution per round
  outcomes: Outcome[];
  cap: number | null; // max contribution per round
  definition: AccumulateDefinition;
  deadline: number | null;
  samples: number;
  seed: number;
}

export interface AccumulateResult {
  status: CalcStatus;
  messages: string[];
  approximate?: boolean;
  model?: TimeModel;
  planningMinutes?: number; // mean-only approximation
  // simulation outputs
  samples?: number;
  seed?: number;
  meanMinutes?: number;
  meanSE?: number;
  medianMinutes?: number;
  p90Minutes?: number;
  pByDeadline?: number;
  pByDeadlineCI?: [number, number];
  unfinished?: number;
  meanContribution?: number;
}

export function parseOutcomes(text: string): { outcomes: Outcome[]; errors: string[] } {
  const outcomes: Outcome[] = [];
  const errors: string[] = [];
  text
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const m = /^(-?[\d.]+)\s*×?\s*[:,=\s]\s*(-?[\d.]+)\s*(%?)$/.exec(line);
      if (!m) {
        errors.push(`Line ${i + 1}: use "multiplier: probability", e.g. "2: 25%".`);
        return;
      }
      const value = Number(m[1]);
      const prob = m[3] === '%' ? Number(m[2]) / 100 : Number(m[2]);
      if (!(value >= 0)) errors.push(`Line ${i + 1}: multiplier must be 0 or more.`);
      if (!(prob >= 0 && prob <= 1)) errors.push(`Line ${i + 1}: probability must be between 0 and 1 (or 0%–100%).`);
      outcomes.push({ value, prob });
    });
  return { outcomes, errors };
}

export function countedContribution(value: number, def: AccumulateDefinition, cap: number | null): number {
  let v = value;
  if (!def.includesStake) v = Math.max(0, v - 1); // net win only
  if (!def.countBelowOne && value < 1) v = 0;
  if (def.losingZero && value === 0) v = 0;
  if (cap != null) v = Math.min(v, cap);
  return v;
}

export function calcAccumulate(input: AccumulateInput): AccumulateResult {
  const missing: string[] = [];
  if (input.target == null) missing.push('Target sum S');
  if (input.rate == null) missing.push('Qualifying rounds per minute r');
  if (input.mode === 'mean' && input.mu == null) missing.push('Average counted contribution μ');
  if (input.mode === 'distribution' && input.outcomes.length === 0) missing.push('Outcome distribution');
  if (missing.length) return { status: 'missing', messages: missing.map((m) => `Missing: ${m}`) };
  const S = input.target!;
  const r = input.rate!;
  const errors: string[] = [];
  if (S < 0) errors.push('Target sum cannot be negative.');
  if (r < 0) errors.push('Rate cannot be negative.');
  if (input.cap != null && input.cap <= 0) errors.push('Contribution cap must be greater than zero.');
  if (input.mode === 'mean' && input.mu! < 0) errors.push('Average contribution cannot be negative.');
  if (input.mode === 'distribution') {
    const total = input.outcomes.reduce((s, o) => s + o.prob, 0);
    if (Math.abs(total - 1) > 1e-6) errors.push(`Outcome probabilities sum to ${(total * 100).toFixed(4)}%, not 100%.`);
    if (input.outcomes.some((o) => !(o.prob >= 0 && o.prob <= 1) || !(o.value >= 0))) errors.push('Each outcome needs a value ≥ 0 and a probability between 0 and 1.');
  }
  if (input.deadline != null && input.deadline < 0) errors.push('Deadline cannot be negative.');
  if (errors.length) return { status: 'invalid', messages: errors };
  if (S === 0) return { status: 'complete', messages: ['S = 0: already complete.'], model: { kind: 'deterministic', minutes: 0 }, pByDeadline: 1 };
  if (r === 0) return { status: 'no-progress', messages: ['r = 0: no progress.'], model: { kind: 'never' }, pByDeadline: 0 };

  if (input.mode === 'mean') {
    const mu = input.mu!;
    if (mu === 0) return { status: 'impossible', messages: ['μ = 0: the sum never grows.'], model: { kind: 'never' }, pByDeadline: 0 };
    const minutes = S / (r * mu);
    return {
      status: 'ok',
      approximate: true,
      messages: [
        'Rough planning approximation only: S / (r × μ). This is not the exact expected threshold-crossing time, and no percentiles can be derived from the mean alone.',
      ],
      planningMinutes: minutes,
      model: { kind: 'deterministic', minutes, approximate: true },
    };
  }

  // Full distribution: reproducible simulation.
  const contributions = input.outcomes.map((o) => ({ c: countedContribution(o.value, input.definition, input.cap), p: o.prob }));
  const meanContribution = contributions.reduce((s, o) => s + o.c * o.p, 0);
  if (meanContribution === 0) {
    return { status: 'impossible', messages: ['No outcome contributes to the sum under this definition.'], model: { kind: 'never' }, pByDeadline: 0, meanContribution };
  }
  const cum: number[] = [];
  let acc = 0;
  for (const o of contributions) {
    acc += o.p;
    cum.push(acc);
  }
  const rng = mulberry32(input.seed);
  const samples = Math.max(100, Math.min(200_000, Math.floor(input.samples)));
  const maxRounds = Math.max(10_000, Math.ceil((S / meanContribution) * 50));
  const times: number[] = [];
  let unfinished = 0;
  for (let s = 0; s < samples; s++) {
    let sum = 0;
    let rounds = 0;
    while (sum < S && rounds < maxRounds) {
      const u = rng() * acc;
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < u) lo = mid + 1;
        else hi = mid;
      }
      sum += contributions[lo].c;
      rounds += 1;
    }
    if (sum >= S) times.push(rounds / r);
    else unfinished += 1;
  }
  times.sort((a, b) => a - b);
  const finite = times.length;
  const mean = finite ? times.reduce((a, b) => a + b, 0) / finite : NaN;
  const variance = finite > 1 ? times.reduce((a, b) => a + (b - mean) ** 2, 0) / (finite - 1) : NaN;
  const model: TimeModel = { kind: 'empirical', sorted: times, samples };
  const res: AccumulateResult = {
    status: 'ok',
    messages: [`Simulated ${samples.toLocaleString('en-US')} players with seed ${input.seed}.`],
    model,
    samples,
    seed: input.seed,
    meanMinutes: mean,
    meanSE: Math.sqrt(variance / finite),
    medianMinutes: modelQuantile(model, 0.5),
    p90Minutes: modelQuantile(model, 0.9),
    unfinished,
    meanContribution,
  };
  if (input.deadline != null) {
    const done = times.filter((x) => x <= input.deadline!).length;
    res.pByDeadline = done / samples;
    res.pByDeadlineCI = wilsonInterval(done, samples);
  }
  if (unfinished) res.messages.push(`${unfinished} simulated players did not reach S within ${maxRounds.toLocaleString('en-US')} rounds.`);
  return res;
}

/** Points for a completion-probability curve. */
export function curvePoints(model: TimeModel, horizon: number, steps = 160): { t: number; y: number }[] {
  const pts: { t: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (horizon * i) / steps;
    pts.push({ t, y: modelCdf(model, t) });
  }
  return pts;
}
