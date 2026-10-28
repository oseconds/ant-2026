# Plan — commit-relative space-time attachment support

## Question

With working ontology A and current `EVENT / WHEN / OWNERSHIP` semantics held fixed, can uninterrupted sampled space-time ancestry provide a selective finite `WHERE` contract for a material commit, without using history quantity, strength, contact count, or a new contribution threshold?

## Fixed state and input

- Base: fresh `origin/main` at `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Existing Stage-1 packet: current G / H0, seed `20261005`, 60 Hz, Audio Off, 0–120 s; no new natural run.
- Existing commit-relative event descriptors and prior C0 masks are frozen inputs. Exact source commits and SHA-256 values are in [`data/inputs/provenance.json`](data/inputs/provenance.json).
- P1 (`trail-plate-1`) is unmatched: ownership anchor is lineage start `64.016666667 s`; commit is `84.016666668 s`.
- P2 (`trail-plate-2`) is also unmatched: ownership anchor is lineage start `86.016666669 s`; commit is `106.016666667 s`. A diagnostic similarity to P1 does not change the ledger's `priorMatchId: null`.
- Each interval has 21 saved anchors, approximately 1 s apart.

## Frozen C1 contract

At each anchor, define `A_t` as the union of whole 8-neighbor `E_qualified` components intersecting same-anchor `H_boundary_length_eligible`. Create temporal edges only between adjacent saved anchors, for the same cell or a Chebyshev-distance-1 cell. C1 at commit contains only nodes with an unbroken backward chain to the ownership-anchor support, with a valid node at every saved anchor. Do not propagate within an anchor.

The candidate is 8-neighbor temporal ancestry. Calculate 4-neighbor temporal ancestry from the same inputs as a sensitivity diagnostic; do not select whichever result appears preferable. Neither rule may use path membership, history magnitude, strength, contact count, a contribution threshold, or repairs such as dilation, bridging, island deletion, pickup relocation, or route copying.

## Stage-1 measurements

For P1 and P2, reconstruct the ancestry from exact frozen inputs and report:

- C0, C1-8, and C1-4 cell counts and hashes; per-anchor associated-domain and ancestry populations; temporal edge counts; and the first backward break for each C0 cell excluded from C1-8.
- 8- and 4-neighbor component topology; relation to C0 and the actual production mask; P1/P2 overlap; source, H, I, and principal-path intersections.
- Descriptive overlays for carried chemical, post-anchor chemical difference, carried SurfaceField, post-anchor SurfaceField difference, carried feet, and commit-owned feet. These are not gates.
- Production 96→32 compiler results on exact masks with actual pickups/material and `edges: []`; no support repair.

## Gate

Run the conditional 600 s shadow only if Stage 1 is finite, interpretable by the real compiler without repair, meaningfully distinct from C0 in ancestry assignment, and coherent as commit support. Otherwise stop with the registered negative or inconclusive verdict. Do not shorten the interval, tune the temporal radius, or otherwise rescue a negative result.

## Interpretation limit

The cadence is approximately 1 s. The result tests sampled continuity under a registered grid relation. It does not measure ant speed or prove continuous physical occupancy between samples. The study covers two commits from one frozen seed/window and does not assess artwork quality.
