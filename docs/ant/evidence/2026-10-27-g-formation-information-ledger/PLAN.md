# G Formation Information Ledger — preregistration

## Question

Measure which spatial information from current-G environmental fields survives each existing `TrailPlateBirth` stage, without changing any production law. Separately measure whether the current raw mechanical field has spatial structure that differs from current chemical signal.

## Provenance and scope

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: the fresh main above; branch: `codex/ant-g-formation-information-ledger-20261027`.
- Production input: seed `20261005`, default `AntController`, 60 Hz, 0–120 model seconds, Audio Off with no bridge.
- The frozen current-G 120 s packet contains endpoint pheromone and `SurfaceField` maps, but not the native per-analysis chemical memory, support samples, or selector funnel. It cannot reconstruct Stages B–I. Run one production replay and one matched read-only observer replay; compare every tick.
- The 2026-10-08 local-accretion result is pre-G branch evidence. Use it only as historical context; do not transfer its natural outcomes to current G.

## Registered observer

Observer runs only after an ordinary production tick when `TrailPlateBirth.lastAnalysisTimeMs` advances. It reads detached/current arrays, calls the production `sampleSupport` and `buildSupportedMask` read-only, and uses an in-memory diagnostic copy of the exact selector to expose intermediate selection counts. It does not feed data back to the controller, write simulation state, call RNG, or create Plates.

### Formation ledger

- **A — native chemical:** exact 316×316 production `PheromoneField.values`; also project bilinearly onto 96×96 production analysis coordinates for matched-coordinate comparisons.
- **B — chemical memory:** exact 96×96 `chemicalMemory` plus the unchanged production `>= 0.30` mask. For A–D, record literal-positive connected structure and production-threshold connected structure where available; these are raster summaries, not new selection thresholds.
- **C — raw mechanics:** exact 96×96 `SurfaceField.values` compaction, positive support, and cells at the existing support threshold `>= 0.015`.
- **D — support readout:** `SurfaceField.sampleSupport(x,y,0.025)` at all 96×96 analysis coordinates for a complete diagnostic map. Production only queries D where B passes; assert equality at every such cell.
- **E — qualified mask:** unchanged B threshold AND D `>= 0.015`.
- **F — full skeleton:** exact production Zhang–Suen thinning of E and 8-connected components before source/boundary selection. Report occupied/skeleton cells, 8-connected components, endpoint/junction proxies, and 4-connected background holes.
- **G — source-annulus filter:** partition F components by whether any skeleton cell lies in the production annulus centered at `(0.5,0.72)`, radii `[0.055,0.115]`.
- **H — boundary/length filters:** for source-connected components, record production boundary targets (distance `<=0.05`), deterministic Dijkstra geodesic maximum, and the unchanged `>=0.30` minimum length decision separately.
- **I — retained network:** exact winning production candidate network and principal source-to-farthest-boundary path. Report retained cells/length against F and the winning source-connected component.
- **J — rasterized Plate:** candidate ribbon mask, the first immutable `TrailPlateBirth` descriptor mask, the union of all frozen `TrailPlateBirth` masks, and separately the union of actual `MaterialStratigraphy` Plate masks. At each birth, require candidate raster bytes to equal the newly frozen descriptor. The first descriptor mask is the actual frozen first Plate geometry.

All area, component, width, and topology measures are raster proxies. Endpoints/junctions use 8-neighbor degree; holes use 4-connected background components not touching the raster boundary. Neither is treated as an organismal or physical branch/loop count.

## Temporal and chemical/mechanical comparison

- Record one row at every actual production qualification analysis through 120 s. Keep actual floating-point model timestamps; do not synthesize nominal timestamps.
- Technical review snapshots: nearest production analysis to 30 s; first production candidate with `stableSeconds >= 10`; last analysis before first Plate birth; the first Plate birth analysis; and the latest analysis at or before 120 s. If any rule selects the same analysis, keep one snapshot with all applicable labels. If no analysis exists for a requested boundary, record it missing.
- Component continuity is descriptive: for each F component, record its maximum Jaccard overlap with any component at the immediately prior analysis. Do not assign biological identity or impose a persistence threshold.
- Select up to 12 raw-chemical local maxima at the 60 s analysis: positive 8-neighbor maxima; ties go to the lowest row-major index; sort by value descending then index ascending; greedily keep anchors more than 3 grid cells apart. No manual selection.
- Keep those fixed anchors at every review snapshot. Estimate the ridge cross-section normal from the minor eigenvector of the local value-weighted covariance in an 11×11 window; an isotropic tie uses the positive x direction. Sample raw chemical projection, raw compaction, and support readout at offsets `-8..+8` cells in `0.5`-cell steps. Report profiles and peak offsets without a post hoc threshold.

## Validation and outputs

- Compare observer OFF/ON every tick for agents/lifecycle, RNG state/calls, native pheromone, raw `SurfaceField`, chemical memory, candidate/birth state, FOOT_CONTACT stream, and `MaterialStratigraphy` arrays/descriptors.
- Assert observer-before/after state hashes are equal at each analysis; assert no extra births or events.
- Compare the 120 s replay endpoint and first Plate time/mask hash with the committed current-G frozen packet.
- Preserve exact selected checkpoint arrays, a per-analysis ledger, cross-section profiles, fixed-scale grayscale technical maps, source/tool hashes, and reproduction instructions.
- Do not modify `src/`, production constants, renderer, tests that define production behavior, or canonical `docs/ant/README.md`. No formation candidate, threshold tuning, second run, or production adoption.

## Pre-result failure boundary

If observer parity, frozen-input comparison, or candidate-to-frozen-mask equality fails, label the pass manipulation-invalid and stop analysis at the first divergence. Do not repair by changing production code or selecting a different seed/window.

## Measurement audit amendments and execution note

- Stage J now stores the first immutable `TrailPlateBirth` descriptor mask separately from both the active candidate ribbon and the later `MaterialStratigraphy` union. Those are different lifecycle states; this prevents an endpoint material union from being mislabeled as the frozen birth raster.
- The frozen raw archive has a 600 s contact-stream digest, so it cannot validate this replay's 120 s prefix. The replay prefix is compared exactly between observer OFF/ON, while group/individual-foot totals for its first 120 archived seconds are compared to the frozen raw input. No digest equality is claimed.
- The analysis script had a syntax error in the cross-section summary and an invalid unsorted-quantile calculation. Both are corrected before running the capture; continuous-field summaries use exact count/minimum/mean/maximum/positive-cell statistics, with full arrays preserved for exact analysis.
- The review distinguishes the frozen descriptor mask(s) from the mutable stratigraphy union. Digital endpoint/junction degree proxies are reported only for skeleton/network maps, not filled masks where local degree mostly measures interior fill.
- The first complete pair exposed missing Stage J distinctions and misleading filled-mask graph-degree measures. Tooling was then revised and the same deterministic seed/window was fully replayed four times as a matched OFF/ON pair while correcting those measurement issues. Only the final pair is retained. This exceeded the preregistered single-capture boundary; no world input, threshold, selector rule, anchor rule, or candidate parameter changed.
