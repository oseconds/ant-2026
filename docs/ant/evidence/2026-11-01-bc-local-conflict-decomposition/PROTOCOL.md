# B/C local X-conflict decomposition protocol

## Authority and frozen inputs

- Production represented: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Dual-history maturation: `248da39a4d7d342022a27a5b9ec183cad9b160e2`.
- Provenance prototype: `a80a613be68ede94fce89008a076fbe582178f41`.
- Commit-slot ambiguity audit and exact input packet: `e960d135afec30e7c9f35722359e15f0f2d39ce3`.
- The input is the prior audit's three exact gzip slot packets: 55 slots for `20261005`, 54 for `20261006`, and 54 for `20261007`; total 163. No world was run or replayed.

## Locked upstream state

The existing B/C opportunity tracks, 20 s uninterrupted maturation, adjacent associated-X Jaccard `>= .60`, mature-candidate lifetimes, earliest possible 10 s temporal slots, and exact same-X B/C collapsing are unchanged. This analysis does not reconstruct or edit those histories. Every saved slot time, unique X mask, option provenance, candidate record, and frozen F-component identity comes from the registered source receipt.

## Primary graph

At each saved slot:

- one node is one upstream unique spatial X option;
- an undirected edge exists iff the two exact sorted X cell sets share at least one cell;
- every graph connected component is reported as a local conflict neighborhood, with no physical-object claim.

The X-overlap graph uses no distance, Jaccard, center, evidence strength, material overlap, or F-component gate. Same-mask B/C candidates stay collapsed upstream as one node labelled `{B,C}`.

The primary graph is constructed with direct set intersection and breadth-first connected components. A second implementation uses a two-pointer scan over sorted masks to reconstruct exact edges and union-find to reconstruct components. Exact edge sets and partitions must match slot by slot.

## Component measures

Each component receipt includes member option IDs and masks; B-only, C-only, and `{B,C}` node counts; overlap/disjoint pair structure; union cells; normalized grid/world bounding box; union-cell centroid and distance from entry `(0.5, 0.72)`; and the distinct frozen F-component IDs represented. Component provenance labels can overlap because a component can contain both a `{B,C}` node and a B/C conflict edge.

Pairwise option receipts include intersection and union counts, Jaccard as a descriptive value only, mask-centroid distance, shared cell IDs, shared F-component IDs, and cross-provenance status.

Reported quantiles use the sorted observed value at `floor((n − 1) × p)`; no interpolation or distribution cutoff is introduced.

## F-component sensitivity

As a separate sensitivity only, a second relation connects any options carrying a common frozen F-component ID. It does not alter the primary graph. The receipts report pairwise X-disjoint options sharing F and the resulting F-relation component membership.

## Across-slot persistence

Slots remain in their actual saved temporal order. Exact X-mask repeats inside a contested component are counted separately. A contested component can continue across adjacent slots only when the union cell sets overlap and the component correspondence is one-to-one in both directions. A split or merge breaks the track; no ambiguous ID is carried forward. This spatial continuity is descriptive and does not assert persistent identity of a physical object.

For a one-to-one continuing component, the receipt also notes whether new candidate track IDs join while at least one prior candidate track ID remains. Exact-mask singleton runs are tracked separately. The temporal pairing changes no option or graph membership.

## Capacity diagnostic

The diagnostic sum adds one hypothetical local event per exact-X overlap component at each existing temporal slot. It applies no spatial winner and creates no material. The current 256-Plate ceiling is only the supplied comparison reference. Crossing is reported at the first actual saved slot where the cumulative diagnostic count is strictly greater than 256. Actual production Plate births are descriptive context only.

## Visual atlas

The SVG atlas draws all selected slot X masks on the registered 96×96 grid. A repeated hue denotes membership in the same exact-overlap component; every option is outlined equally, with no winner. The atlas uses no new native-world frame or replay. The category requiring a coeval `{B,C}` option to overlap another X is shown as `none` when absent.
