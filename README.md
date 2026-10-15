# Cross-Game Missions Lab

Internal SPRIBE research tool for cross-game promotions (Aviator, Pilot Chicken, Plinko, Mines, Goal, Keno, Keno 80, Trader). It lets product and promotions teams:

1. Review the previous seven-day campaign (original mission wording, internal-observation outcomes, day comparison).
2. Inspect published competitor missions, each linked to its source.
3. Calculate single-mission completion time and probability (round count, repeated multiplier, accumulated multipliers).
4. Build campaigns (simultaneous, sequential, scheduled stages; all / any K of G; alternative routes) and estimate **individual completion time** and **final-prize time** (the K-th valid finisher) against the scheduled five-hour window.
5. Compare proposed formats and see exactly which internal data is still missing.

No SPRIBE game probabilities or round speeds are included. Unknown parameters stay blank and block results until supplied.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # math, data and CSV tests (vitest)
npm run build          # typecheck + production build
npm run build:single   # one self-contained HTML file in dist-single/
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/data/` | Source datasets: previous campaign (verbatim), competitor research with source URLs, games, evidence labels. |
| `src/math/binomial.ts` | Log-space binomial tail, negative-binomial quantiles (total-attempts convention), required-p solver, Wilson interval. |
| `src/math/calculators.ts` | Mission calculators A/B/C with validation and edge cases; seeded simulation for accumulated multipliers. |
| `src/math/campaign.ts` | Scenario model, task combination (max / sum / K-th / routes / stages), exact and Monte Carlo evaluation, first-finisher model. |
| `src/math/csv.ts`, `telemetry.ts` | CSV export, telemetry template, validated import, data-supported analyses. |
| `src/state/scenarios.ts` | Defaults, presets (Clone Day 6/7, experiments, competitor adaptations), JSON import/export, local persistence. |
| `src/sections/`, `src/components/` | Presentation only. |

## Modelling notes

- Times are minutes from the scheduled event start; probabilities are entered as % and stored as decimals.
- `P(finish by t) = P(Binomial(⌊r·t⌋, p) ≥ k)`; quantiles use total attempts = failures before the k-th success + k.
- Simultaneous campaigns are evaluated exactly under independence; sequential and staged campaigns use a seeded Monte Carlo simulation.
- First-finisher analysis: `P(all K prizes claimed by t) = P(Binomial(M, F(t)) ≥ K)`. It assumes independent identical players and is **illustrative**: shared Aviator rounds correlate players' outcomes.
- Simulated and calculated outputs are model results, not actual SPRIBE performance.

Saved scenarios, observations and checklists are stored in the browser's `localStorage` only.
