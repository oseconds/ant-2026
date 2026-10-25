# Candidate G adherence-reinforcement ablation

**Decision: REINFORCEMENT NOT SUFFICIENT TO EXPLAIN CONCENTRATION.** The 316-grid G world remained spatially concentrated after its `5 × A²` deposition term was removed. At 600 s, G-R0 had a higher cumulative top-10% occupancy share in all three seeds, and lower corrected recent-30 s coverage and entropy in all three. The ablation changed dose, trail response, recruitment, and trajectories; this does not show that reinforcement has no causal effects on those outcomes.

## Question and boundary

This research-only pair tests whether the intact adherence-based deposition reinforcement is necessary for the repeated G cumulative-occupancy concentration pattern. It changes only `reinforcementGain` from 5 to 0 after ordinary initialization and before tick 1. The production baseline term remains `0.5 × (0.75 + 0.25 × E)`. G representation, `3969/361` dose scale, Gaussian writer, bilinear reader, sensing, Hill response, steering, exploration, recruitment, gait, collision, SurfaceField, and material rules stay fixed.

This is a closed-loop ablation. It cannot separate adherence dependence from the substantial reduction in total pheromone dose. It is not a dose-matched control or a proposed deposition law.

## Provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch point: `a4bed839b2775e774e075324c176213ccbae6dae`, from `codex/ant-g-deposition-source-decomposition-20261025`.
- Preregistration: commit `f53a127bbf7408a8235f1468d8fc223b6592ad75`; see [PREREGISTRATION.md](PREREGISTRATION.md).
- Occupancy-observer correction: commit `8a812529cd210e5d5806575f0f31701f4c42f400`.
- Parent G movement-shadow result: `codex/ant-316-gaussian-dose-unit-movement-shadow-20261024`, commit `6c44253f7f1d6bb99653afe791bf257577a94e78`.
- Parent source decomposition: `codex/ant-g-deposition-source-decomposition-20261025`, commit `a4bed839b2775e774e075324c176213ccbae6dae`.
- Parent data manifests and summary hashes are pinned in `data/SOURCE-LAW-RECEIPT.json` and `data/VALIDATION.json`.

The parent G raw timelines and checkpoint maps are reused from [the movement-shadow evidence package](../2026-10-24-ant-316-gaussian-dose-unit-movement-shadow/); they are not duplicated here. This pass stores new G/G-R0 source ledgers and all G-R0 timelines/maps.

Current-source hashes include `AntController.js` `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04` and `GasterDeposition.js` `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41`. The complete production-source hash set is in the source-law receipt. Production `src/` and `docs/ant/README.md` are unchanged.

## Protocol and manipulation checks

Seeds were `20261005`, `20261006`, and `20261007`; each arm ran 600 simulated seconds at 60 Hz with natural recruitment, no warm-up trail or forced events, and Audio Off. Checkpoints are 30, 60, 120, 300, and 600 s. Same seed establishes the same initial conditions only; later field-dependent trajectory and RNG divergence is expected.

G reproduced the parent result exactly for all three seeds: normalized result, raw timeline, checkpoint maps, and source-dose totals/checkpoints. Initial state fingerprints matched after normalizing only the declared gain field. Each seed passed 120-tick observer-on/off parity for G and G-R0; the observer added zero RNG calls. G-R0 retained grid width 316 and G scale, set gain to exactly zero, kept the baseline expression, and recorded exactly zero reinforcement requested dose. Source mismatch and missing E/A state counts were zero. Chunk source-dose closure was within each run's derived floating-point bound, including deferred dab carry.

The prior movement runner did not reset its one-second occupancy buffer. Its recent-30 s coverage/entropy fields are invalid and were not reused. [MEASUREMENT-ADDENDUM.md](MEASUREMENT-ADDENDUM.md) records the issue. This pass adds a passive 60 Hz observer that starts a fresh one-second bucket, rolls 30 buckets, and exactly reproduces the existing cumulative coverage, top-10 share, and entropy at each checkpoint. To preserve exact parent reproduction, G's original checkpoint maps remain byte-identical and retain the invalid legacy recent arrays. G-R0 checkpoint maps carry corrected cumulative/recent arrays. Correct recent arrays for **both** arms are retained in `correctedOccupancyCheckpoints` in `data/SUMMARY.json` and in each source-accounting gzip's `occupancyCheckpoints`; `CHECKPOINTS.csv` uses these corrected values.

The two full paired replays generated identical 27-file data manifests: `18389a5930064cc96d75348debed8427cb0c24553880c96259af5d2d13a034e7`. See [DETERMINISM-RECEIPT.json](DETERMINISM-RECEIPT.json). Focused tests: 4 passed. Runner syntax and `--selfcheck` passed. Full suite/build and browser soak were not run because production/runtime source was unchanged.

## Deposition source accounting

Values below are unscaled requested dose by movement chunk. G's actual field input is the `scaled` total in the source records; G-R0 uses the same representation scale. Source attribution uses the current post-intention `E` and `A` when each movement chunk is accrued, not later emitted dabs.

| Seed | Arm | Baseline | Reinforcement | Total | Reinforcement share | Mean E | Mean A | Mean A² | Far Hill mean | A≥0.75 travel share | A≥0.75 reinforcement-dose share |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | G | 1,274.721 | 6,782.881 | 8,057.602 | 84.18% | .772 | .651 | .482 | .655 | 43.05% | 65.35% |
| 20261005 | G-R0 | 884.747 | 0 | 884.747 | 0% | .478 | .397 | .213 | .223 | 5.98% | — |
| 20261006 | G | 1,303.786 | 7,246.978 | 8,550.763 | 84.75% | .792 | .672 | .505 | .671 | 46.39% | 68.13% |
| 20261006 | G-R0 | 814.579 | 0 | 814.579 | 0% | .445 | .376 | .193 | .201 | 4.39% | — |
| 20261007 | G | 1,292.902 | 6,859.952 | 8,152.854 | 84.14% | .781 | .657 | .486 | .665 | 42.75% | 64.72% |
| 20261007 | G-R0 | 840.554 | 0 | 840.554 | 0% | .511 | .412 | .224 | .246 | 6.01% | — |
| **Pooled** | **G** | **3,871.408** | **20,889.811** | **24,761.219** | **84.36%** | — | — | — | — | **44.06%** | **66.07%** |
| **Pooled** | **G-R0** | **2,539.879** | **0** | **2,539.879** | **0%** | — | — | — | — | **5.46%** | — |

Pooled G scaled field input was `272,236.230`; G-R0 was `27,924.601`. Their normalized accrued totals differ by `22,221.340`, but this comparison includes both the removed term and trajectory-mediated changes in baseline E and travel. G-R0's baseline component also fell in each seed. No component was compensated elsewhere.

## Movement and concentration at 600 s

| Seed | Arm | Travel | Travel / active-ant-s | Final population | Cumulative coverage | Cumulative top-10 share | Recent-30 s coverage | Recent-30 s entropy | Blocked fraction | Max node | Cap touch/loss |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20261005 | G | 603.098 | .05551 | 19 | .81958 | .41805 | .34668 | .81240 | .01452 | 2.3444 | 0 / 0 |
| 20261005 | G-R0 | 456.122 | .05833 | 11 | .86499 | .56025 | .22803 | .76836 | .02633 | .3508 | 0 / 0 |
| 20261006 | G | 613.718 | .05499 | 22 | .74902 | .41606 | .36743 | .82898 | .01354 | 2.0490 | 0 / 0 |
| 20261006 | G-R0 | 425.306 | .05679 | 13 | .87891 | .52477 | .24268 | .76935 | .03571 | .3179 | 0 / 0 |
| 20261007 | G | 611.080 | .05519 | 21 | .82568 | .41850 | .36865 | .82600 | .01537 | 2.1944 | 0 / 0 |
| 20261007 | G-R0 | 431.155 | .05650 | 15 | .81812 | .62603 | .26147 | .77953 | .03394 | .3370 | 0 / 0 |

The cumulative top-10% share was higher in G-R0 in all three seeds (`+0.14220`, `+0.10870`, `+0.20753`). Recent-30 s coverage and normalized entropy were lower in G-R0 in all three. Cumulative coverage rose in two seeds and fell slightly in one; it does not reverse the concentration result. Against the previously recorded C context, G-R0 also retained lower cumulative coverage and higher top-10 share in all three seeds; C was not rerun in this causal pass.

At 30 s, dose, response, and occupancy differences were already observable, so the 30-second checkpoint cadence cannot establish fine causal ordering. By 120 s, cumulative top-10 share was higher and recent coverage lower in G-R0 for every seed; both patterns persisted through 300 and 600 s. This is temporal alignment, not mediation evidence.

G-R0 remained active: travel per active-ant-second was similar or slightly higher than G. Population, total travel, recruitment, and contacts were lower, while blocked fraction rose. At 600 s, final populations were 11–15 versus 19–22; total travel fell 24–31% by seed. The blocked fraction is `blockedFrames / (activeAntSeconds × 60)`. Speed and turn distributions are retained in `data/SUMMARY.json`; all finite, speed-cap, turn-cap, overlap, and population-ceiling violation counts were zero. This rules out a zero-motion or invariant-failure explanation; the population/recruitment changes remain meaningful parts of the closed-loop effect.

## Field and downstream observations

No cap touch or saturation loss occurred in either arm. Maximum node values remained far below cap 8: G `2.049–2.344`; G-R0 `.318–.351`. Decay ran for 600 s in each arm. Source closure records accepted, boundary-rejected, pending, and requested scaled dose separately.

Downstream counts were lower in G-R0: FOOT_CONTACT groups `23,694–25,472` versus G `33,643–34,237`; individual feet `70,308–75,678` versus `99,469–101,243`. Plate births were `2, 3, 7` versus `36, 38, 37`. SurfaceField sums and exposed/buried layer summaries are in the checkpoint table and raw maps. These are downstream descriptions, not primary causal endpoints.

[CHECKPOINTS.csv](CHECKPOINTS.csv) contains all 30 seed × arm × checkpoint rows: occupancy, movement, population/activation, source-dose components, E/A/A²/far response, high-A shares, field/cap state, contacts, Plate counts, SurfaceField, material state, and RNG calls. Full per-second traces, occupancy maps, source ledgers, histograms, initial fingerprints, and validation receipts are under [data/](data/). `CHECKPOINTS.csv` SHA-256: `3bf778d6c869360bd6d3b6bba1193a15069d90275697cd2fd4620f7737bddc94`.

## Interpretation and next boundary

Removing reinforcement did **not** remove the concentrated occupancy pattern. The top-10 share became higher in every seed, while recent coverage and entropy became lower. Therefore the tested G concentration phenotype does not require the intact `5 × A²` term to appear. Reinforcement still has a large measured effect on dose, E/A/far response, population/recruitment, and downstream world state.

The ablation also removed most requested dose and changed trajectories. It cannot tell whether those consequences arise from adherence dependence, total dose, or their interaction. No reinforcement adjustment is justified by this result. If that distinction remains a future question, a separately authorized dose-matched, adherence-uncoupled control is the smallest clean follow-up; it is outside this pass.

## Reproduction

Run from the repository root on the pinned branch and source state:

```powershell
node --check scripts/ant-g-reinforcement-ablation.js
node --test tests/ant-g-reinforcement-ablation.test.js
node scripts/ant-g-reinforcement-ablation.js --selfcheck
node scripts/ant-g-reinforcement-ablation.js --output=<empty-output-directory>
```

The full paired run is deterministic but takes about one minute per replay. `data/SHA256SUMS.json` covers the 27 generated data artifacts. `DETERMINISM-RECEIPT.json` records two complete runs with byte-identical manifests.
