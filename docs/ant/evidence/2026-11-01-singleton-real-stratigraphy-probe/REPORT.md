# Singleton X as real stratigraphy — seed 20261005, 300 s

## Decision and scope

**REAL STRATIGRAPHY ADDS MATERIAL DYNAMICS.** This classification applies to the native retained-material/Nodule history, not to an additional movement or B/C formation response. OVERLAY and REAL have exactly the same measured movement/environment trajectory, effective-L exposure, B/C opportunities/maturations and native production Plate births through 300 s. REAL nevertheless produces a different native Nodule history: six births versus five, with three research-founded Nodules. The movement-only overlay is an exact proxy for this run's movement/formation response, but is not an equivalent retained material world.

This is the authorized one-seed integration probe, not another feedback-sensitivity seed or adoption of singleton formation. Seed 20261005 ran three fresh arms for 18,000 ticks each at dt=1/60, Audio Off. No second seed, parameter tuning, Residence, capacity change, contested arbitration, PR, merge or production adoption occurred.

Production authority is `bc045dc3caa5954df633ecbee37fbabcb8224f30`; frozen closure is `2cfe9cbab78df2af9e77d9df450c67fb603aa22c`; prior seed05 overlay is `f462d7b0f684afea1bb6868b6045524360e05f2e`; branch parent is `9b03a392588429643cf43b386706d58bbfb66418`. Simulation code and the preregistered [protocol](PROTOCOL.md) were saved before execution at `2a0cb35b6c19cdf969d8c887b2eb4577fcb361b6`. Later result-tool edits only repaired SVG spacing, quantitative axis annotations and a missing fourth-series color; the six derived JSON files stayed byte-identical.

## Validity gates before REAL

CONTROL passed the frozen current-production checks at all 300 real analysis boundaries: exact E/F/B/C/D, native layer/top arrays, 14 production Plate IDs/times/masks, and RNG calls/state. Its live B/C observer matched 25,364 opportunity rows, 1,244,304 X-cell memberships and all 277 frozen maturation events.

Both fresh CONTROL and OVERLAY then matched their prior seed05 saved run objects exactly after removing only `experimentBranch`, including 18,000 tick fingerprints, 300 anchors, 18,000 tick metrics and five checkpoints. OVERLAY's complete exposure receipt also matched. These gates passed before REAL started. No replication mismatch or observer RNG violation occurred. [Conformance receipt](analysis/conformance.json.gz).

## What was integrated

The unchanged B/C observer retains 20 s uninterrupted maturation, adjacent X Jaccard >=.60, exact same-X coeval collapse, and degree-zero singleton eligibility. Contested events remain inert. REAL uses that same live process; it does not replay OVERLAY's decisions into a different world.

For each eligible event group, REAL calls actual `MaterialStratigraphy.addPlate()` with the exact X mask and maturation time. It allocates no overlay and keeps `researchLayerCountProvider` null. Its next tick reads the native combined `layerCountByCell`. The inherited default-off provider exists only for reproducing OVERLAY; production default behavior and `TrailPlateBirth` are unchanged.

The local descriptor omits source, target, centerline, principal path and width fields. It uses a separate research ID/provenance namespace, exact 96-grid mask, two deterministic in-X pickups and the existing neutral audio-test fixture coefficients (.9 stiffness, 1.1 density, .35 damping). All B/C/dual layers share these coefficients. Omitting thickness/width invokes the existing .002 m modeled-thickness fallback. These are explicit structural/model inputs, not material properties measured from B or C. [Complete inherited/derived/artificial field definitions](PROTOCOL.md#minimal-local-descriptor-and-honest-semantics).

Native production insertion and Nodule advancement complete before post-tick research insertion. The first local Plate is born at 42.0166667 s after completed tick 2,521. REAL matches CONTROL's legacy fingerprint through that tick. The new native layer map is available at tick 2,522; the first ant actually reads a research layer at 44.0166667 s. Completed movement, environment and RNG remain unchanged around every insertion. Coeval accepted research masks are disjoint, so their iteration order does not create contested vertical placement.

## Primary result: OVERLAY and REAL movement/formation are exact

The [exact comparison](validation/overlay-real-exact-comparison.json) finds:

- 18,000/18,000 movement/environment fingerprints and all tick movement metrics equal.
- All 300 E/F/B/C/D states, B/C opportunity rows, mature-X sets, singleton/contested counts and native production-candidate records equal.
- All 336 maturation events and all nine production birth ID/time/mask receipts equal.
- Complete exposure JSON and compressed exposure bytes equal. Research-layer counts reconstructed from REAL exactly match OVERLAY's increment map on all cells.

The movement/environment digest excludes the intentionally different stratigraphy/Nodule state. The legacy full digest diverges at tick 2,522 because REAL now retains material; that is not movement divergence.

| Measurement | CONTROL | OVERLAY | REAL |
| --- | ---: | ---: | ---: |
| Actual analyses | 300 | 300 | 300 |
| B / C maturations | 147 / 130 | 179 / 157 | 179 / 157 |
| All maturation events | 277 | 336 | 336 |
| Singleton decision groups | 135 | 151 | 151 |
| Contested decision groups, inert | 61 | 85 | 85 |
| Native production Plate births | 14 | 9 | 9 |
| Research material Plate births | 0 | 0 | 151 |
| Native Nodule births | 5 | 5 | 6 |

OVERLAY and REAL each have 268,721 living-ant ticks, with 52,564 exposed ant ticks (19.56%) across 361 ants. Speed and A arithmetic change on all 52,564 exposed ticks; D same-flow targets change on 4,255 opportunities. Research L min/median/q90/max is 1/1/2/4; effective ant-read L is 1/3/6/10. These are exact matched responsibilities, not a common opportunity score or force measurement.

## Identical 60 s formation windows

Means use actual analysis anchors in half-open model-time windows; every complete window has 60 native anchors. B/C opportunity counts, singleton/contested means and both pooled/per-anchor shares remain in the [machine comparison](analysis/formation-comparison-60s.json).

| Window | Mean mature X CONTROL | Mean mature X OVERLAY = REAL | New B/C CONTROL | New B/C OVERLAY = REAL | Research layers in REAL |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0–60 s | .917 | .933 | 3 / 3 | 3 / 3 | 4 |
| 60–120 s | 5.117 | 9.983 | 27 / 25 | 39 / 35 | 37 |
| 120–180 s | 11.417 | 10.300 | 44 / 44 | 43 / 33 | 30 |
| 180–240 s | 11.217 | 10.617 | 42 / 38 | 30 / 30 | 24 |
| 240–300 s | 9.817 | 16.950 | 31 / 20 | 64 / 56 | 56 |

OVERLAY/REAL pooled contested shares are 26.79%, 31.05%, 54.21%, 56.67% and 40.81%. The same 236 exact-X decision groups split into 151 singleton and 85 contested groups. Accepted local provenance is B 29, C 22 and dual B/C 100. This observed composition does not choose B-OR-C or B-AND-C as a formation law.

| Checkpoint | OVERLAY = REAL population | OVERLAY = REAL travel | OVERLAY = REAL blocked ant ticks | Native Plates O/R | Combined Plates REAL | Nodules O / R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 s | 15 | 34.993 | 513 | 0 | 4 | 0 / 0 |
| 120 s | 17 | 88.027 | 1,398 | 3 | 44 | 0 / 0 |
| 180 s | 15 | 146.950 | 2,781 | 4 | 75 | 0 / 1 |
| 240 s | 13 | 203.131 | 3,709 | 8 | 103 | 2 / 1 |
| 300 s | 16 | 257.321 | 4,592 | 9 | 160 | 5 / 6 |

Population, cumulative spawn/retirement, travel, blocked movement, pheromone, SurfaceField and B match exactly between OVERLAY and REAL. Their values differ from CONTROL, as already established by the prior feedback probe. The [checkpoint receipt](analysis/checkpoint-world-comparison.json) retains all three arms, field hashes and distributions. Travel preserves the prior probe's realized endpoint-distance method, including clamped departure endpoints; it is not requested velocity.

## Actual retained material and chronology

REAL finishes below the unchanged 256 ceiling: **9 production + 151 research = 160 Plates**. Research mask min/median/q90/max is **2 / 3 / 54 / 211 cells**. These are exact sparse X cells, not filled area or expanded corridors.

| Final quantity | Production | Research | Combined |
| --- | ---: | ---: | ---: |
| Unique covered cells | 4,274 | 1,812 | 4,824 union |
| Layer-cell incidences | 11,773 | 2,498 | 14,271 |
| Exposed top cells | 3,961 | 863 | 4,824 |
| Buried layer-cell incidences | 7,812 | 1,635 | 9,447 |
| Descriptors with any buried cells | 8 | 76 | 84 |
| Completely buried descriptors | 0 | 26 | 26 |

Production/research union intersection is 1,262 cells: 550 research-covered cells remain outside final production coverage. Global layer-count q50/q90/max is **1/5/11**, using all 9,216 cells including zeros. This differs from the actual retained production-only map in OVERLAY, even though OVERLAY's effective movement L matches REAL. Native above-foundation depth q90/max is **6.569 / 16.769 mm**; the median is zero. A first layer has zero burial depth. Depth comes from later overlap, not age.

The [chronology receipt](analysis/stratigraphy-chronology.json) reconstructs every column from immutable masks and actual insertion order. Positive pair counts are research-to-research 110, research-to-production 184, production-to-research 129 and production-to-production 36. These are overlapping descriptor pairs, not exclusive event counts or a new allocation rule.

The first observed overlap of each requested type, chosen by actual insertion sequence:

| Order | Earlier layer / time | Later layer / time | Intersection |
| --- | --- | --- | ---: |
| Production then research | `trail-plate-2`, 109.0167 s | `research-local-X-0039`, 114.0167 s | 34 cells |
| Research then production | `research-local-X-0002`, 44.0167 s | `trail-plate-1`, 86.0167 s | 16 cells |
| Research then research | `research-local-X-0002`, 44.0167 s | `research-local-X-0011`, 82.0167 s | 57 cells |

## Native Nodule consequences, with the negative insertion result preserved

REAL produces **six** native Nodules: three production-only and three whose `sourcePlateIDs` include research Plates. All three research-involving Nodules also have a research Plate as their bottom foundation. OVERLAY produces five production-only Nodules. First birth is **176.500 s** in REAL versus **212.083 s** in OVERLAY. Later counts cross: REAL has one versus OVERLAY's two at 240 s, then six versus five at 300 s. The difference is not simply three extra births added to an unchanged five-birth sequence. Serial Nodule IDs are not matched physical event identities across arms.

The research-founded births occur at 176.500, 245.633 and 288.900 s, with foundations `research-local-X-0002`, `research-local-X-0002` and `research-local-X-0011`. Their source stacks include later native production layers. Thus the retained research foundation plus later production-overlap path is exercised. The native Nodule engine, qualification thresholds, persistence, spacing and capacity were not changed or suppressed. [Birth lineage](analysis/nodule-lineage.json).

**No immediate insertion qualification transition or active timer clearing occurred.** Across all 151 insertions and 2,498 changed cell incidences, predicates were unchanged; all recorded candidate timers were already -1. There were zero false-to-true or true-to-false predicate changes, zero timer changes/clears, and zero native Nodule-engine state changes during insertion itself. The addPlate reset path exists, but an active-reset effect was not exercised. Do not attribute the changed Nodule history to timer resets. The material intervention changes retained foundations/columns that participate in later native evaluations and production additions; this pass does not decompose those later interactions into separate effects.

## Exercised paths and representation limits

| Responsibility | Measured result |
| --- | --- |
| Local Plate to layer count to movement | Exercised; native REAL L and complete exposure equal OVERLAY; no additional movement/formation divergence |
| Local Plate to top/buried topology | Exercised; ordered exposure, burial and depth differ from production-only retained material |
| Local Plate to Nodule foundation/qualification | Research foundations and changed native Nodule history exercised; immediate insertion transitions and active timer resets not exercised |
| Local Plate to later production-material overlap | Exercised; all three chronological overlap types occur |

All 160 descriptors and six Nodules pass the existing pure topology compiler, with exact source-grid routing/count/order. This is structural validity, not sonic quality or realtime performance. The unchanged renderer reads stratigraphic top/layer arrays, so these masks naturally enter its existing material fill/outlines; omitted centerlines add no debug paths. This is source-level implementation behavior, not a new live visual or artistic acceptance result.

The [technical SVGs](README.md#technical-figures) show fixed 60 s comparisons, material coverage/depth, Nodule lineage and travel/population. Their purpose is inspection. They select no aesthetic winner.

## IMPLEMENTATION FACT

The current mask-based Plate/stratigraphy contract can represent exact local X without fabricated corridor semantics. REAL retains immutable research Plates through the native insertion path, uses native next-tick material L, and leaves production defaults and source-to-boundary formation intact.

## REAL-MATERIAL MEASUREMENT

Movement and B/C formation remain exact OVERLAY equivalents, while actual burial, foundation lineage and native Nodule births differ. The six-versus-five Nodule history, with three research foundations, is additional measured native material dynamics. Capacity and direct insertion qualification/timer effects were negative results.

## CAUSAL INTERPRETATION

The shared effective L fully accounts for the measured short-horizon movement/formation difference from CONTROL in this matched probe. Actual materialization adds a retained-material/Nodule subloop absent from +L. This does not establish a further movement effect, identify one Nodule mediator, or generalize to another seed, horizon, material coefficient choice or Audio On.

## ONTOLOGY STILL UNRESOLVED

Compatibility does not establish that a singleton episode should become a Plate, that the uniform coefficients/default thickness are its material meaning, or that B OR C, B AND C, lamination, exclusion, capacity or turnover is the final law. No adoption follows.

**Smallest justified next question:** should a local X materialization inherit native Nodule-foundation responsibility, given identical movement/formation but a changed retained Nodule history?
