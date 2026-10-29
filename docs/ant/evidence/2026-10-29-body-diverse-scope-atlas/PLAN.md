# BODY comparison across diverse natural COMMIT scopes

## Question and boundary

Compare existing BODY candidates across structurally varied actual COMMIT scopes in the frozen current-G/H0 seed `20261005` sequence. This is a visual/structural comparison, not a BODY law, winner, or production change. SCOPE, EVENT, COMMIT, candidate formulas, widths, material tuples, and stratigraphy stay fixed.

Production authority: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
Research parent: `d933e0ed0e7cdf15361b3e8f024f5a6d485e44c8`.
Research branch: `codex/ant-body-diverse-scope-atlas-20261029`.

## Frozen inputs and provenance limits

- The 600 s raw packet supplies all 36 actual Plate IDs, commit times, and production-mask SHA-256 values.
- The prior stratigraphy audit's saved deterministic reconstruction supplies the full 36 descriptors, including I nodes, edges, principal paths, and production masks. No replay is run in this pass.
- Each reconstructed production mask is checked against the frozen raw mask digest. P1/P2 full descriptors are also checked against the prior frozen BODY packet.
- The prior reconstruction matched all saved natural-run anchors, but `PheromoneField.js` differed from the frozen source blob. This pass reports that mismatch. It does not claim source-blob identity or frozen per-commit B rasters for P3–P36.
- Exact commit-time chemical raster arrays for P3–P36 are absent from the frozen raw packet and saved reconstruction. Therefore U/W/S are not approximated or rendered for the additional cases. Their Atlas B positions are marked omitted. P1/P2 reference atlases remain untouched.

## Structural inventory and case selection

Inventory all 36 reconstructed I graphs before generating any new BODY output. Graph edges use the production 8-neighbor adjacency stored in each descriptor. Record node/edge counts, components, degree-1 terminals, degree-at-least-3 junctions, cycle rank, bounding-box extent/aspect, node fill within the box, principal-path length and endpoint ratio, off-principal membership, source/target geometry, and production-mask cell count.

Select five additional commits, excluding P1/P2. Apply each criterion to P3–P36 in this fixed order. Choose the first unselected row after ranking; ties use ascending Plate ordinal:

1. Smallest finite scope: node count ascending.
2. Largest finite scope: node count descending.
3. Highest junction complexity: junction count descending, then off-principal node count descending.
4. Most tortuous principal path: path-length / endpoint-distance descending.
5. Most compact scope: bounding-box aspect ratio ascending, then node density descending.

No weighted diversity score or visual criterion is used. If a criterion winner was already selected, use the next row in that criterion's ranking. Save the complete inventory and selection receipt before running candidate rendering.

## Candidate and atlas rules

Reuse exact definitions from the existing BODY exploration:

- P: actual production descriptor mask.
- K: union of fixed-radius `.012` sections at I nodes.
- H: convex lattice envelope of the exact K source-grid cells; a cohesive-sheet countermodel.
- U/W/S: existing definitions require the commit-time chemical B raster. Omit for additional commits because exact B arrays are unavailable.

Atlas A compares P | K | H for the five selected commits. Atlas B keeps the requested K | U | W | S layout, showing exact K and an explicit missing-data card for each omitted U/W/S candidate. Both use the same 96×96 coordinates, y-down orientation, 320×320 nearest-neighbor display, and fixed world extent. No smoothing, repair, or per-panel autoscale.

The existing P1/P2 atlas is linked as a reference and is not replaced. The new rows are additional actual commits, subject to the reconstruction provenance limit above.

## Interpretation boundary

Keep visible difference, graph structure, prior evidence, and artistic preference separate. In particular, a larger or more cohesive silhouette is not more justified. Current production selection remains explicitly source-annulus-to-observation-boundary authorship; BODY comparisons stay conditioned by that selector.

Stop after the comparison package. No new natural run, synthetic geometry appendix, winner, width tuning, BODY law, audio, long-horizon shadow, selector change, or production adoption.
