# Candidate G adherence-coupling control

## Result

**Decision: MIXED.** H removed direct per-ant `A_i²` weighting while matching the intact reinforcement budget on every H tick. It did not produce a consistent reduction in occupancy concentration. At 600 s, H's cumulative top-10% share stayed near G in all seeds and was higher in two; cumulative and recent coverage moved in different directions across seeds. This does not support own-ant adherence allocation as a necessary cause of the concentration pattern.

The test does not isolate total quantity from all adherence feedback. H's shared tick budget `B` still depends on every ant's `A_i`, including its own contribution to the aggregate. G and H also follow divergent trajectories, so their cumulative requested doses need not match. No production law or parameter changed.

## Frozen question and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Parent G-R0 evidence tip: `f1b03e8666f3b920524c458855ff59153156c710`.
- New branch started from that tip: `codex/ant-g-adherence-coupling-control-20261025`.
- Preregistration commits: `9d16d03`, then tick-order amendment `0c2377d`.
- Seeds: `20261005`, `20261006`, `20261007`; 600 simulated seconds at 60 Hz; checkpoints 30/60/120/300/600 s; audio off.
- Reused G movement-shadow and G-R0 corrected occupancy evidence. G-R0 recent-30 s maps were not reused as H outcomes; the independent corrected 60 Hz observer ran for both arms.

See [PREREGISTRATION.md](PREREGISTRATION.md) and [PREREGISTRATION-AMENDMENT.md](PREREGISTRATION-AMENDMENT.md). The amendment replaced write buffering with immediate in-tick multiplier substitution.

## Intervention and tick-order proof

Current source law was verified as:

```text
baseline_i = 0.5 × (0.75 + 0.25 E_i)
reinforcement_i = 5 × A_i²
chunk dose_i = travelled_i × 4.5 × (baseline_i + reinforcement_i)
```

For H, after `LocalOccupancy.constrainDisplacements()` returns collision scales, the harness predicts each ant's exact post-collision, boundary-clipped travel `d_i`, then computes:

```text
B = Σ d_i × 4.5 × 5 × A_i²
D = Σ d_i
U = B / (4.5 × D)   when D > 0 and B > 0; otherwise 0
H multiplier_i = baseline_i + U
```

Only `displacement.depositionMultiplier` changes. The original movement commit, `GasterDeposition.advance()`, dab accumulation, field writes, contact handling, Plate birth, activation, and recruitment order remain in place. Baseline secretion stays ant-local. The aggregate `B` remains adherence-dependent; H removes direct allocation of more reinforcement to the same ant because its own `A_i` is high.

Source audit checked `AntController.tick()` order: all local reads and intentions/wide reads precede displacement and collision calculation; the original movement/deposition/contact loop follows collision calculation; Plate birth, colony activation, and recruitment follow that loop. `LocalOccupancy.constrainDisplacements()` reads neither `depositionMultiplier` nor the field. Gaster calls were checked against predicted travel and rate for every ant chunk.

## Budget and source results

Per-seed dose values below are scale-normalized accrued requested doses before the G area factor `S = 3969/361 = 10.994459833795014`. Actual representation input is this amount multiplied by `S`. Baseline remains local in both arms. H's delivered reinforcement matched its own intact-law `B` on all 36,000 ticks per seed.

| Seed | G baseline | G reinforcement | G total | H baseline | H reinforcement | H total | H/G total change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 1,274.721 | 6,782.881 | 8,057.602 | 1,330.858 | 7,472.964 | 8,803.822 | +9.26% |
| 20261006 | 1,303.786 | 7,246.978 | 8,550.763 | 1,284.598 | 7,143.973 | 8,428.570 | −1.43% |
| 20261007 | 1,292.902 | 6,859.952 | 8,152.854 | 1,322.915 | 7,308.933 | 8,631.848 | +5.88% |
| Pooled | 3,871.408 | 20,889.811 | 24,761.219 | 3,938.370 | 21,925.870 | 25,864.240 | +4.45% |

Pooled scale-multiplied source amounts were `272,236.230` for G and `284,363.352` for H. The cross-arm total differs because paths, E/A states, and travel diverged. This does not violate H's per-tick budget contract.

For H, the largest absolute per-tick `delivered − B` residual by seed was `8.33e−17`, `5.55e−17`, and `5.55e−17`; corresponding derived roundoff bounds were `2.23e−14`, `2.33e−14`, and `2.47e−14`. All ticks passed. Source accrued-dose closure against scaled writer requests plus pending dabs also passed its derived floating-point bound.

## High-adherence allocation

The frozen 40-bin convention uses `A ≥ 0.75` as bins 30–39. H's per-tick multiplier was uniform across movers; the pooled share of reinforcement delivered during high-A movement therefore tracks the travel-by-A distribution, with remaining differences from U varying by tick. G's quadratic allocation concentrates more reinforcement in high-A travel.

| Seed | G travel at A≥.75 | G reinforcement at A≥.75 | H travel at A≥.75 | H reinforcement at A≥.75 | H U p50 / p90 / p99 / max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 43.05% | 65.35% | 46.88% | 48.21% | 2.671 / 3.070 / 3.384 / 3.733 |
| 20261006 | 46.39% | 68.13% | 46.34% | 48.08% | 2.639 / 3.062 / 3.396 / 3.660 |
| 20261007 | 42.75% | 64.72% | 45.74% | 47.32% | 2.642 / 3.035 / 3.361 / 3.819 |
| Pooled | 44.07% | 66.11% | 46.32% | 47.87% | — |

## Movement and response

| Seed | Arm | Travel | Travel / active-ant-s | Final population | Blocked frames | E mean | A mean | A² mean | Far Hill mean |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | G | 603.098 | 0.055505 | 19 | 9,468 | .77165 | .65147 | .48236 | .65494 |
| 20261005 | H | 622.810 | 0.054721 | 19 | 9,586 | .81339 | .68265 | .51477 | .69856 |
| 20261006 | G | 613.718 | 0.054991 | 22 | 9,070 | .79186 | .67195 | .50516 | .67138 |
| 20261006 | H | 604.426 | 0.053914 | 19 | 12,949 | .79473 | .67729 | .50943 | .67707 |
| 20261007 | G | 611.080 | 0.055186 | 21 | 10,214 | .78085 | .65720 | .48610 | .66476 |
| 20261007 | H | 620.206 | 0.055068 | 21 | 9,956 | .80734 | .67575 | .50548 | .69806 |

Population at 30/60/120/300/600 s was G/H: seed 20261005 `10/10, 13/15, 17/18, 21/21, 19/19`; seed 20261006 `10/8, 13/13, 21/16, 21/18, 22/19`; seed 20261007 `10/10, 12/12, 19/16, 21/18, 21/21`. Seed 20261006 had meaningfully more blocked frames and lower mid/late population under H, but travel remained active and no population, speed, turn, overlap, finite-state, or recruitment-ceiling invariant failed. H total travel differed from G by `+3.27%`, `−1.51%`, and `+1.49%`.

| Seed | Arm | Blocked / newly blocked frames | Retired / recruited | Activation at 600 s |
| --- | --- | ---: | ---: | ---: |
| 20261005 | G | 9,468 / 1,590 | 756 / 774 | .8347 |
| 20261005 | H | 9,586 / 1,724 | 807 / 825 | .8466 |
| 20261006 | G | 9,070 / 1,793 | 793 / 814 | .7883 |
| 20261006 | H | 12,949 / 1,462 | 772 / 790 | .8730 |
| 20261007 | G | 10,214 / 1,708 | 769 / 789 | .8344 |
| 20261007 | H | 9,956 / 1,677 | 802 / 822 | .8561 |

Speed, heading, angular-velocity, and one-second displacement histograms are saved at each checkpoint and over each full run in `SUMMARY.json`. The blocked-frame counts above are raw incidences; no threshold was added.

## Occupancy concentration

The table uses the corrected 64×64, 60 Hz occupancy observer. Coverage is occupied-cell share. Entropy is normalized recent-30 s entropy. Recent values at 30 s use the first 30-second window.

| Seed | s | G cumulative coverage / top-10% share | H cumulative coverage / top-10% share | G recent coverage / entropy | H recent coverage / entropy |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 30 | .1873 / .8179 | .1711 / .8598 | .1873 / .7473 | .1711 / .7335 |
| 20261005 | 60 | .3113 / .6973 | .3215 / .6941 | .2068 / .7625 | .2366 / .7724 |
| 20261005 | 120 | .5073 / .5803 | .5444 / .5450 | .2859 / .7932 | .3359 / .8083 |
| 20261005 | 300 | .7605 / .4402 | .7417 / .4461 | .3440 / .8148 | .3567 / .8214 |
| 20261005 | 600 | .8196 / .4180 | .7837 / .4215 | .3467 / .8124 | .3682 / .8241 |
| 20261006 | 30 | .1809 / .8234 | .1926 / .7949 | .1809 / .7424 | .1926 / .7575 |
| 20261006 | 60 | .3657 / .6300 | .3447 / .6515 | .2756 / .7948 | .2273 / .7652 |
| 20261006 | 120 | .5420 / .5276 | .5906 / .5245 | .3149 / .8086 | .3210 / .8062 |
| 20261006 | 300 | .7261 / .4380 | .7756 / .4398 | .3655 / .8210 | .3789 / .8293 |
| 20261006 | 600 | .7490 / .4161 | .8240 / .4220 | .3674 / .8290 | .3643 / .8219 |
| 20261007 | 30 | .2312 / .7270 | .1909 / .8122 | .2312 / .7760 | .1909 / .7419 |
| 20261007 | 60 | .3896 / .6163 | .3218 / .6742 | .2493 / .7710 | .2100 / .7661 |
| 20261007 | 120 | .5818 / .5227 | .5232 / .5574 | .3267 / .8164 | .3179 / .8029 |
| 20261007 | 300 | .7815 / .4348 | .7859 / .4444 | .3850 / .8304 | .3708 / .8236 |
| 20261007 | 600 | .8257 / .4185 | .8164 / .4182 | .3687 / .8260 | .3574 / .8237 |

At 600 s, H top-10% share stayed close to G: it rose by `.00344` and `.00589` in the first two seeds, and fell by only `.00028` in the third. Cumulative coverage rose in one seed and fell in two. Recent coverage and entropy rose in one seed and fell in two. Thus H did not consistently broaden occupancy. It retained the cumulative concentration phenotype, while coverage and recent-window measures were mixed.

Across 30/60/120/300/600 s checkpoints, far-Hill means were higher under H in most comparisons and at 600 s in all three seeds. Whole-run local `E`, `A`, `A²`, and far-Hill means were also higher under H in all three seeds. These are outcomes on divergent trajectories, not independent mediation estimates.

The first exact per-second difference in reinforcement/baseline source buckets and E/A aggregates appeared at seconds 2, 3, and 2 by seed. Cumulative occupancy coverage first differed at seconds 4, 3, and 4. Far-Hill was retained at the fixed 30-second checkpoints, so this dataset cannot establish a finer far-response ordering. Temporal order is descriptive only.

## Downstream world and field audit

| Seed | Arm | FOOT_CONTACT groups / feet | Plate births (first s) | Exposed cells | Buried layer-cells | Max local layer count | Max field node ever |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | G | 33,643 / 99,469 | 36 (84.02) | 5,711 | 60,378 | 35 | 2.344 |
| 20261005 | H | 34,737 / 102,704 | 38 (70.02) | 6,251 | 76,825 | 37 | 3.158 |
| 20261006 | G | 34,237 / 101,243 | 38 (96.02) | 6,112 | 70,927 | 35 | 2.049 |
| 20261006 | H | 33,691 / 99,659 | 41 (81.02) | 5,937 | 83,602 | 41 | 3.194 |
| 20261007 | G | 34,039 / 100,717 | 37 (92.02) | 5,783 | 64,286 | 35 | 2.194 |
| 20261007 | H | 34,586 / 102,326 | 42 (87.02) | 6,287 | 85,183 | 39 | 3.109 |

All runs had zero cap touches and zero saturation loss. H maximum nodes stayed below `3.195` against cap `8`. `SurfaceField` remained finite; its accepted FOOT_CONTACT count matched the event stream and rejected count was zero. Full checkpoint SurfaceField, activation, material, and layer summaries remain in `SUMMARY.json` and maps; they are descriptive downstream outcomes.

At 600 s, `SurfaceField` sum / maximum was seed 20261005 G/H `2,604.666/.9798` and `2,647.227/.9755`; seed 20261006 `2,617.885/.9735` and `2,601.270/.9753`; seed 20261007 `2,621.084/.9750` and `2,654.904/.9767`. These follow changed contacts and movement; they are not primary evidence for the allocation mechanism.

## Validation

- Current production source hashes match the validated G parent; no `src/` file changed. Key hashes: `AntController.js` `e287939a…f4bb04`, `LocalOccupancy.js` `df22dd38…03ff16`, `GasterDeposition.js` `0293e145…33ce41`, `PheromoneField.js` `412798ea…c4afd`.
- All three G arms matched parent summaries; each raw timeline and all five checkpoint map files per seed were byte-identical. Source totals matched the G-R0 observer within the derived accumulation bound. Corrected 60 Hz occupancy matched its parent.
- G/H initial fingerprints matched within each seed.
- G and H observer ON/OFF parity passed each tick for 120 ticks per seed; observer added zero RNG calls.
- H budget closed within the derived roundoff bound on all `108,000` ticks. Predicted post-collision travel and actual `GasterDeposition.advance()` travel/rate matched exactly.
- All three H full replays reproduced their normalized summaries, raw timeline gzip, checkpoint maps, and source ledger gzip byte-for-byte.
- All simulation finite, speed, turn, overlap, and population-ceiling violations were zero. No cap or saturation event occurred.
- Focused tests: `node --test tests/ant-g-adherence-coupling-control.test.js` passed 8/8. Full suite/build skipped because production/runtime source was unchanged.
- SHA manifest covers 44 data files, plus itself. See [data/SHA256SUMS.json](data/SHA256SUMS.json), SHA-256 `7b50c2c5cabd395e61d1acfeb7b7f901bda10ec2eee624d3fa149d8b71292f70`.

Reproduce from a fresh checkout of this branch with Node 22:

```powershell
node --test tests/ant-g-adherence-coupling-control.test.js
node scripts/ant-g-adherence-coupling-control.js --selfcheck
node scripts/ant-g-adherence-coupling-control.js --run --output=docs/ant/evidence/2026-10-25-ant-g-adherence-coupling-control/data
```

The run requires an empty output directory. It reproduces G parent checks before starting H, then performs the three H repeats. The independent output manifest above records frozen data hashes.

## Claim boundary and next step

This control supports only: **removing direct per-ant `A_i²` allocation did not consistently reduce G's concentration pattern under the tested seeds and duration.** It does not prove total pheromone quantity alone caused concentration. H retains an A-dependent shared budget and diverges in total travel and cumulative dose after feedback changes the trajectories. It also does not show that production `5 × A²` is wrong.

Decision: **MIXED**. No gain or law candidate is justified. Any later test must state whether it targets aggregate dose amount or the remaining global A dependence; do not fold both into one intervention.
