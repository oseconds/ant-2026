# Retained-material locomotion resistance — 20% screen

**Decision: MIXED.** Doubling the maximum slowdown produces a clear, reproducible change in this one current-G history, without zero-displacement stalls or invariant failures. It also reduces overall travel and foot contacts, changes the later route and field maps, and produces more Plate material. The would-be max-D region stays in the same entry-adjacent area; its local loading is lower in the 300 s window and higher in the 600 s window. The proposed positive-feedback chain is therefore partial and time-dependent; rank-1 D context is not consistently strengthened. The candidate is not adopted.

## Question and baseline

This screen changes only the amplitude in the existing tick-entry material resistance:

```text
current:   m(L)   = 1 - 0.10 * (1 - exp(-L / 4))
candidate: m20(L)= 1 - 0.20 * (1 - exp(-L / 4))
```

The `/4` layer scale and production call site stay the same. `L` is the tick-entry public `layerCountByCell` value. The multiplier acts once on final `desiredSpeed`, after steering/turning and before target-speed assignment and acceleration. It does not directly affect heading, steering, targets, or attraction. Buried Plate identity and material coefficients are not locomotion inputs. The candidate exists only in a temporary research shadow of `AntController.js`; production source is unchanged.

The control and candidate use the same current-G seed `20261005`, 60 Hz, Audio Off, 600 simulated seconds, initial state, and counted RNG implementation. This is one deterministic paired history, not a multi-seed estimate. No amplitude, layer-scale, or other parameter was varied.

## Provenance and replay

- Production authority: `origin/main` / remote `main` `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a` (`codex/ant-late-qualified-opportunity-capture-20261029`).
- Research branch: `codex/ant-retained-material-locomotion-20pct-screen-20261029`.
- Frozen 10% raw run: `../2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz`, SHA-256 `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`.
- Frozen late opportunity anchors: `../2026-10-29-late-qualified-opportunity-capture/data/late-input.json.gz`; source-run and actual-mask provenance are recorded in `data/run-comparison.json`.
- Actual material-mask context: `../2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz`, SHA-256 `a62ad65b772db8d040ed9bebf636e8af32d2d185ea65fead4a431262964df0e5`.
- Exact production-source and canonical-guide hashes are recorded in `data/run-comparison.json`. The controller SHA-256 is `b5a6344ebed52962a1749d612b0140b6a4249817f159758e13f166877078e9f4`; `docs/ant/README.md` SHA-256 is `bb9b0ea15c67221189a7e60ef4d71f1581727c744da74dbf0d70cf38880a13ba`.

The frozen 10% control replay matched the saved initial state, all 600 position snapshots, 600 contact buckets, ordered contact-stream and Plate-birth hashes, timeline values, checkpoint summaries, final RNG state/calls, and compressed checkpoint maps at 30/60/120/300/600 s. Optional `undefined` telemetry properties were omitted by JSON serialization for the timeline/checkpoint object comparison; all serialized values matched. The control observer consumed zero RNG calls. Full parity receipts are in `data/control-replay-parity.json`.

Both arms begin at the same initialized state (`f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd`). The first saved position difference is at 85 s, after the shared first Plate commit at `84.016667 s`. P1 and P2 still occur at `84.016667 s` and `106.016667 s`; later materialization diverges (candidate Plate 3 at `119.016667 s`, control Plate 3 at `132.016667 s`). This downstream divergence is an outcome, not an anchor-parity claim.

The observer adds no RNG calls. Candidate final RNG state/calls differ from control (`770892275 / 358030` versus `1884230109 / 349136`) after the treatment trajectories diverge; the run does not preserve a common random-call index through 600 s. This is an endogenous deterministic-run limitation, not observer RNG consumption.

Three complete candidate simulations stopped during research-report assembly as harness errors were corrected. Their raw run and all five checkpoint files are byte-identical to one another and to the final candidate output. One set is retained in `data/failed-candidate-attempt-01/`; `data/candidate-rerun-parity.json` keeps the four-run hashes. No different seed or candidate setting was used.

## Manipulation check

| Layer count L | Current 10% | Candidate 20% |
| ---: | ---: | ---: |
| 0 | 1.000000 | 1.000000 |
| 1 | 0.977880 | 0.955760 |
| 4 | 0.936788 | 0.873576 |
| 10 | 0.908208 | 0.816417 |
| asymptote | 0.900000 | 0.800000 |

The assert-based self-check verifies exact identity at `L=0`, monotonic bounded values, the unchanged `/4` scale, and that the research shadow differs only at the amplitude literal. Values are preserved in `data/manipulation.json`.

## Locomotion and contact result

| 600 s measure | 10% control | 20% candidate | Candidate change |
| --- | ---: | ---: | ---: |
| Mean realized speed while on material | 0.057243 | 0.050536 | −11.7% |
| Mean final target speed while on material | 0.057402 | 0.050681 | −11.7% |
| Material-exposed ant-ticks | 423,002 | 456,416 | +7.9% |
| Share of ant-ticks on material | 64.88% | 67.70% | +2.81 points |
| Continuous material-exposure episodes | 2,021 | 1,897 | −6.1% |
| Median / p90 episode duration | 0.90 / 11.35 s | 1.13 / 13.40 s | longer |
| Realized travel | 603.10 | 579.04 | −4.0% |
| Travel per active-ant-second | 0.05551 | 0.05153 | −7.2% |
| Individual FOOT_CONTACT samples | 99,469 | 95,449 | −4.0% |
| FOOT_CONTACT groups | 33,643 | 32,268 | −4.1% |
| Exact zero-displacement ant-ticks | 0 | 0 | — |

The 24×24 descriptive contact maps use the same grid and raw-count scale across each 200 s bin. Control/candidate occupied-cell Jaccard is `0.8985` (0–200 s), `0.9157` (200–400 s), and `0.8511` (400–600 s). Contact volume declines in all three bins, more in the last one; the spatial maps also change. Exact grid counts are retained in `data/arm-observations.json` and shown in the [FOOT_CONTACT atlas](data/FOOT-CONTACT-atlas.svg).

The candidate has longer continuous exposure episodes and a larger fraction of ant-ticks on material, while producing fewer total foot contacts and less total travel. These measures describe the realized trajectory; they do not isolate residence as the sole cause of the later world differences.

## World, material, and mechanical history

The 30 s and 60 s checkpoint maps and summaries are identical before any material exists. The paired histories then diverge. Selected checkpoints:

| Time | Arm | Plates | Buried layer-cells | Max local layer count | FOOT_CONTACTs | Travel | SurfaceField sum |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 120 s | 10% | 2 | 223 | 2 | 12,954 | 78.60 | 508.69 |
| 120 s | 20% | 3 | 847 | 3 | 13,105 | 79.30 | 512.58 |
| 300 s | 10% | 14 | 16,960 | 14 | 44,861 | 272.73 | 1,498.81 |
| 300 s | 20% | 16 | 19,904 | 15 | 44,228 | 268.72 | 1,469.99 |
| 600 s | 10% | 36 | 60,378 | 35 | 99,469 | 603.10 | 2,604.67 |
| 600 s | 20% | 38 | 66,825 | 35 | 95,449 | 579.04 | 2,519.25 |

At 600 s, the candidate has two more Plate commits, 6,447 more buried layer-cells (+10.7%) and 367 more exposed material cells (+6.4%); maximum local layer count is unchanged. Nodule count is 32 in both arms. Plate counts and mask hashes in the candidate receipts are actual run outputs, not shadow descriptors.

At the same checkpoint the SurfaceField sum is 3.3% lower. The native pheromone node sum is `3,626.44` control and `3,458.67` candidate; thresholded coverage is `0.2208` and `0.2042`. Cumulative occupancy-map Jaccard is `0.8884`, and recent-30-second occupancy Jaccard is `0.3356`. The saved field maps therefore show substantial route/history divergence rather than an across-the-board increase in loading. Checkpoint map differences are retained in `data/run-comparison.json`.

## Would-be max-D opportunity context

The 40 late frames reuse the parent observer semantics: separate 20-anchor windows before 300 s and 600 s, 96×96 production grid, current `sampleSupport(..., 0.025)` D, production E→F thinning, edge-bearing F under 8-neighbor connectivity, and the existing descriptive 0.15 spacing for separated D centers. This is read-only context, not allocation.

The sampled spans are `280.016667–299.016667 s` (300 s window) and `579.933333–599.250000 s` (600 s window). For every 20-state summary, “median” is the analysis helper’s discrete upper middle observation (`sorted[round((n−1)×0.5)]`); it is not the average of the two middle observations. Thus 10/20 virgin rank-1 states can coexist with a reported layer-count median of 1.

| Window | Arm | Median D1 | Median D2/D1 | Rank-1 mode (states) | Entry distance | Pre-existing layers at rank 1 (median; virgin states) | Nearby feet in trailing 20 s (median) |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| 300 s | 10% | 0.9080 | 0.5691 | cell 6287 (20/20) | 0.0362 | 2; 0/20 virgin | 198 |
| 300 s | 20% | 0.9155 | 0.5539 | cell 6288 (20/20) | 0.0362 | 1; 10/20 virgin | 177 |
| 600 s | 10% | 0.9640 | 0.7565 | cell 6289 (20/20) | 0.0391 | 6; 0/20 virgin | 162 |
| 600 s | 20% | 0.9650 | 0.7448 | cell 6287 (20/20) | 0.0362 | 8; 0/20 virgin | 176 |

Both arms keep the strongest separated D center in the same entry-adjacent neighborhood across each 20-state window; treatment/control modal cells differ by only one cell in the 300 s window and two cells in the 600 s window. The candidate’s D1 median is slightly higher and D2/D1 slightly lower in both windows, but this does not identify a new allocation law. Local rank-1 material/contact context changes in opposite directions across windows: lower at 300 s, higher at 600 s. The screen therefore does not show consistently stronger rank-1 D context. Full per-anchor values and the fixed-scale [qualified-D atlas](data/qualified-D-atlas.svg) are included.

## Interpretation

**Implementation fact.** The candidate modifies only the resistance amplitude in an isolated shadow controller. Production remains at 10%; no steering, gait, SurfaceField, pheromone, Plate-birth, stratigraphy, audio, or allocation code changed.

**New measurement.** The 20% law produces lower speed while on material, longer exposure episodes, fewer total contacts/travel, two additional Plate births, more buried material, and different late contact/field maps. The max-D region remains entry-adjacent. Its local recent loading is lower in the 300 s comparison and higher in the 600 s comparison.

**Research interpretation.** `MIXED`: the link is strong enough to alter the world, but the effects are not a clean monotone amplification of the proposed `layers → slowdown → contacts → D` chain. More material accumulates even as total contact count, total travel, SurfaceField sum, and late pheromone coverage fall. The opportunity leader does not relocate, but the leader’s local material/contact context is not consistently reinforced across both windows. There were no zero-displacement stalls, non-finite fields, movement-cap/overlap violations, saturation, or population-ceiling violations; the population remained between 2 and 24 and ended at 23 versus 19.

**Authored / artistic implication.** Doubling the authored slowdown visibly changes the material-mediated world history in this run. That does not show that 20% is more expressive, physically correct, or preferable for the artwork. The screen does not establish a material law or adoption case.

**Unresolved risk.** One seed cannot estimate between-seed variability. The random generator begins from the same state, but later call counts diverge after trajectories do. The measured result is a paired deterministic history, not a run with a shared random draw at every later tick.

## Decision and next boundary

**MIXED.** Keep 20% as a bounded research comparison only. Do not adopt it and do not start an amplitude sweep. If a decision to consider 20% further is made, the smallest useful next pass is one already-frozen independent current-G seed with the same 10%/20% pairing and measurements; otherwise stop here. This pass does not implement max-D allocation, X capture, UPDATE, maturation, BODY, or any material feedback.

## Validation and artifacts

- `node scripts/ant-retained-material-locomotion-20pct-screen.js --self-test` passed.
- The deterministic 10% replay matched frozen raw trajectory/event/checkpoint receipts before treatment interpretation.
- The candidate initial-state hash matched control; repeated candidate raw and checkpoint outputs were byte-identical across all complete runs (`data/candidate-rerun-parity.json`).
- `node scripts/ant-retained-material-locomotion-20pct-screen.js --analyze-only` reported `ANALYSIS-RERUN-EXACT`; input SHA-256 `c806ce8f3c0fbc5eb45da2a3c75c00ba64725e59e98b48685f1b92b1f3c721e7`, analysis SHA-256 `532ccfd7076008dbf5b01dd7c51bccfc7afeb38dcb75d4347eb7e72a286a64d0`.
- Focused `tests/ant-material-locomotion-resistance.test.js`: 4/4 passed.
- Both SVG atlases parsed as XML; panel values use the saved paired frames / observer counts and a common fixed scale.
- `git diff --check` passed. Full repository build/test was not run because no production source changed and the focused test plus source-conformance/replay checks cover this diagnostic pass.
- `data/SHA256SUMS.txt` contains the package and daily-record artifact hashes (excluding itself).
