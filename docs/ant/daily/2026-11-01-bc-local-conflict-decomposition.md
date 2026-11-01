# B/C local X-conflict decomposition

## Question

Can simultaneously mature B/C X options be separated into local conflict neighborhoods using only actual shared X cells, or do they form broad mutually competing structures?

## Baseline

- Production represented: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Dual maturation: `248da39a4d7d342022a27a5b9ec183cad9b160e2`.
- Provenance prototype: `a80a613be68ede94fce89008a076fbe582178f41`.
- Source temporal slots: commit-slot ambiguity audit `e960d135afec30e7c9f35722359e15f0f2d39ce3`.
- Reused exact 55/54/54 saved slots, mature candidate options, timestamps, and X masks. No new simulation or replay.

## Method

Constructed one graph node per upstream unique X option, with an edge iff exact X cell masks shared at least one cell. Connected components defined local neighborhoods. An independent sorted-mask/two-pointer and union-find pass matched the primary set-intersection/BFS edge sets and partitions at all 163 slots. F-component connectivity was reported as a separate sensitivity only.

## Result

- 1,121 / 1,352 overlap components were singletons; 1,121 / 1,846 option appearances (60.7%) belonged to singleton components.
- Contested component size had median 2, q90 6, maximum 12. At least one contested component occurred in 138 / 163 slots.
- Only 634 of 10,956 pairwise option relations overlapped; 10,322 were X-disjoint.
- Same frozen F identity linked 2,629 pairwise-disjoint X pairs, confirming that F connectivity is broader than the locked primary spatial-conflict relation.
- One hypothetical event per exact-X component totaled 422 / 486 / 444 per seed and first exceeded the 256-Plate reference at 418.017 / 349.017 / 359.017 s. Actual production births were 37 / 23 / 33; these are context, not a target.
- Exact X masks did not repeat inside contested components across adjacent slots. Cell-overlap component correspondence still found one-to-one local-region runs up to 63 s; splits/merges were not assigned persistent IDs.
- The coeval `{B,C}` option with a positive-overlap distinct-X competitor category did not occur. A same-F but X-disjoint B/C pair was present.

## Decision

**LOCAL CONFLICT DECOMPOSES BUT REMAINS OVERPROLIFIC.** Local overlap is usually limited to small neighborhoods, not one world-wide conflict graph. However, even one independent hypothetical event per component remains above the supplied 256 reference in each seed. Local conflict and world commit capacity are separate responsibilities; neither law was designed here.

## Evidence and limits

[Full report and objective atlas](../evidence/2026-11-01-bc-local-conflict-decomposition/REPORT.md) · [protocol](../evidence/2026-11-01-bc-local-conflict-decomposition/PROTOCOL.md) · [validation and manifest](../evidence/2026-11-01-bc-local-conflict-decomposition/VALIDATION.md)

Production `TrailPlateBirth`, material, RNG, and source code were unchanged. No winner, real Plate, production feedback, or Residence work occurred. The SVG atlas shows exact X mask geometry without native-world frames; browser-based PNG rasterization was unavailable in this sandbox.

## Smallest next question

What separate authored world-level capacity responsibility, if any, should bound independent local material events after local X conflicts are resolved?
