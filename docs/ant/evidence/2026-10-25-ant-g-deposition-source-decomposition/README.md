# Candidate G deposition-source decomposition

## Decision

**REINFORCEMENT-DOMINATED EXCESS.** Across all three frozen seeds, G's scale-normalized movement-chunk dose exceeded C's. The adherence-reinforcement component accounted for `8,545.750` of the `8,552.209` pooled excess (`99.924%` signed share); the baseline component added only `6.459` pooled and was negative in seed `20261005`. Reinforcement dose per travelled distance also rose in all three G runs. This is source accounting on each arm's own natural trajectory, not an independent causal mediation result.

The same 600-second runs retained the earlier occupancy pattern: from 120 seconds onward G had lower cumulative coverage and a higher cumulative top-10% occupancy share than C in all three seeds. The timing is descriptive co-occurrence. It does not show that reinforcement alone caused the occupancy concentration.

## Source law and method

The pinned production law is:

```text
baselineMultiplier = 0.5 × (0.75 + 0.25 × E)
reinforcementMultiplier = 5 × A²
depositionMultiplier = baselineMultiplier + reinforcementMultiplier
chunkDose = actualTravelledDistance × 4.5 × depositionMultiplier
```

`E` is the already computed `localTrail.strength`; `A` is `trailAdherence` after the current tick's `updateIntention()`. Actual travel is the post-collision distance passed to `GasterDeposition.advance()`. G multiplies emitted writer amounts by `S = 3969/361 = 10.994459833795014`. The observer reports both G's scaled field request and the chunk dose divided by `S` on G's unchanged trajectory.

The previous raw archive did not contain paired per-chunk travel, `E`, and `A`, so it could not recover the two requested-dose components. The observer reran the existing movement-shadow runner without changing its simulation path. It reads those values at the existing controller/deposition call boundary and calls each original method once. Deferred dabs are decomposed by the movement chunks that accrued them; a later emitted dab is not assigned the later tick's `E/A`.

## Pooled 600-second source accounting

All doses below are requested amounts in the temporary legacy node-sum convention. G's normalized values are `G_scaled/S` on G's actual trajectory.

| Arm | Baseline | Reinforcement | Total | Reinforcement share | Baseline / reinforcement per travelled unit |
| --- | ---: | ---: | ---: | ---: | ---: |
| C | 3,864.949 | 12,344.061 | 16,209.010 | 76.16% | 2.070 / 6.610 |
| F | 1,400.297 | 0.013 | 1,400.310 | 0.0009% | 1.688 / 0.000015 |
| G, normalized | 3,871.408 | 20,889.811 | 24,761.219 | 84.37% | 2.118 / 11.428 |

| G normalized minus C | Baseline | Reinforcement | Total |
| --- | ---: | ---: | ---: |
| Pooled difference | +6.459 | +8,545.750 | +8,552.209 |
| Signed share of total difference | +0.0755% | +99.9245% | 100% |

The prior emitted-writer statistic reproduces: C requested `16,207.513619`; G requested `272,210.081940`, or `24,758.840912` after dividing by `S`, a ratio of `1.527615×` C. The chunk ledger includes dabs still pending at the 600-second boundary: `1.496164` unscaled for C and `2.378276` unscaled for G. Including those accrued chunks gives the decomposition above (`1.527621×`). The pending carry is part of the chunk-source accounting, while emitted field requests remain a separate writer statistic.

### Per-seed totals

G rows show its scale-normalized source terms. Per-travel columns are dose per actual normalized-world distance.

| Seed | Arm | Baseline | Reinforcement | Total | Reinforcement share | Baseline / reinforcement per travel |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | C | 1,307.219 | 4,161.681 | 5,468.900 | 76.10% | 2.072 / 6.597 |
| 20261005 | F | 460.654 | 0.004 | 460.658 | 0.0009% | 1.688 / 0.000015 |
| 20261005 | G, normalized | 1,274.721 | 6,782.881 | 8,057.602 | 84.18% | 2.114 / 11.247 |
| 20261006 | C | 1,275.759 | 3,966.083 | 5,241.842 | 75.66% | 2.059 / 6.402 |
| 20261006 | F | 463.709 | 0.003 | 463.712 | 0.0007% | 1.688 / 0.000012 |
| 20261006 | G, normalized | 1,303.786 | 7,246.978 | 8,550.763 | 84.75% | 2.124 / 11.808 |
| 20261007 | C | 1,281.971 | 4,216.297 | 5,498.268 | 76.68% | 2.077 / 6.833 |
| 20261007 | F | 475.934 | 0.005 | 475.940 | 0.0011% | 1.688 / 0.000019 |
| 20261007 | G, normalized | 1,292.902 | 6,859.952 | 8,152.854 | 84.14% | 2.116 / 11.226 |

For `G_normalized − C`, the seed-level baseline/reinforcement/total differences were:

| Seed | Baseline delta | Reinforcement delta | Total delta | Baseline / reinforcement signed share |
| --- | ---: | ---: | ---: | ---: |
| 20261005 | −32.498 | +2,621.200 | +2,588.702 | −1.26% / 101.26% |
| 20261006 | +28.026 | +3,280.895 | +3,308.921 | +0.85% / 99.15% |
| 20261007 | +10.930 | +2,643.655 | +2,654.586 | +0.41% / 99.59% |

The baseline component's total sign varied by seed. Reinforcement increased in the same direction in all three, and G's total travelled distance was about `2.1%` lower than C pooled. Reinforcement dose per distance nevertheless rose from `6.610` to `11.428` pooled, while baseline dose per distance moved only from `2.070` to `2.118`. The total-dose excess therefore does not come from G travelling farther.

## Time and feedback alignment

The table gives cumulative G-normalized minus C source-dose differences at the preregistered checkpoints. Reinforcement is already the larger difference at 30 seconds and continues widening. Baseline remains small and changes direction over time and across seeds.

| Seconds | Baseline delta | Reinforcement delta | Total delta |
| ---: | ---: | ---: | ---: |
| 30 | +5.391 | +113.839 | +119.230 |
| 60 | +5.332 | +372.218 | +377.550 |
| 120 | +10.635 | +1,243.733 | +1,254.368 |
| 300 | +4.142 | +4,083.283 | +4,087.426 |
| 600 | +6.459 | +8,545.750 | +8,552.209 |

At 600 seconds, G's mean `E/A/A²` and far Hill response were higher than C in every seed:

| Seed | Arm | Mean E | Mean A | Mean A² | Mean far Hill |
| --- | --- | ---: | ---: | ---: | ---: |
| 20261005 | C | 0.711 | 0.487 | 0.287 | 0.512 |
| 20261005 | G | 0.772 | 0.651 | 0.482 | 0.655 |
| 20261006 | C | 0.687 | 0.476 | 0.279 | 0.487 |
| 20261006 | G | 0.792 | 0.672 | 0.505 | 0.671 |
| 20261007 | C | 0.716 | 0.498 | 0.299 | 0.509 |
| 20261007 | G | 0.781 | 0.657 | 0.486 | 0.665 |

The frozen descriptive adherence bin is `A ≥ 0.75`, the upper ten of the existing forty equal bins over `[0,1]`. Across seeds, this range accounted for:

| Arm | Share of travelled distance at A ≥ 0.75 | Share of reinforcement dose at A ≥ 0.75 |
| --- | ---: | ---: |
| C | 11.70–13.25% | 28.55–30.36% |
| F | 0% | 0% |
| G | 42.75–46.39% | 64.72–68.13% |

G's high-adherence reinforcement share was already `48.9–56.8%` at 30 seconds, when high-A travel was `10.4–15.1%`. The full 40-bin E, A, A², travel-by-A and component-dose-by-A data are preserved per second in `data/*-source-accounting.json.gz`.

At the 600-second checkpoint, cumulative occupancy moved with this source shift in all seeds: G coverage was `0.749–0.826` versus C `0.897–0.942`; G's cumulative top-10% occupancy share was `0.416–0.419` versus C `0.373–0.384`. From 120 seconds onward, each seed had lower G cumulative coverage and a higher G top-10% share than C. At 30/60 seconds seed `20261007` is an early exception, so the relation is not uniform from the first interval. These are aligned outcomes of runs whose feedback-driven trajectories diverge; they do not isolate occupancy as an effect of reinforcement alone.

## Validation and claim boundary

- The pinned production expression and the exact observer accounting boundary are detailed in [SOURCE-LAW-RECEIPT.md](SOURCE-LAW-RECEIPT.md).
- Complete per-seed, per-arm checkpoint values and the one-second source series are in [data/SUMMARY.json](data/SUMMARY.json) and the nine compressed `data/*-source-accounting.json.gz` files.
- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; it is an ancestor of the research branch.
- New branch point: movement-shadow tip `6c44253f7f1d6bb99653afe791bf257577a94e78`.
- Preregistration was committed before outcome collection as `2526facfcf0feb4287964769c205123d1189109c`.
- The prior movement `SUMMARY.json`, `SHA256SUMS.json`, and every file named by that manifest passed SHA verification. The observer rerun reproduced all nine saved arm summaries, all nine raw archive bytes, and all 45 checkpoint map bytes exactly.
- C/F/G observer-on/off checks matched state fingerprints and RNG counts every tick for 120 ticks in each arm. Full runs recorded zero source-rate mismatches and zero missing E/A links.
- Across nine runs, maximum source-dose closure residual was `6.82e-11`; all residuals were within the operation-count-derived IEEE-754 bound. There were zero saturation losses.
- The second full replay produced byte-identical one-second source-accounting files. Scientific summary serialization and each one-second gzip artifact were regenerated twice with identical SHA-256.
- Production `src/` and canonical `docs/ant/README.md` are unchanged. Focused tests and replay details are in [VALIDATION-RECEIPT.json](VALIDATION-RECEIPT.json).

## Reproduction

From the repository root, `node scripts/ant-g-deposition-source-decomposition.js --selfcheck` runs the formula and 120-tick observer parity checks. To regenerate the complete three-seed, three-arm replay and evidence, pass two new empty directories: `node scripts/ant-g-deposition-source-decomposition.js --run-output=<empty-temp-run-dir> --evidence-output=<empty-temp-evidence-dir>`. The full replay is 9 × 600 simulated seconds. Compare the generated `SUMMARY.json` and nine gzip SHA-256 values with `data/DETERMINISM-RECEIPT.json`; the archived parent-run parity hashes are checked by the runner.

This supports the bounded finding that the G-versus-C scale-normalized requested-dose excess in these runs is overwhelmingly in the existing adherence-reinforcement source term. It does not show that the production reinforcement law is wrong, that reinforcement independently caused occupancy concentration, or what gain or physical dose unit should replace it. The current `MIXED / HOLD` movement-shadow decision is unchanged.

The smallest justified next pass is one preregistered research-only test of the G representation-unit interaction with the existing reinforcement feedback. It must define the source-unit contract before testing and must not choose a gain by fitting these results. This pass made no such intervention.
