# Material feedback: exposed surface vs accumulated depth

## Decision

**DEPTH-SENSITIVE for both registered direct responsibilities, A and D.** The fixed surface arm reproduces the first-layer effect exactly, but it does not reproduce the additional turn-cap and same-flow target changes produced by increasing `layerCountByCell` above one. This is a result about the registered candidate laws on one frozen seed, not evidence that buried depth is the physically or artistically correct input.

No production law, formation law, or material state was adopted.

## Question and authority

The pass tests whether existing exposed-material presence `S` is enough to condition the research responsibilities `A` (turn maneuverability) and `D` (same-flow following headway), or whether the already-authored depth functions continue to add direct response at `L > 1`.

- Production authority: `origin/main` `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-material-feedback-ad-composition` `10b1cbd877f4130924be83daa37fe8c40e9b230c`.
- Research branch: `codex/ant-material-feedback-surface-vs-depth-20261030`.
- Treatment: one current-G/H0 `AD-S` run, seed `20261005`, 60 Hz, 600 model seconds, Audio Off; production slowdown, residence, and other candidates Off.
- Frozen comparisons: existing `N` and `AD-L`; they were not rerun.

The production and research-source pins, frozen artifact hashes, and exact treatment anchors are in [`data/ad-s/PROVENANCE.json`](data/ad-s/PROVENANCE.json). Machine-readable measurements are in [`data/ad-s/ANALYSIS.json`](data/ad-s/ANALYSIS.json). The preregistration is [`PLAN.md`](PLAN.md).

## Implementation facts

Production `MaterialStratigraphy` already exposes `topLayerByCell`, `layerCountByCell`, `totalDepthByCellMeters`, and `getTopPlateAt(x,y)`. Surface presence is derived from the existing top-layer index; this pass adds no latent state. `LocalOccupancy` regulates same-flow following through a forward speed limit and uses the existing 0.4 s headway in its comfortable-distance term. The native ant turn cap is 4.5 rad/s. Relevant source: [`MaterialStratigraphy.js`](../../../../src/lib/agents/ant/MaterialStratigraphy.js), [`LocalOccupancy.js`](../../../../src/lib/agents/ant/LocalOccupancy.js), and [`AntAgent.js`](../../../../src/lib/agents/ant/AntAgent.js).

The production `src/`, `static/`, and canonical `docs/ant/README.md` are unchanged. A scoped `.gitattributes` stanza pins this pass's text artifacts to LF and its `.json.gz` packets as binary so the recorded byte hashes remain stable across Windows worktrees. `A` and `D` in this experiment are research-only candidate effects; production retains its existing behavior.

## Registered laws

Depth reference:

```text
qA(L) = 1 - .50 * (1 - exp(-L/4))
turn cap = 4.5 rad/s * qA(L)

hD(L) = 1 + .50 * (1 - exp(-L/4))
same-flow headway = .4 s * hD(L)
```

Surface counterfactual uses only existing first-layer effect: `S=0` for no exposed top material and `S=1` otherwise; on `S=1`, it uses `qA(1)` and `hD(1)` at every depth. Thus `L=0` remains exact native behavior and every `L=1` result must equal the depth arm. At `L=1`, `qA=.8894003915357025`, the turn cap is `4.002301761910661 rad/s`, `hD=1.1105996084642975`, and the headway is `0.44423984338571904 s`. Self-checks also verify monotonicity and the registered asymptotes.

## Design and provenance

The main comparison is **paired on each AD-S tick-entry consumer state**: the treatment applies `S`, while an observer calculates the `L` result on the same exact ant, local occupancy, material column, and requested movement. This isolates direct conditioning-source consequences without a second AD-L replay or independent counterfactual trajectories. Values after `L=1` are allowed to differ; the paired requested heading and same-flow context are otherwise held fixed.

The single natural AD-S run starts from the frozen N/AD-L initial state SHA `f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd`. It matches first Plate timing at `84.01666666666823 s` and positions/contact buckets through that first Plate event. It records 40 registered late opportunity anchors at ticks listed in the provenance. From the first material event onward, AD-S is an endogenous trajectory and its world summaries must not be read as paired causal differences from N or AD-L.

## Direct depth leverage

The run contained `424,775` A material calls. Of these, `380,522` (`89.6%`) occurred at `L>1`, including `266,805` (`62.8%` of material calls) at `L>=5`. D had `29,845` material finite same-flow opportunities; `27,114` (`90.9%`) were at `L>1`, including `18,921` (`63.4%`) at `L>=5`. Natural depth exposure is therefore ample for this registered distinction; this is not an `INCONCLUSIVE` result for lack of high-L contact.

### A — angular maneuverability

| Current depth | A calls | Depth / surface calls changed from native | Paired `|rate|` difference, depth minus surface | Paired applied-heading difference |
|---|---:|---:|---:|---:|
| `L=1` | 44,253 | 42,559 / 42,559 | exactly 0 for all samples | exactly 0 for all samples |
| `L=2–4` | 113,717 | 111,180 / 108,838 | median `-0.6895`, mean `-0.6069` rad/s | median `0.01149`, mean `0.01011` rad |
| `L>=5` | 266,805 | 264,710 / 256,490 | median `-1.5676`, mean `-1.4812` rad/s | median `0.02613`, mean `0.02469` rad |

Differences are computed over all calls in each preregistered bin, including exact zeros. Requested heading is the same within each paired counterfactual; its median absolute request error is about `0.456 rad` at `L=1` and `L=2`, rising slightly to `0.457 rad` at `L=5` and `0.460 rad` at `L=10`. The main change is therefore the cap response, not a different requested target. The depth cap continues to fall after the surface arm reaches its constant `L=1` cap: for example, the actual depth-law cap is `2.8946 rad/s` at `L=5`, `2.4347 rad/s` at `L=10`, and approaches `2.25 rad/s`; surface-only remains `4.0023 rad/s` on material.

This is a clear direct motor-response gradient beyond the first layer. It does not show that every turn in the coupled world was limited by the cap or that the extra restraint improves movement.

### D — same-flow following

`D` sees more than the existence of a material cell: it multiplies the local same-flow headway by the registered depth or surface factor, then retains the native personal-spacing floor and following-speed-limit calculation. Headway expansion below is reported as the change to the speed-scaled distance term; final-target reduction is in world-units/second. Target-reduction means and percentiles use **all material final-target calls in the L bin** as their denominator, including zeros (`44,253`, `113,717`, and `266,805` calls); these are not the narrower finite same-flow opportunity counts shown in the adjacent column.

| Current depth | Finite same-flow opportunities | Headway term expanded, depth / surface | Changed final targets (of all material final-target calls), depth / surface | Target reduction mean, depth / surface; p99, depth / surface (all calls in bin) |
|---|---:|---:|---:|---:|
| `L=1` | 2,731 | 2,505 / 2,505 | 1,455 / 1,455 | mean `0.0000940 / 0.0000940`; p99 `0.003145 / 0.003145` |
| `L=2–4` | 8,193 | 7,384 / 7,361 | 4,499 / 4,267 | mean `0.0002650 / 0.0001146`; p99 `0.008047 / 0.003478` |
| `L>=5` | 18,921 | 18,110 / 18,016 | 12,505 / 10,650 | mean `0.0005276 / 0.0001153`; p99 `0.013858 / 0.003318` |

At `L=1`, direct D checks also match exactly: `46,984` checks, zero mismatches. In the actual finite same-flow contexts, the median increased distance term is `0.002486` at `L=1`, `0.004618` at `L=2`, `0.008754` at `L=5`, and `0.010475` at `L=10` for the depth arm; the surface arm stays near its `L=1` magnitude (for example `0.002596` at `L=2`, `0.002714` at `L=5`, `0.002524` at `L=10`). These are paired local calculations, not independent trials.

The binary surface arm retains the first-layer same-flow responsibility. Increasing L adds further target changes and larger reductions in a measurable subset of local pairs; it is not required for any D effect to exist, but it is required to reproduce the registered depth law's full response.

## Coupled-world secondary readout

These are single-arm, endogenous run descriptions, not treatment-effect estimates. The three worlds share the same seed and pre-material history; once their treatment paths diverge, differences include all downstream feedback.

| 600 s run summary | N | AD-L | AD-S |
|---|---:|---:|---:|
| Realized travel | 616.73 | 620.49 | 615.33 |
| Active ant-seconds | 10,740.82 | 10,761.45 | 10,831.02 |
| Travel / active ant-second | 0.05742 | 0.05766 | 0.05681 |
| FOOT_CONTACT individual feet | 101,836 | 102,341 | 101,518 |
| Plate births | 38 | 39 | 38 |
| Recruited / retired | 792 / 775 | 794 / 779 | 795 / 776 |
| Final population | 20 | 20 | 20 |

At 600 s, AD-S had 38 Plates, 32 nodules, 67,937 buried layer-cells, maximum local layer count 36, pheromone node sum `3741.32`, and SurfaceField sum `2629.04`. N had 69,686 buried layer-cells, max L 37, pheromone sum `3806.18`, and SurfaceField sum `2646.10`; AD-L had 70,742, max L 37, pheromone sum `4014.33`, and SurfaceField sum `2629.07`. These differences are descriptive and cannot identify which conditioning source caused them.

The observer-only max-D context on the same 40 late anchors stayed entry-near in AD-S: median winner entry distance was `0.03617` in the 280–299 s window and `0.03912` in the 580–599.25 s window. Median separated D top2/top1 ratio was `0.5869` and `0.7965`, close to the frozen AD-L values `0.5850` and `0.8021` on those same windows. The D winner cell lay on existing material in all 40 frames; median local layer count was 2 in the first window and 8 in the second. AD-S's median material fraction in the descriptive X capture around the D winner was `0.824` and `0.870`, respectively. This does not establish an allocation rule or show max-D was mechanically affected in a particular direction.

No pathology appeared in the registered invariants: final population remained 20, the one-second displacement audit had zero exact-zero samples among `10,041` consecutive pairs, and finite/speed/turn/overlap/population-ceiling and field/contact/Plate-count counters were zero. This single run is not a broad safety or robustness screen.

## Interpretation and boundary

- **Measurement:** At L=1, S and L are exactly equivalent. At L>1, the depth-conditioned A and D calculations continue to diverge on the same inputs; high-L consumer contexts are common.
- **Research interpretation:** The registered binary exposed-surface conditioning is not a sufficient substitute for the additional depth gradient in either A or D. The evidence supports `DEPTH-SENSITIVE` for this candidate pair.
- **Authored/artistic interpretation:** This does not show that buried depth is the right meaning for immediate turn or pair-flow mechanics. A surface/material-property law, altered authored meaning, or keeping the exploratory law unadopted remain separate choices.
- This pass provides no conclusion about chemical residence. It does not justify a new latent variable, stiffness/density/age mapping, or production adoption.

## Smallest next question

Before composing residence with material history, decide separately for A and D whether the additional buried-depth gradient is intended immediate mechanics, or whether immediate response should be limited to the current interface while slower environmental memory carries accumulated history. No law change is implied by this question.

## Explicit omissions

No extra seed, parameter sweep, new natural run, production mutation, residence treatment, stiffness/density/age input, audio evaluation, long-horizon extension, allocation feedback, UPDATE, BODY, or adoption was performed.
