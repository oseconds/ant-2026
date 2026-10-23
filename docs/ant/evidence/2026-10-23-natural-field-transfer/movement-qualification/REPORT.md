# Raw previous-turn displacement feedback — controlled qualification

Date: 2026-10-23 KST  
Baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`  
Protocol: [PROTOCOL.md](PROTOCOL.md)

## Decision

**The candidate does not clear the controlled screen. Stop escalation here.** It changes movement in 35 of 36 paired candidate-versus-`dtFeedback` shape/field/seed cases, but the known deposited-field `gentleMirror`, `tightMirror` and `sCurve` failures remain in seeds 19 and 61. Seed 193 has mixed outcomes: raw feedback improves some route summaries and degrades others. These outcomes do not show a robust repair of the fixed counterexample family.

No natural 600 s run or 66-state replay was started. No production, audio, field, material, renderer or recruitment source was changed.

## Run and source qualification

The fixed family completed all `6 shapes × 2 field modes × 3 seeds × 4 arms = 144` cases. Each case has 180 ticks, one controlled ant, and all per-tick samples. The four arms are production, `dtFeedback`, `dampingOff` and the one preregistered `rawDisplacement` candidate. The existing route fixture/helper and source generator were reused. The three existing arms' generated-controller receipts match the original builder exactly.

The candidate source uses the raw entry angular velocity in `-0.65 × adherence × angularVelocity × dt`. Its `+/-2.2 rad/s` feedback clamp is removed; the `+/-0.45 rad` local-turn clamp and `4.5 rad/s` turn actuator remain. The instrumented candidate records feedback from the generated controller source. Its 6,480 tick records matched the independently computed law to `1e-15`; the raw term differed from the clamped `dtFeedback` term on 3,131 ticks, exactly the 3,131 tick entries with `|previousOmega| > 2.2 rad/s`. Comparing per-tick `x`, `y`, heading and body turn rate at an absolute difference greater than `1e-15` found a difference in 35 of 36 paired candidate/control cases.

The recurrence screen and source guards passed. Focused tests passed 3/3 using direct Node execution. The initial `node --test` wrapper stopped at the environment's `spawn EPERM` before running assertions; direct execution then ran all three tests successfully.

## Metric correction record

The executed runner stored `run.summary`, but the private route-probe helper did not provide that property. The original 144-case run therefore preserved all raw per-tick samples but omitted the per-case summary field. This is an output/summary omission, not a simulation rerun or a changed movement law. The summaries and grouped comparisons in this report were recovered from the preserved samples using the existing `measureSpatialMovement` function, with recorded `turnRate` mapped to its `angularVelocity` input. The derived local-turn transfer was separately reconstructed from those same samples and cross-checked against the feedback trace and unconstrained-turn identity to `1e-15`. No case was rerun or removed. The exact runner that produced `results.json` is preserved at [sources/runner.ant-transfer-feedback.executed.js](sources/runner.ant-transfer-feedback.executed.js); later analysis support is in the current runner and its hash is listed below.

## Full fixed-family summary

The table reports arithmetic means across the three fixed seeds for each cell. These are descriptive summaries only; the individual seed cases remain in [analysis.json](analysis.json), and complete original tick samples remain in [results.json](results.json). Derived per-tick feedback, local steering, unconstrained and clamped local turns, body turn, collision scale and actual travel are retained in [tick-transfer.json](tick-transfer.json). `agreement` is route-turn sign agreement; `cap` is the body turn-cap fraction. A dash means the straight route has no eligible route-turn pairs.

Each arm cell is `route progress / mean absolute cross-track / agreement / cap`.

| Shape | Field | Production | dtFeedback | dampingOff | rawDisplacement |
|---|---|---|---|---|---|
| straight | analytic | 0.2463 / 0.0041 / — / 0.994 | 0.2463 / 0.0011 / — / 0.044 | 0.2463 / 0.0011 / — / 0.006 | 0.2463 / 0.0012 / — / 0.054 |
| straight | deposited96 | 0.2441 / 0.0178 / — / 0.946 | 0.2455 / 0.0069 / — / 0.037 | 0.2455 / 0.0070 / — / 0.043 | 0.2455 / 0.0067 / — / 0.393 |
| gentle | analytic | 0.2039 / 0.0281 / 0.525 / 0.843 | 0.2476 / 0.0016 / 0.654 / 0.052 | 0.2477 / 0.0016 / 0.912 / 0.019 | 0.2473 / 0.0015 / 0.644 / 0.257 |
| gentle | deposited96 | 0.2200 / 0.0176 / 0.534 / 0.891 | 0.2464 / 0.0037 / 0.683 / 0.072 | 0.2465 / 0.0036 / 0.683 / 0.074 | 0.2464 / 0.0037 / 0.600 / 0.078 |
| tight | analytic | 0.1411 / 0.0486 / 0.510 / 0.876 | 0.2523 / 0.0026 / 0.758 / 0.172 | 0.2527 / 0.0027 / 0.976 / 0.046 | 0.2521 / 0.0026 / 0.682 / 0.372 |
| tight | deposited96 | 0.1471 / 0.0463 / 0.523 / 0.865 | 0.2429 / 0.0060 / 0.855 / 0.187 | 0.2430 / 0.0060 / 0.868 / 0.194 | 0.2427 / 0.0060 / 0.808 / 0.194 |
| gentleMirror | analytic | 0.2009 / 0.0325 / 0.505 / 0.881 | 0.2452 / 0.0014 / 0.678 / 0.098 | 0.2452 / 0.0014 / 0.898 / 0.028 | 0.2449 / 0.0015 / 0.557 / 0.300 |
| gentleMirror | deposited96 | 0.1259 / 0.0627 / 0.464 / 0.694 | 0.1297 / 0.0552 / 0.419 / 0.237 | 0.1295 / 0.0552 / 0.443 / 0.237 | 0.1299 / 0.0552 / 0.439 / 0.235 |
| tightMirror | analytic | 0.1241 / 0.0569 / 0.480 / 0.830 | 0.2445 / 0.0013 / 0.672 / 0.285 | 0.2449 / 0.0013 / 0.994 / 0.033 | 0.2438 / 0.0014 / 0.670 / 0.407 |
| tightMirror | deposited96 | 0.0676 / 0.0809 / 0.492 / 0.691 | 0.0978 / 0.0635 / 0.577 / 0.248 | 0.0979 / 0.0634 / 0.607 / 0.250 | 0.0977 / 0.0635 / 0.557 / 0.274 |
| sCurve | analytic | 0.2480 / 0.0327 / 0.501 / 0.876 | 0.2466 / 0.0014 / 0.650 / 0.069 | 0.2466 / 0.0015 / 0.946 / 0.017 | 0.2464 / 0.0015 / 0.555 / 0.300 |
| sCurve | deposited96 | 0.1766 / 0.0356 / 0.503 / 0.802 | 0.1332 / 0.0602 / 0.508 / 0.226 | 0.1334 / 0.0602 / 0.497 / 0.226 | 0.1336 / 0.0600 / 0.507 / 0.248 |

## Fixed deposited-field counterexample family

Below, each arm is `progress / mean absolute cross-track / route-turn agreement / adjacent same-sign turn-pair fraction`. Values are per seed, not pooled trials. The candidate's near-identical seed-19 outcomes and seed-61 high same-sign fractions preserve the prior direction-loss pattern. Seed-193 outcomes are mixed across the three route families.

| Shape | Seed | dtFeedback | rawDisplacement |
|---|---:|---|---|
| gentleMirror | 19 | 0.02935 / 0.07637 / 0.291 / 0.983 | 0.02935 / 0.07637 / 0.291 / 0.983 |
| gentleMirror | 61 | 0.15635 / 0.07401 / 0.430 / 0.978 | 0.15636 / 0.07402 / 0.430 / 0.978 |
| gentleMirror | 193 | 0.20339 / 0.01527 / 0.536 / 0.624 | 0.20393 / 0.01514 / 0.598 / 0.770 |
| tightMirror | 19 | 0.01812 / 0.07932 / 0.542 / 0.983 | 0.01812 / 0.07932 / 0.542 / 0.983 |
| tightMirror | 61 | 0.09231 / 0.09391 / 0.547 / 0.978 | 0.09232 / 0.09391 / 0.547 / 0.978 |
| tightMirror | 193 | 0.18304 / 0.01714 / 0.642 / 0.736 | 0.18260 / 0.01714 / 0.581 / 0.624 |
| sCurve | 19 | 0.03740 / 0.07427 / 0.285 / 0.983 | 0.03740 / 0.07427 / 0.285 / 0.983 |
| sCurve | 61 | 0.10794 / 0.09539 / 0.542 / 0.978 | 0.10795 / 0.09539 / 0.542 / 0.978 |
| sCurve | 193 | 0.25423 / 0.01087 / 0.698 / 0.736 | 0.25535 / 0.01039 / 0.693 / 0.770 |

The `dampingOff` arm is included for all nine seeds and is nearly coincident with `dtFeedback` on the seed-19 and seed-61 failures. The full four-arm values and paired candidate-minus-dt differences are in [analysis.json](analysis.json). Improvements on some seed-193 cases do not clear the fixed family; `tightMirror` seed 193 moves in the opposite direction on progress and route-turn agreement.

## Interpretation and limits

This is a controlled route-tracking screen on synthetic fixed fields. It does not show a correct natural route, a biological curvature sensor, total pheromone contribution, field-representation dominance or the long-run ecological effect of the candidate. The raw term is not a unit repair or an optimal gain. In the stripped fixed-adherence recurrence `deltaTheta[n] = c - 0.65 A deltaTheta[n-1]`, the pole is `-0.65 A`; a sustained cue still settles at `c/(1+0.65 A)`, about 0.606 c at `A=1`. A decaying alternating transient can therefore coexist with substantial persistent-cue attenuation.

## Provenance and verification

- Full per-tick output: [results.json](results.json), SHA-256 `b9a9e75c4c0bcd8506d5ba8d8d5bd4264ac5539f61d6964e338a1be8b21948d2`. The gzip package [results.json.gz](results.json.gz) is 4,516,203 bytes, SHA-256 `b3f5211f44e6278939fd18b142b610c3df2a6048449e059bd1c9fd2a16948453`; decompression was byte-for-byte equal to `results.json`.
- Derived per-case and grouped metrics: [analysis.json](analysis.json), SHA-256 `c934eb8786add9000272b1f551d4059d42a41ea2212208c2b43d17350e16a443`, based on the preserved result hash above. The omitted local-turn output is derived without simulation in [tick-transfer.json](tick-transfer.json), SHA-256 `9e42e53149c7405428a6068c837adcfa947cf1f127d914f9638521e572f75253`, using the fixed `+/-0.45 rad` clamp; its feedback trace and unconstrained-turn identity were checked against the preserved samples to `1e-15`.
- Generated plain controllers, instrumented candidate, helper and core source, and receipts: [sources/](sources/). The exact executed runner snapshot SHA-256 is `6ab73c2f39db61983aa6bf979c8f4813daf5bbb4f5798e92466076a66b057af7`. `analysis.json` records runner hash `f6753e648a42c0c05f070fb4524fe0654857330069353701388cd8e3ebdcc182` at analysis creation; the final post-run analysis/derivation runner is preserved at [sources/runner.ant-transfer-feedback.analysis-final.js](sources/runner.ant-transfer-feedback.analysis-final.js), SHA-256 `1b47e7c620bdcb7b3cfd78a879c7bd4f6342eb983d973086d693f8e5f65ab66f`.
- Production controller SHA-256: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`; route fixture SHA-256: `3562fe3302f797d3a1de5a17b4d3978529c1aef518c88abd110b1f389cfc2db9`; production generator SHA-256: `6573ef627e050f0cdd23279d886f1a8c2adf224fdcf840370fe35db5c051de4b`.
- Source hashes were rechecked after the run and remained unchanged. Focused tests: 3 passed, 0 failed using `node tests/ant-transfer-feedback.test.js`.

The analytical recurrence and feedback bounds are reduced-model facts. The movement metrics are descriptive fixture observations. Nothing here adopts a world law or changes the Gate A decision.
