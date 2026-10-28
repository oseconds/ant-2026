# 2026-10-28 — Plate local-history ownership

## Question

Can multiple immutable Plate commits keep using one persistent connection while assigning each commit a distinct local-history contribution interval?

## Work

- Reused the exact frozen current-G/H0 seed-20261005 packet and existing continuous-load matched-repeat fixture. No new world replay, RNG draw, production change, candidate reset, or support mask.
- Added a read-only ledger that anchors unmatched commits at lineage start and matched repeats at the newest matched commit. It separates carried-in, `(anchor, commit]` new contribution and post-commit future history.
- Replayed chemical memory against the stored 96-grid samples and SurfaceField against actual anchor snapshots. Retained all FOOT_CONTACT entries in original nested order despite 543 timestamp inversions.
- P1 and P2 are unmatched and have distinct lineage-start anchors; their masks overlap by 223 cells. The natural time windows do not duplicate a timestamp. In the logical repeat fixture, `(0,20]`, `(20,110]`, `(110,200]` assign 200 contacts uniquely.

## Decision

**SUPPORTED — commit-relative provenance interface.** The channels can be accounted for separately and matched repeats avoid double ownership without resetting the live candidate. Chemical projection replay is within 2 ULP but not bit-exact; SurfaceField matched all 21 saved snapshots per window. Neither endpoint difference is an exclusive owner or conserved material amount.

The physical WHERE meaning remains an artist / ontology gate: whether inherited qualification context can be part of a newly committed layer's body. No threshold or mask was selected.

## Next priority

Prepare one compact artist-facing comparison from the existing overlap and contrasting cells. Do not run another simulation or select physical support before that decision.

Evidence: [package README](../evidence/2026-10-28-plate-local-history-ownership/README.md) · [report](../evidence/2026-10-28-plate-local-history-ownership/REPORT.md)
