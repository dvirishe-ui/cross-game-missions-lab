# Cross-Game Missions Lab

Two internal SPRIBE pages for cross-game promotions (Aviator, Pilot Chicken, Plinko, Mines, Goal, Keno, Keno 80, Trader):

- **Missions Simulator** (`index.html`): pick a day from the last campaign or build missions, then simulate a few hundred versions of the day to see when the 50th winner finishes, which mission holds players back, and how this compares with the real Day 1–7 results. Includes estimated multiplier chances for every game and all supporting information in folded sections.
- **Research brief** (`brief.html`): a short page with takeaways, our last campaign and competitor missions, each linked to its source.

### How multiplier chances are estimated

No official SPRIBE paytables were available, so chances come from game mechanics:

- Aviator: shared crash rounds, P(round reaches X×) = RTP / X, and every player in a round sees the same result.
- Pilot Chicken, Mines, Goal, Trader: the player chooses when to cash out, so aiming for X× succeeds about RTP / X of the time.
- Keno, Plinko: fixed paytables, so RTP / X is only a best-case ceiling; the real chance is editable.
- RTP 97% is reported for Aviator and Pilot Chicken; it is an assumption for the other games.
- One speed factor is fitted so simulated last-prize times match the reported Days 1–5 and 7.

## Run

```bash
npm install
npm run dev            # simulator at /, brief at /brief.html
npm test               # math, data and CSV tests (vitest)
npm run build          # typecheck + production build
npm run build:single   # self-contained HTML files for both pages in dist-single/
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
| `src/sim/` | Simulator: game chance model, agent-based engine, calibration, Day 6 Keno check, page. |
| `src/brief/` | Research brief page. |

## Modelling notes

- Times are minutes from the scheduled event start; probabilities are entered as % and stored as decimals.
- `P(finish by t) = P(Binomial(⌊r·t⌋, p) ≥ k)`; quantiles use total attempts = failures before the k-th success + k.
- Simultaneous campaigns are evaluated exactly under independence; sequential and staged campaigns use a seeded Monte Carlo simulation.
- First-finisher analysis: `P(all K prizes claimed by t) = P(Binomial(M, F(t)) ≥ K)`. It assumes independent identical players and is **illustrative**: shared Aviator rounds correlate players' outcomes.
- Simulated and calculated outputs are model results, not actual SPRIBE performance.

Saved scenarios, observations and checklists are stored in the browser's `localStorage` only.
