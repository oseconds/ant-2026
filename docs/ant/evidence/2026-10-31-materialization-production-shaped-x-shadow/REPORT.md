# Results — current-production stateless X shadow

## Decision

**X OVERCONCENTRATED / REPETITIVE.** Max-D → X was available at 97.7–98.2% of actual production analysis boundaries. It produced a connected local structure, changed over time, and selected a markedly different structure from the source→boundary candidate. Yet its nucleus remained concentrated within two adjacent coarse entrance regions; the same exact nucleus recurred in 96.2–97.3% of valid frames after its first appearance, and a median 94–95% of X cells already overlapped material present before the analysis boundary.

This meets the authored description of the overconcentration class. The measurements do not say whether a viewer would prefer one morphology. They say that, under the locked max-D priority and current production history, X repeatedly selects a compact entrance-local, previously materialized packet. Park X; do not add novelty, relocation, allocation redesign, or another capture pass.

## Implementation fact

The world continued using native production `TrailPlateBirth`: its source annulus, boundary corridor selection, persistence and repeat gates, actual Plate births, and `MaterialStratigraphy`. The observer only read the actual E/D inputs at real production analysis boundaries, reproduced the exact production thinning for F, and measured max-D → X with the locked radius and connectivity.

X was available, finite, 8-connected, and inside R=.15 at every valid record. No X-driven Plate, material, field, movement, heading, RNG, or audio change occurred. See [validation](VALIDATION.md).

## Availability and allocation

| Seed | Production analysis rows | X available | Current production candidate | Median nucleus distance from entrance | Distinct exact nuclei | Repeated exact-nucleus rows | Exact switches | Coarse 8×8 regions | Median rank-2 / rank-1 D | Median alternatives within 90% of max-D |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 599 | 587 (98.0%) | 544 (90.8%) | .0258 | 16 | 571 / 587 (97.3%) | 90 | 2 | .9932 | 13 |
| 20261006 | 599 | 585 (97.7%) | 506 (84.5%) | .0258 | 22 | 563 / 585 (96.2%) | 103 | 2 | .9930 | 12 |
| 20261007 | 599 | 588 (98.2%) | 517 (86.3%) | .0258 | 22 | 566 / 588 (96.3%) | 116 | 2 | .9952 | 13 |

The median nucleus distance was .0258 in all seeds; the full maxima were .0405, .0447, and .0677. Both occupied 8×8 bins were adjacent entrance bins `(3,5)` and `(4,5)`. Mean angular direction around the entrance varied by seed: −63.3°, −102.7°, and −20.5°, with circular concentration .493, .713, and .422. Thus the selector did not settle on one shared ray, while remaining tightly localized in position.

The median rank-2 support was 99.3–99.5% of rank 1. A median 12–13 other eligible nuclei sat within 90% of the winner. The deterministic max-D rule therefore resolves a crowded set of near-ties into a repeatedly chosen entrance neighborhood; the observed clustering is not evidence that D has a strongly isolated winner.

## Temporal continuity and X geometry

| Seed | Adjacent Jaccard median | 5-anchor Jaccard median | 10-anchor Jaccard median | 20-anchor Jaccard median | Median X nodes | Median induced edges | Median diameter | Median disk density | Median graph extent from nucleus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | .912 | .657 | .489 | .362 | 253 | 472 | .299 | .395 | .222 |
| 20261006 | .911 | .641 | .484 | .365 | 241 | 438 | .298 | .376 | .224 |
| 20261007 | .912 | .635 | .486 | .329 | 243 | 440 | .298 | .379 | .220 |

Anchor-stride comparisons used real production timestamps. The five-anchor spans were 5.000–5.083 s, ten-anchor spans 10.000–10.167 s, and twenty-anchor spans 20.000–20.333 s. The adjacent result shows recurring structure rather than per-second flicker; the falling 10/20-anchor Jaccard shows continuing local recapture turnover. This turnover is descriptive and was not judged against a new threshold.

X’s median maximum radius from its nucleus was .1496, at the registered R=.15 bound. Its median Euclidean diameter was .298–.299. Median connected graph extent was .220–.224. The median X had 8–9 endpoints, 187–203 degree-3+ junctions, and cycle rank 195–218. Median density inside the sampled radius disk was .376–.395. X did not reach the world boundary in any valid record.

Around the entrance, X’s median centroid distance was .0275–.0291 and median maximum radial extent was .1725–.1734. Angular span medians were 340.5–341.6°; mean absolute edge/radial alignment was .655–.661. This is broad angular structure within an entrance-local radius, not a source-to-boundary span.

## Current production selector comparison

At paired valid anchors, median skeleton Jaccard between current production candidate and X was .122, .128, and .130. This is a substantial descriptive distinction, not a success score.

| Measure (median by seed) | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| Production candidate nodes | 555 | 468 | 509 |
| Production candidate diameter | 1.175 | 1.233 | 1.207 |
| Production centroid distance from entrance | .163 | .128 | .122 |
| Production angular span | 321° | 310° | 312° |
| Production skeleton nodes near world boundary | 12.3% | 12.6% | 15.0% |
| Production radial edge alignment | .814 | .815 | .815 |
| Production source distance from entrance | .0842 | .0842 | .0842 |
| Production target distance from boundary | .0211 | .0211 | .0316 |

The production candidate is larger and boundary-directed. X is smaller, centered close to the entrance, and has no boundary-touching nodes. This demonstrates different selector responsibility in current histories. It does not establish that X has a useful episode or a compatible material body.

## Existing material overlap

Across valid X anchors, the mean fraction of X already covered by prior production material was .777, .694, and .730. The median was .945, .949, and .941. X had median 6.09, 2.88, and 4.76 local layers per X cell. This pattern is consistent with repeated selection of previously materialized entrance-local history, especially later in each run. It does not mean the selector explicitly reads material; the allocation inputs remain current D and F only.

Actual production material coverage at exactly 600 s was 81.4%, 73.1%, and 76.7%, with maximum local layer counts 35, 23, and 31. X did not affect these values.

## Current production context

| Seed | Final population | Accepted spawns | Flow-conditioned accepted spawns | Placement calls blocked | Retry recoveries | Realized travel | Blocked agent frames | FOOT_CONTACT legs | Actual Plate births | 600 s material coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 17 | 842 | 170 (20.2%) | 22 | 20 | 538.7 | 13,343 | 88,756 | 37 | 81.4% |
| 20261006 | 19 | 849 | 154 (18.1%) | 10 | 8 | 516.4 | 8,918 | 84,995 | 23 | 73.1% |
| 20261007 | 15 | 843 | 168 (19.9%) | 14 | 12 | 533.2 | 13,753 | 87,709 | 33 | 76.7% |

Placement attempts were 1,992, 1,822, and 1,854; clearance-rejected positions were 1,150, 973, and 1,011. Every blocked placement call recorded a retry; 20/22, 8/10, and 12/14 recovered. Flow conditioning remained endogenous current production and was not an X input.

At 600 s, pheromone coverage was 90.2%, 90.1%, and 90.9%; SurfaceField coverage was 99.8%, 99.95%, and 99.95%. Contact events were 30,081, 28,807, and 29,758. Exact field summaries, every actual Plate-birth time, population chronology, 60 s windows, and field/material measurements are in `analysis/summary.json` and the per-seed records.

## Actual Plate-birth context

The machine-readable [birth context](analysis/birth-context.json) aligns production candidate, latest X, pre-existing material, and the actual born production Plate at birth ±20 s / ±10 s / birth / +10 s only where a matching production analysis row exists. At the birth boundary it matched all 37, 23, and 33 actual births respectively. Validity by offset was:

| Seed | −20 s | −10 s | birth | +10 s |
| --- | ---: | ---: | ---: | ---: |
| 20261005 | 32/37 | 32/37 | 37/37 | 31/37 |
| 20261006 | 20/23 | 20/23 | 23/23 | 19/23 |
| 20261007 | 28/33 | 28/33 | 33/33 | 28/33 |

Offsets without an exact matching analysis anchor remain invalid; no interpolation or synthetic X state was added. X is not claimed to have “born” at these times.

## Visual review and interpretation boundary

[All-seed / all-time comparison](visual/all-seeds-time-comparison.png) and [technical atlas](visual/technical-overlay-atlas.png) show the same native-renderer production frames with separate selector overlays. The repeated compact orange X region is visible beside the larger blue source→boundary candidate at 300/600 s. This is image-based descriptive evidence. Artistic acceptance remains unmade.

## Research interpretation

The outcome is **X OVERCONCENTRATED / REPETITIVE**, not `X TRACKS PRODUCTION / LITTLE GAIN`: low same-anchor skeleton overlap and the scale/boundary summaries show distinct selection semantics. It is not `X TOO UNSTABLE`: adjacent overlap stays high enough for recurrence, despite medium-term turnover. The reason to park X is its repeated entrance-local allocation and high overlap with already-present material history.

Current production remains source→boundary. Fixed-nucleus UPDATE remains MIXED and E-qualified incumbency remains STALE / OVER-RETENTIVE. The full selector investigation is closed; Chemical Residence is the next workstream. No Residence work, adoption, merge, PR, or artistic verdict is part of this pass.
