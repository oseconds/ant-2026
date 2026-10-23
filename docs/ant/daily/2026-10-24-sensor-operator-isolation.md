# Pheromone sensor operator isolation — 2026-10-24

## Question

With the continuous cue, route stations, phases, and query geometry frozen, identify where local steering sign and wide candidate-rank differences first appear inside the sensor path.

## Baseline and reuse

- Fresh production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production source receipts matched the analytic-reference pass for `AntController.js`, `PheromoneField.js`, and `GasterDeposition.js`; this pass changed none of them.
- Reused only the frozen analytic-reference rows from branch `codex/ant-field-analytic-reference-20261023`, commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`. The copied gzip SHA-256 is `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Cohort remains six routes × four phases × 231 stations. No geometry, field, RNG, or movement was regenerated.

## Work and results

- Replayed every local 18-sample vector through the source local formula and recorded both profiles, peaks, strength input/output, coherence, L/C/R, balance numerator/denominator, balance, and steering for both branches.
- Replayed every wide five-by-five vector through the source sample weights and max, then Hill response and the prior deterministic field-only confidence/directional ranking score. Saved each stage for every row.
- Exact local sign disagreements: 549/4,012 non-ambiguous analytic cues (314 clear, 235 weak under the descriptive per-shape median split). Three production values are numerical residues around `−1.2e-15` rad; 546 are stable opposite signs using a predeclared `64 × Number.EPSILON` floor. All 549 first differ in diagnostic raw-side means; profile weighting and two-distance pooling add no sign reversal.
- Local MAE is `0.06505 rad`. For sign disagreements, balance contributes `0.05575 rad` mean absolute steering error versus `0.00186 rad` from strength. Most balance contribution is its numerator difference, not denominator instability.
- Wide strict-unique winner mismatch is 2,378/5,072 (46.88%). Two distinct measures are retained: first full-rank divergence is at raw maxima for 1,931 rows and at production weights + max for 447; production's first departure from the analytic final winner is at raw maxima for 1,380 mismatches (58.0%) and at weights + max for 998 (42.0%). Hill and confidence/directional score create no first divergence in either comparison.
- The tight `p10`, station `0.066` case isolates a weighted-max contribution: pre-weight maxima still select analytic offset `0`, while production weighted max selects `+0.47`. The tight `p00`, station `0.294` case is the strongest raw-stage counterexample: production raw maxima already select `+0.47` against an analytic top margin of `1.81869`.

## Decision

**MIXED; no sensor-only candidate.** Raw representation error is the earliest cause of every local sign disagreement and already puts the production wide winner away from the analytic final winner in a majority of mismatches. Weights + max account for a substantial 42% minority, so their effect is real, but the evidence does not establish a single sensor-wide dominant cause. Return to field representation before considering a sensor change. No movement inference or production behavior change.

## Validation

- New sensor isolation tests: 3/3.
- Existing trail following: 8/8; controller: 21/21; pheromone field: 8/8.
- Focused total: 40/40; analysis/test syntax checks passed.
- No full build: production source was unchanged.

Detailed stage rows and receipts: [evidence package](../evidence/2026-10-24-ant-sensor-operator-isolation/README.md).
