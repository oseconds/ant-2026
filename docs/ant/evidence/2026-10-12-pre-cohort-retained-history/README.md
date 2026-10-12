# Pre-cohort retained-history contribution

**Decision: SUPPORTED CROSS-COHORT HISTORY** for the current production law and the observed 600 s natural runs. In all three seeds, layers older than every currently live ant remained in the current cell columns of later ants. Because production computes locomotion resistance from aggregate column count `L`, those layers contributed to the multiplier without any new state or feedback.

This does not identify which ant formed a layer, prove that an ant physically senses buried material, or estimate an intervention effect.

## Baseline and conditions

- Production baseline and branch base: `e5e4c52db22512f53d32014f54232f6ff7e3d4cf`, verified as remote `main` after the causal-tail research result was fast-forwarded.
- Research branch: `research/ant-pre-cohort-retained-history-20261012`.
- Conditions: fresh `new AntController()` with production default-On resistance, seeds `20261005`, `20261006`, `20261007`, 600 simulated seconds each, fixed 60 Hz, the existing counted LCG (`1664525`, `1013904223`), no audio bridge and no state overrides.
- Production sources and parameters are unchanged from the baseline. The current law remains `m(L) = 1 - 0.10 * (1 - exp(-L / 4))`.

## Cohort and read semantics

At each tick-entry boundary, `oldestLiveEntryTime` is the minimum exact spawn time among currently live ants. A layer is pre-cohort iff:

```text
layer.descriptor.bornAtSimulationTimeMs < oldestLiveEntryTime
```

The comparison is strict: a layer born at the same simulation time as the oldest live ant's entry is not pre-cohort. When the oldest ant retires, the threshold advances to the next currently live ant; old-layer classification is recomputed on that tick.

The harness wraps the instance's existing `spawnNextAnt()` only during the observer-on replay to record a successful spawn's `controller.simulationTimeMs`. It adds no ant state, emits no callback, consumes no random value, and returns the original result. On every fixed tick before `AntController.tick`, it reads one public `MaterialStratigraphy.getSnapshot()`, uses the production `materialLayerCountAtSnapshot()` for exact `L`, and reads each live ant's public bottom-to-top `getColumnAt()` descriptors to count `P`. It checks that the public column length equals production `L` and that its top identity matches the public top-layer index.

`P` includes pre-cohort layers anywhere in the column. `top pre-cohort` means the current top layer also predates all live ants; `buried-only` means `P > 0` while the current top does not. Locomotion still consumes only aggregate `L`. No layer age, depth, identity, creator or material character is a production input.

The observer samples the state already present at tick entry. Same-tick movement, contact, Plate birth, nodule birth or topology changes can first appear at the next sample. Ant-time uses one `1/60 s` interval per tick-entry sample. A material-column occupancy is `L > 0`; it is not a foot-contact or direct-sensing measurement.

For diagnosis only, the report computes `m(L-P)` and `delta = m(L-P) - m(L)`. This asks how the existing bounded multiplier differs arithmetically if the pre-cohort layers were absent from the count. It does not remove material, rerun behavior, isolate a mediation share or change production.

## Observer validity

The production default remained On in both matched runs; only the observer was Off or On. Each seed compared 36,001 per-tick rows across the same 14 fields used by the prior ANT parity harness: trajectory/lifecycle, counted RNG, pheromone, SurfaceField, gait, body pose, gaster deposition, colony activation, local occupancy, FOOT_CONTACT, Plate/nodule birth events, TrailPlateBirth and full MaterialStratigraphy. All three OFF/ON chains match exactly. The observer-on run also hashes production state immediately before and after every read; all 108,000 boundary checks were unchanged.

See [`data/observer-parity.json`](data/observer-parity.json) for each field's chain hashes. It records exact RNG state/call count, lifecycle and event totals in the seed summaries.

## Results

### Overall

| Measure | Result |
| --- | ---: |
| Simulated seed-seconds / tick samples | 1,800 s / 108,000 |
| Spawned ant instances | 2,180 |
| Active ant-time | 2,020,078 ticks / 33,667.97 ant-seconds |
| Any nonempty column (`L > 0`) | 1,041,125 ticks / 51.54% of active ant-time |
| Pre-cohort history present (`P > 0`) | 930,695 ticks / 46.07% of active ant-time |
| Pre-cohort history among column-occupied ant-time | 89.39% |
| Ants with at least one pre-cohort encounter | 1,603 of 2,180 ant instances |
| Pre-cohort contribution episodes | 5,455; median 1.10 s, p90 8.62 s, maximum 40.00 s |
| All live ants simultaneously on pre-cohort columns | 1,496 tick samples / 24.93 cumulative seconds across runs |
| Mean current-population share on pre-cohort columns | 42.42% across populated samples |

Across the 930,695 samples with `P > 0`, actual `m(L)` had mean `0.93081` and median `0.92865`. The diagnostic `m(L-P)` had mean `0.97970` and median `0.97788`. The bounded marginal `delta` was positive in every such sample: mean `0.04889`, median `0.04712`, p90 `0.08262`, p95 `0.08946`, range `0.00299–0.09991`. These are arithmetic consequences of the adopted law applied to observed `L` and `P`, not a second causal experiment.

Pre-cohort history appeared both on the top layer and below a newer top: 424,574 ant-ticks (45.62%) were top-pre-cohort and 506,121 (54.38%) were buried-only. Mean `delta` was `0.05909` when the top itself was pre-cohort and `0.04033` for buried-only cases. A buried-only `P` count affects the production scalar `L`; this does not mean the ant identifies or senses a buried Plate.

The complete `L` histogram for active ant-time, `P` histogram when `P > 0`, conditional `L` histogram, joint `(L,P)` histogram and multiplier distributions are in [`data/aggregate-summary.json`](data/aggregate-summary.json). Observed ranges were `L = 0–35` overall, `L = 1–35` with pre-cohort history, and `P = 1–33`.

### Seed consistency and time effects

| Seed | Pre-cohort / active ant-time | Pre-cohort / `L > 0` | Ants affected | Episodes (median / p90) | Mean / median `delta` | All-live-old time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 45.61% | 88.31% | 589 | 2,120 (0.93 / 7.42 s) | 0.04532 / 0.04084 | 17.03 s |
| 20261006 | 42.38% | 89.47% | 452 | 1,590 (1.18 / 8.53 s) | 0.04965 / 0.04923 | 0.25 s |
| 20261007 | 50.21% | 90.34% | 562 | 1,745 (1.35 / 10.15 s) | 0.05151 / 0.05244 | 7.65 s |

| Window | Pre-cohort / active ant-time | Pre-cohort / `L > 0` | Mean current-population share | All-live-old time |
| --- | ---: | ---: | ---: | ---: |
| 0–200 s | 1.54% | 41.52% | 1.22% | 0 s |
| 200–400 s | 45.21% | 82.27% | 45.11% | 0 s |
| 400–600 s | 80.84% | 95.41% | 80.93% | 24.93 s |

The later-window rise occurs in every seed: 0–200 / 200–400 / 400–600 s pre-cohort shares were `1.8 / 41.4 / 83.8%`, `0.0 / 42.6 / 74.4%`, and `2.8 / 51.8 / 84.3%`, respectively. This is not confined to a one-time startup overlap. All-live-old intervals occurred in every seed, though their cumulative durations varied considerably.

## Decision and boundaries

**SUPPORTED CROSS-COHORT HISTORY.** In every natural run, current live ants repeatedly occupied columns containing layers born before the earliest entry time of that entire live population. The old layers therefore remained part of aggregate `L` and had nonzero marginal contribution through the unchanged production locomotion multiplier. The pattern grows from sparse early exposure to common late exposure.

Permitted conclusion:

> Retained material history can outlive the currently living cohort and continue to condition later ants through the adopted production locomotion law.

This result does not identify any layer's creator. `Pre-cohort` means only “born before every currently live ant entered.” It is not evidence that a specific retired ant made that layer. The delta is not an intervention, a causal decomposition or evidence of sensing buried material. The production law is an authored local-history condition, not measured physical friction.

Limitations: three deterministic seeds and a 600 s horizon; no zero-ant lifecycle interval; no creator provenance; no physical sensing measurement; no counterfactual run with old layers removed. The study evaluates only the current production law and does not establish a biological mechanism or generalize to every possible seed/horizon.

## Reproduction and artifacts

Run from the research branch with the baseline commit available and a fresh output directory:

```powershell
node scripts/ant-pre-cohort-retained-history.js --baseline=e5e4c52db22512f53d32014f54232f6ff7e3d4cf --seeds=20261005,20261006,20261007 --seconds=600 --output=docs/ant/evidence/2026-10-12-pre-cohort-retained-history/replay-REPLAY-ID
```

The runner refuses a nonempty output directory and verifies the baseline is an ancestor and production source/`package.json` are unchanged. `data/manifest.json` pins conditions, entry/observer semantics, source hashes and reproduction command. Per-seed summaries and ant records, episode records, second-by-second population prevalence, parity field hashes and aggregate distributions are under [`data/`](data/). The source runner is [`scripts/ant-pre-cohort-retained-history.js`](../../../../scripts/ant-pre-cohort-retained-history.js); focused classification tests are [`tests/ant-pre-cohort-retained-history.test.js`](../../../../tests/ant-pre-cohort-retained-history.test.js).

## Validation and independent review

- [Focused cohort/classification tests](focused-test.txt): 3/3 passed.
- [Full `npm test`](npm-test.txt): 304/304 passed.
- [`npm run build`](npm-build.txt): passed. Existing warnings note Zod annotation positions that Rollup strips and a Vite application chunk above 500 kB.
- [Fresh independent review](independent-review.md): **PASS WITH LIMITATIONS**. The reviewer reconciled 39 saved-data/statistic checks and independently recomputed multiplier and delta summaries; all matched. The review was read-only and did not rerun the natural simulations.

Chronology: [`2026-10-12-pre-cohort-retained-history.md`](../../daily/2026-10-12-pre-cohort-retained-history.md).
