# 2026-10-08 — S2b null-family design

## Starting point

S2a showed that independently circularly phase-shifting each recorded ant trajectory produces much denser 1 s topology than the observed run, but the comparator also breaks recruitment-phase alignment, instantaneous colony density/collision exclusion and physical continuity at one circular seam per ant. Approximately 54–57% of null raw encounter episodes overlapped those seams. S2a is therefore retained as a useful synchrony diagnostic, not completed movement-constrained validation.

This pass is **design only**. No second null family is executed here.

## Design question

What is the smallest next null that removes the main S2a confounds while testing whether persistent ant identity / repeated partner continuity adds temporal graph structure beyond the exact recorded spatial movie?

The target is not to fabricate another "plausible colony." The target is to hold the observed movement/density field fixed as tightly as possible and perturb only one additional dimension.

## Candidate families considered

### A. Another per-ant time / phase shift

Preserves each individual sample sequence but again changes birth position, instantaneous density, collision relations and adds a circular seam.

**Decision:** reject as S2b. It repeats the main S2a confounds.

### B. Path-segment or spatial wrap-around randomization

This is closer to the movement-randomization literature and can preserve local turning / speed structure better than an arbitrary random graph. However, in the current ANT square arena it requires extra design choices for boundaries, recruitment origin, segment joins, density preservation and collision exclusion. Those choices could become the dominant source of structure.

**Decision:** keep as a possible later comparator, not the immediate S2b pilot.

### C. Exact-spatial-movie identity permutation

Keep the recorded physical movie exactly fixed at every frame and perturb only which persistent ant ID is attached to which recorded body trajectory segment over time.

This preserves, frame by frame:

- the exact set of positions,
- velocities,
- headings,
- radii,
- active population count,
- arena density,
- collision-consistent geometry,
- recruitment / exit geography,
- pheromone-shaped and occupancy-shaped movement already present in the recording.

Therefore the instantaneous unlabeled proximity graph is exactly preserved. What changes is the temporal continuity of node identity and repeated partner pairing.

**Decision:** choose this family for the next S2b pilot.

## Proposed S2b pilot

Use the three existing 600 s seeds and the existing k=2 encounter definition.

Split time into deterministic **5 s identity blocks**. Five seconds is longer than the observed raw encounter p90 (under 1 s in the S0/S1 runs) and is already an existing ANT analysis context, so most individual short encounters can complete inside a block while longer identity continuity is disrupted.

At each block boundary:

1. keep the exact recorded frame tuples unchanged;
2. deterministically permute identity labels among currently active ants;
3. maintain a bijection so every active recorded body has exactly one active ID and every active ID has exactly one body;
4. when lifecycle membership changes inside a block, recompute only the necessary active-set mapping without moving any body sample;
5. record every identity-remap boundary explicitly.

The null is an **identity/data-stream permutation**, not a physically simulated surrogate trajectory. Identity jumps at remap boundaries are intentional and must be diagnosed rather than hidden.

Initial ensemble: **8 deterministic replicates per source seed**. Do not scale to 32 automatically.

## Invariants

Every null replicate must preserve exactly:

- frame count and timestamps,
- active ant count at every frame,
- unordered per-frame set of complete physical tuples `(x,y,vx,vy,heading,radius)`,
- instantaneous pairwise distances as a multiset,
- instantaneous unlabeled k=2 graph edge count,
- instantaneous unlabeled component-size multiset,
- original source archives byte-for-byte.

No behavior RNG is consumed.

The identity mapping must remain a bijection at every frame, with no duplicate or missing active IDs.

## Primary observables

Because instantaneous geometry is fixed by construction, do **not** present instantaneous edge count or component size as outcomes. They are validation invariants.

Compare observed vs identity-null temporal quantities:

- raw encounter episode count and completed lifetime,
- 1 s rolling edge count,
- 1 s weighted degree,
- temporal-edge lifetime,
- bridge persistence,
- articulation persistence,
- connector persistence,
- merge / split counts.

Use 0.25 s alongside 1 s for transient connector behavior. Keep 5 s / 20 s only as sensitivity cases if implementation cost is negligible; do not make them new biological timescales.

## Interpretation boundary

This null asks:

> Given the exact same spatial movie, does persistent ant identity / repeated partner continuity change the temporal graph?

If observed and null are similar, persistent identity contributes little beyond the recorded spatial process for these metrics.

If observed differs, the result still does **not** demonstrate social preference or social memory. Persistent identity in ANT bundles many non-social mechanisms: continuous inertia, personality, hesitation, pheromone adherence, occupancy history and path dependence. The result would only show that continuous individual trajectories / partner identity matter beyond instantaneous density and geometry.

Boundary-associated changes must be reported separately. A result dominated by 5 s remap boundaries is a null artifact, not a social claim.

## Why this follows the research boundary

The Deep Review criterion was to prefer comparators that preserve movement tendencies, nest geometry and local density while breaking synchrony or partner identity. S2a tested synchrony but did not preserve density/geometry tightly enough. This S2b design instead preserves the complete spatial movie exactly and breaks partner/identity continuity.

Path-segment / wrap-around movement randomization remains available later if identity-null results justify a physically continuous second comparator.

## Stop condition

S2b implementation should stop after this one 5 s identity-block family and the small 8-replicate pilot.

Do not add spectral metrics, social roles, adaptive memory, graph→Plate coupling, behavior feedback or audio work.

Do not infer "emergence passed" from any percentile. Report descriptive ranks/effect sizes and whether differences concentrate near remap boundaries.

After implementation, commit tooling and evidence separately, push the branch, and stop for review before merge.
