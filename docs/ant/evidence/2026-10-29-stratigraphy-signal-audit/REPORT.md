# Prior stratigraphic state at actual Plate commits

## Decision

**`INDEPENDENT STRATIGRAPHIC CONTEXT OBSERVED`**, bounded to one deterministic 600 s current-G sequence (`seed=20261005`, 60 Hz, Audio Off). Later actual Plate masks cover cells with different pre-existing layer counts, depth, and ordered Plate histories. Binary prior overlap alone collapses some of that variation. Current fields and new-mask geometry share measurable structure with the stacks, so this result means separately retained historical context was observed; statistical, predictive, or geometry-conditioned independence was not established.

This label means the history is present and distinguishable in this sequence. It does **not** mean the history is an independently generated cause, that it is mechanically consequential, or that a stratigraphy-dependent Plate body/material law is supported.

## Question and boundary

At each actual Plate materialization, does the substrate immediately before append carry event-specific history beyond (a) any prior overlap, (b) current chemical and mechanical scalar state, and (c) the new Plate's own geometry?

The primary data are the pre-append columns under every actual new Plate mask cell. The new mask is only the sampling footprint for this question. Post-append states are used only to verify append semantics. No body mask, material coefficient, morphology, or production feedback is inferred.

## Baseline and provenance

- Production authority: `main` `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-gait-contact-signal-audit-20261029` at `66a1c16adbc308fdc424307202c61e985b1189c5`.
- Frozen input package: `docs/ant/evidence/2026-10-25-g-production-candidate-review/`.
- Frozen run: current-G, seed `20261005`, 600 s, 60 Hz, Audio Off; 36 actual Plate commits, from P1 `84.016666667 s` to P36 `576.883333333 s`.
- Input SHA-256 values and the replay's full source hash comparison are stored in [`analysis.json`](analysis.json). The compressed seed raw packet hash is `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`.

The frozen raw packet contains actual birth order/times and mask hashes, but not full masks or event-time field maps. Therefore one exact-seed reconstruction was necessary. It reproduced the frozen summary, all 600 one-second position rows and contact buckets, all birth descriptors/times/mask hashes, nodule births, event hashes, and the 30/60/120/300/600 s pheromone, SurfaceField, and cumulative-occupancy maps. Final RNG state/call count also matched the frozen summary. See [validation](VALIDATION.md).

The commit-time chemical, pheromone, SurfaceField, support, and retained-load samples in this report come from that current-main replay; the frozen packet does not contain corresponding per-commit field snapshots. `TrailPlateBirth.js` and `SurfaceField.js` match the frozen source receipt. `PheromoneField.js` does not, so exact replay of saved anchors is established, but exact original-source identity for those event-time pheromone samples is not.

Current-main hashes for `AntController.js`, `TrailPlateBirth.js`, `MaterialStratigraphy.js`, and the other recorded behavior sources match the frozen provenance except `PheromoneField.js`. The latter's frozen receipt hash is from a different source version; current-main replay nevertheless matches all recorded run and checkpoint anchors exactly. The founder evidence script and ANT README hashes also differ, but neither is a simulation behavior source. These mismatches remain disclosed rather than treated as exact source identity.

## Production semantics (implementation facts)

The current `AntController.tick` path first passes realized foot-contact events to `SurfaceField`, `TrailPlateBirth`, and `MaterialStratigraphy`; advances simulation time; obtains births from `TrailPlateBirth`; appends each frozen descriptor to `MaterialStratigraphy`; then advances the nodule system. `TrailPlateBirth.advance` receives pheromone, SurfaceField, and time; it does not receive the previous material stack. Thus this pass measures a candidate context available at commit, not an existing body-generation input.

`MaterialStratigraphy.addPlate` appends an immutable descriptor in historical order. Per-cell `columns` hold bottom-to-top plate indices; `layerCountByCell`, `topLayerByCell`, and `totalDepthByCellMeters` are derived from those columns. The depth array sums the thicknesses above the bottom foundation, so a single-layer cell has `layerCount=1` and `totalDepth=0`; it is not total stack thickness. When a descriptor has no explicit positive thickness, the current source derives it from `meanHalfWidth` as `clamp(0.001 + 0.05 × meanHalfWidth, 0.001, 0.01)` meters. The captured commit descriptors use this exact source path.

`footLoadByCell` is a retained local count of accepted individual FOOT_CONTACT positions. It is distinct from the cumulative SurfaceField response and from the ordered Plate column. The downstream nodule/foundation qualification reads prior layers, compaction, local foot load, and persistence; that existing mechanism is documented only as downstream context and is not evidence that stratigraphy should affect a new Plate.

## Reconstruction and measurement method

The observer wrapped only the runtime instance's `MaterialStratigraphy.addPlate` in the research runner. Immediately before each real append it recorded the frozen descriptor and, for every `mask===1` cell on the existing 96×96 material grid: exact layer count, buried depth, top Plate ID, full ordered Plate IDs, retained foot load, TrailPlate chemical memory, bilinearly sampled pheromone, SurfaceField value, and SurfaceField support at the existing `TRAIL_PLATE_SUPPORT_RADIUS=0.025`. It then called the original append unchanged and captured the resulting cell/Plate-history values only for reconstruction checks.

Offline reconstruction appended those exact descriptors in recorded order to the current-main `MaterialStratigraphy` class. It asserted every live pre-commit cell, post-commit cell, thickness, and Plate-history record against the rebuild. It did not infer missing masks from images or select a suffix after seeing the result.

The audit script's pair selection rule was in place before capture output was generated: among all commit pairs with nonzero prior overlap, minimize the absolute overlap-fraction difference; ties resolve by commit order. P31/P35 are the unique minimum-difference pair, so no tie-break was used. Current fields and mask geometry do not enter this selection rule. This is a deterministic overlap-matched comparison, not a timestamped preregistration.

## Whole-sequence results

Across all 36 new Plate masks there are 66,089 body-cell observations over 5,711 unique 96-grid cells. The pre-commit state of those observations is:

| Pre-commit state | Observations | Share of all mask-cell observations |
| --- | ---: | ---: |
| Virgin (`layerCount=0`) | 5,711 | 8.64% |
| Single layer (`layerCount=1`) | 5,572 | 8.43% |
| Multiple layers (`layerCount≥2`) | 54,806 | 82.93% |
| Any prior material (`layerCount≥1`) | 60,378 | 91.36% |

Exact layer counts range from 0 through 34 across the pre-commit mask cells. The pre-commit buried-depth distribution is min `0`, q25 `1.706 mm`, median `8.310 mm`, q75 `15.047 mm`, q90 `23.321 mm`, max `54.948 mm`. For overlapping cells only, the median is `8.421 mm`. These depth values exclude the foundation layer as defined by the implementation.

There are 23,565 distinct ordered pre-commit stack signatures across observations, involving 35 different existing Plate IDs. Among exact `(layerCount, buriedDepth)` value groups, 1,392 groups contain more than one ordered stack. IDs and order preserve event provenance; this is not a claim that IDs encode distinct material physics.

Per-commit counts below are `virgin / single-layer / multi-layer`. Depth is median/q90 in millimeters over all cells in that new mask. `Stacks / IDs` counts distinct ordered pre-commit stacks and distinct underlying Plate IDs represented within that mask.

| Commit | Time (s) | Mask cells | Virgin / single / multi | Prior overlap | Layer-count range | Depth median / q90 (mm) | Stacks / IDs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 84.017 | 356 | 356 / 0 / 0 | 0.000 | 0–0 | 0.00 / 0.00 | 1 / 0 |
| P2 | 106.017 | 544 | 321 / 223 / 0 | 0.410 | 0–1 | 0.00 / 0.00 | 2 / 1 |
| P3 | 132.017 | 1,088 | 698 / 238 / 152 | 0.358 | 0–2 | 0.00 / 1.65 | 4 / 2 |
| P4 | 143.017 | 1,100 | 256 / 519 / 325 | 0.767 | 0–3 | 0.00 / 3.31 | 8 / 3 |
| P5 | 167.017 | 1,819 | 836 / 374 / 609 | 0.540 | 0–4 | 0.00 / 3.31 | 16 / 4 |
| P6 | 185.017 | 2,059 | 434 / 682 / 943 | 0.789 | 0–5 | 0.00 / 3.33 | 32 / 5 |
| P7 | 197.017 | 1,763 | 328 / 328 / 1,107 | 0.814 | 0–6 | 1.67 / 5.00 | 54 / 6 |
| P8 | 214.017 | 1,642 | 272 / 288 / 1,082 | 0.834 | 0–7 | 1.67 / 6.66 | 69 / 7 |
| P9 | 229.017 | 1,861 | 181 / 288 / 1,392 | 0.903 | 0–8 | 3.31 / 8.31 | 123 / 8 |
| P10 | 240.017 | 1,777 | 275 / 200 / 1,302 | 0.845 | 0–9 | 3.34 / 9.98 | 168 / 9 |
| P11 | 251.017 | 2,068 | 302 / 347 / 1,419 | 0.854 | 0–10 | 3.36 / 10.02 | 253 / 10 |
| P12 | 262.017 | 1,870 | 117 / 348 / 1,405 | 0.937 | 0–11 | 3.38 / 10.05 | 295 / 11 |
| P13 | 272.017 | 1,952 | 160 / 136 / 1,656 | 0.918 | 0–12 | 3.41 / 11.75 | 333 / 12 |
| P14 | 282.017 | 1,764 | 167 / 143 / 1,454 | 0.905 | 0–13 | 5.08 / 13.41 | 415 / 13 |
| P15 | 301.017 | 1,751 | 92 / 169 / 1,490 | 0.947 | 0–14 | 6.69 / 13.43 | 515 / 14 |
| P16 | 312.017 | 2,005 | 123 / 136 / 1,746 | 0.939 | 0–15 | 6.70 / 15.10 | 612 / 15 |
| P17 | 325.017 | 1,992 | 97 / 128 / 1,767 | 0.951 | 0–16 | 6.76 / 15.10 | 702 / 16 |
| P18 | 341.017 | 2,010 | 125 / 155 / 1,730 | 0.938 | 0–17 | 6.74 / 16.76 | 711 / 17 |
| P19 | 351.017 | 2,129 | 52 / 122 / 1,955 | 0.976 | 0–18 | 8.36 / 16.76 | 854 / 18 |
| P20 | 364.017 | 2,235 | 98 / 84 / 2,053 | 0.956 | 0–19 | 10.00 / 18.38 | 1,071 / 19 |
| P21 | 374.017 | 2,085 | 48 / 103 / 1,934 | 0.977 | 0–20 | 9.98 / 20.01 | 996 / 20 |
| P22 | 384.017 | 2,509 | 96 / 75 / 2,338 | 0.962 | 0–20 | 11.62 / 19.99 | 1,277 / 21 |
| P23 | 395.017 | 2,385 | 69 / 73 / 2,243 | 0.971 | 0–21 | 11.69 / 21.67 | 1,273 / 22 |
| P24 | 406.017 | 2,119 | 24 / 83 / 2,012 | 0.989 | 0–22 | 13.32 / 23.37 | 1,230 / 23 |
| P25 | 416.017 | 2,179 | 33 / 45 / 2,101 | 0.985 | 0–23 | 13.32 / 23.44 | 1,261 / 24 |
| P26 | 427.017 | 2,004 | 21 / 47 / 1,936 | 0.990 | 0–24 | 13.29 / 25.04 | 1,157 / 25 |
| P27 | 437.017 | 2,106 | 29 / 32 / 2,045 | 0.986 | 0–25 | 13.33 / 25.06 | 1,289 / 26 |
| P28 | 454.017 | 2,263 | 21 / 40 / 2,202 | 0.991 | 0–26 | 14.97 / 26.65 | 1,488 / 27 |
| P29 | 496.017 | 1,948 | 51 / 28 / 1,869 | 0.974 | 0–27 | 14.99 / 28.31 | 1,321 / 28 |
| P30 | 506.017 | 2,199 | 4 / 61 / 2,134 | 0.998 | 0–28 | 15.04 / 29.91 | 1,537 / 29 |
| P31 | 519.017 | 1,981 | 2 / 3 / 1,976 | 0.999 | 0–29 | 18.25 / 31.61 | 1,518 / 30 |
| P32 | 529.100 | 1,737 | 1 / 7 / 1,729 | 0.999 | 0–30 | 16.69 / 30.66 | 1,317 / 31 |
| P33 | 541.300 | 1,528 | 0 / 5 / 1,523 | 1.000 | 1–31 | 19.89 / 33.29 | 1,234 / 32 |
| P34 | 556.550 | 1,665 | 11 / 33 / 1,621 | 0.993 | 0–32 | 18.33 / 33.29 | 1,295 / 33 |
| P35 | 566.717 | 1,695 | 2 / 15 / 1,678 | 0.999 | 0–33 | 18.42 / 34.92 | 1,318 / 34 |
| P36 | 576.883 | 1,901 | 9 / 14 / 1,878 | 0.995 | 0–34 | 18.36 / 35.01 | 1,472 / 35 |

## Binary overlap and current-state comparisons

The deterministic overlap-matching rule selects P31 and P35. Their prior-overlap fractions are `0.998990` and `0.998820` (absolute difference `0.000170`). Despite effectively the same binary-overlap fraction, their exact discrete layer-count distributions have total-variation distance `0.1209`; P31 ranges from 0–29 layers and P35 from 0–33. P31 contains 1,518 distinct ordered pre-commit stacks across 30 underlying IDs; P35 contains 1,318 stacks across 34 IDs.

Their per-mask current-scalar quartile bands overlap, but the observations are not same-cell or exactly matched states:

| Current field | P31 median (q25–q75) | P35 median (q25–q75) |
| --- | ---: | ---: |
| TrailPlate chemical memory | 0.5005 (0.2897–0.6534) | 0.5343 (0.3310–0.6766) |
| Pheromone sample | 0.0378 (0.0098–0.1060) | 0.0466 (0.0126–0.1246) |
| SurfaceField value | 0.3910 (0.3014–0.4930) | 0.4228 (0.3241–0.5469) |
| SurfaceField support | 0.3847 (0.3051–0.4806) | 0.4116 (0.3372–0.5343) |
| Retained local foot load | 12 (8–18) | 14 (9–21) |

Across all mask-cell observations, layer count correlates with SurfaceField value (`Pearson r=0.564`, `Spearman ρ=0.584`), support (`r=0.598`, `ρ=0.634`), and retained foot load (`r=0.487`, `ρ=0.532`). For overlapping cells only, those correlations are `0.526/0.532`, `0.560/0.580`, and `0.463/0.485`. The relationship to TrailPlate chemical memory is weaker (`0.098/0.100` overall; `0.073/0.069` on overlap-only cells), as is the relationship to pheromone (`0.025/0.029` overall; `0.042/0.039` on overlap-only cells). This is descriptive correlation, not a causal or multivariable independence test.

An exact current-state equality query used the same 96-grid cell and exact pheromone, chemical-memory, SurfaceField, support, retained-load, and overlap values across commit observations. It found zero matching groups. Because several fields are continuous, this exact-equality query has no inferential force and does not establish nonredundancy. The P31/P35 comparison is an objective distribution-level comparison, not a same-cell or exact-field match.

The actual new-mask geometry is also related to stack distribution. Across all 630 unordered pairs of actual binary Plate masks, mask Jaccard has median `0.236` (q90 `0.361`, max `0.598`). Pairwise mask Jaccard and total-variation distance between pre-commit layer-count distributions are strongly inversely associated (`Pearson r=-0.713`, `Spearman ρ=-0.728`): more similar masks generally have more similar stack-count distributions. The objectively most similar mask pair is P24/P25 (Jaccard `0.598`), with layer-count distribution distance `0.076`; it does not show a large separation. P31/P35, selected by overlap fraction only, have mask Jaccard `0.304`, so their stack difference is not a same-geometry comparison. This is counter-evidence to geometry-orthogonal independence and narrows the claim.

Every observation is nevertheless a cell included by an actual new mask, so current-mask membership is `1` in every measured row. At the same fixed grid location, repeated visits can encounter a different pre-commit stack; for example, cell 261 changes between P5 and P6 while both masks include that cell. That establishes local historical variation at a fixed position, but it does not control for whole-mask shape, local centerline distance, or the full connection geometry.

## Temporal persistence and identity/order

Across same-cell adjacent revisit pairs (adjacent visits to that cell, not necessarily adjacent global commits), layer count never decreased and increased at every revisit. Chemical memory decreased in 34,714 of 60,378 pairs; SurfaceField value decreased in 21,598; support decreased in 9,967; retained foot load increased in 22,932. These counts show that immutable stack depth can persist or grow while current fields change; they do not establish material effect.

One local sequence is cell index 261: P5 at `167.016667 s` has four layers, `4.960 mm` buried depth, chemical `0.5821`, SurfaceField `0.21166`, support `0.19787`, load `6`, and stack P1–P4. P6 at `185.016667 s` has five layers, `6.633 mm` buried depth, chemical `0.5038`, SurfaceField `0.21020`, support `0.19650`, load still `6`, and stack P1–P5. The values are reported as observed; no closeness threshold was chosen.

Layer count and buried depth are near-duplicates in this sequence: Pearson `r=0.9989` and Spearman `ρ=0.9966` over all observations. Among overlap cells, they are `0.99999/0.99802`. Depth varies mainly because individual descriptor thicknesses vary slightly; these measurements do not establish two separate useful signals. Different ordered stacks at the same exact count/depth preserve event provenance, not a demonstrated physical difference.

## Counterexamples and limits

- P1 lies entirely on virgin substrate. P2 already has 41.0% prior overlap but no multi-layer cells; overlap presence alone does not identify a stack deeper than one layer.
- Later masks often overlap almost completely, yet their exact layer-count distributions and ordered stacks remain heterogeneous. P31/P35 are selected without looking at current fields.
- SurfaceField/support and retained foot load share a moderate spatial gradient with stack depth. New-mask similarity also tracks stack-distribution similarity strongly. The evidence does not support calling stratigraphy wholly orthogonal to current mechanical state or whole-mask geometry.
- Exact full current-field matches at the same cell were absent, and there is only one seed/run. The audit does not establish cross-seed prevalence, predictive benefit, causal necessity, or material relevance.
- The run's frozen `PheromoneField.js` provenance hash differs from current main. Deterministic replay matched all recorded motion, event, field-map, and RNG anchors, but this is not exact source-blob identity.
- No physics or artistic mapping is implied by layer count, depth, top-Plate ID, or ordered ID history. No next technical question is justified from this audit alone; any later artist/modeling question would first need a separately defined meaning before mapping is proposed.

## Technical atlas

[`atlas.html`](atlas.html) uses one common 96×96 coordinate frame and fixed global data ranges. It exposes new Plate mask, pre-commit layer count, buried depth, top Plate identity, chemical memory, pheromone, SurfaceField, support, and retained foot load. Raw values are available on cell inspection. The atlas is a measurement aid, not a body prototype.

## Interpretation and stop

- **Implementation fact:** current production retains immutable ordered Plate columns and derived layer-count/depth/top arrays.
- **Measurement:** the actual later commit masks sample heterogeneous stacks; similar binary overlap and broad current-field distributions do not make those measured stacks identical.
- **Research interpretation:** bounded pre-existing stratigraphic history is separately retained beyond binary overlap in this one run; the measurements do not show that current scalar fields or whole-mask geometry cannot predict it.
- **Artistic implication:** whether a later Plate should acknowledge that history is an open meaning/body-generation question. This pass does not answer it.

**No stratigraphy-dependent Plate body or material law is validated.** No prototype or production state was created.
