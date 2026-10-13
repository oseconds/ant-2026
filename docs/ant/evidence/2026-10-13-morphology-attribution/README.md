# ANT morphology funnel attribution — 2026-10-13

## Question and decision

Across current natural ANT Plate births, where does spatial variety narrow most along:

```text
movement / occupancy → pheromone → chemical memory + support → qualification
→ skeleton / component → source-annulus to boundary selection → frozen Plate
```

**Decision: the largest observed geometry compression is in skeleton-to-candidate selection, especially pruning the chosen source-connected skeleton component to the source-to-boundary network.** Movement is already locally radial before that step. Qualification removes area, but the mechanical threshold almost never removes chemically qualified cells. Pheromone’s angular concentration change varies by seed. This is descriptive attribution across naturally coupled stages, not a causal estimate of movement or pheromone effects. Production morphology is unchanged.

The smallest justified next pass is **selector-only, read-only diagnosis** on the current baseline: isolate the source-annulus / boundary target and network-retention decisions in one shadow comparison. Do not alter the production selector or add a new morphology mechanism in that pass.

## Baseline and scope

- Production baseline: current `main`, `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`.
- Task branch began at `45e492cedc902aec0ec771d30f8e7d9327c8c958`; the completed ANT UI / transport / dev-audio and 0–200% volume commits remain preserved.
- The attribution runner asserts that `origin/main` is the verified SHA above and that `src/lib/agents/ant/` matches it. Per-source and diagnostic-tool SHA-256 values are in [`manifest.json`](./manifest.json).
- Default retained-material locomotion resistance was **On** in both matched runs. The older 2026-10-08 morphology numbers were not reused: they predate that current default.
- No movement, pheromone, SurfaceField, TrailPlateBirth, stratigraphy, Plate, Nodule, material, or audio production code was changed. No optional shadow selector or pheromone ablation ran.

## Method

Natural runs used seeds `20261005`, `20261006`, and `20261007`, each for 600 simulated seconds at fixed `dt = 1/60 s`. One run was plain and the other used read-only diagnostics; both used the current default-on locomotion law and identical injected LCG state. The harness retained all 60 Hz ant positions and captured the raw pheromone, chemical memory, raw SurfaceField, production support samples, combined supported mask, selector funnel, and actual frozen descriptor at each actual Plate birth. The trajectory window for each birth is `(birthTime − 20 s, birthTime]`: it includes that tick’s movement/contact and ends before the new Plate is inserted into material stratigraphy.

All gridded maps use one normalized 96×96 world coordinate system. At each birth the full SurfaceField support grid was recomputed through its existing `sampleSupport` method, then checked against the production support array on chemically qualified cells. Eligibility was reconstructed as the chemical and mechanical threshold conjunction, and its mask was checked against the exact production mask. A copied current selector records skeleton components, annulus/boundary cells, candidate paths and pruning; its actual candidate geometry is checked against the live candidate. The captured descriptor is checked against its emitted birth event.

Metrics are intentionally small:

- **Effective cells:** `(sum weights)² / sum(weights²)`, invariant to multiplying a field by a constant; binary masks reduce to their positive-cell count.
- **Angular dispersion:** `1 − circular resultant length`; lower values mean a more directionally concentrated distribution around the recruitment/source origin.
- **Angular span:** minimum circular angle interval containing positive cells. Tiny residual field values can widen this metric, so it is read with angular dispersion and effective cells.
- **Movement path:** path length / endpoint displacement (tortuosity) and absolute step projection onto the radial direction (radial alignment). Absolute alignment does not distinguish inward from outward travel.
- **Selector retention:** selected source-to-boundary skeleton pixels divided by the full selected skeleton-component pixels. This is a raster-pixel ratio, not a count of physical branches.

The [representative funnel](./visuals/funnel-representatives.svg) chooses the median ordinal birth per seed. Every field type uses one fixed scale across representatives: PheromoneField 0–8, chemical memory / support / masks 0–1, and occupancy a global scale derived from the maximum cell count across all 100 birth windows. The [seed-stage distribution view](./visuals/seed-stage-distributions.svg) shows every birth with one metric scale per chart row. No per-image normalization is used.

## Results

| Seed | Natural births | Movement tortuosity / radial alignment | Occupancy → pheromone angular dispersion | Combined supported cells | Chosen skeleton component → selected network | Frozen Plate cells |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 29 | 1.22 / 0.90 | 0.329 → 0.338 | 2,772 | 1,612 → 478 (29.0%) | 1,493 |
| 20261006 | 33 | 1.18 / 0.90 | 0.341 → 0.300 | 2,737 | 1,615 → 496 (31.6%) | 1,524 |
| 20261007 | 38 | 1.20 / 0.90 | 0.317 → 0.298 | 2,803 | 1,646 → 537 (30.8%) | 1,652 |

There are **100 births** total. Movement is already strongly radial in each recent 20-second window, with median tortuosity 1.18–1.22 and radial alignment 0.90. Its occupancy still covers a broad angular span (5.68 rad). This supports movement as an upstream contributor to radial-looking routes, but does not by itself explain why the frozen Plate footprint is narrower.

Pheromone increases the spatial effective-cell count relative to recent occupancy (per-seed medians about 1,678–1,728 vs 796–824). Its angular dispersion drops in two seeds and rises slightly in seed 05, so reinforcement is a **mixed secondary observation**, not a consistent primary compression. The natural comparison cannot assign causality between movement and pheromone feedback.

The chemical threshold reduces the broad field to roughly 2,700 chemically qualified cells. Mechanical qualification then changes the cell count in only **1 of 100 births**; the other 99 have identical chemical-qualified and combined-supported counts. Recomputed support matches production at every chemically qualified cell across all 100 births. Thus chemical gating affects area, but the mechanical threshold is not the main morphology bottleneck in these runs.

From the combined-supported mask, the median skeleton spans 3.43–4.34 rad and contains about 1,670–1,730 pixels. The chosen skeleton component retains about 1,610–1,650 of those pixels, but its source-to-boundary network keeps only **29–32%** (median across seeds); selected principal paths have tortuosity 1.16–1.18, radial alignment 0.82–0.84, and angular span 1.14–1.23 rad. This is the clearest observed geometric narrowing. The frozen ribbon expands from roughly 480–540 network pixels to 1,490–1,650 mask pixels while keeping a 2.57–2.81 rad footprint. The frozen mask, centerline nodes, and principal path match the selected descriptor exactly: freezing itself adds no further compression.

### Attribution

| Explanation | Assessment |
| --- | --- |
| A. Movement is already radial | **Secondary, supported descriptively.** Movement windows are strongly radial, but their broad occupancy does not reproduce the narrower Plate footprint by itself. |
| B. Pheromone narrows varied movement | **Mixed / unresolved causally.** Angular concentration shifts in different directions by seed; natural runs cannot isolate the feedback link. |
| C. Chemical + mechanical qualification narrows shape | **Secondary for area; mechanical support unsupported as primary.** Chemical qualification reduces eligible area; mechanical support removes almost no chemically eligible cells. |
| D. Source-annulus → boundary selection compresses shape | **Primary observed funnel compression.** Most pixels in the chosen skeleton component do not enter the selected network, and the resulting principal paths are long and radially aligned. |
| E. Multiple stages contribute | **Supported.** Upstream radial travel and chemical gating contribute, while selector pruning is the strongest measured compression. |

The optional pheromone ablation was **not needed to locate the strongest stage** and was not run. A/B’s independent causal shares remain untested. This decision is not a claim that pheromone reinforcement is absent.

## Integrity, limits, and reproduction

Across each paired 600-second replay, all **36,001 tick rows** matched for agent state, RNG, chemical and mechanical fields, chemical memory, birth state, contacts, lifecycle, and contact counts. Trajectory bytes, every birth/contact record, and final complete world snapshots matched. All 100 captured final descriptors matched their production birth events. The observation consumed no additional RNG. Numeric outputs are checked finite. These checks verify observer noninterference and deterministic matched runs; they do not make the natural stage relationships causal.

Each seed’s compressed `.anttraj.gz` is the complete 60 Hz position movie. Its `.xor.gz` companion stores exact Float32/Uint32 birth-time fields with per-birth offsets in the replay provenance JSON. [`birth-measurements.json`](./data/birth-measurements.json) contains the per-birth, per-stage measurements, selector funnel, selected candidate and frozen descriptor. The scripts are the source of the decoded metrics and figures.

Reproduce the evidence package with:

```powershell
node scripts/ant-morphology-current-attribution.js
```

Validation recorded for this package: focused morphology diagnostics **12/12 pass**; full `npm test` **331/331 pass**; `npm run build` succeeds (409 modules transformed). The build emits the existing Zod annotation-position and Vite large-chunk warnings; neither is a regression for this diagnostic-only pass.
