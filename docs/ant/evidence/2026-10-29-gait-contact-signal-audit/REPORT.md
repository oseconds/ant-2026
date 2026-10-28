# Actual FOOT_CONTACT organization versus scalar mechanical history

## Decision

**INDEPENDENT INFORMATION OBSERVED — narrowly, as descriptive event-history information.** In both frozen events, raw touchdown position, leg identity, tripod group, ant identity and event time are present in spatial combinations that the per-cell cumulative contact count and SurfaceField value do not encode. The evidence is bounded to two 20-second event windows from one deterministic seed. It does **not** show an independent gait mechanism, physical force/pressure/shear, a useful material responsibility, or a Plate/material law.

The broad spatial load is largely shared by the two scalar histories: per-cell cumulative counts and commit SurfaceField are strongly correlated. The extra information is the organization of those contacts—who touched, which leg/tripod, and when. The fixed gait explains the alternating A/B sequence and leg membership exactly. No trajectory-conditioned residual is claimed.

## Baseline and provenance

- Production authority: `main` `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-traffic-direction-signal-audit-20261028` `86308a9cc8bdb067ecabd33465e127d9d453164d`.
- Research branch: `codex/ant-gait-contact-signal-audit-20261029`.
- Frozen source packet: commit `0d5096a920e1ebb2086fa1dae782c5d4e871b590`, path `docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz`, 17,766,995 bytes, SHA-256 `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`.
- The packet records a different provenance `main` (`aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`); all 11 recorded ANT production source hashes match the current production authority. The P1/P2 event and SurfaceField anchors also match the prior frozen parity receipt.
- Reused seed `20261005`, 60 Hz, Audio Off. No simulation replay was needed: the existing frozen stream carries timestamped events, `antId`, contact-group/tripod, centroid, event strength, and individual `legId` plus raw position.
- P1 window: `(64016.66666666308, 84016.66666666823] ms`, tick 5041, 832 groups / 2,470 feet.
- P2 window: `(86016.66666666881, 106016.66666667463] ms`, tick 6361, 849 groups / 2,507 feet.
- Frozen contact prefix through P2: 3,655 groups / 10,849 feet; stream SHA-256 `19bb340be61cf74a8e868d541df11e3b57e8e7427092eb89dd125f52b3de8eaf`.

The window bounds come from the actual ownership/materialization anchors, not the approximate timestamps in the task summary. Each event contact-window digest and each commit `C_surface` map hash matches the frozen parity anchors.

**Prior-pass boundary retained:** the traffic-direction audit measured signed direction and tick-level turning, but did not find strong local flow organization for connection-body morphology. That result is not reused as contact evidence or as a proxy in this pass.

## Production contact path

**Implementation facts.** `AntController.tick()` relaxes SurfaceField by elapsed simulation time, resolves movement and collision/boundary constraints, then passes final observed travel distance and the observed segment to `GaitController.advance()`. For each emitted event it updates SurfaceField, TrailPlateBirth counts and MaterialStratigraphy foot load, then emits `foot-contact` for observers.

`GaitController` advances deterministic per-ant phase from realized travel distance. Its tripods are A = FL/MR/RL and B = FR/ML/RR; the event group alternates at half-cycle boundaries. The stride length, initial phase and event strength are deterministically derived from ant ID. The event carries fractional `simulationTimeMs`, group, individual positions and IDs, centroid, and strength. Foot placement comes from the fixed body/leg geometry and current heading; only in-domain feet are emitted. Event strength is not a measured force.

| Production record | What it retains | What its scalar history discards |
| --- | --- | --- |
| Raw emitted `FOOT_CONTACT` | Ant ID, contact group, leg IDs, individual positions, centroid, strength and event time | Not persistently accumulated by the controller; available to listeners and frozen observers |
| `SurfaceField` | 96×96 Float32 compaction, global accepted-foot total; fixed contact dose `.025`, radius `.012`, half-life `1800 s` | Ant, leg, tripod, event order and contact time; event centroid and strength are ignored |
| `TrailPlateBirth.footContactCounts` | 96×96 nearest-cell saturated integer counts used for candidate/repeat corridor totals | Ant, leg, tripod and timestamp |
| `MaterialStratigraphy.footLoadByCell` | Separate 96×96 nearest-cell saturated integer count and accepted-foot total | Ant, leg, tripod and timestamp after validating each foot ID and position; SurfaceField is ignored during event ingestion |

The two count fields and the SurfaceField are not interchangeable: the count fields increment the nearest 96-grid cell; SurfaceField deposits a spatial dose around each point and relaxes over time. Raw contact history is a third representation.

## Measurements

All raw-window contacts are assigned to the existing 96×96 production count grid using the source `Math.round(x * 95)` / `Math.round(y * 95)` mapping. Cumulative counts include every valid individual contact through that commit. SurfaceField values are the frozen commit `C_surface` map, with no new projection, smoothing or eventwise normalization. The strict window rule is `(start, commit]`.

### Event summaries

| Event | Groups | Feet | Ants | Touched 96-grid cells | Three-foot groups | Incomplete groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 832 | 2,470 | 28 | 1,502 | 811 | 21 |
| P2 | 849 | 2,507 | 30 | 1,474 | 816 | 33 |

Incomplete groups have one or two valid in-domain feet after the source's domain filtering. No missing foot was filled in.

### Spatial load and scalar histories

The P1/P2 event totals are close: P2/P1 feet ratio `1.01498`. Their raw 96-grid window-count maps have 529 cells in common over a 2,447-cell union (Jaccard `0.21618`); per-cell count correlation is `0.28858`. The events therefore have similar total contact volume but different spatial footprints. This is a descriptive comparison of the selected frozen windows, not evidence of a population-level effect.

At each commit, cumulative nearest-cell counts and SurfaceField remain strongly aligned across the whole grid: Pearson `r=0.92803` (P1) and `r=0.93557` (P2); restricting to cells with any cumulative contact gives `0.89277` and `0.90737`. These correlations support substantial scalar redundancy in broad spatial load.

For a stricter information-loss check, the runner first searched for event-touched cells with exactly the same cumulative count **and** exactly the same SurfaceField Float32 value. It found no such cell pairs in either event. It then compared **every adjacent pair** after sorting event-touched cells within each exact cumulative-count stratum by SurfaceField value. This uses no chosen similarity threshold. The observed adjacent SurfaceField differences were:

| Event | Adjacent pairs | Median `|Δ SurfaceField|` | 90th percentile | Pairs with different leg mix | Different A/B mix | Different timed group/leg sequence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 1,483 | 0.00028936 | 0.00275767 | 1,354 (91.3%) | 1,050 (70.8%) | 1,483 (100%) |
| P2 | 1,451 | 0.00045700 | 0.00395359 | 1,329 (91.6%) | 1,050 (72.4%) | 1,451 (100%) |

The adjacent-pair SurfaceField difference spans the full measured range (minimum `3.65e-7` / `5.29e-7`; maximum `0.10307` / `0.12734`). Thus these are a nearest-neighbor descriptive comparison, not a claim that every pair has a practically identical SurfaceField. The deterministic first leg-composition example in P1 has the same cumulative count `1` and SurfaceField values `0.0136445` / `0.0137843` (`Δ=0.00013985`), but the raw window cell history is one FR versus one RR touchdown at different times. P2's corresponding example has cumulative count `1`, values `0.0147421` / `0.0148377` (`Δ=0.00009563`), and different leg/tripod identity. These examples are selected by the runner's fixed cell/value ordering; the full adjacent-pair distributions remain in [`analysis.json`](analysis.json). The comparison matches pointwise cell values only; it does not match neighboring count/SurfaceField profiles or scaffold context, so it is not an identical-ROI or causal comparison.

Raw individual positions also carry sub-grid coordinates: the RMS distance from each point to its nearest production count-cell center is `0.00425` (P1) and `0.00428` (P2), with maximum offsets `0.00735` and `0.00728`. Those coordinates are present in the event stream but are not preserved in the integer count field.

### Leg, tripod and timing

| Event | FL | FR | ML | MR | RL | RR | Tripod A/B feet | A/B groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 405 | 412 | 408 | 417 | 414 | 414 | 1,236 / 1,234 | 418 / 414 |
| P2 | 406 | 419 | 417 | 422 | 418 | 425 | 1,246 / 1,261 | 423 / 426 |

For consecutive emitted groups from the same ant within each window, every observed transition switches A/B: `804/804` transitions in P1 and `819/819` in P2. Every emitted foot also matches the production tripod-to-leg mapping. This is the expected fixed gait pattern and is not treated as a new signal by itself. The global leg and tripod totals are close to balanced.

Touchdown times are event-relative, interpolated simulation timestamps, not 60 Hz sample bins. Consecutive observed contact-group intervals per ant have median `259.22 ms` / `282.83 ms` and 90th percentile `417.04 ms` / `417.78 ms` for P1/P2. Per-cell distinct-time revisit intervals have median `394.82 ms` / `387.18 ms` and 90th percentile `9.29 s` / `9.08 s`. The full distributions are kept in `analysis.json`; no burst or revisit cutoff was imposed.

Emitted event strength ranges from `0.03361` to `0.03638` over the two windows and is constant per ant in the sampled events. Source code derives it from ant ID; SurfaceField, TrailPlateBirth and MaterialStratigraphy do not use it as pressure or force.

## Gait countermodel and strongest counterargument

The known fixed gait explains the observed A/B alternation and leg membership exactly. P1/P2 have no departure from those rules, and aggregate leg frequencies remain close. SurfaceField/counts also preserve most broad load geography, as the high correlations show. There are no exact per-cell pairs matching both scalar values; the weaker nearest-neighbor comparison should not be described as an identical-state counterexample.

Against that counterargument, both windows preserve different actual space-time placements and leg/tripod mixtures at cells with the same exact cumulative count and near-ranked SurfaceField values. Those event-specific descriptors are absent from the scalar endpoint arrays. P1 and P2 show the same type of difference, but this is two windows from one seed and one deterministic model. The observed positions and timings are outputs of the fixed gait driven by actual travel, not evidence of an additional causal controller.

The frozen packet lacks per-tick gait phase and full ant movement/body-pose history. The prior traffic audit's movement samples cover only its selected scaffold association set, not all feet or complete trajectories. A trajectory-conditioned replay/countermodel was therefore not added: the required raw event fields already exist, and a replay was not needed to measure these outputs. The analysis can establish that raw contact-history descriptors differ from scalar encodings; it cannot isolate how much variation remains after conditioning on every ant's full realized trajectory and gait phase.

## Interpretation boundary

- **Implementation fact:** current mechanics use deterministic distance-driven tripod gait and scalar per-cell / field accumulation.
- **Measurement result:** P1/P2 raw contacts contain leg/tripod/time and sub-grid position detail that scalar endpoint arrays omit; broad spatial loading remains strongly redundant.
- **Research interpretation:** bounded independent contact-history information is observed in this descriptive sense. Its material relevance is untested.
- **Artistic implication:** none is selected. No claim is made that a Plate should encode each raw contact, that the contact stream describes force, or that this yields a better sounding body.

The next closed question, only if pursued, is whether a role-isolated, non-production interpretation of actual touchdown timing/leg organization changes material reading beyond the existing count and SurfaceField while holding the same frozen events. This pass creates no prototype and answers no material law.
