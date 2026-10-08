# 2026-10-08 — Interior endpoint production candidate rejected

## Decision

The production-candidate branch `ant-interior-endpoint-production-candidate` is **rejected for current production adoption**.

No candidate selector code is merged into `main`. The current production `TrailPlateBirth` selector remains unchanged.

## Why

The candidate preserved the existing source, weighted-Dijkstra and deterministic path semantics, farthest-boundary principal route and 0.30 geodesic floor, while additionally retaining qualifying source-connected degree-one interior endpoint paths.

Across the three frozen 600 s seeds, the intervention clearly produced richer Plate networks and more births, but the added material increasingly reused territory already represented by earlier Plates.

| Seed | Births main → candidate | Median centerline cells | Median prior-union overlap | Median new area / birth | Final union area |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 32 → 40 | 519.5 → 763 | 0.948 → 0.976 | 0.01130 → 0.00637 | 0.681 → 0.718 |
| 20261006 | 28 → 44 | 527.5 → 790.5 | 0.904 → 0.968 | 0.01540 → 0.00814 | 0.677 → 0.729 |
| 20261007 | 31 → 41 | 528 → 805 | 0.912 → 0.969 | 0.01717 → 0.00920 | 0.716 → 0.740 |

The branch-richness increase is real, but for the current **Material History / sustained spatial novelty** goal it shifts the system toward redundant layering rather than sufficiently new occupied territory.

This is not a universal artistic rejection. The branch remains useful as a preserved alternative if a later direction intentionally favors denser deposition, burial, overgrowth or repeated re-inscription of existing corridors.

## Preserved rejected variant

- Branch: `ant-interior-endpoint-production-candidate`
- Production/tooling commit: `b52bb1f11c170db91738f60f93af94c60bc40524`
- Evidence/chronology commit: `bb970505eb63e9f69d2d00bc302ee72fbe19419e`
- Branch evidence:
  https://github.com/oseconds/ant-2026/tree/ant-interior-endpoint-production-candidate/docs/ant/evidence/2026-10-08-interior-endpoint-production

The branch evidence includes the matched 600 s measurements, fixed-scale plots, Chrome captures, hashes and validation logs. Full tests, build and dev/production browser smoke passed on the branch. Mature 20–30 Plate realtime audio was not tested because the candidate was already rejected at the morphology/material-history gate; the pre-existing mature realtime collapse remains unresolved.

## Boundary

This main-branch entry records the **decision only**. It does not import the candidate implementation, candidate tests, candidate tooling or generated evidence into `main`.
