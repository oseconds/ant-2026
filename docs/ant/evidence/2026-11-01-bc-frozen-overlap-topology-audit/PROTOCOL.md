# Protocol — frozen B/C overlap and union audit

## Frozen authorities

The primary three-seed observation packet is the local-opportunity evidence at da599d9f385f53d0bb24df3e737c5ed2e2eb6a23, represented against production bc045dc3caa5954df633ecbee37fbabcb8224f30. The registered conflict graph comes from 526cbfd526cf0d4a6348cc4c6942fe6bdee09ddf; exact saved graph receipts and masks are inputs, not regenerated observations.

Required upstream contracts were held fixed:

- opportunity channels: B is accumulated qualified chemical history; C is FOOT_CONTACT-written compaction;
- START allocation: an edge-bearing F node with maximum D support, ties to lower row-major index; this is historical receipt context, not reassessed here;
- candidate X: the nucleus-connected 8-neighbor component of F intersected with the Euclidean disk of radius .15 around that nucleus;
- same-slot graph node: one registered unique X option, with exact-same-X B/C records retained as combined provenance {B,C};
- conflict edge: non-empty X cell intersection;
- conflict component: connected component of that exact overlap graph;
- maximum independent set: a diagnostic enumeration only.

No thresholds, radii, scores, allocation priorities, or new episode identities were added.

## Source verification and frozen-mask parity

The script verifies the input package manifests and the referenced source-file SHA-256 values before processing. It also checks the available previous production-shaped X-shadow packet used to recover actual production Plate geometry as a descriptive comparator:

1. the saved simulation source LF hashes equal the checked source files;
2. 1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44 is an ancestor of the production authority;
3. src/ and static/ have no diff between those authorities;
4. each seed's 599 frozen F masks match the saved shadow masks exactly;
5. production Plate IDs/counts and timestamps match the saved birth packet, with maximum timing delta below 5.83e-11 ms.

No world was simulated or replayed. The production Plate comparison is an existing-data geometric context only.

## Cross-channel relation

For every saved boundary, every B candidate was paired with every C candidate. Each pair was classified by exact sorted-mask equality, otherwise positive intersection, otherwise disjoint. Jaccard is intersection divided by union. Nucleus distance is Euclidean distance between saved candidate centers. Symmetric difference is the count of cells in exactly one X.

All-pairs summaries are deliberately kept distinct from any candidate identity or nearest match. Per-option footprint summaries compare each candidate mask against the union of all opposite-channel masks at that boundary; they are descriptive only.

F-component membership and component size are read from the exact frozen F labeling. A same-F association is not used to change the overlap relation.

## Overlap components and graph topology

The analysis reconstructs graph edges directly from the saved X masks and checks exact equality with the registered edge and component receipts. Connected components are computed without a distance rule. Clique number, independence number, articulation vertices, bridges, and the complete set of maximum independent sets are computed exactly for each contested graph. Graphs have at most 12 nodes.

Maximum-set provenance and entry/non-entry composition are reported over all enumerated maximum sets. Node presence in any/every maximum set is computed from set membership, not inferred from one representative set. Footprint variation is measured from the actual union coverage of each maximum set.

## Transitive union geometry

For each contested component, union is the set union of all member X masks. The audit never treats this union as a selectable candidate.

- Euclidean diameter: maximum pairwise distance between cell-center coordinates on the 96×96 normalized grid.
- Bounding box: extrema of union cell-center coordinates; the diagonal is Euclidean.
- Geodesic diameter: all-pairs shortest-path distance in the induced 8-neighbor union graph, in edge count.
- Member comparison: ratios use the largest member X diameter/geodesic span, or largest member X cell count, as specified in the output property.
- Entry and boundary contact: descriptive cell intersections with the fixed entry-radius region and world-boundary cells.

These measures describe geometric expansion only. They do not define a body or a locality threshold.

## Production Plate geometry context

The saved actual Plate masks are measured with the same cell-center Euclidean diameter and 8-neighbor geodesic convention. Their mask geometry is not normalized to X, and no claim is made that the two selectors have equivalent semantics.

## Objective cases and atlas

Case categories are selected by deterministic extrema/conditions in the script, with stable seed, slot, component, and option identity tie-breaking. Missing categories remain absent instead of being substituted. The atlas uses equal-status candidate marks and a separate union mark. It is an objective geometry sheet, not an aesthetic ranking.

## Reproduction

From repository root:

    node scripts/ant-frozen-overlap-bc-topology-audit.cjs

The script writes analysis JSON receipts and visual/objective-atlas.svg. It asserts input integrity, frozen F-mask/birth parity, graph/component reconstruction, exact independent-set results, and no source behavior diff. It performs no RNG, simulation, or replay.
