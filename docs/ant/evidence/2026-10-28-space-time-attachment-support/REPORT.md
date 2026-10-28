# Report — commit-relative space-time attachment support

## Verdict

**BOUNDED NEGATIVE — temporal attachment adds no useful selectivity.** C1-8 preserves almost all C0 at both commits: P1 retains `869/901` cells (96.45%), and P2 retains `1169/1172` (99.74%). The evolving sampled ancestry is distinct as an algorithm, but it does not materially narrow these event-associated commit domains. The registered Stage-1 viability gate therefore fails; Stage 2 did not run.

## State classification

### Implemented facts held fixed

The current `EVENT / WHEN` selection, maturity, timing, descriptor closure, repeat/reissue gates, source/boundary rules, and actual births were not altered. The current ownership ledger defines both P1 and P2 as unmatched and assigns each its lineage start as ownership anchor. P2 has a prior-match diagnostic similarity entry, but `priorMatchId` remains `null`. Production source, descriptors, and existing evidence were not modified.

### Existing evidence

The preceding C0 test already found finite, compiler-valid commit-time masks but poor long-shadow selectivity: its 36-layer union covered `5,785 / 9,216` cells (62.77%), and late successive overlap was about 90%. That result rejected C0, not working ontology A. This pass reuses its exact P1/P2 masks as the comparison baseline.

### New measurements

| Event | Ownership interval | C0 | C1-8 | Retained | C1-4 | C1-8 / C0 Jaccard |
|---|---:|---:|---:|---:|---:|---:|
| P1 | 64.017–84.017 s | 901 | 869 | 96.45% | 789 | 0.9645 |
| P2 | 86.017–106.017 s | 1,172 | 1,169 | 99.74% | 1,101 | 0.9974 |

Each interval contains 21 saved anchors. The exact per-anchor associated-domain, C1-8, and C1-4 populations are in [`data/stage1.json`](data/stage1.json). C1-8 ancestry populations by anchor:

- P1: `576, 586, 599, 619, 641, 668, 673, 691, 707, 724, 745, 764, 776, 789, 796, 810, 821, 822, 836, 849, 869`.
- P2: `937, 948, 954, 967, 979, 993, 1003, 1019, 1029, 1041, 1056, 1076, 1095, 1114, 1137, 1155, 1166, 1182, 1156, 1161, 1169`.

The 8-neighbor temporal graph had 89,703 / 139,381 domain edges, of which 88,703 / 135,685 carried ancestry (P1 / P2). C0 cells rejected by C1-8 first lost backward continuity at these adjacent-anchor intervals: P1: 3 at 78.017–79.017 s, 15 at 81.017–82.017 s, 13 at 82.017–83.017 s, and 1 at 83.017–84.017 s; P2: 2 at 97.017–98.017 s and 1 at 105.017–106.017 s. Per-cell coordinates and exact timestamps are preserved in the JSON.

#### Spatial comparison and topology

- C1-8 is one 8-neighbor component for each event: 869 cells (P1) and 1,169 (P2). Under 4-neighbor component counting, the same masks split into 48 components (largest 783) and 49 (largest 1,060), showing strong diagonal adjacency in their topology.
- C1-4 contains 789 P1 and 1,101 P2 cells. Relative to C1-8, it removes 80 P1 and 68 P2 cells; Jaccard overlap is 0.9079 and 0.9418. C1-4 has 1 / 2 8-neighbor components (P2 sizes 1,100 and 1), and 9 / 26 4-neighbor components (largest 766 / 1,046).
- P1/P2 C1-8 overlap is 786 cells, with 83 P1-only and 383 P2-only (Jaccard 0.6278). C0 overlap was 808, 93, and 364 (Jaccard 0.6387). The 4-neighbor overlap is 717, 72, and 384 (Jaccard 0.6113).
- Against the actual production masks, C1-8 Jaccard is 0.2668 for P1 (258 intersecting cells) and 0.3207 for P2 (416). These are descriptive comparisons; production support is not a C1 gate.
- C1-8 contains each source and target. It contains 601/628 P1 H cells and 755/758 P2 H cells; all 122/122 and 181/181 I cells; and all 69/69 and 72/72 principal-path cells. None of these memberships was used for selection.

#### Ownership overlay

Median overlay values on C1-8, P1 / P2 respectively: carried chemical `0.1490 / 0.1758`; post-anchor chemical difference `0.4187 / 0.4173`; carried SurfaceField `0.0837 / 0.1088`; post-anchor SurfaceField difference `0.0314 / 0.0252`; carried feet `2 / 2`; commit-owned feet `1 / 0`. Commit-owned feet are exactly zero in 426/869 P1 and 635/1,169 P2 cells. This supports no ownership threshold and is consistent with inherited qualification being allowed under ontology A.

#### Compiler compatibility

- C1-8 compiled for both events using the production 96→32 compiler, actual material and pickup values, and `edges: []`. P1: 177 nodes in one component, no isolates; both pickups valid and in the same component. P2: 223 nodes in one component, no isolates; both pickups valid and in the same component.
- C1-4 P1 was rejected without repair: `Plate trail-plate-1 has a pickup outside its frozen mask.` C1-4 P2 compiled to 203 nodes in components `[202, 1]`, with one isolated solver node; both pickups were valid and in the large shared component.

## Interpretation and challenge

**Complete-state null:** the frozen commit-time C0 domain explains nearly all of the final C1-8 support in both cases. The added temporal relation contributes only 32 exclusions at P1 and 3 at P2, so it does not add useful `WHERE` selectivity under the registered gate.

**Strongest counterargument:** C1 is not identical to C0. It removes cells whose sampled lineage breaks and explicitly allows a spatially moving ancestry. It could be valuable as a provenance annotation even when it does not alter the broad material support. That is a different use than the requested finite selective `WHERE` contract. The 4-neighbor sensitivity also shows the edge convention can change pickup validity and solver topology.

**Competing explanation:** the event-associated domains are broad and grow across adjacent anchors. Dense same/neighbor relations let most commit cells trace back through the full interval. C1 therefore carries the broad geography of the changing `A_t` rather than isolating a distinct event body.

**Falsification condition:** if any anchor association, ownership start, prior C0 mask, or temporal recurrence rule is wrong, this reconstruction is invalid. Exact source/artifact hashes, prior-mask equality, deterministic recurrence checks, and per-cell outputs are recorded so that claim can be audited. Passing those checks only supports this frozen packet; it does not generalize to other seeds or cadences.

## Boundaries

This is a two-event, one-seed, 0–120 s reconstruction from approximately 1 s samples. It establishes sampled continuity under the registered grid relation, not continuous physical matter or an ant-speed law. The result rejects only this C1 contract as a useful selector in these Stage-1 cases; it does not reject ontology A or settle how history should be materially represented. No artistic interpretation or audience assessment was performed.

## Next research priority

Before defining another candidate, identify and preregister a different class of spatial selectivity that can narrow the event-associated domain without using strength, history quantity, ownership thresholds, path copying, or post-hoc geometry repair. Do not execute that follow-up in this pass.
